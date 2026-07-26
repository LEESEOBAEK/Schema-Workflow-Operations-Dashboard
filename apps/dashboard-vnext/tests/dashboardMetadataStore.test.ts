import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DashboardState } from '../shared/types/dashboard'
import { applyDashboardMetadata, saveRunMetadata, saveSessionMetadata, saveSessionOrder, systemRunLabel } from '../server/utils/dashboardMetadataStore'

const roots: string[] = []

function dashboard(runId: string): DashboardState {
  return {
    schema_version: '1.1.0',
    conflicts: [],
    projects: [{
      project_id: 'project_test',
      name: '테스트',
      sessions: [{
        session_id: 'session_test',
        name: '테스트 세션',
        relation_status: 'confirmed',
        runs: [{
          run_id: runId,
          status: 'pass',
          platform: 'codex',
          next_action: '완료된 결과 검토',
          artifact_count: 1,
          evidence_count: 1,
        }],
      }],
    }],
    source: { mode: 'live', read_at: new Date().toISOString(), project_roots: [], warnings: [] },
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('dashboard metadata store', () => {
  it('keeps the system label while applying a user display title', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dashboard-metadata-'))
    roots.push(root)
    const metadataPath = join(root, 'dashboard-metadata.json')
    const runId = '2026-07-18_120000__research-monitoring__abcdef12'

    await saveRunMetadata(metadataPath, {
      run_id: runId,
      display_title: '리서치 모니터링 MVP',
      user_note: '결과 검토 필요',
      tags: ['리서치', 'MVP'],
    })
    const decorated = await applyDashboardMetadata(dashboard(runId), metadataPath)
    const run = decorated.projects[0]?.sessions[0]?.runs[0]

    expect(run?.display_title).toBe('리서치 모니터링 MVP')
    expect(run?.system_label).toBe('research monitoring')
    expect(run?.display_status).toBe('active')
    expect(run?.user_note).toBe('결과 검토 필요')
    expect(run?.tags).toEqual(['리서치', 'MVP'])
  })

  it('falls back to the fixed system label when the display title is empty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dashboard-metadata-'))
    roots.push(root)
    const metadataPath = join(root, 'dashboard-metadata.json')
    const runId = '2026-07-18_120000__research-monitoring__abcdef12'

    await saveRunMetadata(metadataPath, { run_id: runId, display_title: '', user_note: '', tags: [] })
    const decorated = await applyDashboardMetadata(dashboard(runId), metadataPath)

    expect(decorated.projects[0]?.sessions[0]?.runs[0]?.display_title).toBe('research monitoring')
  })

  it('preserves an audit history and serializes concurrent saves', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dashboard-metadata-'))
    roots.push(root)
    const metadataPath = join(root, 'dashboard-metadata.json')

    await Promise.all([
      saveRunMetadata(metadataPath, { run_id: 'run_001', display_title: '첫 실행', user_note: '', tags: [] }),
      saveRunMetadata(metadataPath, { run_id: 'run_002', display_title: '둘째 실행', user_note: '', tags: [] }),
    ])
    await saveRunMetadata(metadataPath, { run_id: 'run_001', display_title: '첫 실행 수정', user_note: '메모', tags: ['수정'] })

    const stored = JSON.parse(await readFile(metadataPath, 'utf8')) as { records: Record<string, { history: unknown[] }> }
    expect(Object.keys(stored.records)).toEqual(['run_001', 'run_002'])
    expect(stored.records.run_001?.history).toHaveLength(2)
  })

  it('stores an explicit display status without changing the engine result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dashboard-metadata-'))
    roots.push(root)
    const metadataPath = join(root, 'dashboard-metadata.json')
    const runId = 'run_001'

    await saveRunMetadata(metadataPath, { run_id: runId, display_title: '', user_note: '', tags: [], display_status: 'superseded' })
    const decorated = await applyDashboardMetadata(dashboard(runId), metadataPath)
    const run = decorated.projects[0]?.sessions[0]?.runs[0]

    expect(run?.display_status).toBe('superseded')
    expect(run?.status).toBe('pass')
  })

  it('applies a session display name per project while preserving the original name', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dashboard-metadata-'))
    roots.push(root)
    const metadataPath = join(root, 'dashboard-metadata.json')
    const state = dashboard('run_001')
    state.projects[0]!.source_root = root

    await saveSessionMetadata(metadataPath, { project_root: root, session_id: 'session_test', display_name: 'PDF 학습서 묶음' })
    const decorated = await applyDashboardMetadata(state, metadataPath)
    const session = decorated.projects[0]?.sessions[0]

    expect(session?.name).toBe('PDF 학습서 묶음')
    expect(session?.system_name).toBe('테스트 세션')
  })

  it('persists manual session order and preserves it while automatic sorting is active', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dashboard-metadata-'))
    roots.push(root)
    const metadataPath = join(root, 'dashboard-metadata.json')
    const state = dashboard('run_old')
    state.projects[0]!.source_root = root
    state.projects[0]!.sessions[0]!.runs[0]!.created_at = '2026-07-01T10:00:00Z'
    state.projects[0]!.sessions.push({
      session_id: 'session_new',
      name: '새 세션',
      relation_status: 'confirmed',
      runs: [{ run_id: 'run_new', status: 'pass', platform: 'codex', next_action: '완료', artifact_count: 1, evidence_count: 1, created_at: '2026-07-02T10:00:00Z' }],
    })

    await saveSessionOrder(metadataPath, { project_root: root, sort_mode: 'manual', session_ids: ['session_new', 'session_test'] })
    let decorated = await applyDashboardMetadata(state, metadataPath)
    expect(decorated.projects[0]?.sessions.map(session => session.session_id)).toEqual(['session_new', 'session_test'])
    expect(decorated.projects[0]?.session_sort_mode).toBe('manual')

    await saveSessionOrder(metadataPath, { project_root: root, sort_mode: 'oldest', session_ids: ['session_new', 'session_test'] })
    decorated = await applyDashboardMetadata(state, metadataPath)
    expect(decorated.projects[0]?.sessions.map(session => session.session_id)).toEqual(['session_test', 'session_new'])
    expect(decorated.projects[0]?.session_manual_order).toEqual(['session_new', 'session_test'])
  })

  it('rejects oversized editable fields', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dashboard-metadata-'))
    roots.push(root)
    await expect(saveRunMetadata(join(root, 'dashboard-metadata.json'), {
      run_id: 'run_001',
      display_title: 'x'.repeat(121),
      user_note: '',
      tags: [],
    })).rejects.toThrow('DISPLAY_TITLE_TOO_LONG')
  })

  it('derives a readable fixed label without changing the run id', () => {
    expect(systemRunLabel('2026-07-18_120000__research-monitoring__abcdef12')).toBe('research monitoring')
  })
})
