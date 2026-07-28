import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { ExecutionTemplateRenderResult } from '../../shared/types/dashboard'
import { executionTemplate, renderExecutionTemplate, templateOperationKind } from '../utils/executionTemplateCatalog'
import { readConfiguredProject, requireConfiguredRoot, requireLiveMode } from '../utils/launchApiSupport'
import { createWorkSession, RelationshipGatewayError } from '../utils/relationshipGateway'

interface RequestBody {
  action?: 'preview' | 'save'
  project_root?: string
  template_id?: string
  title?: string
  situation?: string
  anchor_run_id?: string
  constraints?: string
  expected_revision?: number
}

function boundedText(value: unknown, field: string, maxLength: number, required = false): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (required && !text) throw createError({ statusCode: 400, statusMessage: `${field} 입력이 필요합니다.` })
  if (text.length > maxLength) throw createError({ statusCode: 400, statusMessage: `${field} 입력이 너무 깁니다.` })
  return text
}

function timestamp(date: Date): string {
  const value = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
  return value.replace(' ', '_').replaceAll(':', '')
}

function safeSlug(value: string): string {
  return value.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'execution-brief'
}

export default defineEventHandler(async (event): Promise<ExecutionTemplateRenderResult> => {
  requireLiveMode(event)
  const body = await readBody<RequestBody>(event)
  const projectRootInput = boundedText(body.project_root, 'ProjectRoot', 1000, true)
  const projectRoot = await requireConfiguredRoot(event, projectRootInput)
  const templateId = boundedText(body.template_id, '템플릿', 80, true)
  const template = executionTemplate(templateId)
  if (!template) throw createError({ statusCode: 404, statusMessage: '선택한 실행 템플릿을 찾을 수 없습니다.' })

  const title = boundedText(body.title, '작업 제목', 160, true)
  const situation = boundedText(body.situation, '현재 상황', 20000, true)
  const anchorRunId = boundedText(body.anchor_run_id, '기준 Run', 300)
  const constraints = boundedText(body.constraints, '제약조건', 5000)
  const action = body.action === 'save' ? 'save' : 'preview'
  const createdAt = new Date().toISOString()
  const markdown = renderExecutionTemplate({
    projectRoot,
    templateId,
    title,
    situation,
    anchorRunId,
    constraints,
    createdAt,
  })

  if (action === 'preview') {
    return { template, markdown, saved: false, output_path: null, session_id: null, relationship_revision: null, operation_kind: null }
  }
  if (!Number.isInteger(body.expected_revision)) {
    throw createError({ statusCode: 400, statusMessage: '현재 관계 revision이 필요합니다. 화면을 새로고침한 뒤 다시 시도하세요.' })
  }

  const outputDirectory = join(projectRoot, '.schema-workflow', 'execution-briefs')
  await mkdir(outputDirectory, { recursive: true })
  const outputPath = join(outputDirectory, `${timestamp(new Date())}__${safeSlug(title)}.md`)
  const relativeOutputPath = relative(projectRoot, outputPath).replaceAll('\\', '/')
  await writeFile(outputPath, markdown, { encoding: 'utf8', flag: 'wx' })
  const project = await readConfiguredProject(event, projectRoot)
  const operationKind = templateOperationKind(template.kind)
  let result: Awaited<ReturnType<typeof createWorkSession>>
  try {
    result = await createWorkSession({
      project_root: projectRoot,
      expected_revision: body.expected_revision as number,
      session_name: title,
      operation_kind: operationKind,
      anchor_run_id: operationKind === 'independent' ? null : anchorRunId,
      execution_brief_path: relativeOutputPath,
      template_id: template.template_id,
    }, project.project_id)
  } catch (error) {
    await rm(outputPath, { force: true }).catch(() => undefined)
    const gatewayError = error instanceof RelationshipGatewayError ? error : null
    if (gatewayError) {
      const statusCode = gatewayError.code === 'RELATIONSHIP_REVISION_CONFLICT' ? 409
        : gatewayError.code.endsWith('NOT_FOUND') ? 404
          : gatewayError.code.includes('REQUIRED') || gatewayError.code.includes('NOT_ALLOWED') ? 400
            : 500
      throw createError({ statusCode, statusMessage: gatewayError.message, data: { code: gatewayError.code, ...gatewayError.details } })
    }
    throw error
  }

  return {
    template,
    markdown,
    saved: true,
    output_path: relativeOutputPath,
    session_id: result.session_id,
    relationship_revision: result.registry.revision,
    operation_kind: operationKind,
  }
})
