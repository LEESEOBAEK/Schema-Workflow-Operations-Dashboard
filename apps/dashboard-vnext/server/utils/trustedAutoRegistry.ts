import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, parse, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import type { LaunchPlatform, TrustedAutoGrant, TrustedAutoRegistry, TrustedAutoStatus } from '../../shared/types/dashboard'

const SCHEMA_VERSION = '1.0.0'
const LOCK_TIMEOUT_MS = 2000
const LOCK_RETRY_MS = 25

export class TrustedAutoRegistryError extends Error {
  constructor(public code: string, message: string, public details: Record<string, unknown> = {}) { super(message) }
}

function emptyRegistry(): TrustedAutoRegistry {
  return { schema_version: SCHEMA_VERSION, revision: 0, grants: [], updated_at: new Date(0).toISOString() }
}

function validate(value: unknown): TrustedAutoRegistry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TrustedAutoRegistryError('TRUST_REGISTRY_INVALID', '자동 실행 승인 데이터 형식이 올바르지 않습니다.')
  const record = value as Record<string, unknown>
  if (record.schema_version !== SCHEMA_VERSION || !Number.isInteger(record.revision) || !Array.isArray(record.grants)) throw new TrustedAutoRegistryError('TRUST_REGISTRY_INVALID', '자동 실행 승인 데이터 형식이 올바르지 않습니다.')
  return value as TrustedAutoRegistry
}

async function canonicalRoot(projectRoot: string): Promise<string> {
  const root = resolve(projectRoot)
  const rootStat = await stat(root).catch(() => null)
  if (!rootStat?.isDirectory()) throw new TrustedAutoRegistryError('TRUST_PROJECT_ROOT_NOT_FOUND', '승인할 프로젝트 폴더를 찾을 수 없습니다.')
  return realpath(root)
}

function samePath(left: string, right: string): boolean { return resolve(left).toLowerCase() === resolve(right).toLowerCase() }

function assertProjectSizedRoot(projectRoot: string): void {
  const root = resolve(projectRoot)
  const home = resolve(homedir())
  const parsed = parse(root)
  if (samePath(root, parsed.root) || samePath(root, home)) throw new TrustedAutoRegistryError('TRUST_ROOT_TOO_BROAD', '드라이브 또는 사용자 폴더 전체에는 자동 실행을 승인할 수 없습니다.')
  const fromHome = relative(home, root)
  if (fromHome && !fromHome.startsWith(`..${sep}`) && fromHome !== '..') {
    const segments = fromHome.split(sep).filter(Boolean)
    if (segments.length < 2) throw new TrustedAutoRegistryError('TRUST_ROOT_TOO_BROAD', '바탕화면이나 문서 폴더 전체가 아닌 개별 프로젝트 폴더를 선택하세요.')
  }
}

async function readStored(path: string): Promise<TrustedAutoRegistry> {
  try { return validate(JSON.parse(await readFile(resolve(path), 'utf8')) as unknown) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyRegistry()
    throw error
  }
}

async function acquire(path: string): Promise<() => Promise<void>> {
  const lockPath = `${resolve(path)}.lock`
  await mkdir(dirname(lockPath), { recursive: true })
  const started = Date.now()
  while (true) {
    try {
      const handle = await open(lockPath, 'wx')
      return async () => { await handle.close(); await rm(lockPath, { force: true }) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new TrustedAutoRegistryError('TRUST_REGISTRY_LOCK_FAILED', '자동 실행 승인 데이터를 잠글 수 없습니다.')
      if (Date.now() - started >= LOCK_TIMEOUT_MS) throw new TrustedAutoRegistryError('TRUST_REGISTRY_LOCK_TIMEOUT', '다른 승인 변경 작업이 끝나지 않았습니다.')
      await new Promise(resolveDelay => setTimeout(resolveDelay, LOCK_RETRY_MS))
    }
  }
}

async function atomicWrite(path: string, registry: TrustedAutoRegistry): Promise<void> {
  const target = resolve(path)
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.tmp_${randomUUID()}`
  try { await writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, 'utf8'); await rename(temporary, target) }
  finally { await rm(temporary, { force: true }).catch(() => undefined) }
}

async function recordAudit(path: string, event: Record<string, unknown>): Promise<void> {
  const auditPath = resolve(dirname(path), 'trusted-auto-events.jsonl')
  await mkdir(dirname(auditPath), { recursive: true })
  await appendFile(auditPath, `${JSON.stringify(event)}\n`, 'utf8')
}

export async function trustedAutoStatus(path: string, projectRoot: string, platform: LaunchPlatform): Promise<TrustedAutoStatus> {
  const root = await canonicalRoot(projectRoot)
  const registry = await readStored(path)
  const grant = registry.grants.find(item => item.platform === platform && samePath(item.project_root, root)) ?? null
  return { project_root: root, platform, approved: Boolean(grant), grant, revision: registry.revision, source: grant ? 'dashboard' : null }
}

export async function trustedProjectRoots(path: string, platform: LaunchPlatform): Promise<string[]> {
  const registry = await readStored(path)
  return registry.grants.filter(grant => grant.platform === platform).map(grant => grant.project_root)
}

export async function approveTrustedProject(path: string, projectRoot: string, platform: LaunchPlatform): Promise<TrustedAutoStatus> {
  const root = await canonicalRoot(projectRoot)
  assertProjectSizedRoot(root)
  const release = await acquire(path)
  try {
    const registry = await readStored(path)
    const existing = registry.grants.find(item => item.platform === platform && samePath(item.project_root, root))
    if (!existing) {
      const now = new Date().toISOString()
      const grant: TrustedAutoGrant = { grant_id: `grant_${randomUUID().replaceAll('-', '')}`, project_root: root, platform, approved_at: now, approved_by: 'user' }
      registry.grants.push(grant)
      registry.revision += 1
      registry.updated_at = now
      await atomicWrite(path, registry)
      await recordAudit(path, { event_id: `evt_${randomUUID().replaceAll('-', '')}`, event_type: 'TRUST_GRANTED', grant_id: grant.grant_id, project_root: root, platform, occurred_at: now, actor: 'user', revision: registry.revision })
    }
    const grant = registry.grants.find(item => item.platform === platform && samePath(item.project_root, root)) ?? null
    return { project_root: root, platform, approved: Boolean(grant), grant, revision: registry.revision, source: grant ? 'dashboard' : null }
  } finally { await release() }
}

export async function revokeTrustedProject(path: string, projectRoot: string, platform: LaunchPlatform): Promise<TrustedAutoStatus> {
  const root = await canonicalRoot(projectRoot)
  const release = await acquire(path)
  try {
    const registry = await readStored(path)
    const removed = registry.grants.find(item => item.platform === platform && samePath(item.project_root, root))
    if (removed) {
      const now = new Date().toISOString()
      registry.grants = registry.grants.filter(item => item.grant_id !== removed.grant_id)
      registry.revision += 1
      registry.updated_at = now
      await atomicWrite(path, registry)
      await recordAudit(path, { event_id: `evt_${randomUUID().replaceAll('-', '')}`, event_type: 'TRUST_REVOKED', grant_id: removed.grant_id, project_root: root, platform, occurred_at: now, actor: 'user', revision: registry.revision })
    }
    return { project_root: root, platform, approved: false, grant: null, revision: registry.revision, source: null }
  } finally { await release() }
}
