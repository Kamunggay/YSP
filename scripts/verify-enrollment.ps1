$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& "$PSScriptRoot/init-local.ps1"
# Uses the same host Node + contract-validator dependencies as verify-sessions.ps1.
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Test-Path contracts/transport/node_modules/ajv)) {
    throw 'Install Node 24 and run npm ci --prefix contracts/transport before this HTTP/CLI verifier.'
}
$enrollmentProject = 'ysp-enrollment-check-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$enrollmentOverride = Join-Path (Get-Location) ".runtime/$enrollmentProject.yaml"
$enrollmentNames = @('YSP_HTTP_PORT', 'YSP_TEST_ORIGIN', 'YSP_TEST_CONTAINER', 'YSP_TEST_MYSQL_CONTAINER')
$enrollmentPrevious = @{}
foreach ($name in $enrollmentNames) { $enrollmentPrevious[$name] = [Environment]::GetEnvironmentVariable($name) }
function Invoke-EnrollmentCompose {
    & docker compose --env-file backend/.env -f compose.yaml -f $enrollmentOverride -p $enrollmentProject @args
    if ($LASTEXITCODE -ne 0) { throw "Enrollment compose command failed: $args" }
}
function Write-EnrollmentOverride([string] $testOrigin) {
    @"
services:
  backend:
    environment:
      APP_URL: $testOrigin
  backend-race:
    extends:
      file: compose.yaml
      service: backend
    environment:
      APP_URL: $testOrigin
  frontend:
    volumes:
      - ./backend/tests/fixtures/enrollment-nginx.conf:/etc/nginx/conf.d/default.conf:ro
"@ | Set-Content -LiteralPath $enrollmentOverride
}
try {
    $env:YSP_HTTP_PORT = '0'
    Write-EnrollmentOverride 'http://localhost:8080'
    & node contracts/transport/generate-runtime.mjs --check
    if ($LASTEXITCODE -ne 0) { throw 'Runtime metadata drift' }
    Invoke-EnrollmentCompose build backend frontend
    Invoke-EnrollmentCompose up -d --wait --wait-timeout 180 mysql backend backend-race frontend
    $enrollmentPort = & docker compose --env-file backend/.env -f compose.yaml -f $enrollmentOverride -p $enrollmentProject port frontend 8080
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve enrollment gateway' }
    $env:YSP_TEST_ORIGIN = 'http://localhost:' + ($enrollmentPort.Trim() -split ':')[-1]
    Write-EnrollmentOverride $env:YSP_TEST_ORIGIN
    Invoke-EnrollmentCompose up -d --no-deps --wait backend backend-race
    $env:YSP_TEST_CONTAINER = (& docker compose --env-file backend/.env -f compose.yaml -f $enrollmentOverride -p $enrollmentProject ps -q backend).Trim()
    $env:YSP_TEST_MYSQL_CONTAINER = (& docker compose --env-file backend/.env -f compose.yaml -f $enrollmentOverride -p $enrollmentProject ps -q mysql).Trim()
    Invoke-EnrollmentCompose exec -T backend php artisan migrate --force
    Invoke-EnrollmentCompose exec -T backend php artisan migrate --force
    Invoke-EnrollmentCompose exec -T backend php artisan baseline:verify
    & node --test --test-timeout=60000 backend/tests/enrollment-http.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Enrollment HTTP/CLI/MySQL checks failed' }
    Invoke-EnrollmentCompose exec -T backend php artisan test --stop-on-failure
    Write-Output 'Enrollment checks passed on disposable MySQL 8.4 and independent HTTP workers.'
} finally {
    try { Invoke-EnrollmentCompose down --volumes --remove-orphans }
    finally {
        Remove-Item -LiteralPath $enrollmentOverride -ErrorAction SilentlyContinue
        foreach ($name in $enrollmentNames) { [Environment]::SetEnvironmentVariable($name, $enrollmentPrevious[$name]) }
    }
}
