import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import type { ProjectCatalogEntry, ProjectCatalogState } from '../../shared/types/dashboard'

const SCHEMA_VERSION = '1.0.0'
const LOCK_TIMEOUT_MS = 2000
const LOCK_RETRY_MS = 25

export class ProjectCatalogError extends Error {
  constructor(public code: string, message: string, public details: Record<string, unknown> = {}) { super(message) }
}

function catalogPath(path: string): string { return resolve(path) }
function lockPath(path: string): string { return `${catalogPath(path)}.lock` }
function normalized(path: string): string { return resolve(path).toLowerCase() }
function samePath(left: string, right: string): boolean { return normalized(left) === normalized(right) }
function now(): string { return new Date().toISOString() }

function emptyCatalog(): ProjectCatalogState {
  return { schema_version: SCHEMA_VERSION, revision: 0, active_project_root: null, projects: [], updated_at: new Date(0).toISOString() }
}

function validate(value: unknown): ProjectCatalogState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ProjectCatalogError('PROJECT_CATALOG_INVALID', 'Project Catalog 형식이 올바르지 않습니다.')
  const record = value as Record<string, unknown>
  if (record.schema_version !== SCHEMA_VERSION || !Number.isInteger(record.revision) || !Array.isArray(record.projects)) throw new ProjectCatalogError('PROJECT_CATALOG_INVALID', 'Project Catalog 형식이 올바르지 않습니다.')
  return value as ProjectCatalogState
}

async function readStored(path: string): Promise<ProjectCatalogState> {
  try { return validate(JSON.parse(await readFile(catalogPath(path), 'utf8')) as unknown) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyCatalog()
    throw error
  }
}

async function acquire(path: string): Promise<() => Promise<void>> {
  await mkdir(dirname(catalogPath(path)), { recursive: true })
  const started = Date.now()
  while (true) {
    try {
      const handle = await open(lockPath(path), 'wx')
      return async () => { await handle.close(); await rm(lockPath(path), { force: true }) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new ProjectCatalogError('PROJECT_CATALOG_LOCK_FAILED', 'Project Catalog 잠금을 만들 수 없습니다.')
      if (Date.now() - started >= LOCK_TIMEOUT_MS) throw new ProjectCatalogError('PROJECT_CATALOG_LOCK_TIMEOUT', '다른 프로젝트 변경 작업이 끝나지 않았습니다.')
      await new Promise(resolveDelay => setTimeout(resolveDelay, LOCK_RETRY_MS))
    }
  }
}

async function atomicWrite(path: string, state: ProjectCatalogState): Promise<void> {
  const target = catalogPath(path)
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.tmp_${randomUUID()}`
  try { await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8'); await rename(temporary, target) }
  finally { await rm(temporary, { force: true }).catch(() => undefined) }
}

function environmentEntries(roots: string[]): ProjectCatalogEntry[] {
  return [...new Set(roots.map(root => resolve(root)))].map(sourceRoot => ({ source_root: sourceRoot, display_name: basename(sourceRoot), origin: 'environment' as const, added_at: new Date(0).toISOString() }))
}

export async function readProjectCatalog(path: string, environmentRoots: string[] = []): Promise<ProjectCatalogState> {
  const stored = await readStored(path)
  const combined = [...environmentEntries(environmentRoots)]
  for (const project of stored.projects) if (!combined.some(item => samePath(item.source_root, project.source_root))) combined.push({ ...project, source_root: resolve(project.source_root), origin: 'catalog' })
  const storedActive = stored.active_project_root
  const active = storedActive && combined.some(item => samePath(item.source_root, storedActive)) ? resolve(storedActive) : combined[0]?.source_root ?? null
  return { ...stored, active_project_root: active, projects: combined }
}

export async function addProject(path: string, input: { source_root: string; display_name?: string; create_directory?: boolean }, environmentRoots: string[] = []): Promise<ProjectCatalogState> {
  const root = resolve(input.source_root)
  const existing = await stat(root).catch(() => null)
  if (!existing && input.create_directory) await mkdir(root, { recursive: true })
  else if (!existing?.isDirectory()) throw new ProjectCatalogError('PROJECT_ROOT_NOT_FOUND', 'ProjectRoot 폴더를 찾을 수 없습니다.')
  if (input.create_directory) await mkdir(resolve(root, 'outputs', 'workflows'), { recursive: true })
  const release = await acquire(path)
  try {
    const stored = await readStored(path)
    if (!stored.projects.some(item => samePath(item.source_root, root)) && !environmentRoots.some(item => samePath(item, root))) {
      stored.projects.push({ source_root: root, display_name: input.display_name?.trim().slice(0, 120) || basename(root), origin: 'catalog', added_at: now() })
      stored.revision += 1
    }
    stored.active_project_root = root
    stored.updated_at = now()
    await atomicWrite(path, stored)
    return readProjectCatalog(path, environmentRoots)
  } finally { await release() }
}

export async function selectProject(path: string, sourceRoot: string, environmentRoots: string[] = []): Promise<ProjectCatalogState> {
  const available = await readProjectCatalog(path, environmentRoots)
  if (!available.projects.some(item => samePath(item.source_root, sourceRoot))) throw new ProjectCatalogError('PROJECT_NOT_REGISTERED', '등록되지 않은 프로젝트입니다.')
  const release = await acquire(path)
  try {
    const stored = await readStored(path)
    stored.active_project_root = resolve(sourceRoot)
    stored.revision += 1
    stored.updated_at = now()
    await atomicWrite(path, stored)
    return readProjectCatalog(path, environmentRoots)
  } finally { await release() }
}

export async function removeProject(path: string, sourceRoot: string, environmentRoots: string[] = []): Promise<ProjectCatalogState> {
  if (environmentRoots.some(root => samePath(root, sourceRoot))) throw new ProjectCatalogError('PROJECT_ENVIRONMENT_OWNED', '환경 설정 프로젝트는 Catalog에서 제거할 수 없습니다.')
  const release = await acquire(path)
  try {
    const stored = await readStored(path)
    const before = stored.projects.length
    stored.projects = stored.projects.filter(item => !samePath(item.source_root, sourceRoot))
    if (stored.projects.length === before) throw new ProjectCatalogError('PROJECT_NOT_REGISTERED', '등록되지 않은 프로젝트입니다.')
    if (stored.active_project_root && samePath(stored.active_project_root, sourceRoot)) stored.active_project_root = null
    stored.revision += 1
    stored.updated_at = now()
    await atomicWrite(path, stored)
    return readProjectCatalog(path, environmentRoots)
  } finally { await release() }
}
