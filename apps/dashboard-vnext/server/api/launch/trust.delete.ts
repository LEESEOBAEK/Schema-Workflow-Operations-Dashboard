import type { LaunchPlatform } from '../../../shared/types/dashboard'
import { requireConfiguredRoot, requireLiveMode, trustedAutoRegistryPath } from '../../utils/launchApiSupport'
import { revokeTrustedProject, TrustedAutoRegistryError } from '../../utils/trustedAutoRegistry'

function platformOf(value: unknown): LaunchPlatform | null {
  return value === 'codex' || value === 'claude' || value === 'antigravity' ? value : null
}

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const query = getQuery(event)
  const platform = platformOf(query.platform)
  if (typeof query.project_root !== 'string' || !platform) throw createError({ statusCode: 400, statusMessage: 'ProjectRoot와 플랫폼이 필요합니다.' })
  const projectRoot = await requireConfiguredRoot(event, query.project_root)
  try { return await revokeTrustedProject(trustedAutoRegistryPath(event), projectRoot, platform) }
  catch (error) {
    const trustError = error instanceof TrustedAutoRegistryError ? error : new TrustedAutoRegistryError('TRUST_REVOKE_FAILED', '자동 실행 승인을 해제하지 못했습니다.')
    throw createError({ statusCode: trustError.code.includes('NOT_FOUND') ? 404 : 500, statusMessage: trustError.message, data: { code: trustError.code, ...trustError.details } })
  }
})
