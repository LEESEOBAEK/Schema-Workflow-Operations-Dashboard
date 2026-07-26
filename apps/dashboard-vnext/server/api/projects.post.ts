import { environmentProjectRoots, projectCatalogPath, requireLiveMode } from '../utils/launchApiSupport'
import { addProject, ProjectCatalogError } from '../utils/projectCatalogStore'

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const input = await readBody(event) as Record<string, unknown>
  if (typeof input?.source_root !== 'string' || (input.display_name !== undefined && typeof input.display_name !== 'string') || (input.create_directory !== undefined && typeof input.create_directory !== 'boolean')) throw createError({ statusCode: 400, statusMessage: '프로젝트 추가 요청 형식이 올바르지 않습니다.' })
  try {
    return await addProject(projectCatalogPath(event), { source_root: input.source_root, display_name: input.display_name as string | undefined, create_directory: input.create_directory as boolean | undefined }, environmentProjectRoots(event))
  } catch (error) {
    const catalogError = error instanceof ProjectCatalogError ? error : new ProjectCatalogError('PROJECT_ADD_FAILED', '프로젝트를 추가하지 못했습니다.')
    throw createError({ statusCode: catalogError.code.endsWith('NOT_FOUND') ? 404 : 500, statusMessage: catalogError.message, data: { code: catalogError.code } })
  }
})
