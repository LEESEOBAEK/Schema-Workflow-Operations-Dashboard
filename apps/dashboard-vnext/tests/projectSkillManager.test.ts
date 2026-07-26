import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspectProjectSkill, requireCurrentProjectSkill } from '../server/utils/projectSkillManager'

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

async function managedSkill(version = '1.0.0') {
  const root = await mkdtemp(join(tmpdir(), 'schema-workflow-skill-'))
  const target = join(root, '.claude', 'skills', 'schema-workflow')
  const content = '# Schema Workflow\n'
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'SKILL.md'), content, 'utf8')
  await writeFile(join(target, 'schema-workflow-skill.json'), JSON.stringify({
    schema_version: '1.0.0',
    owner: 'schema-workflow-skill-manager',
    compatible_platforms: ['claude'],
    channel: 'candidate',
    skill_version: version,
    files: { 'SKILL.md': hash(content) },
  }), 'utf8')
  return { root, target }
}

describe('project skill manager', () => {
  it('reports a missing skill', async () => {
    const root = await mkdtemp(join(tmpdir(), 'schema-workflow-skill-'))
    expect((await inspectProjectSkill(root, 'claude')).state).toBe('not_installed')
  })

  it('reports a current managed skill and its version', async () => {
    const { root } = await managedSkill()
    const status = await inspectProjectSkill(root, 'claude')
    expect(status.state).toBe('current')
    expect(status.installed_version).toBe('1.0.0')
    expect(status.restart_required).toBe(true)
  })

  it('detects modified managed files', async () => {
    const { root, target } = await managedSkill()
    await writeFile(join(target, 'SKILL.md'), '# Changed\n', 'utf8')
    const status = await inspectProjectSkill(root, 'claude')
    expect(status.state).toBe('modified')
    expect(status.changed_files).toEqual(['SKILL.md'])
  })

  it('detects an outdated skill version', async () => {
    const { root } = await managedSkill('0.9.0')
    expect((await inspectProjectSkill(root, 'claude')).state).toBe('update_required')
  })

  it('requires the same current skill state for every workflow operation', async () => {
    const { root } = await managedSkill()
    await expect(requireCurrentProjectSkill(root, 'claude')).resolves.toMatchObject({ state: 'current' })
    await expect(requireCurrentProjectSkill(root, 'codex')).rejects.toMatchObject({
      code: 'PROJECT_SKILL_NOT_READY',
      skill: { platform: 'codex', state: 'not_installed' },
    })
  })
})
