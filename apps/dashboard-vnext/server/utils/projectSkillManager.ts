import { createHash, randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { LaunchPlatform, ProjectSkillManagementState, ProjectSkillStatus, SchemaWorkflowChannel } from '../../shared/types/dashboard'
import { defaultSchemaWorkflowInstallRoot } from './schemaWorkflowRuntime'

export const EXPECTED_SKILL_VERSION = '1.0.0'
const PLATFORMS: LaunchPlatform[] = ['codex', 'claude', 'antigravity']

interface OwnedSkillManifest {
  schema_version?: unknown
  owner?: unknown
  compatible_platforms?: unknown
  channel?: unknown
  skill_version?: unknown
  files?: unknown
}

function targetFor(projectRoot: string, platform: LaunchPlatform): string {
  return platform === 'claude'
    ? join(resolve(projectRoot), '.claude', 'skills', 'schema-workflow')
    : join(resolve(projectRoot), '.agents', 'skills', 'schema-workflow')
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

function baseStatus(platform: LaunchPlatform, target: string): ProjectSkillStatus {
  return { platform, state: 'not_installed', target, installed_version: null, expected_version: EXPECTED_SKILL_VERSION, channel: null, changed_files: [], compatible_platforms: [], restart_required: false, message: '스킬이 설치되어 있지 않습니다.' }
}

export async function inspectProjectSkill(projectRoot: string, platform: LaunchPlatform, expectedChannel: SchemaWorkflowChannel = 'stable'): Promise<ProjectSkillStatus> {
  const target = targetFor(projectRoot, platform)
  const status = baseStatus(platform, target)
  if (!(await stat(target).catch(() => null))?.isDirectory()) return status
  const manifestPath = join(target, 'schema-workflow-skill.json')
  if (!(await stat(manifestPath).catch(() => null))?.isFile()) return { ...status, state: 'unmanaged', message: 'Schema Workflow가 관리하지 않는 스킬 폴더입니다.' }
  let manifest: OwnedSkillManifest
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as OwnedSkillManifest }
  catch { return { ...status, state: 'invalid', message: '스킬 manifest를 읽을 수 없습니다.' } }
  if (manifest.schema_version !== '1.0.0' || manifest.owner !== 'schema-workflow-skill-manager' || typeof manifest.files !== 'object' || manifest.files === null || Array.isArray(manifest.files)) {
    return { ...status, state: 'invalid', message: '스킬 manifest의 소유권 또는 형식이 올바르지 않습니다.' }
  }
  const files = manifest.files as Record<string, unknown>
  const changedFiles: string[] = []
  for (const [relativePath, expectedHash] of Object.entries(files)) {
    const path = join(target, relativePath)
    if (typeof expectedHash !== 'string' || !(await stat(path).catch(() => null))?.isFile() || await sha256(path).catch(() => '') !== expectedHash) changedFiles.push(relativePath)
  }
  const installedVersion = typeof manifest.skill_version === 'string' ? manifest.skill_version : null
  const common = {
    ...status,
    installed_version: installedVersion,
    channel: typeof manifest.channel === 'string' ? manifest.channel : null,
    changed_files: changedFiles,
    compatible_platforms: Array.isArray(manifest.compatible_platforms) ? manifest.compatible_platforms.filter((value): value is string => typeof value === 'string') : [],
    restart_required: platform === 'claude',
  }
  if (changedFiles.length) return { ...common, state: 'modified', message: `관리 파일 ${changedFiles.length}개가 변경되었거나 누락됐습니다.` }
  if (installedVersion !== EXPECTED_SKILL_VERSION || common.channel !== expectedChannel) return { ...common, state: 'update_required', message: `설치 버전 ${installedVersion ?? '알 수 없음'} 또는 배포 채널을 ${expectedChannel} 기준으로 업데이트해야 합니다.` }
  return { ...common, state: 'current', message: '현재 후보 릴리스와 호환되는 스킬입니다.' }
}

async function activeRelease(installRoot: string): Promise<string | null> {
  try {
    const pointer = JSON.parse(await readFile(join(resolve(installRoot), 'active-release.json'), 'utf8')) as Record<string, unknown>
    return typeof pointer.release_version === 'string' ? pointer.release_version : null
  } catch { return null }
}

export async function inspectProjectSkills(projectRoot: string, expectedChannel: SchemaWorkflowChannel = 'stable', installRoot = defaultSchemaWorkflowInstallRoot(expectedChannel)): Promise<ProjectSkillManagementState> {
  const root = resolve(projectRoot)
  return { project_root: root, engine_release: await activeRelease(installRoot), expected_skill_version: EXPECTED_SKILL_VERSION, skills: await Promise.all(PLATFORMS.map(platform => inspectProjectSkill(root, platform, expectedChannel))) }
}

export async function requireCurrentProjectSkill(projectRoot: string, platform: LaunchPlatform, expectedChannel: SchemaWorkflowChannel = 'stable'): Promise<ProjectSkillStatus> {
  const status = await inspectProjectSkill(projectRoot, platform, expectedChannel)
  if (status.state !== 'current') {
    const error = new Error(status.message) as Error & { code: string, skill: ProjectSkillStatus }
    error.code = 'PROJECT_SKILL_NOT_READY'
    error.skill = status
    throw error
  }
  return status
}

export async function recordSkillEvent(path: string, event: Record<string, unknown>): Promise<void> {
  const target = resolve(path)
  await mkdir(dirname(target), { recursive: true })
  await appendFile(target, `${JSON.stringify({ event_id: `evt_${randomUUID().replaceAll('-', '')}`, occurred_at: new Date().toISOString(), actor: 'user', ...event })}\n`, 'utf8')
}
