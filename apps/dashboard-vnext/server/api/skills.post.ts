import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import type { LaunchPlatform } from '../../shared/types/dashboard'
import { requireConfiguredRoot, requireLiveMode } from '../utils/launchApiSupport'
import { inspectProjectSkill, inspectProjectSkills, recordSkillEvent } from '../utils/projectSkillManager'

const execFileAsync = promisify(execFile)
const PLATFORMS: LaunchPlatform[] = ['codex', 'claude', 'antigravity']

interface InstallSkillBody {
  project_root?: unknown
  platform?: unknown
  confirmed?: unknown
}

function launcherPath(event: H3Event): string {
  const configured = String(useRuntimeConfig(event).schemaWorkflowLauncher || '').trim()
  return resolve(configured || join(homedir(), '.schema-workflow-candidate', 'bin', 'schema-workflow.ps1'))
}

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const body = await readBody<InstallSkillBody>(event)
  if (typeof body.project_root !== 'string') throw createError({ statusCode: 400, statusMessage: 'ProjectRoot가 필요합니다.' })
  if (typeof body.platform !== 'string' || !PLATFORMS.includes(body.platform as LaunchPlatform)) throw createError({ statusCode: 400, statusMessage: '지원하는 플랫폼을 선택하세요.' })
  if (body.confirmed !== true) throw createError({ statusCode: 400, statusMessage: '스킬 설치 확인이 필요합니다.' })

  const platform = body.platform as LaunchPlatform
  const projectRoot = await requireConfiguredRoot(event, body.project_root)
  const before = await inspectProjectSkill(projectRoot, platform)
  if (before.state === 'current') return inspectProjectSkills(projectRoot)
  if (before.state !== 'not_installed') {
    throw createError({
      statusCode: 409,
      statusMessage: before.state === 'update_required'
        ? '기존 스킬의 업데이트가 필요합니다. 현재 버전은 자동으로 덮어쓰지 않습니다.'
        : '기존 스킬이 변경되었거나 소유권을 확인할 수 있어 자동 설치를 중단했습니다.',
      data: { skill: before },
    })
  }

  const launcher = launcherPath(event)
  try {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', launcher,
      'project-init',
      '--project-root', projectRoot,
      '--platform', platform,
      '--channel', 'candidate',
      '--output', 'json',
    ], { cwd: projectRoot, windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 })
  } catch (error: any) {
    const detail = String(error?.stderr || error?.stdout || error?.message || '').trim()
    throw createError({ statusCode: 502, statusMessage: detail || 'Schema Workflow 설치기를 실행하지 못했습니다.' })
  }

  const after = await inspectProjectSkill(projectRoot, platform)
  if (after.state !== 'current') throw createError({ statusCode: 502, statusMessage: '설치는 끝났지만 스킬 무결성 확인을 통과하지 못했습니다.', data: { skill: after } })
  await recordSkillEvent(join(homedir(), '.schema-workflow-dashboard', 'skill-events.jsonl'), {
    event_type: 'SKILL_INSTALLED',
    project_root: projectRoot,
    platform,
    skill_version: after.installed_version,
    target: after.target,
  })
  return inspectProjectSkills(projectRoot)
})
