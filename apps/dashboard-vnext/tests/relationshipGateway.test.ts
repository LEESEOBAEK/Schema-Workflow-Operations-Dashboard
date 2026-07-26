import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RelationshipRecord } from '../shared/types/dashboard'
import { applyRelationshipRegistry, confirmSession, confirmedRegistryRunIds, createWorkSession, readRelationshipRegistry, relationshipPaths, RelationshipGatewayError, validateRelationship, type RelationshipRegistry } from '../server/utils/relationshipGateway'

const roots: string[] = []

async function makeProject(...runIds: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'relationship-gateway-'))
  roots.push(root)
  await Promise.all(runIds.map(runId => mkdir(join(root, 'outputs', 'workflows', runId), { recursive: true })))
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('relationship gateway', () => {
  it('creates and projects an empty independent WorkSession', async () => {
    const root = await makeProject()
    const result = await createWorkSession({ project_root: root, expected_revision: 0, session_name: '새 분석', operation_kind: 'independent' }, 'project_test')
    const projected = applyRelationshipRegistry({ project_id: 'project_test', name: 'Test', source_root: root, sessions: [] }, result.registry)

    expect(result.registry.revision).toBe(1)
    expect(projected.sessions).toHaveLength(1)
    expect(projected.sessions[0]).toMatchObject({ session_id: result.session_id, name: '새 분석', operation_kind: 'independent', relation_status: 'confirmed', runs: [] })
  })

  it('requires an existing anchor Run for continue and branch sessions', async () => {
    const root = await makeProject('run_anchor')
    await expect(createWorkSession({ project_root: root, expected_revision: 0, session_name: '이어가기', operation_kind: 'continue' }, 'project_test')).rejects.toMatchObject({ code: 'SESSION_ANCHOR_REQUIRED' })
    await expect(createWorkSession({ project_root: root, expected_revision: 0, session_name: '분기', operation_kind: 'branch', anchor_run_id: 'missing' }, 'project_test')).rejects.toMatchObject({ code: 'RELATIONSHIP_REFERENCE_NOT_FOUND' })
  })

  it('records branch lineage when a new child Run is confirmed', async () => {
    const root = await makeProject('run_anchor', 'run_branch')
    const branched = await createWorkSession({ project_root: root, expected_revision: 0, session_name: '대안 분기', operation_kind: 'branch', anchor_run_id: 'run_anchor' }, 'project_test')
    const final = await confirmSession({ project_root: root, expected_revision: 1, session_id: branched.session_id, session_name: '대안 분기', run_ids: ['run_branch'], evidence_refs: [], operation_kind: 'branch', anchor_run_id: 'run_anchor' }, 'project_test')

    expect(final.relations).toContainEqual(expect.objectContaining({ source_id: 'run_branch', target_id: 'run_anchor', relation_type: 'BRANCHES_FROM' }))
  })

  it('allows a continuation WorkSession to reuse the same Run without moving it from the original session', async () => {
    const root = await makeProject('run_anchor')
    const original = await createWorkSession({ project_root: root, expected_revision: 0, session_name: '원본', operation_kind: 'independent' }, 'project_test')
    await confirmSession({ project_root: root, expected_revision: 1, session_id: original.session_id, session_name: '원본', run_ids: ['run_anchor'], evidence_refs: [], operation_kind: 'independent' }, 'project_test')
    const continued = await createWorkSession({ project_root: root, expected_revision: 2, session_name: '이어가기', operation_kind: 'continue', anchor_run_id: 'run_anchor' }, 'project_test')
    const registry = await confirmSession({ project_root: root, expected_revision: 3, session_id: continued.session_id, session_name: '이어가기', run_ids: ['run_anchor'], evidence_refs: [], operation_kind: 'continue', anchor_run_id: 'run_anchor' }, 'project_test')

    const activeLinks = registry.relations.filter(relation => relation.relation_type === 'HAS_RUN' && relation.target_id === 'run_anchor' && relation.status === 'confirmed')
    expect(activeLinks.map(relation => relation.source_id).sort()).toEqual([continued.session_id, original.session_id].sort())
    expect(registry.relations.some(relation => relation.relation_type === 'CONTINUES' && relation.source_id === relation.target_id)).toBe(false)
  })

  it('creates confirmed session relations and an append-only audit event', async () => {
    const root = await makeProject('run_a', 'run_b')
    const registry = await confirmSession({ project_root: root, expected_revision: 0, session_id: 'session_alpha', session_name: '알파 작업', run_ids: ['run_a', 'run_b'], evidence_refs: ['user_confirmation'] }, 'project_test')

    expect(registry.revision).toBe(1)
    expect(registry.sessions[0]?.name).toBe('알파 작업')
    expect(registry.relations.filter(relation => relation.relation_type === 'HAS_RUN')).toHaveLength(2)
    expect(registry.relations.every(relation => relation.status === 'confirmed')).toBe(true)
    const events = (await readFile(relationshipPaths(root).events, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(events).toHaveLength(1)
    expect(events[0].previous_revision).toBe(0)
    expect(events[0].revision).toBe(1)
  })

  it('preserves the previous relation as superseded when a run moves sessions', async () => {
    const root = await makeProject('run_a')
    const first = await confirmSession({ project_root: root, expected_revision: 0, session_id: 'session_a', session_name: 'A', run_ids: ['run_a'], evidence_refs: [] }, 'project_test')
    const oldRelation = first.relations.find(relation => relation.relation_type === 'HAS_RUN')!
    const second = await confirmSession({ project_root: root, expected_revision: 1, session_id: 'session_b', session_name: 'B', run_ids: ['run_a'], evidence_refs: ['user_review'] }, 'project_test')
    const current = second.relations.find(relation => relation.relation_type === 'HAS_RUN' && relation.status === 'confirmed')!

    expect(second.relations.find(relation => relation.relation_id === oldRelation.relation_id)?.status).toBe('superseded')
    expect(current.source_id).toBe('session_b')
    expect(current.supersedes_relation_id).toBe(oldRelation.relation_id)
  })

  it('rejects stale revisions and nonexistent runs without changing the registry', async () => {
    const root = await makeProject('run_a')
    await confirmSession({ project_root: root, expected_revision: 0, session_id: 'session_a', session_name: 'A', run_ids: ['run_a'], evidence_refs: [] }, 'project_test')
    const before = await readFile(relationshipPaths(root).registry)

    await expect(confirmSession({ project_root: root, expected_revision: 0, session_id: 'session_b', session_name: 'B', run_ids: ['run_a'], evidence_refs: [] }, 'project_test')).rejects.toMatchObject({ code: 'RELATIONSHIP_REVISION_CONFLICT' })
    await expect(confirmSession({ project_root: root, expected_revision: 1, session_id: 'session_b', session_name: 'B', run_ids: ['missing'], evidence_refs: [] }, 'project_test')).rejects.toMatchObject({ code: 'RELATIONSHIP_REFERENCE_NOT_FOUND' })
    expect(await readFile(relationshipPaths(root).registry)).toEqual(before)
  })

  it('aligns a legacy registry project id while preserving sessions and run relationships', async () => {
    const root = await makeProject('run_a', 'run_b')
    await confirmSession({ project_root: root, expected_revision: 0, session_id: 'session_a', session_name: 'A', run_ids: ['run_a'], evidence_refs: [] }, 'project_legacy')

    const migrated = await confirmSession({ project_root: root, expected_revision: 1, session_id: 'session_b', session_name: 'B', run_ids: ['run_b'], evidence_refs: [] }, 'project_contract')

    expect(migrated.project.project_id).toBe('project_contract')
    expect(migrated.sessions.every(session => session.project_id === 'project_contract')).toBe(true)
    expect(migrated.relations.filter(relation => relation.relation_type === 'HAS_SESSION').every(relation => relation.source_id === 'project_contract')).toBe(true)
    expect(migrated.relations.some(relation => relation.relation_type === 'HAS_RUN' && relation.target_id === 'run_a')).toBe(true)
    expect(migrated.relations.some(relation => relation.relation_type === 'HAS_RUN' && relation.target_id === 'run_b')).toBe(true)
    expect(await readFile(relationshipPaths(root).events, 'utf8')).toContain('"previous_project_id":"project_legacy"')
  })

  it('serializes concurrent writes so only one request can use a revision', async () => {
    const root = await makeProject('run_a', 'run_b')
    const results = await Promise.allSettled([
      confirmSession({ project_root: root, expected_revision: 0, session_id: 'session_a', session_name: 'A', run_ids: ['run_a'], evidence_refs: [] }, 'project_test'),
      confirmSession({ project_root: root, expected_revision: 0, session_id: 'session_b', session_name: 'B', run_ids: ['run_b'], evidence_refs: [] }, 'project_test'),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(RelationshipGatewayError)
    expect(rejected.reason.code).toBe('RELATIONSHIP_REVISION_CONFLICT')
    expect((await readRelationshipRegistry(root)).registry?.revision).toBe(1)
  })

  it('rejects self and transitive CONTINUES cycles', () => {
    const existing: RelationshipRecord = { schema_version: '1.0.0', relation_id: 'rel_existing', source_id: 'run_b', relation_type: 'CONTINUES', target_id: 'run_a', status: 'confirmed', evidence_refs: [], created_at: new Date().toISOString(), created_by: 'user', supersedes_relation_id: null }
    const registry: RelationshipRegistry = { schema_version: '1.0.0', revision: 1, project: { project_id: 'project_test', source_root: 'C:\\test' }, sessions: [], relations: [existing], updated_at: new Date().toISOString() }
    const cycle: RelationshipRecord = { ...existing, relation_id: 'rel_cycle', source_id: 'run_a', target_id: 'run_b' }
    expect(() => validateRelationship(registry, cycle, new Set(['run_a', 'run_b']))).toThrowError(expect.objectContaining({ code: 'RELATIONSHIP_CYCLE_REJECTED' }))
  })

  it('projects confirmed registry sessions without changing Run identities', async () => {
    const root = await makeProject('run_a')
    const registry = await confirmSession({ project_root: root, expected_revision: 0, session_id: 'session_reviewed', session_name: '검토 완료', run_ids: ['run_a'], evidence_refs: ['user_confirmation'] }, 'project_test')
    const project = { project_id: 'project_test', name: 'Test', source_root: root, sessions: [{ session_id: 'session_inferred', name: '추론 관계', relation_status: 'unresolved' as const, runs: [{ run_id: 'run_a', status: 'hold' as const, platform: 'codex' as const, next_action: '확인', artifact_count: 0, evidence_count: 0 }] }] }
    const projected = applyRelationshipRegistry(project, registry)

    expect(projected.relationship_revision).toBe(1)
    expect(projected.sessions[0]?.session_id).toBe('session_reviewed')
    expect(projected.sessions[0]?.relation_status).toBe('confirmed')
    expect(projected.sessions[0]?.runs[0]?.run_id).toBe('run_a')
    expect([...confirmedRegistryRunIds(registry)]).toEqual(['run_a'])
  })
})
