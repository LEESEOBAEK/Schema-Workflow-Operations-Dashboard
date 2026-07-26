[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 3215,
    [ValidateSet('stable', 'candidate')]
    [string]$Channel = 'candidate',
    [string]$InstallRoot = '',
    [string]$ProfilePath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$bundleRoot = $PSScriptRoot
$folder = if ($Channel -eq 'candidate') { '.schema-workflow-candidate' } else { '.schema-workflow' }
if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
    $InstallRoot = Join-Path $HOME $folder
}
$installRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$launcher = Join-Path $installRoot 'bin\schema-workflow.ps1'
$server = Join-Path $bundleRoot 'dashboard\.output\server\index.mjs'
if ([string]::IsNullOrWhiteSpace($ProfilePath)) {
    $ProfilePath = Join-Path $installRoot 'dashboard-profile.json'
}
$profilePath = [System.IO.Path]::GetFullPath(
    $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfilePath)
)

if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
    throw "Schema Workflow Engine is not installed: $launcher"
}
if (-not (Test-Path -LiteralPath $server -PathType Leaf)) {
    throw 'Dashboard production build is missing. Run Install-SchemaWorkflowBundle.ps1 first.'
}
if (-not (Test-Path -LiteralPath $profilePath -PathType Leaf)) {
    throw "Dashboard profile is missing. Run Install-SchemaWorkflowBundle.ps1 first: $profilePath"
}
$profile = Get-Content -LiteralPath $profilePath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]$profile.schema_version -ne '1.0.0') {
    throw "Unsupported dashboard profile schema: $($profile.schema_version)"
}
$projectRoots = @($profile.project_roots | ForEach-Object { [string]$_ })
if ($projectRoots.Count -eq 0) {
    throw 'Dashboard profile must contain at least one project root.'
}

$env:NUXT_DASHBOARD_DATA_MODE = 'live'
$env:NUXT_SCHEMA_WORKFLOW_LAUNCHER = $launcher
$env:NUXT_SCHEMA_WORKFLOW_PACKAGE_ROOT = (Join-Path $bundleRoot 'engine')
$env:NUXT_DASHBOARD_PROJECT_ROOTS = ($projectRoots -join ';')
$env:NUXT_DASHBOARD_METADATA_PATH = [string]$profile.metadata_path
$env:NUXT_DASHBOARD_PROJECT_CATALOG_PATH = [string]$profile.project_catalog_path
$env:NUXT_DASHBOARD_TRUSTED_AUTO_REGISTRY_PATH = [string]$profile.trusted_auto_registry_path
$env:PORT = [string]$Port
$env:HOST = '127.0.0.1'

Set-Location -LiteralPath (Join-Path $bundleRoot 'dashboard')
& node $server
exit $LASTEXITCODE
