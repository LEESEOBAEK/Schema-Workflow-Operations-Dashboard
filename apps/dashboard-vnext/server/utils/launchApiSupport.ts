import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { H3Event } from 'h3'
import type { LaunchPlatform } from '../../shared/types/dashboard'
import { applyRelationshipRegistry, readRelationshipRegistry } from './relationshipGateway'
import { readProjectCatalog } from './projectCatalogStore'
import { readWorkflowDashboard } from './workflowReadAdapter'
import { trustedProjectRoots } from './trustedAutoRegistry'

export function environmentProjectRoots(event: H3Event): string[] {
  const config = useRuntimeConfig(event)
  return String(config.dashboardProjectRoots || '').split(';').map(value => value.trim()).filter(Boolean)
}

export function projectCatalogPath(event: H3Event): string {
  const config = useRuntimeConfig(event)
  return resolve(String(config.dashboardProjectCatalogPath || '.data/project-catalog.json'))
}

export async function configuredProjectRoots(event: H3Event): Promise<string[]> {
  const catalog = await readProjectCatalog(projectCatalogPath(event), environmentProjectRoots(event))
  return catalog.projects.map(project => project.source_root)
}

function environmentTrustedAutoRoots(event: H3Event): string[] {
  const config = useRuntimeConfig(event)
  return String(config.dashboardTrustedAutoRoots || '').split(';').map(value => value.trim()).filter(Boolean)
}

export function trustedAutoRegistryPath(event: H3Event): string {
  const config = useRuntimeConfig(event)
  return resolve(String(config.dashboardTrustedAutoRegistryPath || '') || join(homedir(), '.schema-workflow-dashboard', 'trusted-projects.json'))
}

export async function trustedAutoRoots(event: H3Event, platform: LaunchPlatform): Promise<string[]> {
  return [...new Set([...environmentTrustedAutoRoots(event), ...await trustedProjectRoots(trustedAutoRegistryPath(event), platform)])]
}

export async function requireConfiguredRoot(event: H3Event, requestedRoot: string): Promise<string> {
  const requested = resolve(requestedRoot)
  const configured = (await configuredProjectRoots(event)).find(root => resolve(root).toLowerCase() === requested.toLowerCase())
  if (!configured) throw createError({ statusCode: 403, statusMessage: '대시보드에 설정되지 않은 ProjectRoot입니다.' })
  return resolve(configured)
}

export async function readConfiguredProject(event: H3Event, projectRoot: string) {
  const config = useRuntimeConfig(event)
  const state = await readWorkflowDashboard({ projectRoots: [projectRoot], maxSourceBytes: Number(config.dashboardMaxSourceBytes) || undefined })
  const project = state.projects[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'ProjectRoot의 Workflow 데이터를 찾을 수 없습니다.' })
  const projection = await readRelationshipRegistry(projectRoot)
  if (projection.warning) throw createError({ statusCode: 409, statusMessage: projection.warning.message, data: { code: projection.warning.code } })
  return projection.registry ? applyRelationshipRegistry(project, projection.registry) : { ...project, relationship_revision: 0 }
}

export function requireLiveMode(event: H3Event): void {
  const config = useRuntimeConfig(event)
  if (String(config.dashboardDataMode || 'mock').toLowerCase() !== 'live') throw createError({ statusCode: 409, statusMessage: '실제 데이터 모드에서만 CLI 실행을 준비할 수 있습니다.' })
}
