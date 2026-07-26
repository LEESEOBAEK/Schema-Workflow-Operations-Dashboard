import type { LaunchPlatform } from '../../../shared/types/dashboard'
import { requireConfiguredRoot, requireLiveMode, trustedAutoRegistryPath } from '../../utils/launchApiSupport'
import { trustedAutoStatus, TrustedAutoRegistryError } from '../../utils/trustedAutoRegistry'
import { isTrustedAutoRoot } from '../../utils/launchGateway'
import { trustedAutoRoots } from '../../utils/launchApiSupport'

function platformOf(value: unknown): LaunchPlatform | null {
  return value === 'codex' || value === 'claude' || value === 'antigravity' ? value : null
}

export default defineEventHandler(async (event) => {
  requireLiveMode(event)
  const query = getQuery(event)
  if (typeof query.project_root !== 'string' || !platformOf(query.platform)) throw createError({ statusCode: 400, statusMessage: 'ProjectRoot와 플랫폼이 필요합니다.' })
  const projectRoot = await requireConfiguredRoot(event, query.project_root)
  try {
    const platform = platformOf(query.platform)!
    const status = await trustedAutoStatus(trustedAutoRegistryPath(event), projectRoot, platform)
    if (!status.approved && isTrustedAutoRoot(projectRoot, await trustedAutoRoots(event, platform))) return { ...status, approved: true, source: 'environment' as const }
    return status
  }
  catch (error) {
    const trustError = error instanceof TrustedAutoRegistryError ? error : new TrustedAutoRegistryError('TRUST_STATUS_FAILED', '자동 실행 승인 상태를 확인하지 못했습니다.')
    throw createError({ statusCode: trustError.code.includes('NOT_FOUND') ? 404 : 500, statusMessage: trustError.message, data: { code: trustError.code, ...trustError.details } })
  }
})
