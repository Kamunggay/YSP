$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Checked {
    param([string] $Command, [string[]] $Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Invoke-Checked git @('rev-parse', 'HEAD')
Invoke-Checked git @('status', '--short')
Invoke-Checked docker @('version', '--format', '{{.Server.Version}}')
Invoke-Checked docker @('compose', 'version')
Get-FileHash backend/composer.lock, frontend/package-lock.json, contracts/transport/package-lock.json -Algorithm SHA256 | Format-List
Get-FileHash contracts/health/v1/*.json, contracts/transport/v1/*.json -Algorithm SHA256 | Format-List
# Fail on existing invalid secrets before an expensive build; init preserves values.
& "$PSScriptRoot/init-local.ps1"
& "$PSScriptRoot/check-config.ps1"
