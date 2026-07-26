import { getQuery } from 'h3'
import { environmentProjectRoots, projectCatalogPath, requireLiveMode } from '../utils/launchApiSupport'
import { ProjectCatalogError, removeProject } from '../utils/projectCatalogStore'

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const sourceRoot = getQuery(event).source_root
  if (typeof sourceRoot !== 'string') throw createError({ statusCode: 400, statusMessage: '제거할 ProjectRoot가 필요합니다.' })
  try { return await removeProject(projectCatalogPath(event), sourceRoot, environmentProjectRoots(event)) }
  catch (error) {
    const catalogError = error instanceof ProjectCatalogError ? error : new ProjectCatalogError('PROJECT_REMOVE_FAILED', '프로젝트를 제거하지 못했습니다.')
    throw createError({ statusCode: catalogError.code.includes('ENVIRONMENT') ? 409 : catalogError.code.endsWith('REGISTERED') ? 404 : 500, statusMessage: catalogError.message, data: { code: catalogError.code } })
  }
})
