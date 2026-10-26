$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& "$PSScriptRoot/init-local.ps1"
$sessionProject = 'ysp-session-check-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$sessionOverride = Join-Path (Get-Location) ".runtime/$sessionProject.yaml"
New-Item -ItemType Directory -Force .runtime | Out-Null
@'
services:
  backend:
    environment:
      APP_URL: ${YSP_SESSION_APP_URL:-http://localhost:8080}
      APP_ENV: ${YSP_SESSION_APP_ENV:-local}
'@ | Set-Content -LiteralPath $sessionOverride
$sessionEnvNames = @('YSP_HTTP_PORT', 'YSP_SESSION_APP_URL', 'YSP_SESSION_APP_ENV', 'YSP_TEST_ORIGIN', 'YSP_TEST_CONTAINER', 'YSP_TEST_PROFILE', 'YSP_TEST_BROWSER_ORIGIN')
$sessionPreviousEnv = @{}
foreach ($name in $sessionEnvNames) { $sessionPreviousEnv[$name] = [Environment]::GetEnvironmentVariable($name) }
function Invoke-SessionCompose {
    & docker compose --env-file backend/.env -f compose.yaml -f $sessionOverride --project-name $sessionProject @args
    if ($LASTEXITCODE -ne 0) { throw "Session compose command failed: $args" }
}
try {
    $env:YSP_HTTP_PORT = '0'
    $env:YSP_SESSION_APP_ENV = 'local'
    $env:YSP_SESSION_APP_URL = 'http://localhost:8080'
    $env:YSP_TEST_PROFILE = 'local'
    $env:YSP_TEST_BROWSER_ORIGIN = $null
    & node contracts/transport/generate-runtime.mjs --check
    if ($LASTEXITCODE -ne 0) { throw 'Runtime metadata drift' }
    Invoke-SessionCompose build backend frontend
    Invoke-SessionCompose up -d --wait --wait-timeout 180 mysql backend frontend
    $sessionPort = & docker compose --env-file backend/.env -f compose.yaml -f $sessionOverride --project-name $sessionProject port frontend 8080
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve gateway port' }
    $env:YSP_TEST_ORIGIN = 'http://localhost:' + ($sessionPort.Trim() -split ':')[-1]
    $env:YSP_SESSION_APP_URL = $env:YSP_TEST_ORIGIN
    Invoke-SessionCompose up -d --no-deps --wait --wait-timeout 90 backend
    $env:YSP_TEST_CONTAINER = (& docker compose --env-file backend/.env -f compose.yaml -f $sessionOverride --project-name $sessionProject ps -q backend).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $env:YSP_TEST_CONTAINER) { throw 'Cannot resolve backend container' }
    Invoke-SessionCompose exec -T backend php artisan migrate --force
    Invoke-SessionCompose exec -T backend php artisan migrate --force
    Invoke-SessionCompose exec -T backend php artisan baseline:verify
    Invoke-SessionCompose exec -T backend php artisan test --stop-on-failure
    & node --test backend/tests/session-http.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'HTTP/CLI session checks failed' }
    Invoke-SessionCompose exec -T backend php artisan config:cache
    & node --test --test-name-pattern='root CSRF|origin rejection' backend/tests/session-http.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Cached-config checks failed' }
    Invoke-SessionCompose exec -T backend php artisan config:clear
    $env:YSP_TEST_PROFILE = 'unavailable'
    Invoke-SessionCompose stop mysql
    & node --test --test-name-pattern='storage outage|origin rejection' backend/tests/session-http.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Outage precedence checks failed' }
    Invoke-SessionCompose up -d --no-deps --no-recreate --wait --wait-timeout 180 mysql
    $env:YSP_SESSION_APP_ENV = 'production'
    $env:YSP_SESSION_APP_URL = 'https://ysp.example.test'
    $env:YSP_TEST_BROWSER_ORIGIN = $env:YSP_SESSION_APP_URL
    $env:YSP_TEST_PROFILE = 'production'
    Invoke-SessionCompose up -d --no-deps --wait --wait-timeout 90 backend
    $env:YSP_TEST_CONTAINER = (& docker compose --env-file backend/.env -f compose.yaml -f $sessionOverride --project-name $sessionProject ps -q backend).Trim()
    & node --test --test-name-pattern='production cookies' backend/tests/session-http.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Production cookie checks failed' }
    Write-Output 'Session foundation passed through the gateway and interactive CLI on disposable MySQL 8.4.'
} finally {
    try { Invoke-SessionCompose down --volumes --remove-orphans }
    finally {
        Remove-Item -LiteralPath $sessionOverride
        foreach ($name in $sessionEnvNames) { [Environment]::SetEnvironmentVariable($name, $sessionPreviousEnv[$name]) }
    }
}
