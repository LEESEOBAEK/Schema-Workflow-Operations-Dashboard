import { homedir } from 'node:os'
import { join } from 'node:path'
import { requireConfiguredRoot, requireLiveMode } from '../utils/launchApiSupport'
import { inspectProjectSkills } from '../utils/projectSkillManager'

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const query = getQuery(event)
  if (typeof query.project_root !== 'string') throw createError({ statusCode: 400, statusMessage: 'ProjectRoot가 필요합니다.' })
  const projectRoot = await requireConfiguredRoot(event, query.project_root)
  return inspectProjectSkills(projectRoot, join(homedir(), '.schema-workflow-candidate'))
})
