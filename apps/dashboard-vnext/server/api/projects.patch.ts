import { environmentProjectRoots, projectCatalogPath, requireLiveMode } from '../utils/launchApiSupport'
import { ProjectCatalogError, selectProject } from '../utils/projectCatalogStore'

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const input = await readBody(event) as Record<string, unknown>
  if (typeof input?.source_root !== 'string') throw createError({ statusCode: 400, statusMessage: '선택할 ProjectRoot가 필요합니다.' })
  try { return await selectProject(projectCatalogPath(event), input.source_root, environmentProjectRoots(event)) }
  catch (error) {
    const catalogError = error instanceof ProjectCatalogError ? error : new ProjectCatalogError('PROJECT_SELECT_FAILED', '프로젝트를 선택하지 못했습니다.')
    throw createError({ statusCode: catalogError.code.endsWith('REGISTERED') ? 404 : 500, statusMessage: catalogError.message, data: { code: catalogError.code } })
  }
})
