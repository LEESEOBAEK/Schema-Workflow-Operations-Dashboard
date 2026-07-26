import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { LaunchGatewayError, markWorkspaceOpened, readLaunchRequest } from '../../utils/launchGateway'
import { requireConfiguredRoot, requireLiveMode } from '../../utils/launchApiSupport'
import { buildVSCodeFolderUri } from '../../utils/vscodeLauncher'

async function findVSCode(): Promise<string> {
  const candidates = [
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
    join(process.env.ProgramFiles ?? '', 'Microsoft VS Code', 'Code.exe'),
    join(process.env['ProgramFiles(x86)'] ?? '', 'Microsoft VS Code', 'Code.exe'),
  ]
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate
    } catch { /* Try the next standard installation location. */ }
  }
  throw new LaunchGatewayError('VSCODE_NOT_FOUND', 'Visual Studio Code를 찾지 못했습니다.')
}

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const input = await readBody(event) as { project_root?: unknown; launch_id?: unknown }
  if (typeof input?.project_root !== 'string' || typeof input.launch_id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'ProjectRoot와 Launch ID가 필요합니다.' })
  }
  const projectRoot = await requireConfiguredRoot(event, input.project_root)
  try {
    const request = await readLaunchRequest(projectRoot, input.launch_id)
    if (request.status !== 'prepared' && request.status !== 'workspace_opened') {
      throw new LaunchGatewayError('LAUNCH_STATE_INVALID', '준비된 요청만 VS Code에서 열 수 있습니다.')
    }
    await findVSCode()
    return {
      status: 'workspace_opened',
      open_uri: buildVSCodeFolderUri(request.project_root),
      request: await markWorkspaceOpened(projectRoot, input.launch_id),
    }
  } catch (error) {
    const launchError = error instanceof LaunchGatewayError
      ? error
      : new LaunchGatewayError('VSCODE_OPEN_FAILED', error instanceof Error ? error.message : 'VS Code를 열지 못했습니다.')
    throw createError({ statusCode: launchError.code.includes('NOT_FOUND') ? 404 : launchError.code.includes('STATE') ? 409 : 500, statusMessage: launchError.message, data: { code: launchError.code, ...launchError.details } })
  }
})
