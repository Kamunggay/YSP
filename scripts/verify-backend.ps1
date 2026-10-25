$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& "$PSScriptRoot/init-local.ps1"
$verificationProject = 'ysp-health-check-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$previousPort = $env:YSP_HTTP_PORT
$env:YSP_HTTP_PORT = '0'
function Invoke-Compose {
    & docker compose --env-file backend/.env -f compose.yaml -f compose.backend.yaml --project-name $verificationProject @args
    if ($LASTEXITCODE -ne 0) { throw "Compose command failed: $args" }
}
try {
    Invoke-Compose config --quiet
    Invoke-Compose build backend
    & docker run --rm ysp-backend:local composer check
    if ($LASTEXITCODE -ne 0) { throw 'Static checks failed' }
    & docker run --rm ysp-backend:local composer audit --locked --no-interaction
    if ($LASTEXITCODE -ne 0) { throw 'Dependency audit failed' }
    & "$PSScriptRoot/check-config.ps1"
    Invoke-Compose up -d --wait --wait-timeout 180 mysql backend
    Invoke-Compose exec -T backend php artisan migrate --force
    Invoke-Compose exec -T backend php artisan baseline:verify
    Invoke-Compose exec -T backend php artisan migrate --force
    Invoke-Compose exec -T backend php scripts/http-smoke.php
    $published = & docker compose --env-file backend/.env -f compose.yaml -f compose.backend.yaml --project-name $verificationProject port backend 8080
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve HTTP port' }
    $response = Invoke-WebRequest -UseBasicParsing -Uri ("http://" + $published.Trim() + "/api/v1/health")
    if ($response.StatusCode -ne 200 -or $response.Content -notmatch '"status":"ok"') {
        throw 'Host HTTP check failed'
    }
    Invoke-Compose stop mysql
    Invoke-Compose exec -T -e HEALTH_EXPECT_STATUS=503 backend php scripts/http-smoke.php
    # Compose v2 supports health waits on up, but not on start.
    Invoke-Compose up -d --no-deps --no-recreate --wait --wait-timeout 180 mysql
    Invoke-Compose exec -T backend php scripts/http-smoke.php
    Invoke-Compose exec -T backend php artisan config:cache
    Invoke-Compose exec -T backend php scripts/http-smoke.php
    Invoke-Compose exec -T backend php artisan config:clear
    Invoke-Compose exec -T backend php artisan test
    Write-Output 'Backend verification passed on a fresh disposable MySQL volume.'
} finally {
    & docker compose --env-file backend/.env -f compose.yaml -f compose.backend.yaml --project-name $verificationProject down --volumes --remove-orphans
    $cleanupStatus = $LASTEXITCODE
    $env:YSP_HTTP_PORT = $previousPort
    if ($cleanupStatus -ne 0) { throw 'Disposable verification cleanup failed' }
}
