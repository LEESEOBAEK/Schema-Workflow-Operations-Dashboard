import type { LaunchPlatform } from '../../../shared/types/dashboard'
import { requireConfiguredRoot, requireLiveMode, trustedAutoRegistryPath } from '../../utils/launchApiSupport'
import { approveTrustedProject, TrustedAutoRegistryError } from '../../utils/trustedAutoRegistry'

function platformOf(value: unknown): LaunchPlatform | null {
  return value === 'codex' || value === 'claude' || value === 'antigravity' ? value : null
}

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const input = await readBody(event) as Record<string, unknown>
  const platform = platformOf(input.platform)
  if (typeof input.project_root !== 'string' || !platform || input.approved !== true) throw createError({ statusCode: 400, statusMessage: '프로젝트와 플랫폼에 대한 명시적 승인이 필요합니다.' })
  const projectRoot = await requireConfiguredRoot(event, input.project_root)
  try { return await approveTrustedProject(trustedAutoRegistryPath(event), projectRoot, platform) }
  catch (error) {
    const trustError = error instanceof TrustedAutoRegistryError ? error : new TrustedAutoRegistryError('TRUST_APPROVAL_FAILED', '자동 실행을 승인하지 못했습니다.')
    const statusCode = trustError.code.includes('TOO_BROAD') ? 400 : trustError.code.includes('NOT_FOUND') ? 404 : 500
    throw createError({ statusCode, statusMessage: trustError.message, data: { code: trustError.code, ...trustError.details } })
  }
})
