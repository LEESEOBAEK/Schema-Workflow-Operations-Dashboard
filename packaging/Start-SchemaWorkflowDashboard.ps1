[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 3215,
    [ValidateSet('stable', 'candidate')]
    [string]$Channel = 'candidate',
    [string]$InstallRoot = ''
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

if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
    throw "Schema Workflow Engine is not installed: $launcher"
}
if (-not (Test-Path -LiteralPath $server -PathType Leaf)) {
    throw 'Dashboard production build is missing. Run Install-SchemaWorkflowBundle.ps1 first.'
}

$env:NUXT_DASHBOARD_DATA_MODE = 'live'
$env:NUXT_SCHEMA_WORKFLOW_LAUNCHER = $launcher
$env:NUXT_SCHEMA_WORKFLOW_PACKAGE_ROOT = (Join-Path $bundleRoot 'engine')
$env:PORT = [string]$Port
$env:HOST = '127.0.0.1'

Set-Location -LiteralPath (Join-Path $bundleRoot 'dashboard')
& node $server
exit $LASTEXITCODE
