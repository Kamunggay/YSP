param(
    [ValidateSet('Run', 'Start', 'Test', 'Stop')][string] $Action = 'Run',
    [string] $Project,
    [string] $TestNamePattern,
    [switch] $SkipBuild
)

$ErrorActionPreference = 'Stop'
$enrollmentRoot = Split-Path $PSScriptRoot -Parent
if (-not $Project) {
    if ($Action -ne 'Run') { throw 'Specify -Project for Start, Test or Stop.' }
    $Project = 'ysp-enrollment-check-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
}
if ($Project -notmatch '^ysp-enrollment-check-[a-z0-9][a-z0-9-]{0,39}$') {
    throw 'Project must use the ysp-enrollment-check- prefix and a lowercase alphanumeric/hyphen suffix.'
}
$enrollmentOverride = Join-Path $enrollmentRoot ".runtime/$Project.yaml"
$enrollmentStatePath = Join-Path $enrollmentRoot ".runtime/$Project.json"
$enrollmentNames = @('YSP_HTTP_PORT', 'YSP_TEST_ORIGIN', 'YSP_TEST_CONTAINER', 'YSP_TEST_MYSQL_CONTAINER', 'YSP_TEST_BROWSER_ORIGIN')
$enrollmentPrevious = @{}
foreach ($name in $enrollmentNames) { $enrollmentPrevious[$name] = [Environment]::GetEnvironmentVariable($name) }
$enrollmentOwned = $false
$enrollmentFailure = $null
$enrollmentCleanup = $Action -in @('Run', 'Stop')
$enrollmentLock = $null
$enrollmentTesting = $false

function Measure-EnrollmentPhase {
    param([string] $Name, [scriptblock] $Work)
    $watch = [Diagnostics.Stopwatch]::StartNew()
    try { & $Work } finally {
        Write-Host ('[verification-timing] {0} ms={1}' -f $Name, $watch.ElapsedMilliseconds)
    }
}

function Invoke-EnrollmentNative {
    param([string] $Command, [string[]] $Arguments)
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject (@($Command) + $Arguments) -Compress)))
    & node "$PSScriptRoot/run-native.mjs" --encoded-arguments $encoded
    if ($LASTEXITCODE -ne 0) { throw "Verification executable failed: $Command (exit $LASTEXITCODE)" }
}
function Invoke-EnrollmentCompose {
    Invoke-EnrollmentNative docker (@('compose', '--env-file', 'backend/.env', '-f', 'compose.yaml', '-f', $enrollmentOverride, '-p', $Project) + $args)
}
function Get-EnrollmentFingerprint {
    # Mounted application/tests/resources/migrations may change without a rebuild.
    $files = @('compose.yaml', 'backend/Dockerfile', 'backend/composer.json', 'backend/composer.lock',
        'backend/.env', 'backend/.env.example', 'frontend/Dockerfile', 'frontend/package.json', 'frontend/package-lock.json',
        'frontend/nginx.conf', 'backend/tests/fixtures/enrollment-nginx.conf')
    $files += @(Get-ChildItem backend/config, backend/public -File -Recurse | ForEach-Object FullName)
    $files += @(Get-ChildItem backend/bootstrap -File | ForEach-Object FullName)
    return (($files | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash }) -join ':')
}
function Write-EnrollmentOverride([string] $Origin) {
    $mounts = (@('app', 'routes', 'tests', 'resources', 'database') | ForEach-Object { "      - ./backend/${_}:/app/${_}:ro" }) -join "`n"
    @"
services:
  migrate:
    volumes:
      - ./backend/database:/app/database:ro
  backend:
    environment:
      APP_URL: $Origin
    volumes:
$mounts
  backend-race:
    extends:
      file: compose.yaml
      service: backend
    environment:
      APP_URL: $Origin
    volumes:
$mounts
  frontend:
    volumes:
      - ./backend/tests/fixtures/enrollment-nginx.conf:/etc/nginx/conf.d/default.conf:ro
"@ | Set-Content -LiteralPath $enrollmentOverride -Encoding UTF8
}
function Save-EnrollmentDiagnostics {
    $directory = Join-Path $enrollmentRoot ('.runtime/' + $Project + '-failure-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path $directory | Out-Null
    # Local ignored artifacts: no environment dumps, resolved config or SQL/proof values.
    foreach ($probe in @(
        @{ Name = 'services.log'; Arguments = @('ps', '-a') },
        @{ Name = 'containers.log'; Arguments = @('logs', '--no-color', '--tail', '100', 'backend', 'backend-race', 'mysql') },
        @{ Name = 'mysql-locks.log'; Arguments = @('exec', '-T', 'mysql', 'sh', '-c', 'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot -e "SELECT l.OBJECT_NAME,l.INDEX_NAME,l.LOCK_MODE,w.REQUESTING_THREAD_ID,w.BLOCKING_THREAD_ID FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON w.REQUESTING_ENGINE_LOCK_ID=l.ENGINE_LOCK_ID"') }
    )) {
        $probeArguments = $probe.Arguments
        try {
            $captured = Invoke-EnrollmentCompose @probeArguments | Out-String
            if ($probe.Name -eq 'mysql-locks.log' -and [string]::IsNullOrWhiteSpace($captured)) { $captured = 'No current MySQL lock waits.' }
            Set-Content -LiteralPath (Join-Path $directory $probe.Name) -Value $captured -Encoding UTF8
        }
        catch { $_.Exception.Message | Set-Content -LiteralPath (Join-Path $directory ($probe.Name + '.error')) }
    }
    Write-Host "Failure diagnostics: $directory (inspect/redact before sharing)."
}

Push-Location $enrollmentRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node 24 for the enrollment verifier.' }
    New-Item -ItemType Directory -Force .runtime | Out-Null
    # An OS handle, not a PID/file-exists check: released even after process termination.
    # Keep the empty lock file so contenders always open the same inode.
    try {
        $enrollmentLock = [IO.File]::Open((Join-Path $enrollmentRoot ".runtime/$Project.lock"),
            [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    } catch [IO.IOException] { throw "A verification command is already running for $Project; wait for it to finish." }
    $env:YSP_HTTP_PORT = '0'
    $env:YSP_TEST_BROWSER_ORIGIN = $null
    if ($Action -in @('Test', 'Stop')) {
        if (-not (Test-Path -LiteralPath $enrollmentStatePath) -or -not (Test-Path -LiteralPath $enrollmentOverride)) {
            throw "No owned test environment for $Project; run -Action Start first."
        }
        $state = Get-Content -LiteralPath $enrollmentStatePath -Raw | ConvertFrom-Json
        if ($state.Root -ne $enrollmentRoot -or $state.Project -ne $Project) { throw 'Test environment ownership mismatch.' }
        $enrollmentOwned = $true
        if ($Action -eq 'Stop') { return }
        if ($state.Ready -ne $true) { throw 'Test environment is not ready; Stop then Start after interrupted startup or migrations.' }
        if ($state.Fingerprint -ne (Get-EnrollmentFingerprint)) { throw 'Build/configuration inputs changed; Stop then Start this test environment (rebuild required).' }
        $env:YSP_TEST_ORIGIN = $state.Origin
    } else {
        if (Test-Path -LiteralPath $enrollmentStatePath) { throw "Environment already exists; use -Action Test or Stop for $Project." }
        $existing = Invoke-EnrollmentNative docker @('ps', '-aq', '--filter', "label=com.docker.compose.project=$Project")
        if ($existing) { throw 'Project has containers without an ownership record; refusing to reuse or remove them.' }
        & "$PSScriptRoot/init-local.ps1"
        Write-EnrollmentOverride 'http://localhost:8080'
        $enrollmentOwned = $true
        # Persist ownership before startup so an interrupted Start can be explicitly stopped.
        $state = @{ Root = $enrollmentRoot; Project = $Project; Origin = $null; Ready = $false; Fingerprint = Get-EnrollmentFingerprint }
        $state | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $enrollmentStatePath -Encoding UTF8
        if (-not $SkipBuild) { Measure-EnrollmentPhase build { Invoke-EnrollmentCompose build backend frontend } }
        Measure-EnrollmentPhase startup { Invoke-EnrollmentCompose up -d --no-build --wait --wait-timeout 180 mysql backend backend-race frontend }
        $port = (Invoke-EnrollmentCompose port frontend 8080 | Out-String).Trim()
        if ($port -notmatch ':(\d+)$') { throw 'Cannot resolve enrollment gateway port.' }
        $env:YSP_TEST_ORIGIN = 'http://localhost:' + $Matches[1]
        Write-EnrollmentOverride $env:YSP_TEST_ORIGIN
        Measure-EnrollmentPhase origin-restart { Invoke-EnrollmentCompose up -d --no-build --no-deps --wait --wait-timeout 90 backend backend-race }
        $state.Origin = $env:YSP_TEST_ORIGIN
        $state | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $enrollmentStatePath -Encoding UTF8
        Measure-EnrollmentPhase migrations { Invoke-EnrollmentCompose run --rm --no-deps migrate }
        Measure-EnrollmentPhase schema-baseline { Invoke-EnrollmentCompose exec -T backend php artisan baseline:verify }
        $state.Ready = $true
        $state | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $enrollmentStatePath -Encoding UTF8
    }
    Write-Host "Enrollment environment: $Project ($env:YSP_TEST_ORIGIN)"
    if ($Action -eq 'Start') { return }
    if (-not (Test-Path contracts/transport/node_modules/ajv)) { throw 'Run npm ci --prefix contracts/transport before HTTP checks.' }
    Invoke-EnrollmentNative node @('contracts/transport/generate.mjs', '--fixtures')
    Invoke-EnrollmentNative node @('contracts/transport/generate-runtime.mjs', '--check')
    $env:YSP_TEST_CONTAINER = (Invoke-EnrollmentCompose ps -q backend | Out-String).Trim()
    $env:YSP_TEST_MYSQL_CONTAINER = (Invoke-EnrollmentCompose ps -q mysql | Out-String).Trim()
    if (-not $env:YSP_TEST_CONTAINER -or -not $env:YSP_TEST_MYSQL_CONTAINER) { throw 'Test containers are missing; Stop then Start the environment.' }
    if ($Action -eq 'Test') {
        $state.Ready = $false
        $state | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $enrollmentStatePath -Encoding UTF8
        Measure-EnrollmentPhase migrations { Invoke-EnrollmentCompose run --rm --no-deps migrate }
        $state.Ready = $true
        $state | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $enrollmentStatePath -Encoding UTF8
    }
    $state.Ready = $false
    $state | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $enrollmentStatePath -Encoding UTF8
    $enrollmentTesting = $true
    Measure-EnrollmentPhase integration-tests { Invoke-EnrollmentNative node @('scripts/run-http-tests.mjs', 'backend/tests/enrollment-http.test.mjs', $TestNamePattern) }
    if (-not $TestNamePattern) { Measure-EnrollmentPhase phpunit { Invoke-EnrollmentCompose exec -T backend php artisan test --stop-on-failure } }
    $state.Ready = $true
    $state | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $enrollmentStatePath -Encoding UTF8
    Write-Host 'Enrollment checks passed on isolated MySQL and independent HTTP workers.'
} catch {
    $enrollmentFailure = $_
    if ($enrollmentTesting) {
        $state.Ready = $true
        $state | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $enrollmentStatePath -Encoding UTF8
    }
    if ($enrollmentOwned) {
        try { Save-EnrollmentDiagnostics } catch { Write-Warning "Diagnostic capture failed: $($_.Exception.Message)" }
        if ($Action -eq 'Start') { $enrollmentCleanup = $true }
    }
    throw
} finally {
    try {
        if ($enrollmentCleanup -and $enrollmentOwned) {
            # Only remove state after successful teardown, so failed cleanup can be retried.
            try {
                Invoke-EnrollmentCompose down --volumes --remove-orphans
                Remove-Item -LiteralPath $enrollmentOverride, $enrollmentStatePath -ErrorAction SilentlyContinue
            } catch {
                if ($enrollmentFailure) { Write-Warning "Cleanup also failed; ownership state retained: $($_.Exception.Message)" }
                else { throw }
            }
        }
    } finally {
        foreach ($name in $enrollmentNames) { [Environment]::SetEnvironmentVariable($name, $enrollmentPrevious[$name]) }
        Pop-Location
        if ($enrollmentLock) { $enrollmentLock.Dispose() }
    }
}
