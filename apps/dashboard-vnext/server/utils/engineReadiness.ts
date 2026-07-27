import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { EngineReadinessState, SchemaWorkflowChannel } from '../../shared/types/dashboard'
import { defaultSchemaWorkflowInstallRoot } from './schemaWorkflowRuntime'

const execFileAsync = promisify(execFile)

interface EngineReadinessOptions {
  channel?: SchemaWorkflowChannel
  installRoot?: string
  launcherPath?: string
  packageRoot?: string
}

interface InstallEngineOptions extends EngineReadinessOptions {
  runCommand?: typeof execFileAsync
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  }
  catch {
    return null
  }
}

async function isFile(path: string): Promise<boolean> {
  return Boolean((await stat(path).catch(() => null))?.isFile())
}

function resolvedPaths(options: EngineReadinessOptions) {
  const channel = options.channel ?? 'stable'
  const installRoot = resolve(options.installRoot || defaultSchemaWorkflowInstallRoot(channel))
  return {
    channel,
    installRoot,
    launcherPath: resolve(options.launcherPath || join(installRoot, 'bin', 'schema-workflow.ps1')),
    packageRoot: options.packageRoot?.trim() ? resolve(options.packageRoot) : null,
  }
}

async function packageState(packageRoot: string | null): Promise<{ available: boolean, release: string | null }> {
  if (!packageRoot) return { available: false, release: null }
  const manifest = await readJson(join(packageRoot, 'release-manifest.json'))
  const installer = join(packageRoot, 'installer', 'Install-SchemaWorkflow.ps1')
  return {
    available: Boolean(manifest && typeof manifest.release_version === 'string' && await isFile(installer)),
    release: typeof manifest?.release_version === 'string' ? manifest.release_version : null,
  }
}

export async function inspectEngineReadiness(options: EngineReadinessOptions = {}): Promise<EngineReadinessState> {
  const paths = resolvedPaths(options)
  const packageInfo = await packageState(paths.packageRoot)
  const common = {
    channel: paths.channel,
    install_root: paths.installRoot,
    launcher_path: paths.launcherPath,
    package_root: paths.packageRoot,
    package_release: packageInfo.release,
    package_available: packageInfo.available,
    can_install: packageInfo.available,
  }

  if (!await isFile(paths.launcherPath)) {
    return {
      ...common,
      status: 'not_installed',
      active_release: null,
      message: packageInfo.available
        ? 'Schema Workflow 엔진이 설치되어 있지 않습니다.'
        : '엔진이 없고 설치 패키지도 연결되지 않았습니다.',
    }
  }

  const pointer = await readJson(join(paths.installRoot, 'active-release.json'))
  const activeRelease = typeof pointer?.release_version === 'string' ? pointer.release_version : null
  if (!activeRelease) {
    return { ...common, status: 'invalid', active_release: null, message: '활성 엔진 버전 정보를 읽을 수 없습니다.' }
  }

  const manifest = await readJson(join(paths.installRoot, 'releases', activeRelease, 'release-manifest.json'))
  if (
    !manifest
    || manifest.release_version !== activeRelease
    || typeof manifest.manifest_sha256 !== 'string'
    || pointer?.manifest_sha256 !== manifest.manifest_sha256
  ) {
    return {
      ...common,
      status: 'invalid',
      active_release: activeRelease,
      message: '활성 엔진과 릴리스 manifest가 일치하지 않습니다. 복구 또는 재설치가 필요합니다.',
    }
  }

  return {
    ...common,
    status: 'ready',
    active_release: activeRelease,
    message: `Schema Workflow ${activeRelease} 엔진이 준비되었습니다.`,
  }
}

export async function installEnginePackage(options: InstallEngineOptions = {}): Promise<EngineReadinessState> {
  const paths = resolvedPaths(options)
  const packageInfo = await packageState(paths.packageRoot)
  if (!paths.packageRoot || !packageInfo.available) {
    throw Object.assign(new Error('검증 가능한 Schema Workflow 설치 패키지가 연결되지 않았습니다.'), {
      code: 'ENGINE_PACKAGE_NOT_AVAILABLE',
    })
  }

  const installer = join(paths.packageRoot, 'installer', 'Install-SchemaWorkflow.ps1')
  await (options.runCommand ?? execFileAsync)('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', installer,
    '-PackageRoot', paths.packageRoot,
    '-InstallRoot', paths.installRoot,
    '-Channel', paths.channel,
    '-Approved',
  ], { windowsHide: true, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 })

  const result = await inspectEngineReadiness(options)
  if (result.status !== 'ready') {
    throw Object.assign(new Error(result.message), { code: 'ENGINE_INSTALLATION_NOT_READY', readiness: result })
  }
  return result
}
