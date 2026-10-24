$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Checked {
    param([string] $Command, [string[]] $Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Verification command failed: $Command $Arguments" }
}

Write-Output 'Combined P01 verification; no deployment or package acceptance implied.'
Invoke-Checked git @('rev-parse', 'HEAD')
Invoke-Checked git @('status', '--short')
Invoke-Checked docker @('version', '--format', '{{.Server.Version}}')
Invoke-Checked docker @('compose', 'version')
Get-FileHash backend/composer.lock, frontend/package-lock.json, contracts/transport/package-lock.json -Algorithm SHA256 | Format-List

# Fail on existing invalid secrets before an expensive build; init preserves values.
& "$PSScriptRoot/init-local.ps1"
& "$PSScriptRoot/check-config.ps1"
Invoke-Checked docker @('build', '-f', 'scripts/verification.Dockerfile', '-t', 'ysp-verification:local', '.')
Invoke-Checked docker @('run', '--rm', '-w', '/workspace/contracts/transport', 'ysp-verification:local', 'npm', 'test')
Invoke-Checked docker @('run', '--rm', '-w', '/workspace/contracts/transport', 'ysp-verification:local', 'npm', 'audit', '--package-lock-only')
Invoke-Checked docker @('run', '--rm', 'ysp-verification:local', 'npm', 'test')
Invoke-Checked docker @('run', '--rm', 'ysp-verification:local', 'npm', 'audit', '--package-lock-only')

# Reuse the existing locked build/static/test and fresh MySQL migration checks.
& "$PSScriptRoot/verify-backend.ps1"
# Builds frontend with lint + strict TypeScript + Vite and exercises the real origin.
& "$PSScriptRoot/verify-same-origin.ps1" -BrowserImage 'ysp-verification:local'
Invoke-Checked docker @('run', '--rm', 'ysp-verification:local', 'node', '--version')
Invoke-Checked docker @('image', 'inspect', 'ysp-verification:local', 'ysp-backend:local', 'ysp-frontend:local', '--format', '{{.RepoTags}} {{.Id}}')
Get-FileHash contracts/health/v1/*.json, contracts/transport/v1/*.json -Algorithm SHA256 | Format-List
Write-Output 'Combined local verification passed. Remote CI, nonauthor reproduction and P01 acceptance remain pending.'
