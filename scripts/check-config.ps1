$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$configText = & docker compose --env-file backend/.env config --format json
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration failed' }
$config = $configText | ConvertFrom-Json
if ($config.services.mysql.ports) { throw 'MySQL must not publish ports' }
if (-not $config.networks.private.internal) { throw 'MySQL network must be private' }
if (@($config.services.mysql.networks.PSObject.Properties.Name).Count -ne 1 -or
    $config.services.mysql.networks.PSObject.Properties.Name -notcontains 'private') {
    throw 'MySQL must join only the private network'
}
if ($config.services.mysql.image -notmatch '@sha256:[a-f0-9]{64}$') { throw 'MySQL image is not immutable' }
if ($config.services.backend.ports) { throw 'Default runtime must not publish backend ports' }
foreach ($port in $config.services.frontend.ports) {
    if ($port.host_ip -ne '127.0.0.1') { throw 'Local frontend must bind loopback only' }
}
if ($config.services.frontend.secrets -or $config.services.frontend.environment) {
    throw 'Frontend must not receive backend credentials or environment'
}
foreach ($secret in @('backend/.env', 'backend/vendor/autoload.php', 'frontend/node_modules/', 'frontend/dist/', 'frontend/.env')) {
    & git check-ignore --quiet -- $secret
    if ($LASTEXITCODE -ne 0) { throw "Private/generated path is not ignored: $secret" }
}
$tracked = & git ls-files
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect tracked files' }
foreach ($path in $tracked) {
    if ($path -match '(^|/)(\.env(\.(?!example$)[^/]+)?|auth\.json)$|^\.runtime/|^backend/vendor/|^frontend/(node_modules|dist|test-results|playwright-report)/') {
        throw "Private/generated file is tracked: $path"
    }
}
$sourceFiles = Get-ChildItem backend, frontend, scripts, .github -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '[\\/](vendor|storage|cache|node_modules|test-results|playwright-report)[\\/]' -and $_.Name -ne '.env' -and $_.Extension -in @('.php', '.json', '.yaml', '.yml', '.ps1', '.ts', '.tsx', '.js', '.css', '.html', '.conf', '.md') }
foreach ($secretName in @('APP_KEY', 'DB_PASSWORD', 'MYSQL_ROOT_PASSWORD')) {
    $match = [regex]::Match([IO.File]::ReadAllText((Join-Path (Get-Location) 'backend/.env')), ('(?m)^' + $secretName + '=([^\r\n]*)'))
    $value = $match.Groups[1].Value.Trim()
    if ($value.Length -lt 32) { throw 'Missing or weak local secret' }
    foreach ($sourceFile in $sourceFiles) {
        if ([IO.File]::ReadAllText($sourceFile.FullName).Contains($value)) { throw 'Local secret copied into source' }
    }
}
Write-Output 'Private network, immutable DB image, ignored secrets and local secret scan passed.'
