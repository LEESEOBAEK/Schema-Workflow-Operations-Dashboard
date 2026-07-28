import { describe, expect, it } from 'vitest'
import type { WorkSession } from '../shared/types/dashboard'
import { runSelectionFor } from '../app/utils/runSelection'

const sessions: WorkSession[] = [
  {
    session_id: 'session_a',
    name: '첫 작업',
    relation_status: 'confirmed',
    runs: [{ run_id: 'run_a', status: 'pass', platform: 'codex', next_action: '완료', artifact_count: 1, evidence_count: 1 }],
  },
  {
    session_id: 'session_b',
    name: '두 번째 작업',
    relation_status: 'confirmed',
    runs: [{ run_id: 'run_b', status: 'hold', platform: 'claude', next_action: '검토', artifact_count: 0, evidence_count: 0 }],
  },
]

describe('run selection synchronization', () => {
  it('returns the owning session and run together', () => {
    expect(runSelectionFor(sessions, 'run_b')).toEqual({ session_id: 'session_b', run_id: 'run_b' })
  })

  it('does not invent a session for an unknown run', () => {
    expect(runSelectionFor(sessions, 'run_missing')).toBeNull()
  })
})
