import { resolve, sep } from 'node:path'
import type { SessionOrderUpdate } from '../../shared/types/dashboard'
import { saveSessionOrder } from '../utils/dashboardMetadataStore'
import { configuredProjectRoots } from '../utils/launchApiSupport'
import { applyRelationshipRegistry, readRelationshipRegistry } from '../utils/relationshipGateway'
import { readWorkflowDashboard } from '../utils/workflowReadAdapter'

function isUpdate(value: unknown): value is SessionOrderUpdate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.project_root === 'string'
    && ['manual', 'newest', 'oldest', 'name'].includes(String(candidate.sort_mode))
    && Array.isArray(candidate.session_ids)
    && candidate.session_ids.every(id => typeof id === 'string')
}

function isInsideRoot(path: string, root: string): boolean {
  const candidate = resolve(path).toLowerCase()
  const resolvedRoot = resolve(root).toLowerCase()
  return candidate === resolvedRoot || candidate.startsWith(resolvedRoot + sep)
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (String(config.dashboardDataMode || 'mock').toLowerCase() !== 'live') {
    throw createError({ statusCode: 409, statusMessage: '실제 데이터 모드에서만 작업 세션 순서를 저장할 수 있습니다.' })
  }
  const update = await readBody(event) as unknown
  if (!isUpdate(update)) throw createError({ statusCode: 400, statusMessage: '작업 세션 정렬 정보가 올바르지 않습니다.' })

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
  const project = rawProject && projection.registry ? applyRelationshipRegistry(rawProject, projection.registry) : rawProject
  const actualIds = new Set(project?.sessions.map(session => session.session_id) ?? [])
  if (update.session_ids.length !== actualIds.size || update.session_ids.some(id => !actualIds.has(id))) {
    throw createError({ statusCode: 409, statusMessage: '화면의 작업 세션 목록이 변경되었습니다. 새로고침 후 다시 시도해 주세요.' })
  }

  const metadata = await saveSessionOrder(metadataPath, { ...update, project_root: requestedRoot })
  return { status: 'saved', metadata }
})
