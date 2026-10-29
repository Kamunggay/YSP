param([string] $Stage, [string] $From, [string] $Fail = '', [string] $Signals)
$ErrorActionPreference = 'Stop'
function global:docker {
    Add-Content -LiteralPath $Signals -Value ('docker ' + ($args -join ' '))
    $global:LASTEXITCODE = if ($Fail -eq 'docker') { 23 } else { 0 }
}
function global:git { $global:LASTEXITCODE = 0 }
function global:node {
    Add-Content -LiteralPath $Signals -Value ('node ' + ($args -join ' '))
    $global:LASTEXITCODE = if ($Fail -eq 'node') { 24 } else { 0 }
    if ($args[0] -eq '--test' -and -not (Test-Path -LiteralPath '.runtime')) {
        Write-Output 'The lifecycle tests require a runtime directory.'
        $global:LASTEXITCODE = 27
    }
}
function global:npm {
    Add-Content -LiteralPath $Signals -Value ('npm ' + ($args -join ' '))
    $global:LASTEXITCODE = if ($Fail -eq 'npm') { 25 } else { 0 }
}
function Invoke-TestShell {
    $script = Split-Path $args[2] -Leaf
    $extra = if ($args.Count -gt 3) { $args[3..($args.Count - 1)] -join ' ' } else { '' }
    Add-Content -LiteralPath $Signals -Value ($script + ' ' + $extra)
    $global:LASTEXITCODE = if ($script -eq $Fail) { 17 } else { 0 }
}
function global:powershell.exe { Invoke-TestShell @args }
function global:pwsh { Invoke-TestShell @args }
$selection = @{}
if ($PSBoundParameters.ContainsKey('Stage')) { $selection.Stage = $Stage }
if ($PSBoundParameters.ContainsKey('From')) { $selection.From = $From }
& (Join-Path $PSScriptRoot '../../verify.ps1') @selection
exit $LASTEXITCODE
