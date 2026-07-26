import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'

describe('portable bundle command contract', () => {
  it('does not require a globally installed pnpm from the build script', () => {
    expect(packageJson.scripts.build).toBe('nuxt typecheck && nuxt build')
    expect(packageJson.scripts.build).not.toContain('pnpm ')
  })

  it('runs Dashboard validation and build through Corepack', async () => {
    const installer = await readFile(
      resolve(process.cwd(), '..', '..', 'packaging', 'Install-SchemaWorkflowBundle.ps1'),
      'utf8',
    )
    expect(installer).toContain('& $corepack.Source pnpm run typecheck')
    expect(installer).toContain('& $corepack.Source pnpm exec nuxt build')
    expect(installer).not.toContain('& $corepack.Source pnpm build')
  })

  it('persists dashboard paths and ships a double-click launcher', async () => {
    const packagingRoot = resolve(process.cwd(), '..', '..', 'packaging')
    const installer = await readFile(resolve(packagingRoot, 'Install-SchemaWorkflowBundle.ps1'), 'utf8')
    const starter = await readFile(resolve(packagingRoot, 'Start-SchemaWorkflowDashboard.ps1'), 'utf8')
    const builder = await readFile(resolve(packagingRoot, 'Build-SchemaWorkflowBundle.ps1'), 'utf8')
    const cmd = await readFile(resolve(packagingRoot, 'Start-SchemaWorkflowDashboard.cmd'), 'utf8')

    expect(installer).toContain("'dashboard-profile.json'")
    expect(installer).toContain("'dashboard-profiles'")
    expect(installer).toContain("dashboard_install_mode = $dashboardInstallMode")
    expect(installer).toContain('workspace_root = $workspace')
    expect(starter).toContain('$env:NUXT_DASHBOARD_PROJECT_ROOTS')
    expect(starter).toContain('$env:NUXT_DASHBOARD_METADATA_PATH')
    expect(starter).toContain('Dashboard port $Port is already in use')
    expect(starter).toContain('[string]$ProfileName')
    expect(starter).toContain('[switch]$NoBrowser')
    expect(starter).toContain('Start-Process $Url')
    expect(builder).toContain("'Start-SchemaWorkflowDashboard.cmd'")
    expect(builder).toContain("Copy-Item -LiteralPath $prebuiltOutput")
    expect(cmd).toContain('Start-SchemaWorkflowDashboard.ps1')
  })
})
