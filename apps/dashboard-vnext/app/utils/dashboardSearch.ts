import type { WorkflowProject } from '../../shared/types/dashboard'

export interface DashboardSearchResult {
  kind: 'session' | 'run'
  session_id: string
  run_id?: string
  title: string
  detail: string
}

function searchable(parts: Array<string | string[] | undefined>): string {
  return parts.flatMap(part => Array.isArray(part) ? part : [part ?? '']).join(' ').toLocaleLowerCase('ko')
}

export function searchProject(project: WorkflowProject | undefined, query: string, limit = 24): DashboardSearchResult[] {
  const term = query.trim().toLocaleLowerCase('ko')
  if (!project || term.length < 2) return []

  const results: DashboardSearchResult[] = []
  for (const session of project.sessions) {
    if (searchable([session.name, session.system_name, session.session_id]).includes(term)) {
      results.push({
        kind: 'session',
        session_id: session.session_id,
        title: session.name,
        detail: `작업 세션 · ${session.runs.length}개 실행`,
      })
    }

    for (const run of session.runs) {
      if (!searchable([
        run.display_title,
        run.system_label,
        run.run_id,
        run.next_action,
        run.user_note,
        run.tags,
        run.evidence_ids,
        run.artifact_ids,
      ]).includes(term)) continue

      results.push({
        kind: 'run',
        session_id: session.session_id,
        run_id: run.run_id,
        title: run.display_title || run.system_label || run.run_id,
        detail: `${session.name} · ${run.status}`,
      })
      if (results.length >= limit) return results
    }
    if (results.length >= limit) return results
  }
  return results
}
