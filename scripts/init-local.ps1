$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$secretDirectory = Join-Path (Get-Location) '.runtime'
[IO.Directory]::CreateDirectory($secretDirectory) | Out-Null
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    foreach ($secretName in @('app_key', 'db_password', 'db_root_password')) {
        $secretPath = Join-Path $secretDirectory $secretName
        if (-not (Test-Path -LiteralPath $secretPath)) {
            $secretBytes = New-Object byte[] 32
            $random.GetBytes($secretBytes)
            $secretValue = if ($secretName -eq 'app_key') {
                'base64:' + [Convert]::ToBase64String($secretBytes)
            } else {
                ([BitConverter]::ToString($secretBytes)).Replace('-', '').ToLowerInvariant()
            }
            [IO.File]::WriteAllText($secretPath, $secretValue)
        }
    }
} finally {
    $random.Dispose()
}
Write-Output 'Local secrets are ready; existing values were preserved.'
