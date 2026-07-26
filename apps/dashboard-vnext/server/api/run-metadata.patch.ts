import { resolve, sep } from 'node:path'
import type { RunMetadataUpdate } from '../../shared/types/dashboard'
import { saveRunMetadata } from '../utils/dashboardMetadataStore'
import { readWorkflowDashboard } from '../utils/workflowReadAdapter'
import { configuredProjectRoots } from '../utils/launchApiSupport'

function isUpdate(value: unknown): value is RunMetadataUpdate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.run_id === 'string'
    && typeof candidate.display_title === 'string'
    && typeof candidate.user_note === 'string'
    && Array.isArray(candidate.tags)
    && candidate.tags.every(tag => typeof tag === 'string')
    && (candidate.display_status === undefined || ['active', 'superseded', 'archived'].includes(String(candidate.display_status)))
}

function isInsideRoot(path: string, root: string): boolean {
  const candidate = resolve(path).toLowerCase()
  const resolvedRoot = resolve(root).toLowerCase()
  const boundary = resolvedRoot + sep
  return candidate === resolvedRoot || candidate.startsWith(boundary)
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const mode = String(config.dashboardDataMode || 'mock').toLowerCase()
  if (mode !== 'live') {
    throw createError({ statusCode: 409, statusMessage: '실제 데이터 모드에서만 표시 정보를 저장할 수 있습니다.' })
  }

  const update = await readBody(event) as unknown
  if (!isUpdate(update)) {
    throw createError({ statusCode: 400, statusMessage: '표시 정보 형식이 올바르지 않습니다.' })
  }

  const projectRoots = await configuredProjectRoots(event)
  const metadataPath = resolve(String(config.dashboardMetadataPath || '.data/dashboard-metadata.json'))
  if (projectRoots.some(root => isInsideRoot(metadataPath, root))) {
    throw createError({ statusCode: 409, statusMessage: '대시보드 편집 데이터는 Workflow ProjectRoot 밖에 저장해야 합니다.' })
  }
  const state = await readWorkflowDashboard({
    projectRoots,
    maxSourceBytes: Number(config.dashboardMaxSourceBytes) || undefined,
  })
  const runExists = state.projects.some(project => project.sessions.some(session => session.runs.some(run => run.run_id === update.run_id)))
  if (!runExists) {
    throw createError({ statusCode: 404, statusMessage: '현재 ProjectRoot에서 해당 실행을 찾을 수 없습니다.' })
  }

  try {
    const metadata = await saveRunMetadata(metadataPath, update)
    return { status: 'saved', metadata }
  } catch (error) {
    const code = error instanceof Error ? error.message : 'DASHBOARD_METADATA_SAVE_FAILED'
    const validationErrors = ['DISPLAY_TITLE_TOO_LONG', 'USER_NOTE_TOO_LONG', 'TAG_TOO_LONG']
    throw createError({
      statusCode: validationErrors.includes(code) ? 400 : 500,
      statusMessage: validationErrors.includes(code) ? '입력 가능한 글자 수를 확인해 주세요.' : '표시 정보를 저장하지 못했습니다.',
      data: { code },
    })
  }
})
