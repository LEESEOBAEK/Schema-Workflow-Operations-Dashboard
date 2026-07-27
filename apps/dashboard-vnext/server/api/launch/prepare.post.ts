import { readFile } from 'node:fs/promises'
import type { LaunchPrepareRequest } from '../../../shared/types/dashboard'
import { LaunchGatewayError, prepareLaunchRequest } from '../../utils/launchGateway'
import { readConfiguredProject, requireConfiguredRoot, requireLiveMode, trustedAutoRoots } from '../../utils/launchApiSupport'
import { requireCurrentProjectSkill } from '../../utils/projectSkillManager'
import { normalizeSchemaWorkflowChannel } from '../../utils/schemaWorkflowRuntime'

function isRequest(value: unknown): value is LaunchPrepareRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.project_root === 'string' && typeof candidate.session_id === 'string'
    && ['codex', 'claude', 'antigravity'].includes(String(candidate.platform))
    && ['confirm_launch', 'trusted_auto'].includes(String(candidate.mode))
    && typeof candidate.task === 'string' && typeof candidate.run_name === 'string'
    && (candidate.antigravity_new_project === undefined || typeof candidate.antigravity_new_project === 'boolean')
}

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const input = await readBody(event) as unknown
  if (!isRequest(input)) throw createError({ statusCode: 400, statusMessage: 'CLI 준비 요청 형식이 올바르지 않습니다.' })
  const projectRoot = await requireConfiguredRoot(event, input.project_root)
  const project = await readConfiguredProject(event, projectRoot)
  const session = project.sessions.find(session => session.session_id === input.session_id)
  if (!session) throw createError({ statusCode: 404, statusMessage: '선택한 WorkSession을 찾을 수 없습니다.' })
  const config = useRuntimeConfig(event)
  const channel = normalizeSchemaWorkflowChannel(config.schemaWorkflowChannel)
  try {
    await requireCurrentProjectSkill(projectRoot, input.platform, channel)
  } catch (error) {
    const skillError = error as Error & { code?: string, skill?: unknown }
    throw createError({
      statusCode: 409,
      statusMessage: '선택한 플랫폼의 Schema Workflow 스킬 상태를 먼저 확인하거나 설치해야 합니다.',
      data: { code: skillError.code ?? 'PROJECT_SKILL_NOT_READY', skill: skillError.skill },
    })
  }
  try {
    const request = await prepareLaunchRequest({ ...input, project_root: projectRoot }, project, session, { channel, launcherPath: String(config.schemaWorkflowLauncher || '') || undefined, trustedAutoRoots: await trustedAutoRoots(event, input.platform) })
    return { status: 'prepared', request, prompt_text: await readFile(request.prompt_path, 'utf8') }
  } catch (error) {
    const launchError = error instanceof LaunchGatewayError ? error : new LaunchGatewayError('LAUNCH_PREPARE_FAILED', 'CLI 실행 준비에 실패했습니다.')
    throw createError({ statusCode: launchError.code.includes('REQUIRED') || launchError.code.includes('UNSUPPORTED') || launchError.code.includes('MISMATCH') ? 400 : 500, statusMessage: launchError.message, data: { code: launchError.code, ...launchError.details } })
  }
})
