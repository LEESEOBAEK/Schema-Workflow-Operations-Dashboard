import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { inspectEngineReadiness, installEnginePackage } from '../server/utils/engineReadiness'

async function packageFixture(root: string, release = '1.0.2-candidate.1') {
  const packageRoot = join(root, 'package')
  await mkdir(join(packageRoot, 'installer'), { recursive: true })
  await writeFile(join(packageRoot, 'release-manifest.json'), JSON.stringify({
    release_version: release,
    manifest_sha256: 'package-sha',
  }), 'utf8')
  await writeFile(join(packageRoot, 'installer', 'Install-SchemaWorkflow.ps1'), '# installer\n', 'utf8')
  return packageRoot
}

async function installedFixture(root: string, release = '1.0.2-candidate.1') {
  const installRoot = join(root, 'install')
  await mkdir(join(installRoot, 'bin'), { recursive: true })
  await mkdir(join(installRoot, 'releases', release), { recursive: true })
  await writeFile(join(installRoot, 'bin', 'schema-workflow.ps1'), '# launcher\n', 'utf8')
  await writeFile(join(installRoot, 'active-release.json'), JSON.stringify({
    release_version: release,
    manifest_sha256: 'release-sha',
  }), 'utf8')
  await writeFile(join(installRoot, 'releases', release, 'release-manifest.json'), JSON.stringify({
    release_version: release,
    manifest_sha256: 'release-sha',
  }), 'utf8')
  return installRoot
}

describe('engine readiness', () => {
  it('separates a missing engine from an unavailable package', async () => {
    const root = await mkdtemp(join(tmpdir(), 'engine-readiness-'))
    const result = await inspectEngineReadiness({ installRoot: join(root, 'missing') })
    expect(result).toMatchObject({
      status: 'not_installed',
      package_available: false,
      can_install: false,
      active_release: null,
    })
  })

  it('offers installation when a verified package shape is present', async () => {
    const root = await mkdtemp(join(tmpdir(), 'engine-readiness-'))
    const packageRoot = await packageFixture(root)
    const result = await inspectEngineReadiness({ installRoot: join(root, 'missing'), packageRoot })
    expect(result).toMatchObject({
      status: 'not_installed',
      package_available: true,
      package_release: '1.0.2-candidate.1',
      can_install: true,
    })
  })

  it('reports a matching active release as ready', async () => {
    const root = await mkdtemp(join(tmpdir(), 'engine-readiness-'))
    const installRoot = await installedFixture(root)
    const result = await inspectEngineReadiness({ installRoot })
    expect(result).toMatchObject({
      status: 'ready',
      active_release: '1.0.2-candidate.1',
    })
  })

  it('blocks a mismatched active pointer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'engine-readiness-'))
    const installRoot = await installedFixture(root)
    await writeFile(join(installRoot, 'active-release.json'), JSON.stringify({
      release_version: '1.0.2-candidate.1',
      manifest_sha256: 'wrong-sha',
    }), 'utf8')
    expect(await inspectEngineReadiness({ installRoot })).toMatchObject({ status: 'invalid' })
  })

  it('runs the package installer only through the explicit install operation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'engine-readiness-'))
    const packageRoot = await packageFixture(root)
    const installRoot = join(root, 'install')
    const runCommand = vi.fn(async () => {
      await installedFixture(root)
      return { stdout: '', stderr: '' }
    })
    const result = await installEnginePackage({ installRoot, packageRoot, runCommand: runCommand as any })
    expect(runCommand).toHaveBeenCalledOnce()
    expect(result.status).toBe('ready')
  })
})
