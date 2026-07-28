import type { Dirent } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { DashboardState, DashboardWarning, RelationConflict, RelationStatus, RunReferenceDetail, RunStatus, WorkSession, WorkflowProject, WorkflowRun } from '../../shared/types/dashboard'

export const DEFAULT_MAX_SOURCE_BYTES = 1024 * 1024

type JsonRecord = Record<string, unknown>

interface ReadResult {
  data: JsonRecord | null
  warning?: DashboardWarning
}

interface ParsedRun extends WorkflowRun {
  display_name: string
  created_at: string
}

export interface WorkflowReadOptions {
  projectRoots: string[]
  maxSourceBytes?: number
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordAt(value: unknown, key: string): JsonRecord | null {
  if (!isRecord(value)) return null
  const child = value[key]
  return isRecord(child) ? child : null
}

function stringAt(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined
  const child = value[key]
  return typeof child === 'string' && child.trim() ? child : undefined
}

function booleanAt(value: unknown, key: string): boolean | undefined {
  if (!isRecord(value)) return undefined
  return typeof value[key] === 'boolean' ? value[key] as boolean : undefined
}

function arrayAt(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) return []
  return Array.isArray(value[key]) ? value[key] as unknown[] : []
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown'
}

async function readJsonBounded(path: string, maxBytes: number, required = false): Promise<ReadResult> {
  let fileStat
  try {
    fileStat = await stat(path)
  } catch {
    return required
      ? { data: null, warning: { code: 'SOURCE_FILE_MISSING', message: '필수 원본 파일이 없습니다.', source_path: path } }
      : { data: null }
  }

  if (!fileStat.isFile()) {
    return { data: null, warning: { code: 'SOURCE_NOT_FILE', message: '읽기 대상이 파일이 아닙니다.', source_path: path } }
  }
  if (fileStat.size > maxBytes) {
    return { data: null, warning: { code: 'SOURCE_FILE_TOO_LARGE', message: `원본 파일이 읽기 제한 ${maxBytes} bytes를 초과했습니다.`, source_path: path } }
  }

  try {
    const parsed = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')) as unknown
    if (!isRecord(parsed)) {
      return { data: null, warning: { code: 'SOURCE_JSON_NOT_OBJECT', message: 'JSON 최상위 값이 객체가 아닙니다.', source_path: path } }
    }
    return { data: parsed }
  } catch {
    return { data: null, warning: { code: 'SOURCE_JSON_INVALID', message: 'JSON을 해석할 수 없습니다.', source_path: path } }
  }
}

function inferPlatform(projectRoot: string): WorkflowRun['platform'] {
  const normalized = projectRoot.toLowerCase()
  if (normalized.includes('claude')) return 'claude'
  if (normalized.includes('antigravity')) return 'antigravity'
  return 'codex'
}

function mapStatus(manifest: JsonRecord | null, next: JsonRecord | null, fulfillment: JsonRecord | null): RunStatus {
  if (!manifest) return 'unknown'
  const summary = recordAt(manifest, 'summary')
  const workflowState = stringAt(next, 'workflow_state') ?? stringAt(summary, 'workflow_state') ?? stringAt(manifest, 'status')
  if (fulfillment) {
    if (booleanAt(fulfillment, 'valid') === false || stringAt(fulfillment, 'severity') === 'fail') return 'evidence_insufficient'
    if (booleanAt(fulfillment, 'valid') === true && ['pass', 'ready'].includes(stringAt(fulfillment, 'severity') ?? '')) return 'pass'
  }
  if (workflowState?.includes('waiting') || workflowState?.includes('required')) return 'hold'
  if (workflowState?.includes('completed') && !fulfillment) return 'unknown'
  return 'unknown'
}

function collectIds(items: unknown[], key: string): string[] {
  return items.map(item => stringAt(item, key)).filter((value): value is string => Boolean(value))
}

function compactText(value: string | undefined, maxLength = 280): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

function artifactDetails(items: unknown[]): RunReferenceDetail[] {
  const details: RunReferenceDetail[] = []
  for (const entry of items) {
    const id = stringAt(entry, 'id')
    if (!id) continue
    const path = stringAt(entry, 'path')
    const description = compactText(stringAt(entry, 'description'))
    details.push({
      id,
      title: description ? id.replaceAll('_', ' ') : (path ?? id),
      summary: description || `등록된 산출물 경로: ${path ?? '경로 정보 없음'}`,
      status: stringAt(entry, 'status'),
      path,
      type: stringAt(entry, 'type'),
      role: stringAt(entry, 'role'),
    })
  }
  return details
}

function evidenceDetails(items: unknown[]): RunReferenceDetail[] {
  const details: RunReferenceDetail[] = []
  for (const entry of items) {
    const id = stringAt(entry, 'criterion_id')
    if (!id) continue
    const evidence = compactText(stringAt(entry, 'evidence'))
    details.push({
      id,
      title: `${id} 판정 근거`,
      summary: evidence || '근거 설명이 기록되지 않았습니다.',
      status: stringAt(entry, 'status'),
    })
  }
  return details
}

async function readRun(runDir: string, platform: WorkflowRun['platform'], maxBytes: number): Promise<{ run: ParsedRun; warnings: DashboardWarning[] }> {
  const files = {
    manifest: join(runDir, 'workflow_manifest.json'),
    next: join(runDir, 'workflow_next.json'),
    artifacts: join(runDir, 'artifacts_manifest.json'),
    evidence: join(runDir, '07_fulfillment', 'data', 'evidence_filled.json'),
    fulfillment: join(runDir, '07_fulfillment', 'data', 'validation.json'),
  }
  const [manifestResult, nextResult, artifactResult, evidenceResult, fulfillmentResult] = await Promise.all([
    readJsonBounded(files.manifest, maxBytes, true),
    readJsonBounded(files.next, maxBytes),
    readJsonBounded(files.artifacts, maxBytes, true),
    readJsonBounded(files.evidence, maxBytes, true),
    readJsonBounded(files.fulfillment, maxBytes, true),
  ])
  const warnings = [manifestResult, nextResult, artifactResult, evidenceResult, fulfillmentResult]
    .map(result => result.warning)
    .filter((warning): warning is DashboardWarning => Boolean(warning))

  const manifest = manifestResult.data
  const next = nextResult.data
  const artifacts = arrayAt(artifactResult.data, 'artifacts')
  const criteria = arrayAt(evidenceResult.data, 'criteria_results')
  const summary = recordAt(manifest, 'summary')
  const trace = recordAt(manifest, 'trace')
  const nextAction = recordAt(next, 'next_action')
  const runId = stringAt(manifest, 'run_id') ?? basename(runDir)
  let status = mapStatus(manifest, next, fulfillmentResult.data)
  if (status === 'pass' && (artifactResult.warning || evidenceResult.warning)) status = 'evidence_insufficient'
  if (fulfillmentResult.warning) status = 'unknown'
  const nextActionText = stringAt(summary, 'next_required_action')
    ?? stringAt(nextAction, 'reason')
    ?? (status === 'pass' ? '완료된 결과 검토' : '실행 원본 확인 필요')
  const normalizedNextAction = nextActionText === 'none' ? '완료된 결과 검토' : nextActionText

  warnings.forEach(warning => { warning.run_id = runId })
  return {
    warnings,
    run: {
      run_id: runId,
      status,
      platform,
      next_action: normalizedNextAction,
      artifact_count: artifacts.length,
      evidence_count: criteria.length,
      operation_id: stringAt(manifest, 'operation_id'),
      workspace_id: stringAt(manifest, 'workspace_id'),
      parent_run_id: stringAt(manifest, 'parent_run_id') ?? null,
      relation_type: stringAt(manifest, 'relation_type'),
      artifact_ids: collectIds(artifacts, 'id'),
      evidence_ids: collectIds(criteria, 'criterion_id'),
      artifact_details: artifactDetails(artifacts),
      evidence_details: evidenceDetails(criteria),
      source_path: runDir,
      warnings: warnings.map(warning => warning.code),
      display_name: stringAt(trace, 'original_run_name') ?? stringAt(trace, 'run_name') ?? runId,
      created_at: stringAt(manifest, 'created_at') ?? '',
    },
  }
}

function buildSessions(runs: ParsedRun[], conflicts: RelationConflict[]): WorkSession[] {
  const byId = new Map(runs.map(run => [run.run_id, run]))
  const groups = new Map<string, { relation: RelationStatus; root: ParsedRun; runs: ParsedRun[] }>()

  for (const run of runs) {
    let cursor = run
    const visited = new Set<string>()
    let relation: RelationStatus = 'confirmed'
    let groupKey = run.run_id

    while (cursor.parent_run_id) {
      if (visited.has(cursor.run_id)) {
        relation = 'conflict'
        groupKey = `cycle_${run.run_id}`
        conflicts.push({ relation_id: `cycle_${safeId(run.run_id)}`, source_id: run.run_id, target_id: cursor.parent_run_id, reason: '실행 관계에 순환 참조가 있습니다.' })
        break
      }
      visited.add(cursor.run_id)
      const parent = byId.get(cursor.parent_run_id)
      if (!parent) {
        relation = 'unresolved'
        groupKey = `unresolved_${run.run_id}`
        conflicts.push({ relation_id: `missing_parent_${safeId(run.run_id)}`, source_id: run.run_id, target_id: cursor.parent_run_id, reason: '부모 실행을 현재 ProjectRoot에서 찾을 수 없습니다.' })
        break
      }
      cursor = parent
      groupKey = cursor.run_id
    }

    const existing = groups.get(groupKey)
    if (existing) {
      existing.runs.push(run)
      if (relation !== 'confirmed') existing.relation = relation
    } else {
      groups.set(groupKey, { relation, root: cursor, runs: [run] })
    }
  }

  return [...groups.entries()].map(([key, group]) => ({
    session_id: `session_${safeId(key)}`,
    name: group.root.display_name,
    relation_status: group.relation,
    root_run_id: group.root.run_id,
    runs: group.runs
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(({ display_name: _displayName, ...run }) => run),
  }))
}

async function readProject(projectRoot: string, maxBytes: number): Promise<{ project: WorkflowProject; warnings: DashboardWarning[]; conflicts: RelationConflict[] }> {
  const resolvedRoot = resolve(projectRoot)
  const workflowsRoot = join(resolvedRoot, 'outputs', 'workflows')
  const warnings: DashboardWarning[] = []
  const conflicts: RelationConflict[] = []
  let entries: Dirent[]
  try {
    entries = await readdir(workflowsRoot, { withFileTypes: true })
  } catch {
    warnings.push({ code: 'WORKFLOWS_ROOT_MISSING', message: 'outputs/workflows 폴더를 읽을 수 없습니다.', source_path: workflowsRoot })
    entries = []
  }

  const runDirs = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => join(workflowsRoot, entry.name)).sort()
  const platform = inferPlatform(resolvedRoot)
  const results = await Promise.all(runDirs.map(runDir => readRun(runDir, platform, maxBytes)))
  results.forEach(result => warnings.push(...result.warnings))
  const runs = results.map(result => result.run)
  const workspaceIds = [...new Set(runs.map(run => run.workspace_id).filter((value): value is string => Boolean(value)))]
  const projectId = workspaceIds.length === 1 ? workspaceIds[0]! : `project_${safeId(basename(resolvedRoot))}`
  const projectName = `${basename(dirname(resolvedRoot))} / ${basename(resolvedRoot)}`

  return {
    warnings,
    conflicts,
    project: {
      project_id: projectId,
      name: projectName,
      source_root: resolvedRoot,
      sessions: buildSessions(runs, conflicts),
    },
  }
}

export async function readWorkflowDashboard(options: WorkflowReadOptions): Promise<DashboardState> {
  const maxBytes = options.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES
  const roots = [...new Set(options.projectRoots.map(root => root.trim()).filter(Boolean))]
  const results = await Promise.all(roots.map(root => readProject(root, maxBytes)))
  return {
    schema_version: '1.1.0',
    projects: results.map(result => result.project),
    conflicts: results.flatMap(result => result.conflicts),
    source: {
      mode: 'live',
      read_at: new Date().toISOString(),
      project_roots: roots.map(root => resolve(root)),
      warnings: results.flatMap(result => result.warnings),
    },
  }
}
