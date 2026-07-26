import type { WorkflowRun, WorkSession } from '../../shared/types/dashboard'

export interface RunChoice extends WorkflowRun {
  linked_session_ids: string[]
  linked_session_names: string[]
}

function freshness(run: WorkflowRun): string {
  return run.metadata_updated_at ?? run.created_at ?? ''
}

export function buildRunChoices(sessions: WorkSession[]): RunChoice[] {
  const choices = new Map<string, RunChoice>()

  for (const session of sessions) {
    for (const run of session.runs) {
      const current = choices.get(run.run_id)
      if (!current) {
        choices.set(run.run_id, {
          ...run,
          linked_session_ids: [session.session_id],
          linked_session_names: [session.name],
        })
        continue
      }

      if (freshness(run) > freshness(current)) {
        Object.assign(current, run)
      }
      if (!current.linked_session_ids.includes(session.session_id)) {
        current.linked_session_ids.push(session.session_id)
      }
      if (!current.linked_session_names.includes(session.name)) {
        current.linked_session_names.push(session.name)
      }
    }
  }

  return [...choices.values()]
}
