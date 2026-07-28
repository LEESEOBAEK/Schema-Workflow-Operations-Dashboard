import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { renderExecutionTemplate } from '../server/utils/executionTemplateCatalog'
import { buildPipelineReview, parseExecutionBrief } from '../server/utils/pipelineReview'
import { confirmSession, createWorkSession } from '../server/utils/relationshipGateway'

const roots: string[] = []

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function makeProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-review-'))
  roots.push(root)
  await mkdir(join(root, 'outputs', 'workflows'), { recursive: true })
  return root
}

async function makePassingRun(root: string, runId: string): Promise<void> {
  const runDir = join(root, 'outputs', 'workflows', runId)
  await writeJson(join(runDir, 'workflow_manifest.json'), {
    run_id: runId,
    workspace_id: 'ws_pipeline_test',
    operation_id: `op_${runId}`,
    relation_type: 'independent',
    created_at: '2026-07-28T10:00:00Z',
    trace: { original_run_name: '검토 대상 실행' },
    summary: { workflow_state: 'request_completed', next_required_action: 'none' },
  })
  await writeJson(join(runDir, 'workflow_next.json'), { workflow_state: 'request_completed', next_action: { type: 'none' } })
  await writeJson(join(runDir, 'artifacts_manifest.json'), { artifacts: [{ id: 'ART-001', path: 'deliverables/result.md', description: '최종 결과', status: 'present', role: 'final_output', type: 'document' }] })
  await writeJson(join(runDir, '07_fulfillment', 'data', 'evidence_filled.json'), { criteria_results: [{ criterion_id: 'AC-001', status: 'pass', evidence: '완료 기준을 충족했다.' }] })
  await writeJson(join(runDir, '07_fulfillment', 'data', 'validation.json'), { valid: true, severity: 'pass', can_complete: true })
}

async function makeTemplateSession(root: string, withRun = false, completeBrief = false): Promise<string> {
  const briefDirectory = join(root, '.schema-workflow', 'execution-briefs')
  await mkdir(briefDirectory, { recursive: true })
  const briefPath = join(briefDirectory, 'project-start.md')
  let brief = renderExecutionTemplate({
    projectRoot: root,
    templateId: 'project-start',
    title: '상세 검토 테스트',
    situation: '템플릿 실행본과 실제 결과를 한 화면에서 확인한다.',
    createdAt: '2026-07-28T09:00:00Z',
  })
  if (completeBrief) {
    brief = brief
      .replaceAll('[작성 필요]', '테스트 입력 완료')
      .replaceAll('validation_needed', '확인 완료')
      .replace(/- \[ \]/g, '- [x]')
  }
  await writeFile(briefPath, brief, 'utf8')
  const created = await createWorkSession({
    project_root: root,
    expected_revision: 0,
    session_name: '상세 검토 테스트',
    operation_kind: 'independent',
    execution_brief_path: '.schema-workflow/execution-briefs/project-start.md',
    template_id: 'project-start',
  }, 'ws_pipeline_test')
  if (withRun) {
    await makePassingRun(root, 'run_pipeline_001')
    await confirmSession({
      project_root: root,
      expected_revision: 1,
      session_id: created.session_id,
      session_name: '상세 검토 테스트',
      run_ids: ['run_pipeline_001'],
      evidence_refs: [],
      operation_kind: 'independent',
    }, 'ws_pipeline_test')
  }
  return created.session_id
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('pipeline review', () => {
  it('parses the template execution copy into inspectable sections', () => {
    const parsed = parseExecutionBrief('# 작업\n\n## 1. 현재 상황\n현재 문제\n\n## 2. 적용 목적\n목표')

    expect(parsed.title).toBe('작업')
    expect(parsed.currentSituation).toBe('현재 문제')
    expect(parsed.sections.map(section => section.title)).toEqual(['1. 현재 상황', '2. 적용 목적'])
  })

  it('shows a template session without a Run as evidence needed instead of inventing results', async () => {
    const root = await makeProject()
    const sessionId = await makeTemplateSession(root)

    const review = await buildPipelineReview(root, sessionId)

    expect(review.template?.template_id).toBe('project-start')
    expect(review.brief.current_situation).toContain('템플릿 실행본과 실제 결과')
    expect(review.summary.run_count).toBe(0)
    expect(review.status).toBe('EVIDENCE_NEEDED')
    expect(review.issues.map(issue => issue.code)).toContain('RUN_NOT_CREATED')
  })

  it('passes a confirmed template session whose Run, evidence, artifact, and validation all pass', async () => {
    const root = await makeProject()
    const sessionId = await makeTemplateSession(root, true, true)

    const review = await buildPipelineReview(root, sessionId)

    expect(review.status).toBe('PASS')
    expect(review.stages.every(stage => stage.status === 'PASS')).toBe(true)
    expect(review.summary).toMatchObject({ run_count: 1, pass_count: 1, evidence_count: 1, artifact_count: 1 })
    expect(review.runs[0]?.evidence[0]?.summary).toContain('완료 기준')
    expect(review.runs[0]?.artifacts[0]?.path).toBe('deliverables/result.md')
  })

  it('keeps a passing Run in evidence-needed state while the execution brief is incomplete', async () => {
    const root = await makeProject()
    const sessionId = await makeTemplateSession(root, true)

    const review = await buildPipelineReview(root, sessionId)

    expect(review.status).toBe('EVIDENCE_NEEDED')
    expect(review.stages.find(stage => stage.id === 'brief')?.status).toBe('EVIDENCE_NEEDED')
    expect(review.brief.placeholder_count + review.brief.validation_marker_count + review.brief.unchecked_item_count).toBeGreaterThan(0)
    expect(review.issues.map(issue => issue.code)).toContain('EXECUTION_BRIEF_REVIEW_REQUIRED')
  })

  it('keeps a missing execution brief visible as an evidence gap', async () => {
    const root = await makeProject()
    const created = await createWorkSession({
      project_root: root,
      expected_revision: 0,
      session_name: '누락 문서',
      operation_kind: 'independent',
      execution_brief_path: '.schema-workflow/execution-briefs/missing.md',
      template_id: 'project-start',
    }, 'ws_pipeline_test')

    const review = await buildPipelineReview(root, created.session_id)

    expect(review.status).toBe('EVIDENCE_NEEDED')
    expect(review.brief.available).toBe(false)
    expect(review.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['BRIEF_FILE_UNREADABLE', 'EXECUTION_BRIEF_MISSING']))
  })
})
