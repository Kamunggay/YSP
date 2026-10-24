$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$configText = & docker compose config --format json
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration failed' }
$config = $configText | ConvertFrom-Json
if ($config.services.mysql.ports) { throw 'MySQL must not publish ports' }
if (-not $config.networks.private.internal) { throw 'MySQL network must be private' }
if (@($config.services.mysql.networks.PSObject.Properties.Name).Count -ne 1 -or
    $config.services.mysql.networks.PSObject.Properties.Name -notcontains 'private') {
    throw 'MySQL must join only the private network'
}
if ($config.services.mysql.image -notmatch '@sha256:[a-f0-9]{64}$') { throw 'MySQL image is not immutable' }
foreach ($port in $config.services.backend.ports) {
    if ($port.host_ip -ne '127.0.0.1') { throw 'Local API must bind loopback only' }
}
foreach ($secret in @('.runtime/app_key', '.runtime/db_password', '.runtime/db_root_password', 'backend/.env', 'backend/vendor/autoload.php')) {
    & git check-ignore --quiet -- $secret
    if ($LASTEXITCODE -ne 0) { throw "Private/generated path is not ignored: $secret" }
}
$tracked = & git ls-files
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect tracked files' }
foreach ($path in $tracked) {
    if ($path -match '(^|/)(\.env(\.(?!example$)[^/]+)?|auth\.json)$|^\.runtime/|^backend/vendor/') {
        throw "Private/generated file is tracked: $path"
    }
}
$sourceFiles = Get-ChildItem backend, scripts, .github -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '[\\/](vendor|storage|cache)[\\/]' -and $_.Extension -in @('.php', '.json', '.yaml', '.yml', '.ps1') }
foreach ($secretName in @('app_key', 'db_password', 'db_root_password')) {
    $value = [IO.File]::ReadAllText((Join-Path '.runtime' $secretName)).Trim()
    if ($value.Length -lt 32) { throw 'Missing or weak local secret' }
    foreach ($sourceFile in $sourceFiles) {
        if ([IO.File]::ReadAllText($sourceFile.FullName).Contains($value)) { throw 'Local secret copied into source' }
    }
}
Write-Output 'Private network, immutable DB image, ignored secrets and local secret scan passed.'
