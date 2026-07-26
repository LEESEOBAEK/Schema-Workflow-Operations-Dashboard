import { describe, expect, it } from 'vitest'
import { buildRunChoices } from '../app/utils/runChoices'
import type { WorkSession } from '../shared/types/dashboard'

describe('buildRunChoices', () => {
  it('shows one anchor choice when multiple sessions reuse the same Run', () => {
    const sessions: WorkSession[] = [
      {
        session_id: 'session_original',
        name: '브랜드 디자인',
        relation_status: 'confirmed',
        operation_kind: 'independent',
        runs: [{ run_id: 'run_shared', status: 'pass', platform: 'codex', next_action: 'none', artifact_count: 1, evidence_count: 1 }],
      },
      {
        session_id: 'session_continue',
        name: '브랜드 디자인 이어가기',
        relation_status: 'confirmed',
        operation_kind: 'continue',
        anchor_run_id: 'run_shared',
        runs: [{ run_id: 'run_shared', status: 'hold', platform: 'codex', next_action: 'select candidate', artifact_count: 5, evidence_count: 4, metadata_updated_at: '2026-07-19T13:00:00' }],
      },
    ]

    const choices = buildRunChoices(sessions)

    expect(choices).toHaveLength(1)
    expect(choices[0]).toMatchObject({
      run_id: 'run_shared',
      status: 'hold',
      artifact_count: 5,
      linked_session_ids: ['session_original', 'session_continue'],
      linked_session_names: ['브랜드 디자인', '브랜드 디자인 이어가기'],
    })
  })

  it('keeps distinct Run ids as separate choices', () => {
    const sessions: WorkSession[] = [{
      session_id: 'session_a',
      name: 'A',
      relation_status: 'confirmed',
      runs: [
        { run_id: 'run_a', status: 'pass', platform: 'codex', next_action: 'none', artifact_count: 1, evidence_count: 1 },
        { run_id: 'run_b', status: 'hold', platform: 'claude', next_action: 'review', artifact_count: 1, evidence_count: 1 },
      ],
    }]

    expect(buildRunChoices(sessions).map(run => run.run_id)).toEqual(['run_a', 'run_b'])
  })
})
