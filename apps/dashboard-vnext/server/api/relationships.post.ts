import type { ConfirmSessionRequest } from '../../shared/types/dashboard'
import { confirmSession, RelationshipGatewayError } from '../utils/relationshipGateway'
import { readConfiguredProject, requireConfiguredRoot } from '../utils/launchApiSupport'

function isRequest(value: unknown): value is ConfirmSessionRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.project_root === 'string'
    && Number.isInteger(candidate.expected_revision)
    && typeof candidate.session_id === 'string'
    && typeof candidate.session_name === 'string'
    && Array.isArray(candidate.run_ids)
    && candidate.run_ids.every(value => typeof value === 'string')
    && Array.isArray(candidate.evidence_refs)
    && candidate.evidence_refs.every(value => typeof value === 'string')
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (String(config.dashboardDataMode || 'mock').toLowerCase() !== 'live') {
    throw createError({ statusCode: 409, statusMessage: '실제 데이터 모드에서만 관계를 저장할 수 있습니다.' })
  }
  const request = await readBody(event) as unknown
  if (!isRequest(request)) throw createError({ statusCode: 400, statusMessage: '관계 확인 요청 형식이 올바르지 않습니다.' })

  const configured = await requireConfiguredRoot(event, request.project_root)
  const project = await readConfiguredProject(event, configured)
  const visibleRunIds = new Set(project.sessions.flatMap(session => session.runs).map(run => run.run_id))
  if (request.run_ids.some(runId => !visibleRunIds.has(runId))) {
    throw createError({ statusCode: 404, statusMessage: '현재 대시보드에서 확인되지 않은 Run이 포함되어 있습니다.' })
  }

  try {
    const registry = await confirmSession({ ...request, project_root: configured }, project.project_id)
    return { status: 'saved', revision: registry.revision, registry_path: '.schema-workflow/relations/relationship-registry.json' }
  } catch (error) {
    const gatewayError = error instanceof RelationshipGatewayError ? error : new RelationshipGatewayError('RELATIONSHIP_SAVE_FAILED', '관계를 저장하지 못했습니다.')
    const statusCode = gatewayError.code === 'RELATIONSHIP_REVISION_CONFLICT' ? 409
      : gatewayError.code.endsWith('NOT_FOUND') ? 404
        : gatewayError.code.includes('INVALID') || gatewayError.code.includes('CYCLE') ? 400
          : 500
    throw createError({ statusCode, statusMessage: gatewayError.message, data: { code: gatewayError.code, ...gatewayError.details } })
  }
})
