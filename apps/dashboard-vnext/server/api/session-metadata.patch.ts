import { resolve, sep } from 'node:path'
import type { SessionMetadataUpdate } from '../../shared/types/dashboard'
import { saveSessionMetadata } from '../utils/dashboardMetadataStore'
import { configuredProjectRoots } from '../utils/launchApiSupport'
import { applyRelationshipRegistry, readRelationshipRegistry } from '../utils/relationshipGateway'
import { readWorkflowDashboard } from '../utils/workflowReadAdapter'

function isUpdate(value: unknown): value is SessionMetadataUpdate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.project_root === 'string'
    && typeof candidate.session_id === 'string'
    && typeof candidate.display_name === 'string'
}

function isInsideRoot(path: string, root: string): boolean {
  const candidate = resolve(path).toLowerCase()
  const resolvedRoot = resolve(root).toLowerCase()
  return candidate === resolvedRoot || candidate.startsWith(resolvedRoot + sep)
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (String(config.dashboardDataMode || 'mock').toLowerCase() !== 'live') {
    throw createError({ statusCode: 409, statusMessage: '실제 데이터 모드에서만 작업 세션 표시 이름을 저장할 수 있습니다.' })
  }

  const update = await readBody(event) as unknown
  if (!isUpdate(update)) throw createError({ statusCode: 400, statusMessage: '작업 세션 표시 정보 형식이 올바르지 않습니다.' })

  const projectRoots = await configuredProjectRoots(event)
  const requestedRoot = resolve(update.project_root)
  if (!projectRoots.some(root => resolve(root).toLowerCase() === requestedRoot.toLowerCase())) {
    throw createError({ statusCode: 404, statusMessage: '현재 대시보드에 등록된 프로젝트를 찾을 수 없습니다.' })
  }

  const metadataPath = resolve(String(config.dashboardMetadataPath || '.data/dashboard-metadata.json'))
  if (projectRoots.some(root => isInsideRoot(metadataPath, root))) {
    throw createError({ statusCode: 409, statusMessage: '대시보드 편집 데이터는 Workflow ProjectRoot 밖에 저장해야 합니다.' })
  }

  const state = await readWorkflowDashboard({ projectRoots: [requestedRoot], maxSourceBytes: Number(config.dashboardMaxSourceBytes) || undefined })
  const rawProject = state.projects.find(project => project.source_root?.toLowerCase() === requestedRoot.toLowerCase())
  const projection = await readRelationshipRegistry(requestedRoot)
  const projectedProject = rawProject && projection.registry ? applyRelationshipRegistry(rawProject, projection.registry) : rawProject
  const sessionExists = projectedProject?.sessions.some(session => session.session_id === update.session_id) ?? false
  if (!sessionExists) throw createError({ statusCode: 404, statusMessage: '현재 프로젝트에서 해당 작업 세션을 찾을 수 없습니다.' })

  try {
    const metadata = await saveSessionMetadata(metadataPath, { ...update, project_root: requestedRoot })
    return { status: 'saved', metadata }
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SESSION_METADATA_SAVE_FAILED'
    const validationErrors = ['SESSION_ID_REQUIRED', 'SESSION_DISPLAY_NAME_REQUIRED', 'SESSION_DISPLAY_NAME_TOO_LONG']
    throw createError({
      statusCode: validationErrors.includes(code) ? 400 : 500,
      statusMessage: validationErrors.includes(code) ? '작업 세션 이름을 1~120자로 입력해 주세요.' : '작업 세션 표시 이름을 저장하지 못했습니다.',
      data: { code },
    })
  }
})
