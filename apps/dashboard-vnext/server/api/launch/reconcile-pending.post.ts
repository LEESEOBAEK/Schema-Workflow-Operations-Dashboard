import { requireConfiguredRoot, requireLiveMode } from '../../utils/launchApiSupport'
import { reconcilePendingLaunchRequests } from '../../utils/launchGateway'

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const body = await readBody(event) as Record<string, unknown>
  if (typeof body.project_root !== 'string') throw createError({ statusCode: 400, statusMessage: 'ProjectRoot가 필요합니다.' })
  const projectRoot = await requireConfiguredRoot(event, body.project_root)
  return reconcilePendingLaunchRequests(projectRoot)
})
