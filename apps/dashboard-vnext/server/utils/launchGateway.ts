import { spawn as nodeSpawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { ContextCapsule, LaunchMode, LaunchPlatform, LaunchPrepareRequest, LaunchRequestRecord, RelationshipContract, RelationshipValidation, WorkSession, WorkflowProject } from '../../shared/types/dashboard'
import { confirmSession, readRelationshipRegistry } from './relationshipGateway'

export const LAUNCH_REQUEST_SCHEMA_VERSION = '1.0.0'
export const MAX_CAPSULE_BYTES = 2048
export const MAX_REQUEST_BYTES = 1024 * 1024

export class LaunchGatewayError extends Error {
  constructor(public code: string, message: string, public details: Record<string, unknown> = {}) { super(message) }
}

interface PrepareOptions { launcherPath?: string; trustedAutoRoots?: string[] }
interface ExecuteOptions { trustedAutoRoots?: string[]; spawnProcess?: typeof nodeSpawn }

function quotePowerShell(value: string): string { return `'${value.replaceAll("'", "''")}'` }
function safeSegment(value: string): string { return value.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'launch' }
function isInside(path: string, root: string): boolean {
  const candidate = resolve(path).toLowerCase()
  const base = resolve(root).toLowerCase()
  return candidate === base || candidate.startsWith(base + sep)
}
export function isTrustedAutoRoot(projectRoot: string, roots: string[]): boolean { return roots.some(root => root.trim() && isInside(projectRoot, root.trim())) }
function defaultLauncherPath(): string { return join(homedir(), '.schema-workflow-candidate', 'bin', 'schema-workflow.ps1') }
function launchRoot(projectRoot: string): string { return join(resolve(projectRoot), '.schema-workflow', 'launch') }
function requestPath(projectRoot: string, launchId: string): string { return join(launchRoot(projectRoot), 'requests', safeSegment(launchId), 'request.json') }
function requestSourcePath(projectRoot: string, launchId: string): string { return join(launchRoot(projectRoot), 'requests', safeSegment(launchId), 'user-request.md') }
function requestDigest(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex') }

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp_${randomUUID()}`
  try { await writeFile(temporary, content, 'utf8'); await rename(temporary, path) }
  finally { await rm(temporary, { force: true }).catch(() => undefined) }
}
function boundedRefs(values: Array<string | undefined>, limit: number): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)).map(value => value.trim()).filter(Boolean))].slice(0, limit)
}

export function buildRelationshipContract(session: WorkSession): RelationshipContract {
  const operationKind = session.operation_kind ?? 'independent'
  const anchorRunId = session.anchor_run_id?.trim() || null
  if (operationKind !== 'independent' && !anchorRunId) {
    throw new LaunchGatewayError('RELATIONSHIP_ANCHOR_REQUIRED', '이어가기와 분기는 기준 Run이 필요합니다.')
  }
  if (operationKind === 'continue') return { contract_version: '1.0.0', operation_kind: operationKind, result_run_policy: 'reuse_anchor', expected_relation_type: 'continuation', anchor_run_id: anchorRunId, delivery_policy: 'required' }
  if (operationKind === 'branch') return { contract_version: '1.0.0', operation_kind: operationKind, result_run_policy: 'create_new', expected_relation_type: 'branch', anchor_run_id: anchorRunId, delivery_policy: 'required' }
  return { contract_version: '1.0.0', operation_kind: operationKind, result_run_policy: 'create_new', expected_relation_type: 'independent', anchor_run_id: null, delivery_policy: 'required' }
}

export function buildContextCapsule(project: WorkflowProject, session: WorkSession, task: string): ContextCapsule {
  const relationshipContract = buildRelationshipContract(session)
  const capsule: ContextCapsule = {
    capsule_version: '1.0.0', project_id: project.project_id, session_id: session.session_id,
    pending_run: true, relation_status: session.relation_status, operation_kind: session.operation_kind ?? 'independent', relationship_contract: relationshipContract, required_action: 'start_workflow',
    source_refs: boundedRefs([project.source_root, relationshipContract.anchor_run_id ?? undefined, ...session.runs.map(run => run.run_id)], 5),
    evidence_refs: boundedRefs(session.runs.flatMap(run => run.evidence_ids ?? []), 5),
    artifact_refs: boundedRefs(session.runs.flatMap(run => run.artifact_ids ?? []), 5),
    summary: task.trim().replace(/\s+/g, ' ').slice(0, 500),
  }
  if (session.anchor_run_id) capsule.anchor_run_id = session.anchor_run_id
  if (!capsule.evidence_refs?.length) delete capsule.evidence_refs
  if (!capsule.artifact_refs?.length) delete capsule.artifact_refs
  const bytes = Buffer.byteLength(JSON.stringify(capsule), 'utf8')
  if (bytes > MAX_CAPSULE_BYTES) throw new LaunchGatewayError('CAPSULE_SIZE_LIMIT_EXCEEDED', 'Context Capsule이 2 KiB 제한을 초과했습니다.', { bytes })
  return capsule
}

function skillInvocation(platform: LaunchPlatform): string { return platform === 'codex' ? '@schema-workflow' : '/schema-workflow' }
function relationshipInstructions(record: LaunchRequestRecord): string {
  const contract = record.relationship_contract
  if (contract.operation_kind === 'continue') return `- 작업 방식은 이어가기다. 신규 Run을 생성하거나 init 명령을 사용하지 않는다.
- 먼저 workflow_runner.py continue-run을 사용해 기준 Run ${contract.anchor_run_id}에 OperationId ${record.operation_id}를 예약한다.
- continue-run에는 --run-id, --operation-id, --session-reference ${record.session_id}를 사용한다.
- 전체 원문은 요약하지 말고 --supplemental-input-file "${record.request_integrity.source_path}" --supplemental-input-sha256 ${record.request_integrity.sha256}로 전달한다.
- 모든 후속 산출물과 검증은 기준 Run ${contract.anchor_run_id} 안에서 수행하며 최종 RunId도 동일해야 한다.`
  if (contract.operation_kind === 'branch') return `- 작업 방식은 분기다. workflow_runner.py init에 --relation-type branch와 --parent-run-id ${contract.anchor_run_id}를 반드시 사용한다.
- --operation-id ${record.operation_id}와 --session-reference ${record.session_id}를 그대로 사용해 새로운 Run을 생성한다.
- 최종 manifest의 relation_type은 branch, parent_run_id는 ${contract.anchor_run_id}여야 한다.`
  return `- 작업 방식은 새 작업이다. workflow_runner.py init에 --relation-type independent를 사용한다.
- --operation-id ${record.operation_id}와 --session-reference ${record.session_id}를 그대로 사용해 새로운 Run을 생성한다.
- 최종 manifest에는 parent_run_id가 없어야 한다.`
}

function buildPrompt(record: LaunchRequestRecord, capsuleRelativePath: string): string {
  const requestRelativePath = relative(resolve(record.project_root), record.request_integrity.source_path).replaceAll('\\', '/')
  return `${skillInvocation(record.platform)}

ProjectRoot:
${record.project_root}

OperationId:
${record.operation_id}

WorkSessionId:
${record.session_id}

ContextCapsule:
${capsuleRelativePath}

RunName:
${record.run_name}

작업 관계 계약:
- operation_kind: ${record.relationship_contract.operation_kind}
- result_run_policy: ${record.relationship_contract.result_run_policy}
- expected_relation_type: ${record.relationship_contract.expected_relation_type}
- anchor_run_id: ${record.relationship_contract.anchor_run_id ?? 'none'}
- delivery_policy: ${record.relationship_contract.delivery_policy}
${relationshipInstructions(record)}

Delivery rules:
- Register only the representative user-facing deliverable with role=final_output (or --final).
- Register supporting working files as generated_output inside the Run; do not flatten every support file into ProjectRoot/deliverables.
- A continuation must not be completed until every declared final output has a registered DeliverablePath.
- artifact_ready는 이번 반복의 산출물이 준비됐다는 뜻이며 사용자 원문의 최종 목표가 완료됐다는 뜻이 아니다.

반복 완료 규칙:
- 사용자 원문에서 최종 목표와 검증 가능한 완료 조건을 먼저 추출하고 작업 목록으로 유지한다.
- 구현 -> 빌드 -> 전체 회귀 테스트 -> 실패 분석 -> 최소 수정 순환을 같은 Run 안에서 반복한다.
- validation_needed와 아직 구현되지 않은 테스트는 다음 작업 후보이며, 그것만으로 blocked 또는 전체 완료로 판정하지 않는다.
- 실제 blocked 상태, 외부 권한, 비용 발생, 되돌리기 어려운 작업처럼 사용자의 결정이 필요한 경우에만 중단한다.
- CLI 프로세스 종료, 보고서 생성, 일부 테스트 통과, artifact_ready만으로 최종 완료를 선언하지 않는다.
- 사용자 원문의 완료 조건이 모두 검증되기 전에는 남은 항목과 다음 행동을 기록하고 continuation을 유지한다.

사용자 원문 계약:
- source_path: ${requestRelativePath}
- sha256: ${record.request_integrity.sha256}
- character_count: ${record.request_integrity.character_count}
- byte_count: ${record.request_integrity.byte_count}
- 위 파일 전체를 UTF-8로 읽고 SHA-256과 길이를 확인한 뒤 작업한다.
- 대화나 Context Capsule의 요약문을 원문 대신 완료 계약으로 사용하지 않는다.
- 원문을 읽을 수 없거나 해시가 다르면 실행을 중단하고 REQUEST_INTEGRITY_FAILED로 보고한다.

운영 규칙:
- 위 OperationId를 새로 생성하지 말고 정확히 사용한다.
- 위 WorkSessionId는 대시보드에서 이미 만든 작업 세션이다. 별도 작업 세션을 새로 만들지 않는다.
- 작업 관계 계약은 선택 사항이 아니다. 계약과 다른 RunId, relation_type, parent_run_id로 완료하지 않는다.
- Context Capsule은 작업 연결을 위한 최소 참조이며 원본 파일을 우선 확인한다.
- candidate launcher와 현재 프로젝트의 schema-workflow 스킬을 사용한다.
- 01~07 검증과 산출물 등록을 완료하고 최종 RunId를 보고한다.
- 근거가 부족하면 임의로 확정하지 않고 validation_needed로 남긴다.
`
}

function platformCommand(platform: LaunchPlatform, mode: LaunchMode, newProject: boolean): string {
  if (platform === 'codex') return mode === 'trusted_auto' ? '& codex exec -C $projectRoot --sandbox workspace-write $prompt' : '& codex -C $projectRoot --ask-for-approval on-request $prompt'
  if (platform === 'claude') return mode === 'trusted_auto' ? '& claude --print --dangerously-skip-permissions $prompt' : '& claude --permission-mode manual $prompt'
  const projectFlag = newProject ? ' --new-project' : ''
  return mode === 'trusted_auto'
    ? `& agy --dangerously-skip-permissions --mode accept-edits --log-file $agyLogPath${projectFlag} --print $prompt`
    : `& agy --log-file $agyLogPath${projectFlag} --prompt-interactive $prompt`
}
function platformProgressNotice(platform: LaunchPlatform, mode: LaunchMode): string {
  if (platform === 'antigravity' && mode === 'trusted_auto') {
    return `Write-Host '[Schema Workflow] Antigravity is working in automatic print mode.' -ForegroundColor Cyan
  Write-Host '[Schema Workflow] Intermediate responses are hidden; the final response appears when the task finishes.' -ForegroundColor DarkGray
  Write-Host (('[Schema Workflow] Detailed log: {0}') -f $agyLogPath) -ForegroundColor DarkGray`
  }
  return `Write-Host '[Schema Workflow] CLI initialization completed. Starting the requested workflow.' -ForegroundColor Cyan`
}
function buildScript(record: LaunchRequestRecord, launcherPath: string): string {
  return `$ErrorActionPreference = 'Stop'
$projectRoot = ${quotePowerShell(record.project_root)}
$launcher = ${quotePowerShell(resolve(launcherPath))}
$promptPath = ${quotePowerShell(record.prompt_path)}
$logPath = ${quotePowerShell(record.execution_log_path ?? join(record.request_dir, 'execution.log'))}
$agyLogPath = ${quotePowerShell(record.platform_log_path ?? join(record.request_dir, 'antigravity.log'))}
$resultPath = ${quotePowerShell(record.process_result_path ?? join(record.request_dir, 'process-result.json'))}
$result = [ordered]@{ status = 'running'; exit_code = $null; finished_at = $null; error = $null }

try {
  Start-Transcript -LiteralPath $logPath -Force | Out-Null
  if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'Schema Workflow candidate launcher not found.' }
  & $launcher project-init --project-root $projectRoot --platform ${quotePowerShell(record.platform)} --channel candidate --output json
  if ($LASTEXITCODE -ne 0) { throw "Schema Workflow project initialization failed with exit code $LASTEXITCODE." }

  $prompt = Get-Content -Raw -LiteralPath $promptPath -Encoding UTF8
  Set-Location -LiteralPath $projectRoot
  ${platformProgressNotice(record.platform, record.mode)}
  ${platformCommand(record.platform, record.mode, record.antigravity_new_project)}
  if ($LASTEXITCODE -ne 0) { throw "CLI exited with code $LASTEXITCODE." }
  $result.status = 'completed'
  $result.exit_code = 0
} catch {
  $result.status = 'failed'
  $result.exit_code = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 1 }
  $result.error = $_.Exception.Message
  throw
} finally {
  $result.finished_at = (Get-Date).ToString('o')
  try { Stop-Transcript | Out-Null } catch {}
  $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $resultPath -Encoding UTF8
}
`
}

function buildBridgeScript(record: LaunchRequestRecord): string {
  const noExit = record.mode === 'confirm_launch' ? "'-NoExit', " : ''
  return `$ErrorActionPreference = 'Stop'
$targetScript = ${quotePowerShell(record.script_path)}
$terminalProcessPath = ${quotePowerShell(record.terminal_process_path ?? join(record.request_dir, 'terminal-process.json'))}
$arguments = @('-NoProfile', ${noExit}'-ExecutionPolicy', 'Bypass', '-File', ('"' + $targetScript + '"'))
$terminal = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WorkingDirectory ${quotePowerShell(record.project_root)} -WindowStyle Normal -PassThru
[ordered]@{ process_id = $terminal.Id; started_at = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $terminalProcessPath -Encoding UTF8
`
}

function buildWorkspaceScript(record: LaunchRequestRecord): string {
  return `$ErrorActionPreference = 'Stop'
$projectRoot = ${quotePowerShell(record.project_root)}
$codeCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs/Microsoft VS Code/Code.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft VS Code/Code.exe')
)
$codePath = $codeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $codePath) { throw 'Visual Studio Code was not found.' }
Start-Process -FilePath $codePath -ArgumentList @('--new-window', ('"' + $projectRoot + '"')) -WorkingDirectory $projectRoot
`
}

function validatePrepare(input: LaunchPrepareRequest, project: WorkflowProject, session: WorkSession, trustedRoots: string[]): void {
  if (!project.source_root || resolve(project.source_root).toLowerCase() !== resolve(input.project_root).toLowerCase()) throw new LaunchGatewayError('LAUNCH_PROJECT_MISMATCH', '선택한 ProjectRoot가 대시보드의 프로젝트와 다릅니다.')
  if (session.session_id !== input.session_id) throw new LaunchGatewayError('LAUNCH_SESSION_MISMATCH', '선택한 WorkSession을 찾을 수 없습니다.')
  if (!['codex', 'claude', 'antigravity'].includes(input.platform)) throw new LaunchGatewayError('LAUNCH_PLATFORM_UNSUPPORTED', '지원하지 않는 플랫폼입니다.')
  if (!['confirm_launch', 'trusted_auto'].includes(input.mode)) throw new LaunchGatewayError('LAUNCH_MODE_UNSUPPORTED', '지원하지 않는 실행 방식입니다.')
  if (!input.task.trim()) throw new LaunchGatewayError('LAUNCH_TASK_REQUIRED', '문제 상황을 입력해야 합니다.')
  const requestBytes = Buffer.byteLength(input.task.trim(), 'utf8')
  if (requestBytes > MAX_REQUEST_BYTES) throw new LaunchGatewayError('LAUNCH_TASK_SIZE_LIMIT_EXCEEDED', '문제 상황 원문이 1 MiB 제한을 초과했습니다. 원문을 여러 계약 문서로 분리해 주세요.', { request_bytes: requestBytes, maximum_bytes: MAX_REQUEST_BYTES })
  if (input.mode === 'trusted_auto' && !isTrustedAutoRoot(input.project_root, trustedRoots)) throw new LaunchGatewayError('TRUSTED_AUTO_ROOT_REQUIRED', '격리 허용 경로에서만 자동 실행을 사용할 수 있습니다.')
  if (input.platform === 'antigravity' && input.antigravity_new_project !== true && !session.runs.some(run => run.platform === 'antigravity')) throw new LaunchGatewayError('ANTIGRAVITY_PROJECT_REGISTRATION_REQUIRED', 'Antigravity 첫 실행은 새 프로젝트 등록 여부를 확인해야 합니다.')
}

export async function prepareLaunchRequest(input: LaunchPrepareRequest, project: WorkflowProject, session: WorkSession, options: PrepareOptions = {}): Promise<LaunchRequestRecord> {
  validatePrepare(input, project, session, options.trustedAutoRoots ?? [])
  const relationshipContract = buildRelationshipContract(session)
  const operationId = `op_dashboard_${randomUUID().replaceAll('-', '')}`
  const launchId = `launch_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${randomUUID().slice(0, 8)}`
  const directory = dirname(requestPath(input.project_root, launchId))
  const capsulePath = join(directory, 'context-capsule.json')
  const sourcePath = requestSourcePath(input.project_root, launchId)
  const promptPath = join(directory, 'prompt.txt')
  const scriptPath = join(directory, 'launch.ps1')
  const workspaceScriptPath = join(directory, 'open-vscode.ps1')
  const bridgeScriptPath = join(directory, 'open-terminal.ps1')
  const capsuleRelativePath = relative(resolve(input.project_root), capsulePath).replaceAll('\\', '/')
  const requestText = input.task.trim()
  const requestBytes = Buffer.byteLength(requestText, 'utf8')
  const record: LaunchRequestRecord = {
    schema_version: '1.0.0', launch_id: launchId, operation_id: operationId, project_id: project.project_id,
    project_root: resolve(input.project_root), session_id: session.session_id, session_name: session.name,
    operation_kind: session.operation_kind ?? 'independent', anchor_run_id: session.anchor_run_id ?? null,
    relationship_contract: relationshipContract,
    relationship_validation: { status: 'pending', checked_at: null, expected: relationshipContract, actual_run_id: null, actual_relation_type: null, actual_parent_run_id: null, operation_source: null, errors: [] },
    platform: input.platform, mode: input.mode, task: requestText,
    request_integrity: { algorithm: 'sha256', sha256: requestDigest(requestText), character_count: [...requestText].length, byte_count: requestBytes, source_path: sourcePath, verified: false },
    run_name: input.run_name.trim().slice(0, 120),
    antigravity_new_project: input.antigravity_new_project === true, status: 'prepared', created_at: new Date().toISOString(),
    workspace_opened_at: null, launched_at: null, bound_at: null, run_id: null,
    command_preview: `& powershell -NoExit -ExecutionPolicy Bypass -File ${quotePowerShell(scriptPath)}`,
    request_dir: directory, capsule_path: capsulePath, prompt_path: promptPath, script_path: scriptPath, workspace_script_path: workspaceScriptPath,
    bridge_script_path: bridgeScriptPath, terminal_process_path: join(directory, 'terminal-process.json'),
    execution_log_path: join(directory, 'execution.log'), platform_log_path: join(directory, 'antigravity.log'), process_result_path: join(directory, 'process-result.json'),
    exit_code: null, process_exited_at: null,
  }
  const capsule = buildContextCapsule(project, session, requestText)
  await mkdir(directory, { recursive: true })
  await atomicWrite(sourcePath, requestText)
  const persistedRequest = await readFile(sourcePath, 'utf8')
  if (requestDigest(persistedRequest) !== record.request_integrity.sha256 || Buffer.byteLength(persistedRequest, 'utf8') !== requestBytes) {
    throw new LaunchGatewayError('LAUNCH_REQUEST_INTEGRITY_FAILED', '저장된 사용자 원문이 입력과 일치하지 않습니다.')
  }
  record.request_integrity.verified = true
  await atomicWrite(capsulePath, `${JSON.stringify(capsule, null, 2)}\n`)
  await atomicWrite(promptPath, buildPrompt(record, capsuleRelativePath))
  await atomicWrite(scriptPath, buildScript(record, options.launcherPath ?? defaultLauncherPath()))
  await atomicWrite(workspaceScriptPath, buildWorkspaceScript(record))
  await atomicWrite(bridgeScriptPath, buildBridgeScript(record))
  await atomicWrite(requestPath(input.project_root, launchId), `${JSON.stringify(record, null, 2)}\n`)
  return record
}

export async function readLaunchRequest(projectRoot: string, launchId: string): Promise<LaunchRequestRecord> {
  try {
    const parsed = JSON.parse(await readFile(requestPath(projectRoot, launchId), 'utf8')) as LaunchRequestRecord
    if (parsed.schema_version !== LAUNCH_REQUEST_SCHEMA_VERSION || parsed.launch_id !== launchId || resolve(parsed.project_root).toLowerCase() !== resolve(projectRoot).toLowerCase()) throw new Error('invalid')
    if (parsed.request_integrity) {
      const sourcePath = resolve(parsed.request_integrity.source_path)
      if (!isInside(sourcePath, parsed.request_dir)) throw new LaunchGatewayError('LAUNCH_REQUEST_INTEGRITY_FAILED', '사용자 원문 경로가 Launch Request 경계를 벗어났습니다.')
      const source = await readFile(sourcePath, 'utf8')
      const valid = requestDigest(source) === parsed.request_integrity.sha256
        && [...source].length === parsed.request_integrity.character_count
        && Buffer.byteLength(source, 'utf8') === parsed.request_integrity.byte_count
      if (!valid) throw new LaunchGatewayError('LAUNCH_REQUEST_INTEGRITY_FAILED', '사용자 원문의 길이 또는 SHA-256이 준비 시점과 다릅니다.')
      parsed.request_integrity.verified = true
    }
    parsed.relationship_contract ??= buildRelationshipContract({ session_id: parsed.session_id, name: parsed.session_name, relation_status: 'confirmed', operation_kind: parsed.operation_kind, anchor_run_id: parsed.anchor_run_id, runs: [] })
    parsed.relationship_validation ??= { status: 'pending', checked_at: null, expected: parsed.relationship_contract, actual_run_id: null, actual_relation_type: null, actual_parent_run_id: null, operation_source: null, errors: [] }
    return parsed
  } catch (error) {
    if (error instanceof LaunchGatewayError) throw error
    throw new LaunchGatewayError('LAUNCH_REQUEST_NOT_FOUND', 'Launch Request를 찾을 수 없습니다.')
  }
}
async function saveLaunchRequest(record: LaunchRequestRecord): Promise<void> { await atomicWrite(requestPath(record.project_root, record.launch_id), `${JSON.stringify(record, null, 2)}\n`) }

export async function markWorkspaceOpened(projectRoot: string, launchId: string): Promise<LaunchRequestRecord> {
  const record = await readLaunchRequest(projectRoot, launchId)
  if (record.status !== 'prepared' && record.status !== 'workspace_opened') throw new LaunchGatewayError('LAUNCH_STATE_INVALID', 'Only a prepared request can open its workspace.')
  record.status = 'workspace_opened'
  record.workspace_opened_at ??= new Date().toISOString()
  await saveLaunchRequest(record)
  return record
}

export async function executeLaunchRequest(projectRoot: string, launchId: string, confirmed: boolean, options: ExecuteOptions = {}): Promise<LaunchRequestRecord> {
  if (!confirmed) throw new LaunchGatewayError('LAUNCH_CONFIRMATION_REQUIRED', '사용자 확인 전에는 CLI를 실행할 수 없습니다.')
  const record = await readLaunchRequest(projectRoot, launchId)
  if (record.status !== 'prepared') throw new LaunchGatewayError('LAUNCH_STATE_INVALID', '준비 상태의 요청만 실행할 수 있습니다.')
  if (record.mode === 'trusted_auto' && !isTrustedAutoRoot(record.project_root, options.trustedAutoRoots ?? [])) throw new LaunchGatewayError('TRUSTED_AUTO_ROOT_REQUIRED', '격리 허용 경로 밖에서는 자동 실행할 수 없습니다.')
  const bridgePath = record.bridge_script_path ?? record.script_path
  const scriptStat = await stat(bridgePath).catch(() => null)
  if (!scriptStat?.isFile()) throw new LaunchGatewayError('LAUNCH_SCRIPT_MISSING', '준비된 PowerShell 실행 브리지를 찾을 수 없습니다.')
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', bridgePath]
  const child = (options.spawnProcess ?? nodeSpawn)('powershell.exe', args, { cwd: record.project_root, detached: false, stdio: 'ignore', windowsHide: true })
  record.status = 'launched'; record.launched_at = new Date().toISOString(); record.process_id = child.pid
  await saveLaunchRequest(record)
  return record
}

interface OperationMatch {
  runId: string
  manifest: Record<string, unknown>
  source: 'run' | 'continuation'
  continuation: Record<string, unknown> | null
}

async function readRunManifest(root: string, runId: string): Promise<Record<string, unknown> | null> {
  const path = join(root, runId, 'workflow_manifest.json')
  try {
    const fileStat = await stat(path)
    if (!fileStat.isFile() || fileStat.size > 1024 * 1024) return null
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  } catch { return null }
}

function operationMatchFromManifest(manifest: Record<string, unknown>, fallbackRunId: string, operationId: string): OperationMatch | null {
  const runId = typeof manifest.run_id === 'string' ? manifest.run_id : fallbackRunId
  if (manifest.operation_id === operationId) return { runId, manifest, source: 'run', continuation: null }
  const continuation = Array.isArray(manifest.continuation_operations)
    ? manifest.continuation_operations.find(item => typeof item === 'object' && item !== null && (item as Record<string, unknown>).operation_id === operationId) as Record<string, unknown> | undefined
    : undefined
  return continuation ? { runId, manifest, source: 'continuation', continuation } : null
}

async function authoritativeOperationRunId(root: string, operationId: string): Promise<string | null> {
  try {
    const registry = JSON.parse(await readFile(join(root, '.control', 'workspace_registry.json'), 'utf8')) as Record<string, unknown>
    const operation = Array.isArray(registry.operations)
      ? registry.operations.find(item => typeof item === 'object' && item !== null && (item as Record<string, unknown>).operation_id === operationId) as Record<string, unknown> | undefined
      : undefined
    return typeof operation?.run_id === 'string' ? operation.run_id : null
  } catch { return null }
}

async function findRunByOperationId(projectRoot: string, operationId: string): Promise<OperationMatch | null> {
  const root = join(resolve(projectRoot), 'outputs', 'workflows')
  const authoritativeRunId = await authoritativeOperationRunId(root, operationId)
  if (authoritativeRunId) {
    const manifest = await readRunManifest(root, authoritativeRunId)
    const match = manifest && operationMatchFromManifest(manifest, authoritativeRunId, operationId)
    if (match) return match
  }
  let entries
  try { entries = await readdir(root, { withFileTypes: true }) } catch { return null }
  for (const entry of entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).sort((a, b) => b.name.localeCompare(a.name))) {
    const manifest = await readRunManifest(root, entry.name)
    const match = manifest && operationMatchFromManifest(manifest, entry.name, operationId)
    if (match) return match
  }
  return null
}

async function boundRunNeedsReconciliation(record: LaunchRequestRecord): Promise<boolean> {
  if (!record.run_id) return true
  const root = join(resolve(record.project_root), 'outputs', 'workflows')
  const authoritativeRunId = await authoritativeOperationRunId(root, record.operation_id)
  if (authoritativeRunId && authoritativeRunId !== record.run_id) return true
  return !(await stat(join(root, record.run_id)).catch(() => null))?.isDirectory()
}

export function validateRelationshipContract(record: LaunchRequestRecord, match: OperationMatch): RelationshipValidation {
  const expected = record.relationship_contract
  const actualRelation = typeof match.manifest.relation_type === 'string' ? match.manifest.relation_type : 'independent'
  const actualParent = typeof match.manifest.parent_run_id === 'string' ? match.manifest.parent_run_id : null
  const errors: string[] = []
  if (expected.result_run_policy === 'reuse_anchor') {
    if (match.runId !== expected.anchor_run_id) errors.push('이어가기는 기준 Run과 동일한 RunId를 사용해야 합니다.')
    if (match.source !== 'continuation') errors.push('이어가기 OperationId가 continuation_operations에 기록되지 않았습니다.')
    if (match.continuation?.session_reference !== record.session_id) errors.push('이어가기의 session_reference가 WorkSessionId와 다릅니다.')
    if (match.continuation?.delivery_policy !== expected.delivery_policy) errors.push('이어가기의 사용자 전달 정책이 작업 관계 계약과 다릅니다.')
  } else {
    if (match.source !== 'run') errors.push('새 작업 또는 분기 OperationId가 신규 Run의 최상위 operation_id가 아닙니다.')
    if (expected.operation_kind === 'independent' && (actualRelation !== 'independent' || actualParent !== null)) errors.push('새 작업은 independent 관계이며 parent_run_id가 없어야 합니다.')
    if (expected.operation_kind === 'branch' && (actualRelation !== 'branch' || actualParent !== expected.anchor_run_id)) errors.push('분기는 branch 관계와 정확한 parent_run_id를 가져야 합니다.')
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    checked_at: new Date().toISOString(),
    expected,
    actual_run_id: match.runId,
    actual_relation_type: match.source === 'continuation' ? 'continuation' : actualRelation,
    actual_parent_run_id: actualParent,
    operation_source: match.source,
    errors,
  }
}

export async function reconcileLaunchRequest(projectRoot: string, launchId: string): Promise<LaunchRequestRecord> {
  const record = await readLaunchRequest(projectRoot, launchId)
  if (record.status === 'failed') return record
  if (record.status === 'bound' && !(await boundRunNeedsReconciliation(record))) return record
  const match = await findRunByOperationId(record.project_root, record.operation_id)
  if (!match) {
    if (record.status === 'prepared') throw new LaunchGatewayError('LAUNCH_RUN_PENDING', '준비된 OperationId로 생성된 Run을 아직 찾지 못했습니다.')
    if (record.status === 'workspace_opened') throw new LaunchGatewayError('LAUNCH_RUN_PENDING', 'VS Code 작업에서 생성된 Run을 아직 찾지 못했습니다.')
    let result: { status?: string; exit_code?: number; finished_at?: string; error?: string } | undefined
    if (record.process_result_path) {
      try { result = JSON.parse((await readFile(record.process_result_path, 'utf8')).replace(/^\uFEFF/, '')) as { status?: string; exit_code?: number; finished_at?: string; error?: string } }
      catch { /* The process may still be writing its result. */ }
    }
    let terminal: { process_id?: number; started_at?: string } | undefined
    if (record.terminal_process_path) {
      try { terminal = JSON.parse((await readFile(record.terminal_process_path, 'utf8')).replace(/^\uFEFF/, '')) as { process_id?: number; started_at?: string } }
      catch { /* The bridge may still be opening the terminal. */ }
    }
    if (terminal?.process_id) record.terminal_process_id = terminal.process_id
    const terminalAlive = terminal?.process_id ? (() => { try { process.kill(terminal.process_id!, 0); return true } catch { return false } })() : false
    const bridgeGraceExpired = Date.now() - new Date(record.launched_at ?? record.created_at).getTime() > 10_000
    const terminalFailedToStart = !terminal?.process_id && bridgeGraceExpired
    if (result?.status === 'failed' || (terminal?.process_id && !terminalAlive) || terminalFailedToStart) {
      record.status = 'failed'
      record.exit_code = result?.exit_code ?? null
      record.process_exited_at = result?.finished_at ?? new Date().toISOString()
      record.error = {
        code: result?.status === 'failed' ? 'CLI_PROCESS_FAILED' : terminalFailedToStart ? 'TERMINAL_START_FAILED' : 'CLI_PROCESS_EXITED_WITHOUT_RUN',
        message: result?.error || (terminalFailedToStart ? 'PowerShell 작업 창을 열지 못했습니다.' : 'CLI 프로세스가 Run을 생성하지 않고 종료되었습니다.'),
      }
      await saveLaunchRequest(record)
      return record
    }
    throw new LaunchGatewayError('LAUNCH_RUN_PENDING', 'CLI가 실행 중입니다. 완료 후 다시 확인해 주세요.')
  }
  const relationshipValidation = validateRelationshipContract(record, match)
  record.relationship_validation = relationshipValidation
  if (relationshipValidation.status !== 'pass') {
    record.status = 'relation_mismatch'
    record.error = { code: 'RELATIONSHIP_CONTRACT_MISMATCH', message: relationshipValidation.errors.join(' ') }
    await saveLaunchRequest(record)
    throw new LaunchGatewayError('RELATIONSHIP_CONTRACT_MISMATCH', '대시보드 작업 방식과 Run manifest의 관계가 일치하지 않습니다.', { validation: relationshipValidation })
  }
  const runId = match.runId
  const projection = await readRelationshipRegistry(record.project_root)
  if (projection.warning) throw new LaunchGatewayError(projection.warning.code, projection.warning.message)
  await confirmSession({ project_root: record.project_root, expected_revision: projection.registry?.revision ?? 0, session_id: record.session_id, session_name: record.session_name, run_ids: [runId], evidence_refs: [], operation_kind: record.operation_kind, anchor_run_id: record.anchor_run_id }, record.project_id)
  record.status = 'bound'; record.run_id = runId; record.bound_at = new Date().toISOString(); record.error = undefined
  await saveLaunchRequest(record)
  return record
}

export interface PendingLaunchReconciliation {
  checked: number
  bound: number
  pending: number
  failed: number
  errors: Array<{ launch_id: string; code: string; message: string }>
}

export async function reconcilePendingLaunchRequests(projectRoot: string): Promise<PendingLaunchReconciliation> {
  const requestsRoot = join(launchRoot(projectRoot), 'requests')
  const result: PendingLaunchReconciliation = { checked: 0, bound: 0, pending: 0, failed: 0, errors: [] }
  const entries = await readdir(requestsRoot, { withFileTypes: true }).catch(() => [])
  for (const entry of entries.filter(entry => entry.isDirectory() && entry.name.startsWith('launch_')).sort((a, b) => a.name.localeCompare(b.name))) {
    let request: LaunchRequestRecord
    try { request = await readLaunchRequest(projectRoot, entry.name) }
    catch (error) {
      const launchError = error instanceof LaunchGatewayError ? error : new LaunchGatewayError('LAUNCH_REQUEST_INVALID', 'Launch Request를 읽지 못했습니다.')
      result.errors.push({ launch_id: entry.name, code: launchError.code, message: launchError.message })
      continue
    }
    const repairBoundRequest = request.status === 'bound' && await boundRunNeedsReconciliation(request)
    if (request.status !== 'prepared' && request.status !== 'workspace_opened' && request.status !== 'launched' && request.status !== 'relation_mismatch' && !repairBoundRequest) continue
    result.checked += 1
    try {
      const reconciled = await reconcileLaunchRequest(projectRoot, request.launch_id)
      if (reconciled.status === 'bound') result.bound += 1
      else if (reconciled.status === 'failed') result.failed += 1
      else result.pending += 1
    } catch (error) {
      const launchError = error instanceof LaunchGatewayError ? error : new LaunchGatewayError('LAUNCH_RECONCILE_FAILED', 'Run 연결에 실패했습니다.')
      if (launchError.code === 'LAUNCH_RUN_PENDING') result.pending += 1
      else result.errors.push({ launch_id: request.launch_id, code: launchError.code, message: launchError.message })
    }
  }
  return result
}
