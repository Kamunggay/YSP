param([string] $BrowserImage = '')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& "$PSScriptRoot/init-local.ps1"
$verificationProject = 'ysp-origin-check-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$previousPort = $env:YSP_HTTP_PORT
$previousBrowserUrl = $env:YSP_BROWSER_URL
$previousExpectation = $env:YSP_EXPECT_HEALTH
$env:YSP_HTTP_PORT = '0'
$overrideFile = Join-Path (Get-Location) ('.runtime/' + $verificationProject + '.yaml')
[IO.File]::WriteAllText($overrideFile, "services:`n  backend:`n    environment:`n      APP_KEY_FILE: /run/secrets/not-provided`n")
function Invoke-Compose {
    & docker compose --project-name $verificationProject @args
    if ($LASTEXITCODE -ne 0) { throw "Compose command failed: $args" }
}
function Invoke-Browser([string] $Expected, [switch] $ConnectivityOnly) {
    $env:YSP_EXPECT_HEALTH = $Expected
    if ($BrowserImage) {
        $browserArguments = @('run', '--rm', '--init', '--shm-size=256m', '--network', ($verificationProject + '_local'),
            '-e', 'YSP_BROWSER_URL=http://frontend:8080', '-e', ('YSP_EXPECT_HEALTH=' + $Expected), $BrowserImage,
            'npx', '--no-install', 'playwright', 'test')
        if ($ConnectivityOnly) { $browserArguments += @('tests/health.spec.ts', '--grep', 'checks the real API', '--max-failures=1') }
        & docker @browserArguments
        if ($LASTEXITCODE -ne 0) { throw 'Container browser integration check failed' }
        return
    }
    Push-Location frontend
    try {
        if ($ConnectivityOnly) {
            & npx playwright test tests/health.spec.ts --grep 'checks the real API' --max-failures=1
        } else {
            & npm run test:browser
        }
        if ($LASTEXITCODE -ne 0) { throw 'Browser integration check failed' }
    } finally { Pop-Location }
}
try {
    Invoke-Compose config --quiet
    Invoke-Compose build backend frontend
    & "$PSScriptRoot/check-config.ps1"
    Invoke-Compose up -d --wait --wait-timeout 180
    Invoke-Compose exec -T backend php artisan migrate --force
    Invoke-Compose exec -T backend php artisan baseline:verify
    $published = & docker compose --project-name $verificationProject port frontend 8080
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve frontend HTTP port' }
    $env:YSP_BROWSER_URL = 'http://' + $published.Trim()
    Write-Output 'Same-origin success and browser behavior checks'
    Invoke-Browser '200'

    Write-Output 'Real MySQL outage through the client'
    Invoke-Compose stop mysql
    Invoke-Browser '503' -ConnectivityOnly
    Invoke-Compose start --wait mysql
    Invoke-Browser '200' -ConnectivityOnly

    Write-Output 'Real backend outage through the client'
    Invoke-Compose stop backend
    Invoke-Browser '503' -ConnectivityOnly
    Invoke-Compose start --wait backend
    Invoke-Browser '200' -ConnectivityOnly

    Write-Output 'Missing application key through the client'
    & docker compose -f compose.yaml -f $overrideFile --project-name $verificationProject up -d --no-deps backend
    if ($LASTEXITCODE -ne 0) { throw 'Cannot start configuration failure probe' }
    Invoke-Compose exec -T -e HEALTH_EXPECT_STATUS=503 backend php scripts/http-smoke.php
    Invoke-Browser '503' -ConnectivityOnly
    Invoke-Compose up -d --no-deps --wait --wait-timeout 60 backend
    Invoke-Browser '200' -ConnectivityOnly

    & docker image inspect ysp-frontend:local ysp-backend:local --format '{{.RepoTags}} {{.Id}}'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot record image identities' }
    Get-FileHash frontend/package-lock.json, backend/composer.lock -Algorithm SHA256 | Format-Table -AutoSize
    Invoke-Compose exec -T frontend nginx -v
    Invoke-Compose exec -T frontend sh -c 'sha256sum /usr/share/nginx/html/index.html /usr/share/nginx/html/assets/*'
    Write-Output 'Same-origin connection, outage, configuration and recovery checks passed on disposable MySQL.'
} finally {
    & docker compose --project-name $verificationProject down --volumes --remove-orphans
    $cleanupStatus = $LASTEXITCODE
    Remove-Item -LiteralPath $overrideFile -ErrorAction SilentlyContinue
    $env:YSP_HTTP_PORT = $previousPort
    $env:YSP_BROWSER_URL = $previousBrowserUrl
    $env:YSP_EXPECT_HEALTH = $previousExpectation
    if ($cleanupStatus -ne 0) { throw 'Disposable integration cleanup failed' }
}
