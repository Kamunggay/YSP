# Substitute only the native executable boundary; exercise the real verifier/state files.
param([string] $Action, [string] $Project, [string] $Signals, [switch] $FailMigration, [switch] $FailCleanup, [switch] $HoldTests)
$ErrorActionPreference = 'Stop'
function global:node {
    $command = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($args[2])) | ConvertFrom-Json
    $global:LASTEXITCODE = 0
    if ($command[0] -eq 'docker') {
        $operation = $command -join ' '
        if ($operation -match ' down --volumes' -and $FailCleanup) { $global:LASTEXITCODE = 8 }
        elseif ($operation -match ' port frontend ') { '127.0.0.1:19001' }
        elseif ($operation -match ' ps -q ') { 'synthetic-container' }
        elseif ($operation -match ' run --rm --no-deps migrate$') {
            Add-Content -LiteralPath (Join-Path $Signals 'migrations') -Value $Action
            if ($Action -eq 'Start') {
                Set-Content -LiteralPath (Join-Path $Signals 'held') -Value 'migration reached'
                while (-not (Test-Path -LiteralPath (Join-Path $Signals 'release'))) { Start-Sleep -Milliseconds 25 }
            }
            if ($FailMigration) { $global:LASTEXITCODE = 9 }
        }
    } elseif ($HoldTests -and $command[1] -eq 'scripts/run-http-tests.mjs') {
        Set-Content -LiteralPath (Join-Path $Signals 'tests-held') -Value 'tests reached'
        while (-not (Test-Path -LiteralPath (Join-Path $Signals 'tests-release'))) { Start-Sleep -Milliseconds 25 }
    }
}
& (Join-Path $PSScriptRoot '../../verify-enrollment.ps1') -Action $Action -Project $Project -SkipBuild
