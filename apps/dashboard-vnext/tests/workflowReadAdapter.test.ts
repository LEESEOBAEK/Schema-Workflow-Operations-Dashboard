import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readWorkflowDashboard } from '../server/utils/workflowReadAdapter'

const temporaryRoots: string[] = []

async function makeProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dashboard-read-adapter-'))
  temporaryRoots.push(root)
  await mkdir(join(root, 'outputs', 'workflows'), { recursive: true })
  return root
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function makeRun(projectRoot: string, runId: string, parentRunId: string | null = null): Promise<string> {
  const runDir = join(projectRoot, 'outputs', 'workflows', runId)
  await mkdir(join(runDir, '07_fulfillment', 'data'), { recursive: true })
  await writeJson(join(runDir, 'workflow_manifest.json'), {
    run_id: runId,
    workspace_id: 'ws_test_001',
    operation_id: `op_${runId}`,
    parent_run_id: parentRunId,
    relation_type: parentRunId ? 'branch' : 'independent',
    created_at: parentRunId ? '2026-01-02T00:00:00Z' : '2026-01-01T00:00:00Z',
    trace: { original_run_name: parentRunId ? '후속 실행' : '기준 실행' },
    summary: { workflow_state: 'request_completed', next_required_action: 'none' },
  })
  await writeJson(join(runDir, 'workflow_next.json'), { workflow_state: 'request_completed', next_action: { type: 'none' } })
  await writeJson(join(runDir, 'artifacts_manifest.json'), { artifacts: [{ id: `artifact_${runId}` }] })
  await writeJson(join(runDir, '07_fulfillment', 'data', 'evidence_filled.json'), { criteria_results: [{ criterion_id: `evidence_${runId}`, status: 'pass' }] })
  await writeJson(join(runDir, '07_fulfillment', 'data', 'validation.json'), { valid: true, can_complete: true, severity: 'pass' })
  return runDir
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('workflow read adapter', () => {
  it('preserves source bytes and run, artifact, and evidence IDs', async () => {
    const root = await makeProject()
    const firstDir = await makeRun(root, 'run_001')
    await makeRun(root, 'run_002', 'run_001')
    const manifestPath = join(firstDir, 'workflow_manifest.json')
    const before = await sha256(manifestPath)

    const dashboard = await readWorkflowDashboard({ projectRoots: [root] })

    expect(await sha256(manifestPath)).toBe(before)
    expect(dashboard.projects).toHaveLength(1)
    expect(dashboard.projects[0]?.sessions).toHaveLength(1)
    const runs = dashboard.projects[0]?.sessions[0]?.runs ?? []
    expect(runs.map(run => run.run_id)).toEqual(['run_001', 'run_002'])
    expect(runs[0]?.artifact_ids).toEqual(['artifact_run_001'])
    expect(runs[0]?.evidence_ids).toEqual(['evidence_run_001'])
    expect(runs.every(run => run.status === 'pass')).toBe(true)
  })

  it('marks a missing parent relation as unresolved instead of inventing a link', async () => {
    const root = await makeProject()
    await makeRun(root, 'run_orphan', 'run_missing')

    const dashboard = await readWorkflowDashboard({ projectRoots: [root] })

    expect(dashboard.projects[0]?.sessions[0]?.relation_status).toBe('unresolved')
    expect(dashboard.conflicts[0]?.source_id).toBe('run_orphan')
    expect(dashboard.conflicts[0]?.target_id).toBe('run_missing')
  })

  it('accepts UTF-8 BOM JSON produced by Windows tools', async () => {
    const root = await makeProject()
    const runDir = await makeRun(root, 'run_bom_evidence')
    const evidencePath = join(runDir, '07_fulfillment', 'data', 'evidence_filled.json')
    await writeFile(evidencePath, `\uFEFF${JSON.stringify({ criteria_results: [{ criterion_id: 'evidence_bom', status: 'pass' }] })}`, 'utf8')

    const dashboard = await readWorkflowDashboard({ projectRoots: [root] })
    const run = dashboard.projects[0]?.sessions[0]?.runs[0]

    expect(run?.status).toBe('pass')
    expect(run?.evidence_ids).toEqual(['evidence_bom'])
    expect(dashboard.source?.warnings.some(warning => warning.code === 'SOURCE_JSON_INVALID')).toBe(false)
  })

  it('downgrades a completed run when its evidence JSON is damaged', async () => {
    const root = await makeProject()
    const runDir = await makeRun(root, 'run_damaged_evidence')
    await writeFile(join(runDir, '07_fulfillment', 'data', 'evidence_filled.json'), '{ invalid', 'utf8')

    const dashboard = await readWorkflowDashboard({ projectRoots: [root] })
    const run = dashboard.projects[0]?.sessions[0]?.runs[0]

    expect(run?.status).toBe('evidence_insufficient')
    expect(run?.warnings).toContain('SOURCE_JSON_INVALID')
  })
it('bounds oversized source content and exposes an unknown run with a warning', async () => {
    const root = await makeProject()
    const runDir = join(root, 'outputs', 'workflows', 'run_oversized')
    await mkdir(runDir, { recursive: true })
    await writeFile(join(runDir, 'workflow_manifest.json'), JSON.stringify({ payload: 'x'.repeat(500) }), 'utf8')

    const dashboard = await readWorkflowDashboard({ projectRoots: [root], maxSourceBytes: 100 })
    const run = dashboard.projects[0]?.sessions[0]?.runs[0]

    expect(run?.run_id).toBe('run_oversized')
    expect(run?.status).toBe('unknown')
    expect(dashboard.source?.warnings.some(warning => warning.code === 'SOURCE_FILE_TOO_LARGE')).toBe(true)
  })
})
