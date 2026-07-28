import { describe, expect, it } from 'vitest'
import type { WorkflowProject } from '../shared/types/dashboard'
import { searchProject } from '../app/utils/dashboardSearch'

const project: WorkflowProject = {
  project_id: 'project_search',
  name: '검색 테스트',
  sessions: [{
    session_id: 'session_alpha',
    name: '고객 문의 분석',
    relation_status: 'confirmed',
    runs: [{
      run_id: 'run_001',
      status: 'pass',
      platform: 'codex',
      next_action: '결과 확인',
      artifact_count: 1,
      evidence_count: 1,
      artifact_ids: ['customer_report'],
      evidence_ids: ['source_email'],
      display_title: '문의 분류 결과',
    }],
  }],
}

describe('dashboard search', () => {
  it('finds sessions, runs, evidence, and artifacts', () => {
    expect(searchProject(project, '고객')).toMatchObject([{ kind: 'session', session_id: 'session_alpha' }])
    expect(searchProject(project, '문의 분류')).toMatchObject([{ kind: 'run', run_id: 'run_001' }])
    expect(searchProject(project, 'source_email')).toMatchObject([{ kind: 'run', run_id: 'run_001' }])
    expect(searchProject(project, 'customer_report')).toMatchObject([{ kind: 'run', run_id: 'run_001' }])
  })

  it('does not search one-character or blank queries', () => {
    expect(searchProject(project, '')).toEqual([])
    expect(searchProject(project, '고')).toEqual([])
  })
})
