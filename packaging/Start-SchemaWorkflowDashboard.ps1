[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 3215,
    [ValidateSet('stable', 'candidate')]
    [string]$Channel = 'candidate',
    [string]$InstallRoot = '',
    [string]$ProfilePath = '',
    [string]$ProfileName = 'default',
    [switch]$NoBrowser
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
    if ($ProfileName -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$') {
        throw 'ProfileName must contain only letters, numbers, hyphens, or underscores.'
    }
    $ProfilePath = Join-Path $installRoot "dashboard-profiles\$ProfileName.json"
    $legacyProfilePath = Join-Path $installRoot 'dashboard-profile.json'
    if ($ProfileName -eq 'default' -and
        -not (Test-Path -LiteralPath $ProfilePath -PathType Leaf) -and
        (Test-Path -LiteralPath $legacyProfilePath -PathType Leaf)) {
        $ProfilePath = $legacyProfilePath
    }
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
    throw "Dashboard profile '$ProfileName' is missing. Install it with -ProfileName and -WorkspaceRoot: $profilePath"
}
$profile = Get-Content -LiteralPath $profilePath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]$profile.schema_version -ne '1.0.0') {
    throw "Unsupported dashboard profile schema: $($profile.schema_version)"
}
$projectRoots = @($profile.project_roots | ForEach-Object { [string]$_ })
if ($projectRoots.Count -eq 0) {
    throw 'Dashboard profile must contain at least one project root.'
}
$listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
    $processIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    throw "Dashboard port $Port is already in use by process $processIds. Close that process or run with -Port <another port>."
}

$env:NUXT_DASHBOARD_DATA_MODE = 'live'
$env:NUXT_SCHEMA_WORKFLOW_CHANNEL = $Channel
$env:NUXT_SCHEMA_WORKFLOW_LAUNCHER = $launcher
$env:NUXT_SCHEMA_WORKFLOW_PACKAGE_ROOT = (Join-Path $bundleRoot 'engine')
$env:NUXT_DASHBOARD_PROJECT_ROOTS = ($projectRoots -join ';')
$env:NUXT_DASHBOARD_METADATA_PATH = [string]$profile.metadata_path
$env:NUXT_DASHBOARD_PROJECT_CATALOG_PATH = [string]$profile.project_catalog_path
$env:NUXT_DASHBOARD_TRUSTED_AUTO_REGISTRY_PATH = [string]$profile.trusted_auto_registry_path
$env:PORT = [string]$Port
$env:HOST = '127.0.0.1'

Set-Location -LiteralPath (Join-Path $bundleRoot 'dashboard')
$browserJob = $null
if (-not $NoBrowser) {
    $dashboardUrl = "http://127.0.0.1:$Port/"
    $browserJob = Start-Job -ScriptBlock {
        param([string]$Url)
        for ($attempt = 0; $attempt -lt 80; $attempt++) {
            try {
                $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 1
                if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                    Start-Process $Url
                    return
                }
            }
            catch {
                Start-Sleep -Milliseconds 250
            }
        }
    } -ArgumentList $dashboardUrl
}
try {
    & node $server
    $serverExitCode = $LASTEXITCODE
}
finally {
    if ($browserJob) {
        Stop-Job -Job $browserJob -ErrorAction SilentlyContinue
        Remove-Job -Job $browserJob -Force -ErrorAction SilentlyContinue
    }
}
exit $serverExitCode
