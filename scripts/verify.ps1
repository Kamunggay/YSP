[CmdletBinding()]
param(
    [ValidateSet('preflight', 'toolchain', 'script-tests', 'contracts', 'client', 'backend', 'sessions', 'enrollment', 'same-origin')]
    [string] $Stage,
    [ValidateSet('preflight', 'toolchain', 'script-tests', 'contracts', 'client', 'backend', 'sessions', 'enrollment', 'same-origin')]
    [string] $From
)
$ErrorActionPreference = 'Stop'
if ($PSBoundParameters.ContainsKey('Stage') -and $PSBoundParameters.ContainsKey('From')) {
    throw 'Specify either -Stage or -From, not both.'
}
Set-Location (Split-Path $PSScriptRoot -Parent)
if ($Stage) { $Stage = $Stage.ToLowerInvariant() }
if ($From) { $From = $From.ToLowerInvariant() }
$stageOrder = @('preflight', 'toolchain', 'script-tests', 'contracts', 'client', 'backend', 'sessions', 'enrollment', 'same-origin')
$partial = $PSBoundParameters.ContainsKey('Stage') -or $PSBoundParameters.ContainsKey('From')
$selected = if ($Stage) { @($Stage) } elseif ($From) { $stageOrder[([array]::IndexOf($stageOrder, $From))..($stageOrder.Count - 1)] } else { $stageOrder }
$verificationShell = if ($PSVersionTable.PSEdition -eq 'Desktop') { 'powershell.exe' } else { 'pwsh' }
$completed = @{}
$verificationExitCode = 1
$currentStage = $null
$nodeReady = $false

function Invoke-Checked {
    param([string] $Command, [string[]] $Arguments)
    Get-Command $Command -ErrorAction Stop | Out-Null
    # Native stderr is diagnostic output, including under Windows PowerShell 5.1.
    # Decide success from the executable's exit status rather than stderr records.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $global:LASTEXITCODE = 0
        & $Command @Arguments
        $status = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    if ($status -ne 0) {
        $script:verificationExitCode = $status
        throw "Verification command failed: $Command $Arguments (exit $status)"
    }
}
function Invoke-Child {
    param([string] $Name, [string[]] $Arguments = @())
    # Separate processes keep the existing children's functions, exit and cleanup local.
    Invoke-Checked $verificationShell (@('-NoProfile', '-File', (Join-Path $PSScriptRoot $Name)) + $Arguments)
}
function Initialize-Node {
    if ($script:nodeReady) { return }
    Write-Output 'Preparing Node 24 and locked transport dependencies.'
    Invoke-Checked node @('-e', 'if(parseInt(process.versions.node)!==24)process.exit(1)')
    # Always install from the lock, rather than trusting a stale node_modules directory.
    Invoke-Checked npm @('ci', '--prefix', 'contracts/transport', '--ignore-scripts', '--no-audit', '--no-fund')
    $script:nodeReady = $true
}
function Invoke-Stage([string] $Name) {
    if ($completed.ContainsKey($Name)) { return }
    if ($Name -ne 'preflight') { Invoke-Stage 'preflight' }
    if ($Name -in @('contracts', 'client', 'same-origin')) { Invoke-Stage 'toolchain' }
    $script:currentStage = $Name
    Write-Output "[verification-stage] $Name"
    switch ($Name) {
        'preflight' { Invoke-Child 'verify-preflight.ps1' }
        'toolchain' { Invoke-Child 'verify-toolchain.ps1' }
        'script-tests' {
            Initialize-Node
            New-Item -ItemType Directory -Force .runtime | Out-Null
            Invoke-Checked node @('--test', 'scripts/tests/verification.test.mjs', 'scripts/tests/run-native.test.mjs', 'scripts/tests/run-http-tests.test.mjs', 'scripts/tests/enrollment-environment.test.mjs')
        }
        'contracts' { Invoke-Checked docker @('run', '--rm', '-w', '/workspace/contracts/transport', 'ysp-verification:local', 'npm', 'test') }
        'client' {
            Invoke-Checked docker @('run', '--rm', '-w', '/workspace/contracts/transport', 'ysp-verification:local', 'npm', 'audit', '--package-lock-only')
            Invoke-Checked docker @('run', '--rm', 'ysp-verification:local', 'npm', 'test')
            Invoke-Checked docker @('run', '--rm', 'ysp-verification:local', 'npm', 'audit', '--package-lock-only')
        }
        'backend' { Invoke-Child 'verify-backend.ps1' }
        'sessions' { Invoke-Child 'verify-sessions.ps1' }
        'enrollment' {
            Initialize-Node
            Invoke-Child 'verify-enrollment.ps1' @('-Action', 'Run')
        }
        'same-origin' { Invoke-Child 'verify-same-origin.ps1' @('-BrowserImage', 'ysp-verification:local') }
    }
    $completed[$Name] = $true
}

try {
    if ($partial) { Write-Output ('Partial verification requested: ' + ($selected -join ', ')) }
    else { Write-Output 'Full verification requested; no deployment or package acceptance implied.' }
    foreach ($name in $selected) { Invoke-Stage $name }
    if ($partial) { Write-Output 'Partial verification passed. The entire suite was not verified.' }
    else { Write-Output 'Full verification passed for this checkout. Review and package acceptance are recorded separately.' }
} catch {
    Write-Output "Verification failed at stage: $currentStage"
    Write-Output $_.Exception.Message
    Write-Output ('Targeted rerun: {0} -NoProfile -File "{1}" -Stage {2}' -f $verificationShell, (Join-Path $PSScriptRoot 'verify.ps1'), $currentStage)
    exit $verificationExitCode
}
