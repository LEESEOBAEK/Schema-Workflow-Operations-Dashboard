import type { CreateWorkSessionRequest, OperationKind } from '../../shared/types/dashboard'
import { readConfiguredProject, requireConfiguredRoot, requireLiveMode } from '../utils/launchApiSupport'
import { createWorkSession, RelationshipGatewayError } from '../utils/relationshipGateway'

function isOperationKind(value: unknown): value is OperationKind {
  return value === 'independent' || value === 'continue' || value === 'branch'
}

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const input = await readBody(event) as Record<string, unknown>
  if (typeof input.project_root !== 'string' || !Number.isInteger(input.expected_revision) || typeof input.session_name !== 'string' || !isOperationKind(input.operation_kind) || (input.anchor_run_id !== undefined && input.anchor_run_id !== null && typeof input.anchor_run_id !== 'string') || (input.execution_brief_path !== undefined && input.execution_brief_path !== null && typeof input.execution_brief_path !== 'string') || (input.template_id !== undefined && input.template_id !== null && typeof input.template_id !== 'string')) {
    throw createError({ statusCode: 400, statusMessage: '작업 세션 생성 요청 형식이 올바르지 않습니다.' })
  }
  const projectRoot = await requireConfiguredRoot(event, input.project_root)
  const project = await readConfiguredProject(event, projectRoot)
  const request: CreateWorkSessionRequest = {
    project_root: projectRoot,
    expected_revision: input.expected_revision as number,
    session_name: input.session_name,
    operation_kind: input.operation_kind,
    anchor_run_id: typeof input.anchor_run_id === 'string' ? input.anchor_run_id : null,
    execution_brief_path: typeof input.execution_brief_path === 'string' ? input.execution_brief_path : null,
    template_id: typeof input.template_id === 'string' ? input.template_id : null,
  }
  try {
    const result = await createWorkSession(request, project.project_id)
    return { status: 'created', session_id: result.session_id, revision: result.registry.revision }
  } catch (error) {
    const gatewayError = error instanceof RelationshipGatewayError ? error : new RelationshipGatewayError('WORK_SESSION_CREATE_FAILED', '작업 세션을 생성하지 못했습니다.')
    const statusCode = gatewayError.code === 'RELATIONSHIP_REVISION_CONFLICT' ? 409
      : gatewayError.code.endsWith('NOT_FOUND') ? 404
        : gatewayError.code.includes('REQUIRED') || gatewayError.code.includes('NOT_ALLOWED') ? 400
          : 500
    throw createError({ statusCode, statusMessage: gatewayError.message, data: { code: gatewayError.code, ...gatewayError.details } })
  }
})
