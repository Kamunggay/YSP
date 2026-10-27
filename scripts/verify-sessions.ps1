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
      PHP_CLI_SERVER_WORKERS: 4
'@ | Set-Content -LiteralPath $sessionOverride
$sessionEnvNames = @('YSP_HTTP_PORT', 'YSP_SESSION_APP_URL', 'YSP_SESSION_APP_ENV', 'YSP_TEST_ORIGIN', 'YSP_TEST_CONTAINER', 'YSP_TEST_MYSQL_CONTAINER', 'YSP_TEST_PROFILE', 'YSP_TEST_BROWSER_ORIGIN')
$sessionPreviousEnv = @{}
foreach ($name in $sessionEnvNames) { $sessionPreviousEnv[$name] = [Environment]::GetEnvironmentVariable($name) }
function Invoke-SessionCompose {
    & docker compose --env-file backend/.env -f compose.yaml -f $sessionOverride --project-name $sessionProject @args
    if ($LASTEXITCODE -ne 0) { throw "Session compose command failed: $args" }
}
function Invoke-SessionTests([string] $Pattern) {
    # Share only the disposable gateway's network namespace, including on Linux
    # where the loopback-published port cannot be reached through a host gateway.
    & docker run --rm --network "container:$sessionGateway" --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges `
        -v /var/run/docker.sock:/var/run/docker.sock `
        -e YSP_TEST_ORIGIN=http://127.0.0.1:8080 -e "YSP_TEST_BROWSER_ORIGIN=$env:YSP_SESSION_APP_URL" `
        -e YSP_TEST_CONTAINER -e YSP_TEST_MYSQL_CONTAINER -e YSP_TEST_PROFILE `
        ysp-session-tests:local node scripts/run-http-tests.mjs backend/tests/session-http.test.mjs $Pattern
    if ($LASTEXITCODE -ne 0) { throw "HTTP/CLI session checks failed: $Pattern" }
}
try {
    $env:YSP_HTTP_PORT = '0'
    $env:YSP_SESSION_APP_ENV = 'local'
    $env:YSP_SESSION_APP_URL = 'http://localhost:8080'
    $env:YSP_TEST_PROFILE = 'local'
    $env:YSP_TEST_BROWSER_ORIGIN = $null
    & docker build -f scripts/session-tests.Dockerfile -t ysp-session-tests:local .
    if ($LASTEXITCODE -ne 0) { throw 'Session test image build failed' }
    & docker run --rm --network none ysp-session-tests:local node contracts/transport/generate-runtime.mjs --check
    if ($LASTEXITCODE -ne 0) { throw 'Runtime metadata drift' }
    Invoke-SessionCompose build backend frontend
    Invoke-SessionCompose up -d --wait --wait-timeout 180 mysql backend frontend
    $sessionGateway = (& docker compose --env-file backend/.env -f compose.yaml -f $sessionOverride --project-name $sessionProject ps -q frontend).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $sessionGateway) { throw 'Cannot resolve gateway container' }
    $sessionPort = & docker compose --env-file backend/.env -f compose.yaml -f $sessionOverride --project-name $sessionProject port frontend 8080
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve gateway port' }
    $env:YSP_TEST_ORIGIN = 'http://localhost:' + ($sessionPort.Trim() -split ':')[-1]
    $env:YSP_SESSION_APP_URL = $env:YSP_TEST_ORIGIN
    Invoke-SessionCompose up -d --no-deps --wait --wait-timeout 90 backend
    $env:YSP_TEST_CONTAINER = (& docker compose --env-file backend/.env -f compose.yaml -f $sessionOverride --project-name $sessionProject ps -q backend).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $env:YSP_TEST_CONTAINER) { throw 'Cannot resolve backend container' }
    $env:YSP_TEST_MYSQL_CONTAINER = (& docker compose --env-file backend/.env -f compose.yaml -f $sessionOverride --project-name $sessionProject ps -q mysql).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $env:YSP_TEST_MYSQL_CONTAINER) { throw 'Cannot resolve MySQL container' }
    Invoke-SessionCompose run --rm --no-deps migrate
    Invoke-SessionCompose run --rm --no-deps migrate
    Invoke-SessionCompose exec -T backend php artisan baseline:verify
    Invoke-SessionCompose exec -T backend php artisan test --stop-on-failure
    Invoke-SessionTests
    Invoke-SessionCompose exec -T backend php artisan config:cache
    Invoke-SessionTests 'root CSRF|origin rejection'
    Invoke-SessionCompose exec -T backend php artisan config:clear
    $env:YSP_TEST_PROFILE = 'unavailable'
    Invoke-SessionCompose stop mysql
    Invoke-SessionTests 'storage outage|origin rejection'
    Invoke-SessionCompose up -d --no-deps --no-recreate --wait --wait-timeout 180 mysql
    $env:YSP_TEST_PROFILE = 'backend-unavailable'
    Invoke-SessionCompose stop backend
    Invoke-SessionTests 'stopped backend'
    Invoke-SessionCompose up -d --no-deps --no-recreate --wait --wait-timeout 180 backend
    $env:YSP_SESSION_APP_ENV = 'production'
    $env:YSP_SESSION_APP_URL = 'https://ysp.example.test'
    $env:YSP_TEST_BROWSER_ORIGIN = $env:YSP_SESSION_APP_URL
    $env:YSP_TEST_PROFILE = 'production'
    Invoke-SessionCompose up -d --no-deps --wait --wait-timeout 90 backend
    $env:YSP_TEST_CONTAINER = (& docker compose --env-file backend/.env -f compose.yaml -f $sessionOverride --project-name $sessionProject ps -q backend).Trim()
    Invoke-SessionTests 'production cookies'
    Write-Output 'Session foundation passed through the gateway and interactive CLI on disposable MySQL 8.4.'
} finally {
    try { Invoke-SessionCompose down --volumes --remove-orphans }
    finally {
        Remove-Item -LiteralPath $sessionOverride
        foreach ($name in $sessionEnvNames) { [Environment]::SetEnvironmentVariable($name, $sessionPreviousEnv[$name]) }
    }
}
