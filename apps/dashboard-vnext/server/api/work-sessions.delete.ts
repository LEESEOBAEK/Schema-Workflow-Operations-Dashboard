import type { RemoveWorkSessionRequest } from '../../shared/types/dashboard'
import { readConfiguredProject, requireConfiguredRoot, requireLiveMode } from '../utils/launchApiSupport'
import { RelationshipGatewayError, removeWorkSession } from '../utils/relationshipGateway'

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const input = await readBody(event) as Record<string, unknown>
  if (typeof input.project_root !== 'string' || !Number.isInteger(input.expected_revision) || typeof input.session_id !== 'string' || (input.session_name !== undefined && typeof input.session_name !== 'string') || (input.run_ids !== undefined && (!Array.isArray(input.run_ids) || input.run_ids.some(runId => typeof runId !== 'string')))) {
    throw createError({ statusCode: 400, statusMessage: '작업 세션 제거 요청 형식이 올바르지 않습니다.' })
  }
  const projectRoot = await requireConfiguredRoot(event, input.project_root)
  const project = await readConfiguredProject(event, projectRoot)
  const request: RemoveWorkSessionRequest = {
    project_root: projectRoot,
    expected_revision: input.expected_revision as number,
    session_id: input.session_id,
    session_name: typeof input.session_name === 'string' ? input.session_name : undefined,
    run_ids: Array.isArray(input.run_ids) ? input.run_ids as string[] : [],
  }
  try {
    const result = await removeWorkSession(request, project.project_id)
    return {
      status: 'removed',
      session_id: request.session_id,
      revision: result.registry.revision,
      preserved_run_ids: result.removed_run_ids,
    }
  } catch (error) {
    const gatewayError = error instanceof RelationshipGatewayError ? error : new RelationshipGatewayError('WORK_SESSION_REMOVE_FAILED', '작업 세션을 제거하지 못했습니다.')
    const statusCode = gatewayError.code === 'RELATIONSHIP_REVISION_CONFLICT' ? 409
      : gatewayError.code.endsWith('NOT_FOUND') ? 404
        : gatewayError.code.includes('REQUIRED') ? 400
          : 500
    throw createError({ statusCode, statusMessage: gatewayError.message, data: { code: gatewayError.code, ...gatewayError.details } })
  }
})
