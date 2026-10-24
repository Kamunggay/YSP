$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path -LiteralPath 'backend/.env')) {
    $configuration = [IO.File]::ReadAllText((Join-Path (Get-Location) 'backend/.env.example'))
    $legacyNames = @{ APP_KEY = 'app_key'; DB_PASSWORD = 'db_password'; MYSQL_ROOT_PASSWORD = 'db_root_password' }
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        foreach ($name in @('APP_KEY', 'DB_PASSWORD', 'MYSQL_ROOT_PASSWORD')) {
            $legacyPath = Join-Path '.runtime' $legacyNames[$name]
            if (Test-Path -LiteralPath $legacyPath) {
                $value = [IO.File]::ReadAllText((Join-Path (Get-Location) $legacyPath)).Trim()
            } else {
                $bytes = New-Object byte[] 32
                $random.GetBytes($bytes)
                $value = if ($name -eq 'APP_KEY') { 'base64:' + [Convert]::ToBase64String($bytes) }
                    else { ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant() }
            }
            $configuration = [regex]::Replace($configuration, "(?m)^$name=.*$", "$name=$value")
        }
        [IO.File]::WriteAllText((Join-Path (Get-Location) 'backend/.env'), $configuration)
    } finally { $random.Dispose() }
}
if (-not (Test-Path -LiteralPath 'frontend/.env')) {
    Copy-Item -LiteralPath 'frontend/.env.example' -Destination 'frontend/.env'
}
Write-Output 'Local backend/frontend .env files are ready; existing configuration was preserved.'
