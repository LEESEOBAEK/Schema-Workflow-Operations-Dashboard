import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { DashboardState, DashboardWarning, RunDisplayStatus, RunMetadataUpdate, RunReviewStatus, SessionMetadataUpdate, SessionOrderUpdate, SessionSortMode, WorkflowRun, WorkSession } from '../../shared/types/dashboard'

export const DASHBOARD_METADATA_SCHEMA_VERSION = '0.5.0'
const LEGACY_METADATA_SCHEMA_VERSIONS = ['0.1.0', '0.2.0', '0.3.0', '0.4.0']

interface MetadataHistoryEntry {
  changed_at: string
  previous: Pick<RunMetadataRecord, 'display_title' | 'user_note' | 'tags' | 'display_status' | 'review_status' | 'review_note'>
  current: Pick<RunMetadataRecord, 'display_title' | 'user_note' | 'tags' | 'display_status' | 'review_status' | 'review_note'>
}

export interface RunMetadataRecord {
  run_id: string
  display_title: string
  user_note: string
  tags: string[]
  display_status: RunDisplayStatus
  review_status: RunReviewStatus
  review_note: string
  reviewed_at?: string
  updated_at: string
  history: MetadataHistoryEntry[]
}

interface SessionMetadataHistoryEntry {
  changed_at: string
  previous: { display_name: string }
  current: { display_name: string }
}

export interface SessionMetadataRecord {
  project_root: string
  session_id: string
  display_name: string
  updated_at: string
  history: SessionMetadataHistoryEntry[]
}

export interface SessionOrderRecord {
  project_root: string
  sort_mode: SessionSortMode
  session_ids: string[]
  updated_at: string
}

interface DashboardMetadataFile {
  schema_version: string
  records: Record<string, RunMetadataRecord>
  session_records: Record<string, SessionMetadataRecord>
  session_order_records: Record<string, SessionOrderRecord>
}

const writeQueues = new Map<string, Promise<void>>()

function emptyFile(): DashboardMetadataFile {
  return { schema_version: DASHBOARD_METADATA_SCHEMA_VERSION, records: {}, session_records: {}, session_order_records: {} }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((tag): tag is string => typeof tag === 'string')
    .map(tag => tag.trim())
    .filter(Boolean))].slice(0, 8)
}

function normalizeDisplayStatus(value: unknown): RunDisplayStatus {
  return value === 'superseded' || value === 'archived' ? value : 'active'
}

function normalizeReviewStatus(value: unknown): RunReviewStatus {
  return value === 'approved' || value === 'changes_requested' || value === 'deferred' ? value : 'unreviewed'
}

function normalizeRecord(runId: string, value: unknown): RunMetadataRecord | null {
  if (!isRecord(value)) return null
  return {
    run_id: runId,
    display_title: typeof value.display_title === 'string' ? value.display_title.slice(0, 120) : '',
    user_note: typeof value.user_note === 'string' ? value.user_note.slice(0, 2000) : '',
    tags: normalizeTags(value.tags),
    display_status: normalizeDisplayStatus(value.display_status),
    review_status: normalizeReviewStatus(value.review_status),
    review_note: typeof value.review_note === 'string' ? value.review_note.slice(0, 1000) : '',
    reviewed_at: typeof value.reviewed_at === 'string' ? value.reviewed_at : undefined,
    updated_at: typeof value.updated_at === 'string' ? value.updated_at : '',
    history: Array.isArray(value.history) ? value.history.filter(isRecord).slice(-100) as unknown as MetadataHistoryEntry[] : [],
  }
}

function sessionMetadataKey(projectRoot: string, sessionId: string): string {
  return `${resolve(projectRoot).toLowerCase()}::${sessionId}`
}

function normalizeSessionRecord(value: unknown): SessionMetadataRecord | null {
  if (!isRecord(value) || typeof value.project_root !== 'string' || typeof value.session_id !== 'string') return null
  return {
    project_root: resolve(value.project_root),
    session_id: value.session_id,
    display_name: typeof value.display_name === 'string' ? value.display_name.slice(0, 120) : '',
    updated_at: typeof value.updated_at === 'string' ? value.updated_at : '',
    history: Array.isArray(value.history) ? value.history.filter(isRecord).slice(-100) as unknown as SessionMetadataHistoryEntry[] : [],
  }
}

function normalizeSortMode(value: unknown): SessionSortMode {
  return value === 'newest' || value === 'oldest' || value === 'name' ? value : 'manual'
}

function normalizeSessionOrderRecord(value: unknown): SessionOrderRecord | null {
  if (!isRecord(value) || typeof value.project_root !== 'string') return null
  return {
    project_root: resolve(value.project_root),
    sort_mode: normalizeSortMode(value.sort_mode),
    session_ids: Array.isArray(value.session_ids)
      ? [...new Set(value.session_ids.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())).map(id => id.trim()))]
      : [],
    updated_at: typeof value.updated_at === 'string' ? value.updated_at : '',
  }
}

function validateUpdate(update: RunMetadataUpdate): RunMetadataUpdate {
  const displayTitle = update.display_title.trim()
  const userNote = update.user_note.trim()
  const tags = normalizeTags(update.tags)
  if (displayTitle.length > 120) throw new Error('DISPLAY_TITLE_TOO_LONG')
  if (userNote.length > 2000) throw new Error('USER_NOTE_TOO_LONG')
  if (tags.some(tag => tag.length > 32)) throw new Error('TAG_TOO_LONG')
  const reviewNote = update.review_note?.trim()
  if (reviewNote && reviewNote.length > 1000) throw new Error('REVIEW_NOTE_TOO_LONG')
  return {
    run_id: update.run_id,
    display_title: displayTitle,
    user_note: userNote,
    tags,
    display_status: update.display_status,
    review_status: update.review_status,
    review_note: reviewNote,
  }
}

export function systemRunLabel(runId: string): string {
  const parts = runId.split('__')
  const source = parts.length > 1 ? (parts[1] ?? runId) : runId
  return source.replace(/[-_]+/g, ' ').trim() || runId
}

async function readMetadataFile(metadataPath: string): Promise<{ file: DashboardMetadataFile; warning?: DashboardWarning }> {
  const resolvedPath = resolve(metadataPath)
  try {
    const parsed = JSON.parse(await readFile(resolvedPath, 'utf8')) as unknown
    if (!isRecord(parsed) || ![DASHBOARD_METADATA_SCHEMA_VERSION, ...LEGACY_METADATA_SCHEMA_VERSIONS].includes(String(parsed.schema_version)) || !isRecord(parsed.records)) {
      return { file: emptyFile(), warning: { code: 'DASHBOARD_METADATA_INVALID', message: '대시보드 편집 데이터 형식이 올바르지 않아 적용하지 않았습니다.', source_path: resolvedPath } }
    }
    const records = Object.fromEntries(Object.entries(parsed.records)
      .map(([runId, value]) => [runId, normalizeRecord(runId, value)] as const)
      .filter((entry): entry is [string, RunMetadataRecord] => entry[1] !== null))
    const sessionRecordsSource = isRecord(parsed.session_records) ? parsed.session_records : {}
    const sessionRecords = Object.fromEntries(Object.entries(sessionRecordsSource)
      .map(([key, value]) => [key, normalizeSessionRecord(value)] as const)
      .filter((entry): entry is [string, SessionMetadataRecord] => entry[1] !== null))
    const sessionOrderRecordsSource = isRecord(parsed.session_order_records) ? parsed.session_order_records : {}
    const sessionOrderRecords = Object.fromEntries(Object.entries(sessionOrderRecordsSource)
      .map(([key, value]) => [key, normalizeSessionOrderRecord(value)] as const)
      .filter((entry): entry is [string, SessionOrderRecord] => entry[1] !== null))
    return { file: { schema_version: DASHBOARD_METADATA_SCHEMA_VERSION, records, session_records: sessionRecords, session_order_records: sessionOrderRecords } }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { file: emptyFile() }
    return { file: emptyFile(), warning: { code: 'DASHBOARD_METADATA_UNREADABLE', message: '대시보드 편집 데이터를 읽을 수 없어 적용하지 않았습니다.', source_path: resolvedPath } }
  }
}

function sessionTimestamp(session: WorkSession): number {
  const timestamps = session.runs.map(run => Date.parse(run.created_at ?? '')).filter(Number.isFinite)
  return timestamps.length ? Math.max(...timestamps) : 0
}

function orderSessions(sessions: WorkSession[], record?: SessionOrderRecord): WorkSession[] {
  const mode = record?.sort_mode ?? 'manual'
  if (mode === 'name') return [...sessions].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  if (mode === 'newest') return [...sessions].sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a))
  if (mode === 'oldest') return [...sessions].sort((a, b) => sessionTimestamp(a) - sessionTimestamp(b))
  const indexes = new Map((record?.session_ids ?? []).map((id, index) => [id, index]))
  return [...sessions].sort((a, b) => {
    const aIndex = indexes.get(a.session_id)
    const bIndex = indexes.get(b.session_id)
    if (aIndex === undefined && bIndex === undefined) return 0
    if (aIndex === undefined) return 1
    if (bIndex === undefined) return -1
    return aIndex - bIndex
  })
}

function decorateRun(run: WorkflowRun, record?: RunMetadataRecord): WorkflowRun {
  const systemLabel = systemRunLabel(run.run_id)
  return {
    ...run,
    system_label: systemLabel,
    display_title: record?.display_title || systemLabel,
    user_note: record?.user_note ?? '',
    tags: record?.tags ?? [],
    display_status: record?.display_status ?? 'active',
    review_status: record?.review_status ?? 'unreviewed',
    review_note: record?.review_note ?? '',
    reviewed_at: record?.reviewed_at,
    metadata_updated_at: record?.updated_at || undefined,
  }
}

function decorateSession(session: WorkSession, projectRoot: string | undefined, records: Record<string, SessionMetadataRecord>): WorkSession {
  if (!projectRoot) return session
  const record = records[sessionMetadataKey(projectRoot, session.session_id)]
  return {
    ...session,
    system_name: session.name,
    name: record?.display_name || session.name,
    metadata_updated_at: record?.updated_at || undefined,
    runs: session.runs.map(run => run),
  }
}

export async function applyDashboardMetadata(state: DashboardState, metadataPath: string): Promise<DashboardState> {
  const { file, warning } = await readMetadataFile(metadataPath)
  return {
    ...state,
    projects: state.projects.map(project => {
      const orderRecord = project.source_root ? file.session_order_records[resolve(project.source_root).toLowerCase()] : undefined
      const decoratedSessions = project.sessions.map(session => {
        const decorated = decorateSession(session, project.source_root, file.session_records)
        return { ...decorated, runs: decorated.runs.map(run => decorateRun(run, file.records[run.run_id])) }
      })
      return {
        ...project,
        session_sort_mode: orderRecord?.sort_mode ?? 'manual',
        session_manual_order: orderRecord?.session_ids ?? decoratedSessions.map(session => session.session_id),
        sessions: orderSessions(decoratedSessions, orderRecord),
      }
    }),
    source: state.source && warning ? { ...state.source, warnings: [...state.source.warnings, warning] } : state.source,
  }
}

export async function saveSessionOrder(metadataPath: string, update: SessionOrderUpdate): Promise<SessionOrderRecord> {
  const projectRoot = resolve(update.project_root)
  const sortMode = normalizeSortMode(update.sort_mode)
  const sessionIds = [...new Set(update.session_ids.map(id => id.trim()).filter(Boolean))]
  const resolvedPath = resolve(metadataPath)
  let saved!: SessionOrderRecord
  const previousQueue = writeQueues.get(resolvedPath) ?? Promise.resolve()
  const nextQueue = previousQueue.then(async () => {
    const { file, warning } = await readMetadataFile(resolvedPath)
    if (warning) throw new Error(warning.code)
    saved = { project_root: projectRoot, sort_mode: sortMode, session_ids: sessionIds, updated_at: new Date().toISOString() }
    file.session_order_records[projectRoot.toLowerCase()] = saved
    await atomicWrite(resolvedPath, file)
  })
  writeQueues.set(resolvedPath, nextQueue)
  try {
    await nextQueue
    return saved
  } finally {
    if (writeQueues.get(resolvedPath) === nextQueue) writeQueues.delete(resolvedPath)
  }
}

async function atomicWrite(metadataPath: string, file: DashboardMetadataFile): Promise<void> {
  const resolvedPath = resolve(metadataPath)
  await mkdir(dirname(resolvedPath), { recursive: true })
  const temporaryPath = `${resolvedPath}.tmp_${randomUUID()}`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, resolvedPath)
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

export async function saveRunMetadata(metadataPath: string, update: RunMetadataUpdate): Promise<RunMetadataRecord> {
  const normalized = validateUpdate(update)
  const resolvedPath = resolve(metadataPath)
  let saved!: RunMetadataRecord
  const previousQueue = writeQueues.get(resolvedPath) ?? Promise.resolve()
  const nextQueue = previousQueue.then(async () => {
    const { file, warning } = await readMetadataFile(resolvedPath)
    if (warning) throw new Error(warning.code)
    const previous = file.records[normalized.run_id]
    const changedAt = new Date().toISOString()
    const previousValues = {
      display_title: previous?.display_title ?? '',
      user_note: previous?.user_note ?? '',
      tags: previous?.tags ?? [],
      display_status: previous?.display_status ?? 'active' as RunDisplayStatus,
      review_status: previous?.review_status ?? 'unreviewed' as RunReviewStatus,
      review_note: previous?.review_note ?? '',
    }
    const currentValues = {
      display_title: normalized.display_title,
      user_note: normalized.user_note,
      tags: normalized.tags,
      display_status: normalized.display_status ?? previous?.display_status ?? 'active' as RunDisplayStatus,
      review_status: normalized.review_status ?? previous?.review_status ?? 'unreviewed' as RunReviewStatus,
      review_note: normalized.review_note ?? previous?.review_note ?? '',
    }
    const reviewChanged = currentValues.review_status !== previousValues.review_status || currentValues.review_note !== previousValues.review_note
    saved = {
      run_id: normalized.run_id,
      ...currentValues,
      reviewed_at: reviewChanged ? changedAt : previous?.reviewed_at,
      updated_at: changedAt,
      history: [...(previous?.history ?? []), { changed_at: changedAt, previous: previousValues, current: currentValues }].slice(-100),
    }
    file.records[normalized.run_id] = saved
    await atomicWrite(resolvedPath, file)
  })
  writeQueues.set(resolvedPath, nextQueue)
  try {
    await nextQueue
    return saved
  } finally {
    if (writeQueues.get(resolvedPath) === nextQueue) writeQueues.delete(resolvedPath)
  }
}

export async function saveSessionMetadata(metadataPath: string, update: SessionMetadataUpdate): Promise<SessionMetadataRecord> {
  const projectRoot = resolve(update.project_root)
  const sessionId = update.session_id.trim()
  const displayName = update.display_name.trim()
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED')
  if (!displayName) throw new Error('SESSION_DISPLAY_NAME_REQUIRED')
  if (displayName.length > 120) throw new Error('SESSION_DISPLAY_NAME_TOO_LONG')
  const resolvedPath = resolve(metadataPath)
  let saved!: SessionMetadataRecord
  const previousQueue = writeQueues.get(resolvedPath) ?? Promise.resolve()
  const nextQueue = previousQueue.then(async () => {
    const { file, warning } = await readMetadataFile(resolvedPath)
    if (warning) throw new Error(warning.code)
    const key = sessionMetadataKey(projectRoot, sessionId)
    const previous = file.session_records[key]
    const changedAt = new Date().toISOString()
    saved = {
      project_root: projectRoot,
      session_id: sessionId,
      display_name: displayName,
      updated_at: changedAt,
      history: [...(previous?.history ?? []), {
        changed_at: changedAt,
        previous: { display_name: previous?.display_name ?? '' },
        current: { display_name: displayName },
      }].slice(-100),
    }
    file.session_records[key] = saved
    await atomicWrite(resolvedPath, file)
  })
  writeQueues.set(resolvedPath, nextQueue)
  try {
    await nextQueue
    return saved
  } finally {
    if (writeQueues.get(resolvedPath) === nextQueue) writeQueues.delete(resolvedPath)
  }
}
