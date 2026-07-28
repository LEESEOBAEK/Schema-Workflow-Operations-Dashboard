import type { PipelineReviewOverview } from '../../shared/types/dashboard'
import { buildPipelineReview, PipelineReviewError } from '../utils/pipelineReview'
import { requireConfiguredRoot, requireLiveMode } from '../utils/launchApiSupport'

export default defineEventHandler(async (event): Promise<PipelineReviewOverview> => {
  requireLiveMode(event)
  const query = getQuery(event)
  if (typeof query.project_root !== 'string' || typeof query.session_id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'ProjectRoot와 작업 세션이 필요합니다.' })
  }
  const projectRoot = await requireConfiguredRoot(event, query.project_root)
  try {
    return await buildPipelineReview(projectRoot, query.session_id, Number(useRuntimeConfig(event).dashboardMaxSourceBytes) || undefined)
  } catch (error) {
    if (error instanceof PipelineReviewError) {
      throw createError({ statusCode: error.code.endsWith('NOT_FOUND') ? 404 : 422, statusMessage: error.message, data: { code: error.code } })
    }
    throw error
  }
})
