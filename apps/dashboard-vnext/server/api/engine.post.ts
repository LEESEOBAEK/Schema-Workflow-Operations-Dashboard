import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { installEnginePackage } from '../utils/engineReadiness'

interface InstallEngineBody {
  confirmed?: unknown
}

export default defineEventHandler(async (event) => {
  const body = await readBody<InstallEngineBody>(event)
  if (body.confirmed !== true) {
    throw createError({ statusCode: 400, statusMessage: '엔진 설치에 대한 명시적 확인이 필요합니다.' })
  }
  const config = useRuntimeConfig(event)
  const configuredLauncher = String(config.schemaWorkflowLauncher || '').trim()
  const installRoot = configuredLauncher
    ? dirname(dirname(configuredLauncher))
    : join(homedir(), '.schema-workflow-candidate')
  try {
    return await installEnginePackage({
      installRoot,
      launcherPath: configuredLauncher || undefined,
      packageRoot: String(config.schemaWorkflowPackageRoot || '').trim() || undefined,
    })
  }
  catch (error: any) {
    const detail = String(error?.stderr || error?.stdout || error?.message || '').trim()
    throw createError({
      statusCode: error?.code === 'ENGINE_PACKAGE_NOT_AVAILABLE' ? 409 : 502,
      statusMessage: detail || 'Schema Workflow 엔진을 설치하지 못했습니다.',
      data: { code: error?.code ?? 'ENGINE_INSTALLATION_FAILED' },
    })
  }
})
