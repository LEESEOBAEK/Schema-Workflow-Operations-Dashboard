[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EngineSourceRoot,
    [string]$DashboardSourceRoot = '',
    [Parameter(Mandatory = $true)][string]$OutputRoot,
    [Parameter(Mandatory = $true)][string]$ReleaseVersion,
    [Parameter(Mandatory = $true)][string]$SourceCommit
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($DashboardSourceRoot)) {
    $DashboardSourceRoot = Join-Path $PSScriptRoot '..\apps\dashboard-vnext'
}
$engineSource = (Resolve-Path -LiteralPath $EngineSourceRoot).Path
$dashboardSource = (Resolve-Path -LiteralPath $DashboardSourceRoot).Path
$output = [System.IO.Path]::GetFullPath(
    $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputRoot)
)
if (Test-Path -LiteralPath $output) {
    throw "Bundle output already exists: $output"
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    throw 'Python is required to build the Engine release package.'
}
$corepack = Get-Command corepack -ErrorAction SilentlyContinue
if (-not $corepack) {
    throw 'Node.js with Corepack is required to build the prebuilt Dashboard.'
}

New-Item -ItemType Directory -Path $output | Out-Null
try {
    $engineOutput = Join-Path $output 'engine'
    Push-Location -LiteralPath $engineSource
    try {
        & $python.Source -m release_manager.package_builder `
            --source-root $engineSource `
            --output-root $engineOutput `
            --release-version $ReleaseVersion `
            --source-commit $SourceCommit
        if ($LASTEXITCODE -ne 0) {
            throw 'Engine candidate package build failed.'
        }
    }
    finally {
        Pop-Location
    }

    $dashboardOutput = Join-Path $output 'dashboard'
    New-Item -ItemType Directory -Path $dashboardOutput | Out-Null
    foreach ($directory in @('app', 'public', 'server', 'shared', 'tests')) {
        Copy-Item -LiteralPath (Join-Path $dashboardSource $directory) -Destination $dashboardOutput -Recurse
    }
    foreach ($file in @(
        '.env.example',
        '.gitignore',
        'nuxt.config.ts',
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        'README.md',
        'tsconfig.json'
    )) {
        Copy-Item -LiteralPath (Join-Path $dashboardSource $file) -Destination $dashboardOutput
    }
    Push-Location -LiteralPath $dashboardSource
    try {
        & $corepack.Source pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            throw 'Dashboard dependency installation failed during bundle build.'
        }
        & $corepack.Source pnpm run typecheck
        if ($LASTEXITCODE -ne 0) {
            throw 'Dashboard typecheck failed during bundle build.'
        }
        & $corepack.Source pnpm exec nuxt build
        if ($LASTEXITCODE -ne 0) {
            throw 'Dashboard production build failed during bundle build.'
        }
    }
    finally {
        Pop-Location
    }
    $prebuiltOutput = Join-Path $dashboardSource '.output'
    if (-not (Test-Path -LiteralPath (Join-Path $prebuiltOutput 'server\index.mjs') -PathType Leaf)) {
        throw 'Prebuilt Dashboard server output is missing after build.'
    }
    Copy-Item -LiteralPath $prebuiltOutput -Destination $dashboardOutput -Recurse

    foreach ($file in @(
        'Install-SchemaWorkflowBundle.ps1',
        'Start-SchemaWorkflowDashboard.ps1',
        'Start-SchemaWorkflowDashboard.cmd',
        'README.md'
    )) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $output
    }

    $outputPrefix = $output.TrimEnd('\') + '\'
    $files = Get-ChildItem -LiteralPath $output -Recurse -File |
        Where-Object { $_.Name -ne 'bundle-manifest.json' } |
        Sort-Object FullName |
        ForEach-Object {
            [pscustomobject]@{
                path = $_.FullName.Substring($outputPrefix.Length).Replace('\', '/')
                size = $_.Length
                sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            }
        }
    [pscustomobject]@{
        schema_version = '1.0.0'
        bundle_version = $ReleaseVersion
        created_at = (Get-Date).ToString('o')
        files = @($files)
    } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $output 'bundle-manifest.json') -Encoding UTF8
}
catch {
    if (Test-Path -LiteralPath $output) {
        Remove-Item -LiteralPath $output -Recurse -Force
    }
    throw
}

[pscustomobject]@{
    status = 'normal'
    code = 'PORTABLE_BUNDLE_BUILT'
    bundle_root = $output
    release_version = $ReleaseVersion
    file_count = @($files).Count
} | ConvertTo-Json
