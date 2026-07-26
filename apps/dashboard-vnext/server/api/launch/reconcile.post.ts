import { LaunchGatewayError, readLaunchRequest, reconcileLaunchRequest } from '../../utils/launchGateway'
import { requireConfiguredRoot, requireLiveMode } from '../../utils/launchApiSupport'

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const input = await readBody(event) as Record<string, unknown>
  if (typeof input?.project_root !== 'string' || typeof input.launch_id !== 'string') throw createError({ statusCode: 400, statusMessage: 'ProjectRoot와 Launch ID가 필요합니다.' })
  const projectRoot = await requireConfiguredRoot(event, input.project_root)
  try {
    const request = await reconcileLaunchRequest(projectRoot, input.launch_id)
    return { status: request.status, request }
  } catch (error) {
    const launchError = error instanceof LaunchGatewayError ? error : new LaunchGatewayError('LAUNCH_RECONCILE_FAILED', 'Run 연결 상태를 확인하지 못했습니다.')
    if (launchError.code === 'RELATIONSHIP_CONTRACT_MISMATCH') {
      return { status: 'relation_mismatch', request: await readLaunchRequest(projectRoot, input.launch_id), message: launchError.message }
    }
    const statusCode = launchError.code === 'LAUNCH_RUN_PENDING' ? 202 : launchError.code.includes('NOT_FOUND') ? 404 : launchError.code.includes('NOT_STARTED') || launchError.code === 'RELATIONSHIP_CONTRACT_MISMATCH' ? 409 : 500
    if (statusCode === 202) return { status: 'pending', code: launchError.code, message: launchError.message }
    throw createError({ statusCode, statusMessage: launchError.message, data: { code: launchError.code, ...launchError.details } })
  }
})
