import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { ConfirmSessionRequest, CreateWorkSessionRequest, DashboardWarning, OperationKind, RelationshipRecord, RelationshipType, WorkflowProject } from '../../shared/types/dashboard'

export const RELATIONSHIP_SCHEMA_VERSION = '1.0.0'
const LOCK_TIMEOUT_MS = 2000
const LOCK_RETRY_MS = 25

interface SessionEntity {
  session_id: string
  project_id: string
  name: string
  created_at: string
  operation_kind?: OperationKind
  anchor_run_id?: string | null
}

export interface RelationshipRegistry {
  schema_version: '1.0.0'
  revision: number
  project: { project_id: string; source_root: string }
  sessions: SessionEntity[]
  relations: RelationshipRecord[]
  updated_at: string
}

export interface RelationshipProjection {
  registry: RelationshipRegistry | null
  warning?: DashboardWarning
}

export class RelationshipGatewayError extends Error {
  constructor(public code: string, message: string, public details: Record<string, unknown> = {}) {
    super(message)
  }
}

function relationshipRoot(projectRoot: string): string {
  return join(resolve(projectRoot), '.schema-workflow', 'relations')
}

export function relationshipPaths(projectRoot: string) {
  const root = relationshipRoot(projectRoot)
  return {
    root,
    registry: join(root, 'relationship-registry.json'),
    events: join(root, 'relation-events.jsonl'),
    lock: join(root, 'relationship-registry.lock'),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || randomUUID().replaceAll('-', '')
}

function emptyRegistry(projectRoot: string, projectId: string): RelationshipRegistry {
  return {
    schema_version: RELATIONSHIP_SCHEMA_VERSION,
    revision: 0,
    project: { project_id: projectId, source_root: resolve(projectRoot) },
    sessions: [],
    relations: [],
    updated_at: new Date(0).toISOString(),
  }
}

function alignProjectIdentity(registry: RelationshipRegistry, projectId: string): string | null {
  const previousProjectId = registry.project.project_id
  if (previousProjectId === projectId) return null
  registry.project.project_id = projectId
  registry.sessions.forEach(session => { session.project_id = projectId })
  registry.relations.forEach(relation => {
    if (relation.relation_type === 'HAS_SESSION' && relation.source_id === previousProjectId) relation.source_id = projectId
  })
  return previousProjectId
}

function validateRegistry(value: unknown, projectRoot: string): RelationshipRegistry {
  if (!isRecord(value)
    || value.schema_version !== RELATIONSHIP_SCHEMA_VERSION
    || !Number.isInteger(value.revision)
    || !isRecord(value.project)
    || !Array.isArray(value.sessions)
    || !Array.isArray(value.relations)) {
    throw new RelationshipGatewayError('RELATIONSHIP_REGISTRY_INVALID', '관계 Registry 형식이 올바르지 않습니다.')
  }
  const storedRoot = typeof value.project.source_root === 'string' ? resolve(value.project.source_root) : ''
  if (storedRoot.toLowerCase() !== resolve(projectRoot).toLowerCase()) {
    throw new RelationshipGatewayError('RELATIONSHIP_PROJECT_ROOT_MISMATCH', '관계 Registry의 ProjectRoot가 현재 프로젝트와 다릅니다.')
  }
  return value as unknown as RelationshipRegistry
}

export async function readRelationshipRegistry(projectRoot: string): Promise<RelationshipProjection> {
  const path = relationshipPaths(projectRoot).registry
  try {
    return { registry: validateRegistry(JSON.parse(await readFile(path, 'utf8')) as unknown, projectRoot) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { registry: null }
    const code = error instanceof RelationshipGatewayError ? error.code : 'RELATIONSHIP_REGISTRY_UNREADABLE'
    return { registry: null, warning: { code, message: '관계 Registry를 읽을 수 없어 원본 추론 관계만 표시합니다.', source_path: path } }
  }
}

async function acquireLock(path: string): Promise<() => Promise<void>> {
  await mkdir(dirname(path), { recursive: true })
  const started = Date.now()
  while (true) {
    try {
      const handle = await open(path, 'wx')
      await handle.writeFile(`${process.pid}\n`, 'utf8')
      return async () => { await handle.close(); await rm(path, { force: true }) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new RelationshipGatewayError('RELATIONSHIP_LOCK_FAILED', '관계 저장 잠금을 만들 수 없습니다.')
      }
      if (Date.now() - started >= LOCK_TIMEOUT_MS) {
        throw new RelationshipGatewayError('RELATIONSHIP_LOCK_TIMEOUT', '다른 관계 변경 작업이 끝나지 않았습니다.')
      }
      await new Promise(resolveDelay => setTimeout(resolveDelay, LOCK_RETRY_MS))
    }
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp_${randomUUID()}`
  try {
    await writeFile(temporary, content, 'utf8')
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}

async function listRunIds(projectRoot: string): Promise<Set<string>> {
  const root = join(resolve(projectRoot), 'outputs', 'workflows')
  try {
    return new Set((await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => entry.name))
  } catch {
    return new Set()
  }
}

function activeRelations(registry: RelationshipRegistry, type?: RelationshipType): RelationshipRecord[] {
  return registry.relations.filter(relation => relation.status !== 'superseded' && (!type || relation.relation_type === type))
}

function wouldCreateLineageCycle(registry: RelationshipRegistry, sourceId: string, targetId: string): boolean {
  if (sourceId === targetId) return true
  const lineage = registry.relations.filter(relation => relation.status !== 'superseded' && (relation.relation_type === 'CONTINUES' || relation.relation_type === 'BRANCHES_FROM'))
  const nextBySource = new Map(lineage.map(relation => [relation.source_id, relation.target_id]))
  nextBySource.set(sourceId, targetId)
  let cursor: string | undefined = targetId
  const seen = new Set<string>()
  while (cursor) {
    if (cursor === sourceId || seen.has(cursor)) return true
    seen.add(cursor)
    cursor = nextBySource.get(cursor)
  }
  return false
}

export function validateRelationship(registry: RelationshipRegistry, relation: RelationshipRecord, knownRunIds: Set<string>): void {
  const sessionIds = new Set(registry.sessions.map(session => session.session_id))
  const projectId = registry.project.project_id
  if (relation.relation_type === 'HAS_SESSION' && (relation.source_id !== projectId || !sessionIds.has(relation.target_id))) {
    throw new RelationshipGatewayError('RELATIONSHIP_REFERENCE_NOT_FOUND', 'Project 또는 WorkSession을 찾을 수 없습니다.')
  }
  if (relation.relation_type === 'HAS_RUN' && (!sessionIds.has(relation.source_id) || !knownRunIds.has(relation.target_id))) {
    throw new RelationshipGatewayError('RELATIONSHIP_REFERENCE_NOT_FOUND', 'WorkSession 또는 Run을 찾을 수 없습니다.')
  }
  if (relation.relation_type === 'CONTINUES' || relation.relation_type === 'BRANCHES_FROM') {
    if (!knownRunIds.has(relation.source_id) || !knownRunIds.has(relation.target_id)) {
      throw new RelationshipGatewayError('RELATIONSHIP_REFERENCE_NOT_FOUND', '연결할 Run을 찾을 수 없습니다.')
    }
    if (wouldCreateLineageCycle(registry, relation.source_id, relation.target_id)) {
      throw new RelationshipGatewayError('RELATIONSHIP_CYCLE_REJECTED', 'Run 계속 관계에 순환이 발생합니다.')
    }
  }
}

function normalizeOperationKind(value: OperationKind | undefined): OperationKind {
  return value === 'continue' || value === 'branch' ? value : 'independent'
}

function validateSessionIntent(operationKind: OperationKind, anchorRunId: string | null, knownRunIds: Set<string>): void {
  if (operationKind === 'independent') {
    if (anchorRunId) throw new RelationshipGatewayError('SESSION_ANCHOR_NOT_ALLOWED', '독립 작업에는 기준 Run을 지정할 수 없습니다.')
    return
  }
  if (!anchorRunId) throw new RelationshipGatewayError('SESSION_ANCHOR_REQUIRED', '이어가기 또는 분기 작업에는 기준 Run이 필요합니다.')
  if (!knownRunIds.has(anchorRunId)) throw new RelationshipGatewayError('RELATIONSHIP_REFERENCE_NOT_FOUND', '기준 Run을 현재 ProjectRoot에서 찾을 수 없습니다.')
}

export async function createWorkSession(request: CreateWorkSessionRequest, projectId: string): Promise<{ registry: RelationshipRegistry; session_id: string }> {
  const projectRoot = resolve(request.project_root)
  const rootStat = await stat(projectRoot).catch(() => null)
  if (!rootStat?.isDirectory()) throw new RelationshipGatewayError('PROJECT_ROOT_NOT_FOUND', 'ProjectRoot를 찾을 수 없습니다.')
  const sessionName = request.session_name.trim().slice(0, 120)
  if (!sessionName) throw new RelationshipGatewayError('SESSION_NAME_REQUIRED', '작업 이름을 입력해야 합니다.')
  const operationKind = normalizeOperationKind(request.operation_kind)
  const anchorRunId = request.anchor_run_id?.trim() || null
  const paths = relationshipPaths(projectRoot)
  const release = await acquireLock(paths.lock)
  try {
    const registry = await loadForWrite(projectRoot, projectId)
    if (registry.revision !== request.expected_revision) throw new RelationshipGatewayError('RELATIONSHIP_REVISION_CONFLICT', '다른 관계 변경이 먼저 저장되었습니다.', { expected_revision: request.expected_revision, current_revision: registry.revision })
    const previousProjectId = alignProjectIdentity(registry, projectId)
    const knownRunIds = await listRunIds(projectRoot)
    validateSessionIntent(operationKind, anchorRunId, knownRunIds)
    const now = new Date().toISOString()
    const sessionId = `session_${safeId(sessionName).slice(0, 48)}_${randomUUID().slice(0, 8)}`
    registry.sessions.push({ session_id: sessionId, project_id: projectId, name: sessionName, created_at: now, operation_kind: operationKind, anchor_run_id: anchorRunId })
    const relation: RelationshipRecord = { schema_version: '1.0.0', relation_id: `rel_${randomUUID().replaceAll('-', '')}`, source_id: projectId, relation_type: 'HAS_SESSION', target_id: sessionId, status: 'confirmed', evidence_refs: [], created_at: now, created_by: 'user', supersedes_relation_id: null }
    validateRelationship(registry, relation, knownRunIds)
    registry.relations.push(relation)
    const previousRevision = registry.revision
    registry.revision += 1
    registry.updated_at = now
    await persistMutation(projectRoot, registry, { event_id: `evt_${randomUUID().replaceAll('-', '')}`, event_type: 'WORK_SESSION_CREATED', project_id: projectId, previous_project_id: previousProjectId, session_id: sessionId, operation_kind: operationKind, anchor_run_id: anchorRunId, previous_revision: previousRevision, revision: registry.revision, occurred_at: now, actor: 'user' })
    return { registry, session_id: sessionId }
  } finally { await release() }
}

async function loadForWrite(projectRoot: string, projectId: string): Promise<RelationshipRegistry> {
  const path = relationshipPaths(projectRoot).registry
  try {
    return validateRegistry(JSON.parse(await readFile(path, 'utf8')) as unknown, projectRoot)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyRegistry(projectRoot, projectId)
    throw error
  }
}

async function persistMutation(projectRoot: string, registry: RelationshipRegistry, event: Record<string, unknown>): Promise<void> {
  const paths = relationshipPaths(projectRoot)
  const previousEvents = await readFile(paths.events, 'utf8').catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  })
  await atomicWrite(paths.registry, `${JSON.stringify(registry, null, 2)}\n`)
  await atomicWrite(paths.events, `${previousEvents}${JSON.stringify(event)}\n`)
}

export async function confirmSession(request: ConfirmSessionRequest, projectId: string): Promise<RelationshipRegistry> {
  const projectRoot = resolve(request.project_root)
  const rootStat = await stat(projectRoot).catch(() => null)
  if (!rootStat?.isDirectory()) throw new RelationshipGatewayError('PROJECT_ROOT_NOT_FOUND', 'ProjectRoot를 찾을 수 없습니다.')
  if (!request.session_id.trim() || !request.session_name.trim() || !request.run_ids.length) {
    throw new RelationshipGatewayError('RELATIONSHIP_INPUT_INVALID', '세션 이름과 하나 이상의 Run이 필요합니다.')
  }
  const paths = relationshipPaths(projectRoot)
  const release = await acquireLock(paths.lock)
  try {
    const registry = await loadForWrite(projectRoot, projectId)
    if (registry.revision !== request.expected_revision) {
      throw new RelationshipGatewayError('RELATIONSHIP_REVISION_CONFLICT', '다른 관계 변경이 먼저 저장되었습니다.', { expected_revision: request.expected_revision, current_revision: registry.revision })
    }
    const previousProjectId = alignProjectIdentity(registry, projectId)
    const knownRunIds = await listRunIds(projectRoot)
    const runIds = [...new Set(request.run_ids)]
    if (runIds.some(runId => !knownRunIds.has(runId))) {
      throw new RelationshipGatewayError('RELATIONSHIP_REFERENCE_NOT_FOUND', '현재 ProjectRoot에서 일부 Run을 찾을 수 없습니다.')
    }
    const staleRunRelations = activeRelations(registry, 'HAS_RUN').filter(relation => !knownRunIds.has(relation.target_id))
    staleRunRelations.forEach(relation => { relation.status = 'superseded' })
    const now = new Date().toISOString()
    const sessionId = safeId(request.session_id)
    const existingSession = registry.sessions.find(session => session.session_id === sessionId)
    const operationKind = existingSession?.operation_kind ?? normalizeOperationKind(request.operation_kind)
    const anchorRunId = existingSession?.anchor_run_id ?? (request.anchor_run_id?.trim() || null)
    validateSessionIntent(operationKind, anchorRunId, knownRunIds)
    if (!existingSession) registry.sessions.push({ session_id: sessionId, project_id: projectId, name: request.session_name.trim().slice(0, 120), created_at: now, operation_kind: operationKind, anchor_run_id: anchorRunId })
    else {
      existingSession.operation_kind = existingSession.operation_kind ?? operationKind
      existingSession.anchor_run_id = existingSession.anchor_run_id ?? anchorRunId
    }
    const created: RelationshipRecord[] = []
    const projectRelationExists = activeRelations(registry, 'HAS_SESSION').some(relation => relation.source_id === projectId && relation.target_id === sessionId)
    if (!projectRelationExists) {
      created.push({ schema_version: '1.0.0', relation_id: `rel_${randomUUID().replaceAll('-', '')}`, source_id: projectId, relation_type: 'HAS_SESSION', target_id: sessionId, status: 'confirmed', evidence_refs: request.evidence_refs, created_at: now, created_by: 'user', supersedes_relation_id: null })
    }
    for (const runId of runIds) {
      const previous = activeRelations(registry, 'HAS_RUN').find(relation => relation.target_id === runId)
      if (previous?.source_id === sessionId && previous.status === 'confirmed') continue
      const reusesAnchor = operationKind === 'continue' && runId === anchorRunId
      if (previous && !reusesAnchor) previous.status = 'superseded'
      created.push({ schema_version: '1.0.0', relation_id: `rel_${randomUUID().replaceAll('-', '')}`, source_id: sessionId, relation_type: 'HAS_RUN', target_id: runId, status: 'confirmed', evidence_refs: request.evidence_refs, created_at: now, created_by: 'user', supersedes_relation_id: reusesAnchor ? null : previous?.relation_id ?? null })
      if (anchorRunId && runId !== anchorRunId) {
        const relationType = operationKind === 'branch' ? 'BRANCHES_FROM' : 'CONTINUES'
        const alreadyLinked = activeRelations(registry, relationType).some(relation => relation.source_id === runId && relation.target_id === anchorRunId)
        if (!alreadyLinked) created.push({ schema_version: '1.0.0', relation_id: `rel_${randomUUID().replaceAll('-', '')}`, source_id: runId, relation_type: relationType, target_id: anchorRunId, status: 'confirmed', evidence_refs: request.evidence_refs, created_at: now, created_by: 'user', supersedes_relation_id: null })
      }
    }
    created.forEach(relation => validateRelationship(registry, relation, knownRunIds))
    registry.relations.push(...created)
    const previousRevision = registry.revision
    registry.revision += 1
    registry.updated_at = now
    await persistMutation(projectRoot, registry, { event_id: `evt_${randomUUID().replaceAll('-', '')}`, event_type: 'SESSION_CONFIRMED', project_id: projectId, previous_project_id: previousProjectId, session_id: sessionId, run_ids: runIds, superseded_stale_relation_ids: staleRunRelations.map(relation => relation.relation_id), created_relation_ids: created.map(relation => relation.relation_id), previous_revision: previousRevision, revision: registry.revision, occurred_at: now, actor: 'user' })
    return registry
  } finally {
    await release()
  }
}

export function applyRelationshipRegistry(project: WorkflowProject, registry: RelationshipRegistry): WorkflowProject {
  const runsById = new Map(project.sessions.flatMap(session => session.runs).map(run => [run.run_id, run]))
  const activeRunRelations = activeRelations(registry, 'HAS_RUN')
  const assigned = new Set<string>()
  const sessions = registry.sessions.map(entity => {
    const relations = activeRunRelations.filter(relation => relation.source_id === entity.session_id)
    const runs = relations.map(relation => runsById.get(relation.target_id)).filter(run => Boolean(run)) as NonNullable<ReturnType<typeof runsById.get>>[]
    runs.forEach(run => assigned.add(run.run_id))
    const sessionRelation = activeRelations(registry, 'HAS_SESSION').find(relation => relation.target_id === entity.session_id)
    return { session_id: entity.session_id, name: entity.name, relation_status: sessionRelation?.status ?? (relations.every(relation => relation.status === 'confirmed') ? 'confirmed' as const : 'unresolved' as const), relation_id: sessionRelation?.relation_id ?? relations[0]?.relation_id, relation_revision: registry.revision, operation_kind: entity.operation_kind ?? 'independent', anchor_run_id: entity.anchor_run_id ?? null, runs }
  })
  const remainder = project.sessions.map(session => ({ ...session, runs: session.runs.filter(run => !assigned.has(run.run_id)), relation_revision: registry.revision })).filter(session => session.runs.length)
  return { ...project, relationship_revision: registry.revision, sessions: [...sessions, ...remainder] }
}

export function confirmedRegistryRunIds(registry: RelationshipRegistry): Set<string> {
  return new Set(activeRelations(registry, 'HAS_RUN').filter(relation => relation.status === 'confirmed').map(relation => relation.target_id))
}
