import { executeLaunchRequest, LaunchGatewayError, readLaunchRequest } from '../../utils/launchGateway'
import { requireConfiguredRoot, requireLiveMode, trustedAutoRoots } from '../../utils/launchApiSupport'

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const input = await readBody(event) as Record<string, unknown>
  if (typeof input?.project_root !== 'string' || typeof input.launch_id !== 'string' || input.confirmed !== true) throw createError({ statusCode: 400, statusMessage: '사용자 확인과 Launch ID가 필요합니다.' })
  const projectRoot = await requireConfiguredRoot(event, input.project_root)
  try {
    const existing = await readLaunchRequest(projectRoot, input.launch_id)
    const request = await executeLaunchRequest(projectRoot, input.launch_id, true, { trustedAutoRoots: await trustedAutoRoots(event, existing.platform) })
    return { status: 'launched', request }
  } catch (error) {
    const launchError = error instanceof LaunchGatewayError ? error : new LaunchGatewayError('LAUNCH_EXECUTE_FAILED', 'CLI를 시작하지 못했습니다.')
    const statusCode = launchError.code.includes('CONFIRMATION') || launchError.code.includes('TRUSTED_AUTO') || launchError.code.includes('STATE') ? 409 : launchError.code.includes('NOT_FOUND') ? 404 : 500
    throw createError({ statusCode, statusMessage: launchError.message, data: { code: launchError.code, ...launchError.details } })
  }
})
