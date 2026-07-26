import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { approveTrustedProject, revokeTrustedProject, trustedAutoStatus, trustedProjectRoots } from '../server/utils/trustedAutoRegistry'

const roots: string[] = []

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'trusted-auto-'))
  roots.push(root)
  const projectRoot = join(root, 'workspace', 'project-a')
  await mkdir(projectRoot, { recursive: true })
  return { root, projectRoot, registryPath: join(root, 'user-data', 'trusted-projects.json') }
}

afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('trusted auto registry', () => {
  it('approves an exact project and isolates grants by platform', async () => {
    const { projectRoot, registryPath } = await fixture()
    const approved = await approveTrustedProject(registryPath, projectRoot, 'claude')

    expect(approved.approved).toBe(true)
    expect(approved.grant?.platform).toBe('claude')
    expect((await trustedAutoStatus(registryPath, projectRoot, 'codex')).approved).toBe(false)
    expect(await trustedProjectRoots(registryPath, 'claude')).toEqual([approved.project_root])
  })

  it('records approval and revocation without leaving an active grant', async () => {
    const { projectRoot, registryPath, root } = await fixture()
    await approveTrustedProject(registryPath, projectRoot, 'antigravity')
    const revoked = await revokeTrustedProject(registryPath, projectRoot, 'antigravity')

    expect(revoked.approved).toBe(false)
    expect(await trustedProjectRoots(registryPath, 'antigravity')).toEqual([])
    const audit = await readFile(join(root, 'user-data', 'trusted-auto-events.jsonl'), 'utf8')
    expect(audit).toContain('TRUST_GRANTED')
    expect(audit).toContain('TRUST_REVOKED')
  })

  it('rejects approval for the entire user directory', async () => {
    const { registryPath } = await fixture()
    await expect(approveTrustedProject(registryPath, homedir(), 'codex')).rejects.toMatchObject({ code: 'TRUST_ROOT_TOO_BROAD' })
  })
})
