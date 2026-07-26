import { environmentProjectRoots, projectCatalogPath, requireLiveMode } from '../utils/launchApiSupport'
import { readProjectCatalog } from '../utils/projectCatalogStore'

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  return readProjectCatalog(projectCatalogPath(event), environmentProjectRoots(event))
})
