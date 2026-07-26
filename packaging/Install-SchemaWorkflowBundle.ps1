[CmdletBinding()]
param(
    [ValidateSet('stable', 'candidate')]
    [string]$Channel = 'candidate',
    [string]$InstallRoot = '',
    [switch]$Approved
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $Approved) {
    throw 'Bundle installation requires explicit approval. Run again with -Approved.'
}

$bundleRoot = $PSScriptRoot
$manifestPath = Join-Path $bundleRoot 'bundle-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Bundle manifest is missing: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($item in $manifest.files) {
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $bundleRoot ([string]$item.path)))
    if (-not $candidate.StartsWith(
        [System.IO.Path]::GetFullPath($bundleRoot).TrimEnd('\') + '\',
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
        throw "Bundle file escaped the bundle root: $($item.path)"
    }
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        throw "Bundle file is missing: $($item.path)"
    }
    $actual = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne [string]$item.sha256 -or (Get-Item -LiteralPath $candidate).Length -ne [long]$item.size) {
        throw "Bundle integrity check failed: $($item.path)"
    }
}

$python = Get-Command python -ErrorAction SilentlyContinue
$corepack = Get-Command corepack -ErrorAction SilentlyContinue
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $python) {
    throw 'Python 3.10 or newer is required to install Schema Workflow.'
}
$pythonVersionText = (& $python.Source --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $pythonVersionText -notmatch '^Python\s+(\d+)\.(\d+)') {
    throw "Unable to determine the Python version: $pythonVersionText"
}
if ([int]$Matches[1] -lt 3 -or ([int]$Matches[1] -eq 3 -and [int]$Matches[2] -lt 10)) {
    throw "Python 3.10 or newer is required. Found: $pythonVersionText"
}
if (-not $corepack -or -not $node) {
    throw 'Node.js with Corepack is required to install the Dashboard.'
}

$engineInstaller = Join-Path $bundleRoot 'engine\installer\Install-SchemaWorkflow.ps1'
$engineArguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $engineInstaller,
    '-PackageRoot', (Join-Path $bundleRoot 'engine'),
    '-Channel', $Channel,
    '-Approved'
)
if (-not [string]::IsNullOrWhiteSpace($InstallRoot)) {
    $engineArguments += @('-InstallRoot', $InstallRoot)
}
$engineOutput = & powershell.exe @engineArguments 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    throw "Engine installation failed.`n$engineOutput"
}
$engineResult = $engineOutput | ConvertFrom-Json

$dashboardRoot = Join-Path $bundleRoot 'dashboard'
Push-Location -LiteralPath $dashboardRoot
try {
    & $corepack.Source pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
        throw 'Dashboard dependency installation failed.'
    }
    & $corepack.Source pnpm build
    if ($LASTEXITCODE -ne 0) {
        throw 'Dashboard production build failed.'
    }
}
finally {
    Pop-Location
}

[pscustomobject]@{
    status = 'ready'
    code = 'SCHEMA_WORKFLOW_BUNDLE_INSTALLED'
    bundle_root = $bundleRoot
    engine_release = $engineResult.release_version
    engine_install_root = $engineResult.install_root
    dashboard_root = $dashboardRoot
    start_script = (Join-Path $bundleRoot 'Start-SchemaWorkflowDashboard.ps1')
} | ConvertTo-Json -Depth 8
