$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
$total = [Diagnostics.Stopwatch]::StartNew()

try {
    # Services must already be rebuilt and running from this checkout.
    # Compose honors COMPOSE_FILE / COMPOSE_PROJECT_NAME for an isolated workspace.
    $phpFiles = @(git ls-files --cached --others --exclude-standard -- backend |
        Where-Object { $_ -like '*.php' } |
        ForEach-Object { $_.Substring(8) })
    if ($LASTEXITCODE -ne 0) { throw 'Cannot list PHP source files' }
    if ($phpFiles.Count -eq 0) { throw 'No backend PHP source files found' }

    $checks = @(
        @{ Name = 'Laravel / real MySQL smoke'; Run = {
            docker compose exec -T backend php artisan test --stop-on-failure tests/Feature/ConnectivityTest.php
        } }
        @{ Name = 'TypeScript'; Run = { npm run typecheck --prefix frontend } }
        @{ Name = 'Frontend production build'; Run = {
            Push-Location frontend
            try { npm exec -- vite build } finally { Pop-Location }
        } }
        @{ Name = 'PHP syntax'; Run = { docker compose exec -T backend php -l @phpFiles artisan } }
        @{ Name = 'PHP dependency audit'; Run = {
            docker compose exec -T backend composer audit --locked --no-interaction
        } }
        @{ Name = 'JavaScript dependency audit'; Run = { npm audit --prefix frontend } }
    )

    foreach ($check in $checks) {
        Write-Host "Running: $($check.Name)"
        $timer = [Diagnostics.Stopwatch]::StartNew()
        & $check.Run
        $checkExit = $LASTEXITCODE
        $timer.Stop()
        Write-Host ('{0}: exit {1}, {2:N2}s' -f $check.Name, $checkExit, $timer.Elapsed.TotalSeconds)
        if ($checkExit -ne 0) { throw "$($check.Name) failed; remaining checks did not run" }
    }

    Write-Host 'All six agreed automated scaffold checks passed. Record the manual browser result separately.'
} finally {
    Write-Host ('Elapsed local checks: {0:N2}s' -f $total.Elapsed.TotalSeconds)
    Pop-Location
}
