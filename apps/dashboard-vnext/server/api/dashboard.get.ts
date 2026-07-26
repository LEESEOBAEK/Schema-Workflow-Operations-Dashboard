import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DashboardState, DashboardWarning } from '../../shared/types/dashboard'
import { applyDashboardMetadata } from '../utils/dashboardMetadataStore'
import { applyRelationshipRegistry, confirmedRegistryRunIds, readRelationshipRegistry } from '../utils/relationshipGateway'
import { readProjectCatalog } from '../utils/projectCatalogStore'
import { readWorkflowDashboard } from '../utils/workflowReadAdapter'

export default defineEventHandler(async (event): Promise<DashboardState> => {
  const config = useRuntimeConfig(event)
  const mode = String(config.dashboardDataMode || 'mock').toLowerCase()
  const environmentRoots = String(config.dashboardProjectRoots || '').split(';').map(value => value.trim()).filter(Boolean)
  const catalogPath = resolve(String(config.dashboardProjectCatalogPath || '.data/project-catalog.json'))
  const catalog = await readProjectCatalog(catalogPath, environmentRoots)
  const projectRoots = catalog.projects.map(project => project.source_root)
  const metadataPath = String(config.dashboardMetadataPath || '.data/dashboard-metadata.json')

  if (mode === 'live') {
    const state = await readWorkflowDashboard({
      projectRoots,
      maxSourceBytes: Number(config.dashboardMaxSourceBytes) || undefined,
    })
    const projections = await Promise.all(state.projects.map(async (project) => {
      if (!project.source_root) return { project: { ...project, relationship_revision: 0 }, resolvedRunIds: new Set<string>() }
      const projection = await readRelationshipRegistry(project.source_root)
      return {
        project: projection.registry ? applyRelationshipRegistry(project, projection.registry) : { ...project, relationship_revision: 0 },
        revision: projection.registry?.revision,
        resolvedRunIds: projection.registry ? confirmedRegistryRunIds(projection.registry) : new Set<string>(),
        warning: projection.warning,
      }
    }))
    const warnings = projections.map(projection => projection.warning).filter((warning): warning is DashboardWarning => Boolean(warning))
    const resolvedRunIds = new Set(projections.flatMap(projection => [...projection.resolvedRunIds]))
    return applyDashboardMetadata({
      ...state,
      projects: projections.map(projection => projection.project),
      conflicts: state.conflicts.filter(conflict => !resolvedRunIds.has(conflict.source_id)),
      relationship_revision: Math.max(0, ...projections.map(projection => projection.revision ?? 0)),
      source: state.source ? { ...state.source, active_project_root: catalog.active_project_root ?? undefined, warnings: warnings.length ? [...state.source.warnings, ...warnings] : state.source.warnings } : state.source,
    }, metadataPath)
  }

  const fixturePath = resolve(process.cwd(), '../../fixtures/dashboard_mock_state.json')
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as DashboardState
  return applyDashboardMetadata({
    ...fixture,
    source: {
      mode: 'mock',
      read_at: new Date().toISOString(),
      project_roots: [],
      warnings: [],
    },
  }, metadataPath)
})
