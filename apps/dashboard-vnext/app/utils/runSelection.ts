import type { WorkSession } from '../../shared/types/dashboard'

export interface RunSelection {
  session_id: string
  run_id: string
}

export function runSelectionFor(sessions: WorkSession[], runId: string): RunSelection | null {
  for (const session of sessions) {
    if (session.runs.some(run => run.run_id === runId)) {
      return { session_id: session.session_id, run_id: runId }
    }
  }
  return null
}
