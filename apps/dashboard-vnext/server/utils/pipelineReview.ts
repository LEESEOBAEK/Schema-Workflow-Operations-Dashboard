import { readFile, realpath, stat } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import type {
  PipelineReviewBriefSection,
  PipelineReviewIssue,
  PipelineReviewOverview,
  PipelineReviewStage,
  PipelineReviewStatus,
  WorkSession,
} from '../../shared/types/dashboard'
import { executionTemplate } from './executionTemplateCatalog'
import { applyRelationshipRegistry, readRelationshipRegistry } from './relationshipGateway'
import { readWorkflowDashboard } from './workflowReadAdapter'

const MAX_BRIEF_BYTES = 1024 * 1024

export class PipelineReviewError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

function sectionId(title: string, index: number): string {
  const normalized = title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return normalized || `section-${index + 1}`
}

export function parseExecutionBrief(markdown: string): { title: string; sections: PipelineReviewBriefSection[]; currentSituation: string } {
  const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/)
  const title = lines.find(line => /^#\s+/.test(line))?.replace(/^#\s+/, '').trim() ?? ''
  const sections: PipelineReviewBriefSection[] = []
  let currentTitle = ''
  let content: string[] = []
  const flush = () => {
    if (!currentTitle) return
    sections.push({ id: sectionId(currentTitle, sections.length), title: currentTitle, content: content.join('\n').trim() })
  }
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      flush()
      currentTitle = line.replace(/^##\s+/, '').trim()
      content = []
    } else if (currentTitle) {
      content.push(line)
    }
  }
  flush()
  const currentSituation = sections.find(section => /현재 상황/.test(section.title))?.content ?? ''
  return { title, sections, currentSituation }
}

async function readBrief(projectRoot: string, briefPath: string | null | undefined): Promise<{ path: string | null; markdown: string; issue?: PipelineReviewIssue }> {
  if (!briefPath) return { path: null, markdown: '' }
  const root = await realpath(resolve(projectRoot))
  const boundary = root.toLowerCase() + sep
  const candidate = resolve(root, briefPath)
  if (!candidate.toLowerCase().startsWith(boundary)) {
    return { path: briefPath, markdown: '', issue: { code: 'BRIEF_PATH_OUTSIDE_PROJECT', severity: 'error', message: '실행 문서가 프로젝트 경계를 벗어납니다.', source_path: briefPath } }
  }
  try {
    const resolved = await realpath(candidate)
    if (!resolved.toLowerCase().startsWith(boundary)) throw new PipelineReviewError('BRIEF_PATH_OUTSIDE_PROJECT', '실행 문서가 프로젝트 경계를 벗어납니다.')
    const fileStat = await stat(resolved)
    if (!fileStat.isFile() || fileStat.size > MAX_BRIEF_BYTES) {
      return { path: relative(root, candidate).replaceAll('\\', '/'), markdown: '', issue: { code: 'BRIEF_FILE_INVALID', severity: 'error', message: '실행 문서가 너무 크거나 일반 파일이 아닙니다.', source_path: briefPath } }
    }
    return { path: relative(root, resolved).replaceAll('\\', '/'), markdown: await readFile(resolved, 'utf8') }
  } catch (error) {
    const code = error instanceof PipelineReviewError ? error.code : (error as NodeJS.ErrnoException).code
    return {
      path: briefPath,
      markdown: '',
      issue: {
        code: code === 'BRIEF_PATH_OUTSIDE_PROJECT' ? code : 'BRIEF_FILE_UNREADABLE',
        severity: 'error',
        message: code === 'BRIEF_PATH_OUTSIDE_PROJECT' ? '실행 문서가 프로젝트 경계를 벗어납니다.' : '연결된 실행 문서를 읽을 수 없습니다.',
        source_path: briefPath,
      },
    }
  }
}

function stage(id: PipelineReviewStage['id'], label: string, status: PipelineReviewStatus, summary: string, sourcePath?: string): PipelineReviewStage {
  return { id, label, status, summary, ...(sourcePath ? { source_path: sourcePath } : {}) }
}

function reviewStatus(stages: PipelineReviewStage[]): PipelineReviewStatus {
  if (stages.some(item => item.status === 'HOLD')) return 'HOLD'
  if (stages.some(item => item.status === 'EVIDENCE_NEEDED' || item.status === 'NOT_RUN')) return 'EVIDENCE_NEEDED'
  return 'PASS'
}

function findSession(sessions: WorkSession[], sessionId: string): WorkSession | undefined {
  return sessions.find(session => session.session_id === sessionId)
}

export async function buildPipelineReview(projectRoot: string, sessionId: string, maxSourceBytes?: number): Promise<PipelineReviewOverview> {
  const root = await realpath(resolve(projectRoot))
  const dashboard = await readWorkflowDashboard({ projectRoots: [root], maxSourceBytes })
  const rawProject = dashboard.projects[0]
  if (!rawProject) throw new PipelineReviewError('PROJECT_NOT_FOUND', '프로젝트 데이터를 읽을 수 없습니다.')
  const relationship = await readRelationshipRegistry(root)
  const project = relationship.registry ? applyRelationshipRegistry(rawProject, relationship.registry) : rawProject
  const session = findSession(project.sessions, sessionId)
  if (!session) throw new PipelineReviewError('SESSION_NOT_FOUND', '선택한 작업 세션을 찾을 수 없습니다.')

  const issues: PipelineReviewIssue[] = []
  const template = session.template_id ? executionTemplate(session.template_id) ?? null : null
  const briefFile = await readBrief(root, session.execution_brief_path)
  if (briefFile.issue) issues.push(briefFile.issue)
  const parsed = parseExecutionBrief(briefFile.markdown)
  const placeholderCount = (briefFile.markdown.match(/\[\s*작성 필요\s*\]/g) ?? []).length
  const validationMarkerCount = (briefFile.markdown.match(/validation_needed/g) ?? []).length
  const uncheckedItemCount = (briefFile.markdown.match(/^\s*[-*]\s+\[\s\]/gm) ?? []).length
  const openBriefReviewCount = placeholderCount + validationMarkerCount + uncheckedItemCount
  const briefReviewOpen = openBriefReviewCount > 0

  if (!template) issues.push({ code: 'TEMPLATE_REFERENCE_MISSING', severity: 'warning', message: '이 작업 세션에는 원본 템플릿 참조가 없습니다.' })
  if (!briefFile.markdown) issues.push({ code: 'EXECUTION_BRIEF_MISSING', severity: 'warning', message: '프로젝트 실행 문서가 연결되지 않았습니다.', source_path: briefFile.path ?? undefined })
  if (briefReviewOpen) {
    issues.push({ code: 'EXECUTION_BRIEF_REVIEW_REQUIRED', severity: 'warning', message: `실행 문서에 작성 또는 확인이 필요한 항목 ${openBriefReviewCount}개가 남아 있습니다. Run은 통과했더라도 실행 기준과 결과의 대조가 완료되지 않았습니다.`, source_path: briefFile.path ?? undefined })
  }
  if (session.relation_status !== 'confirmed') issues.push({ code: 'SESSION_RELATION_UNRESOLVED', severity: 'error', message: '작업 세션과 Run의 관계를 확인해야 합니다.' })
  if (!session.runs.length) issues.push({ code: 'RUN_NOT_CREATED', severity: 'warning', message: '이 작업 세션에 연결된 Run이 없습니다.' })

  for (const run of session.runs) {
    if (run.status === 'hold') issues.push({ code: 'RUN_ON_HOLD', severity: 'error', message: `${run.run_id} 실행이 사용자 확인 또는 보류 상태입니다.`, source_path: run.source_path })
    if (run.status === 'evidence_insufficient') issues.push({ code: 'RUN_EVIDENCE_INSUFFICIENT', severity: 'warning', message: `${run.run_id} 실행의 근거 또는 검증이 부족합니다.`, source_path: run.source_path })
    if (run.status === 'unknown') issues.push({ code: 'RUN_STATUS_UNKNOWN', severity: 'warning', message: `${run.run_id} 실행의 완료 상태를 확정할 수 없습니다.`, source_path: run.source_path })
    for (const warning of run.warnings ?? []) issues.push({ code: warning, severity: 'warning', message: `${run.run_id} 원본 데이터에서 경고가 발견되었습니다.`, source_path: run.source_path })
  }

  const runCount = session.runs.length
  const passCount = session.runs.filter(run => run.status === 'pass').length
  const evidenceCount = session.runs.reduce((total, run) => total + run.evidence_count, 0)
  const artifactCount = session.runs.reduce((total, run) => total + run.artifact_count, 0)
  const anyRunHold = session.runs.some(run => run.status === 'hold')
  const allRunsPass = runCount > 0 && passCount === runCount
  const stages: PipelineReviewStage[] = [
    stage('brief', '실행 기준', briefFile.markdown && template && !briefReviewOpen ? 'PASS' : 'EVIDENCE_NEEDED', briefFile.markdown ? (briefReviewOpen ? `실행 문서 연결됨 · 남은 확인 ${openBriefReviewCount}개` : `${template?.name ?? '템플릿 미확인'} 실행 문서 검토 완료`) : '실행 문서 연결 필요', briefFile.path ?? undefined),
    stage('relation', '작업 관계', session.relation_status === 'confirmed' ? 'PASS' : 'HOLD', session.relation_status === 'confirmed' ? `${runCount}개 Run 연결 확인` : '세션과 Run 관계 확인 필요'),
    stage('execution', '실행 기록', !runCount ? 'NOT_RUN' : anyRunHold ? 'HOLD' : 'PASS', runCount ? `${runCount}개 Run 기록됨` : '아직 Run 없음'),
    stage('evidence', '근거', !runCount ? 'NOT_RUN' : evidenceCount > 0 ? 'PASS' : 'EVIDENCE_NEEDED', `${evidenceCount}개 근거 확인`),
    stage('artifacts', '산출물', !runCount ? 'NOT_RUN' : artifactCount > 0 ? 'PASS' : 'EVIDENCE_NEEDED', `${artifactCount}개 산출물 확인`),
    stage('validation', '완료 검증', !runCount ? 'NOT_RUN' : anyRunHold ? 'HOLD' : allRunsPass ? 'PASS' : 'EVIDENCE_NEEDED', allRunsPass ? `${passCount}/${runCount} Run 통과` : `${passCount}/${runCount} Run 통과`),
  ]

  return {
    project_root: root,
    session_id: session.session_id,
    session_name: session.name,
    operation_kind: session.operation_kind ?? 'independent',
    relation_status: session.relation_status,
    anchor_run_id: session.anchor_run_id ?? null,
    status: reviewStatus(stages),
    template,
    brief: {
      available: Boolean(briefFile.markdown),
      path: briefFile.path,
      title: parsed.title,
      current_situation: parsed.currentSituation,
      markdown: briefFile.markdown,
      sections: parsed.sections,
      placeholder_count: placeholderCount,
      validation_marker_count: validationMarkerCount,
      unchecked_item_count: uncheckedItemCount,
    },
    runs: session.runs.map(run => ({
      run_id: run.run_id,
      label: run.display_title || run.system_label || run.run_id,
      status: run.status,
      platform: run.platform,
      created_at: run.created_at ?? '',
      next_action: run.next_action,
      source_path: run.source_path ?? '',
      evidence: run.evidence_details ?? [],
      artifacts: run.artifact_details ?? [],
      warnings: run.warnings ?? [],
    })),
    stages,
    issues,
    summary: {
      run_count: runCount,
      pass_count: passCount,
      evidence_count: evidenceCount,
      artifact_count: artifactCount,
      warning_count: issues.filter(issue => issue.severity !== 'information').length,
    },
  }
}
