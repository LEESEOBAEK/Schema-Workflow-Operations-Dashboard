import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LaunchPrepareRequest, WorkSession, WorkflowProject } from '../shared/types/dashboard'
import { buildContextCapsule, executeLaunchRequest, markWorkspaceOpened, MAX_CAPSULE_BYTES, prepareLaunchRequest, readLaunchRequest, reconcileLaunchRequest, reconcilePendingLaunchRequests } from '../server/utils/launchGateway'
import { readRelationshipRegistry } from '../server/utils/relationshipGateway'

const roots: string[] = []

async function fixture(platform: 'codex' | 'claude' | 'antigravity' = 'codex') {
  const root = await mkdtemp(join(tmpdir(), 'launch-gateway-'))
  roots.push(root)
  const session: WorkSession = {
    session_id: 'session_alpha', name: '알파 작업', relation_status: 'confirmed',
    runs: [{ run_id: 'run_existing', status: 'pass', platform, next_action: '완료', artifact_count: 1, evidence_count: 1, artifact_ids: ['artifact_1'], evidence_ids: ['evidence_1'] }],
  }
  const project: WorkflowProject = { project_id: 'project_test', name: 'Test', source_root: root, sessions: [session] }
  const input: LaunchPrepareRequest = { project_root: root, session_id: session.session_id, platform: 'codex', mode: 'confirm_launch', task: '고객 요청을 구조화하고 보고서를 작성한다.', run_name: '고객 요청 분석' }
  return { root, session, project, input }
}

afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('launch gateway', () => {
  it('creates a bounded Context Capsule and a reviewable launch package', async () => {
    const { root, session, project, input } = await fixture()
    const capsule = buildContextCapsule(project, session, `${'긴 설명 '.repeat(200)}`)
    expect(Buffer.byteLength(JSON.stringify(capsule), 'utf8')).toBeLessThanOrEqual(MAX_CAPSULE_BYTES)
    expect(capsule.evidence_refs).toEqual(['evidence_1'])

    const request = await prepareLaunchRequest(input, project, session, { channel: 'stable', launcherPath: join(root, 'stable.ps1') })
    expect(request.status).toBe('prepared')
    expect(request.operation_id).toMatch(/^op_dashboard_/)
    const prompt = await readFile(request.prompt_path, 'utf8')
    expect(prompt).toContain(request.operation_id)
    expect(prompt).toContain(`WorkSessionId:\n${session.session_id}`)
    expect(prompt).toContain('operation_kind: independent')
    expect(prompt).toContain('--relation-type independent')
    expect(prompt).toContain('별도 작업 세션을 새로 만들지 않는다')
    expect(prompt).toContain('artifact_ready는 이번 반복의 산출물이 준비됐다는 뜻')
    expect(prompt).toContain('구현 -> 빌드 -> 전체 회귀 테스트 -> 실패 분석 -> 최소 수정')
    expect(prompt).toContain('CLI 프로세스 종료, 보고서 생성, 일부 테스트 통과')
    expect(prompt).toContain('user-request.md')
    expect(prompt).toContain(request.request_integrity.sha256)
    expect(request.request_integrity.verified).toBe(true)
    const script = await readFile(request.script_path, 'utf8')
    expect(request.schema_workflow_channel).toBe('stable')
    expect(script).toContain('--channel stable')
    expect(script).not.toContain('--channel candidate')
    expect(script).toContain('--ask-for-approval on-request')
    expect(script).toContain('Start-Transcript')
    expect(script).toContain('process-result.json')
    expect(await readFile(request.bridge_script_path!, 'utf8')).toContain('Start-Process')
    const workspaceScript = await readFile(request.workspace_script_path!, 'utf8')
    expect(workspaceScript).not.toContain('project-init')
    expect(workspaceScript).not.toContain('schema-workflow')
    expect(workspaceScript).toContain('Microsoft VS Code/Code.exe')
  })

  it('keeps candidate launches explicit instead of changing the global default', async () => {
    const { root, session, project, input } = await fixture()
    const request = await prepareLaunchRequest(input, project, session, { channel: 'candidate', launcherPath: join(root, 'candidate.ps1') })
    const script = await readFile(request.script_path, 'utf8')
    expect(request.schema_workflow_channel).toBe('candidate')
    expect(script).toContain('--channel candidate')
  })

  it('preserves a long request losslessly outside the CLI prompt', async () => {
    const { session, project, input } = await fixture()
    const longTask = `# 장문 계약\n\n${'필수 산출물과 검증 조건을 보존한다.\n'.repeat(600)}`
    const request = await prepareLaunchRequest({ ...input, task: longTask }, project, session)
    expect(await readFile(request.request_integrity.source_path, 'utf8')).toBe(longTask.trim())
    expect(request.request_integrity.character_count).toBe([...longTask.trim()].length)
    expect(request.request_integrity.byte_count).toBe(Buffer.byteLength(longTask.trim(), 'utf8'))
    const prompt = await readFile(request.prompt_path, 'utf8')
    expect(prompt).toContain('사용자 원문 계약')
    expect(prompt).not.toContain('필수 산출물과 검증 조건을 보존한다.\n필수 산출물')
  })

  it('rejects a launch request when its immutable source changes', async () => {
    const { root, session, project, input } = await fixture()
    const request = await prepareLaunchRequest(input, project, session)
    await writeFile(request.request_integrity.source_path, '변조된 요청', 'utf8')
    await expect(readLaunchRequest(root, request.launch_id)).rejects.toMatchObject({ code: 'LAUNCH_REQUEST_INTEGRITY_FAILED' })
  })

  it('does not spawn a process before explicit confirmation', async () => {
    const { root, session, project, input } = await fixture()
    const request = await prepareLaunchRequest(input, project, session)
    const spawnProcess = vi.fn()
    await expect(executeLaunchRequest(root, request.launch_id, false, { spawnProcess: spawnProcess as any })).rejects.toMatchObject({ code: 'LAUNCH_CONFIRMATION_REQUIRED' })
    expect(spawnProcess).not.toHaveBeenCalled()
  })

  it('allows trusted auto only under an allowlisted isolation root', async () => {
    const { root, session, project, input } = await fixture()
    const autoInput = { ...input, mode: 'trusted_auto' as const }
    await expect(prepareLaunchRequest(autoInput, project, session, { trustedAutoRoots: [] })).rejects.toMatchObject({ code: 'TRUSTED_AUTO_ROOT_REQUIRED' })
    const request = await prepareLaunchRequest(autoInput, project, session, { trustedAutoRoots: [root] })
    const script = await readFile(request.script_path, 'utf8')
    expect(script).toContain('--sandbox workspace-write')
    expect(script).not.toContain('--dangerously-bypass-approvals-and-sandbox')
    await expect(executeLaunchRequest(root, request.launch_id, true, { trustedAutoRoots: [] })).rejects.toMatchObject({ code: 'TRUSTED_AUTO_ROOT_REQUIRED' })
  })

  it('uses a hidden bridge that opens trusted auto in a visible PowerShell console', async () => {
    const { root, session, project, input } = await fixture()
    const request = await prepareLaunchRequest({ ...input, mode: 'trusted_auto' }, project, session, { trustedAutoRoots: [root] })
    const spawnProcess = vi.fn(() => ({ pid: 4242, unref: vi.fn() }))
    await executeLaunchRequest(root, request.launch_id, true, { trustedAutoRoots: [root], spawnProcess: spawnProcess as any })
    expect(spawnProcess).toHaveBeenCalledWith('powershell.exe', expect.any(Array), expect.objectContaining({ windowsHide: true, detached: false }))
    expect(await readFile(request.bridge_script_path!, 'utf8')).toContain('-WindowStyle Normal')
  })

  it('requires explicit first-project registration for Antigravity', async () => {
    const { session, project, input } = await fixture()
    const agyInput = { ...input, platform: 'antigravity' as const }
    await expect(prepareLaunchRequest(agyInput, project, session)).rejects.toMatchObject({ code: 'ANTIGRAVITY_PROJECT_REGISTRATION_REQUIRED' })
    const request = await prepareLaunchRequest({ ...agyInput, antigravity_new_project: true }, project, session)
    expect(await readFile(request.script_path, 'utf8')).toContain('agy --log-file $agyLogPath --new-project --prompt-interactive $prompt')
  })

  it('places Antigravity print immediately before the prompt', async () => {
    const { session, project, input } = await fixture()
    const request = await prepareLaunchRequest({ ...input, platform: 'antigravity', mode: 'trusted_auto', antigravity_new_project: true }, project, session, { trustedAutoRoots: [project.source_root!] })
    const script = await readFile(request.script_path, 'utf8')
    expect(script).toContain('agy --dangerously-skip-permissions --mode accept-edits --log-file $agyLogPath --new-project --print $prompt')
    expect(script).not.toContain('agy --print --dangerously-skip-permissions')
    expect(script).toContain('Antigravity is working in automatic print mode.')
    expect(script).toContain('Intermediate responses are hidden; the final response appears when the task finishes.')
    expect(script).toContain("Detailed log: {0}")
  })

  it('binds the Run with the prepared OperationId to the selected WorkSession', async () => {
    const { root, session, project, input } = await fixture()
    const request = await prepareLaunchRequest(input, project, session)
    const spawnProcess = vi.fn(() => ({ pid: 4242, unref: vi.fn() }))
    const launched = await executeLaunchRequest(root, request.launch_id, true, { spawnProcess: spawnProcess as any })
    expect(launched.status).toBe('launched')
    expect(spawnProcess).toHaveBeenCalledOnce()

    const runId = 'run_created_by_cli'
    const runRoot = join(root, 'outputs', 'workflows', runId)
    await mkdir(runRoot, { recursive: true })
    await writeFile(join(runRoot, 'workflow_manifest.json'), JSON.stringify({ run_id: runId, operation_id: request.operation_id }), 'utf8')
    const bound = await reconcileLaunchRequest(root, request.launch_id)
    expect(bound.status).toBe('bound')
    expect(bound.run_id).toBe(runId)
    const registry = (await readRelationshipRegistry(root)).registry
    expect(registry?.relations.some(relation => relation.source_id === session.session_id && relation.target_id === runId && relation.relation_type === 'HAS_RUN' && relation.status === 'confirmed')).toBe(true)
  })

  it('reuses the anchor Run for a legacy continuation whose omitted delivery policy means required', async () => {
    const { root, project, input } = await fixture()
    const anchorRunId = 'run_existing'
    const session: WorkSession = { session_id: 'session_continue', name: 'Continue', relation_status: 'confirmed', operation_kind: 'continue', anchor_run_id: anchorRunId, runs: [] }
    project.sessions.push(session)
    const request = await prepareLaunchRequest({ ...input, session_id: session.session_id }, project, session)
    const prompt = await readFile(request.prompt_path, 'utf8')
    expect(prompt).toContain('workflow_runner.py continue-run')
    expect(prompt).toContain('--supplemental-input-file')
    expect(prompt).toContain('--supplemental-input-sha256')
    expect(prompt).toContain(request.request_integrity.source_path)
    expect(prompt).toContain(request.request_integrity.sha256)
    const runRoot = join(root, 'outputs', 'workflows', anchorRunId)
    await mkdir(runRoot, { recursive: true })
    await writeFile(join(runRoot, 'workflow_manifest.json'), JSON.stringify({
      run_id: anchorRunId,
      operation_id: 'op_original',
      relation_type: 'independent',
      continuation_operations: [{
        operation_id: request.operation_id,
        status: 'completed',
        session_reference: session.session_id,
      }],
    }), 'utf8')

    const bound = await reconcileLaunchRequest(root, request.launch_id)
    expect(bound).toMatchObject({ status: 'bound', run_id: anchorRunId, relationship_validation: { status: 'pass', operation_source: 'continuation' } })
  })

  it('rejects an explicit continuation delivery policy that conflicts with the session contract', async () => {
    const { root, project, input } = await fixture()
    const anchorRunId = 'run_policy_conflict'
    const session: WorkSession = { session_id: 'session_policy_conflict', name: 'Continue', relation_status: 'confirmed', operation_kind: 'continue', anchor_run_id: anchorRunId, runs: [] }
    project.sessions.push(session)
    const request = await prepareLaunchRequest({ ...input, session_id: session.session_id }, project, session)
    const runRoot = join(root, 'outputs', 'workflows', anchorRunId)
    await mkdir(runRoot, { recursive: true })
    await writeFile(join(runRoot, 'workflow_manifest.json'), JSON.stringify({
      run_id: anchorRunId,
      operation_id: 'op_original',
      relation_type: 'independent',
      continuation_operations: [{
        operation_id: request.operation_id,
        status: 'completed',
        session_reference: session.session_id,
        delivery_policy: 'internal_only',
      }],
    }), 'utf8')

    await expect(reconcileLaunchRequest(root, request.launch_id)).rejects.toMatchObject({ code: 'RELATIONSHIP_CONTRACT_MISMATCH' })
    expect(await readLaunchRequest(root, request.launch_id)).toMatchObject({ status: 'relation_mismatch', relationship_validation: { status: 'fail' } })
  })

  it('requires a branch Run to record its parent in the manifest', async () => {
    const { root, project, input } = await fixture()
    const session: WorkSession = { session_id: 'session_branch', name: 'Branch', relation_status: 'confirmed', operation_kind: 'branch', anchor_run_id: 'run_existing', runs: [] }
    project.sessions.push(session)
    const request = await prepareLaunchRequest({ ...input, session_id: session.session_id }, project, session)
    expect(await readFile(request.prompt_path, 'utf8')).toContain('--relation-type branch')
    const childRunId = 'run_branch'
    await mkdir(join(root, 'outputs', 'workflows', 'run_existing'), { recursive: true })
    const runRoot = join(root, 'outputs', 'workflows', childRunId)
    await mkdir(runRoot, { recursive: true })
    await writeFile(join(runRoot, 'workflow_manifest.json'), JSON.stringify({ run_id: childRunId, operation_id: request.operation_id, relation_type: 'branch', parent_run_id: 'run_existing' }), 'utf8')

    const bound = await reconcileLaunchRequest(root, request.launch_id)
    expect(bound).toMatchObject({ status: 'bound', run_id: childRunId, relationship_validation: { status: 'pass', actual_parent_run_id: 'run_existing' } })
  })

  it('blocks completion when the Run manifest violates the relationship contract', async () => {
    const { root, project, input } = await fixture()
    const session: WorkSession = { session_id: 'session_bad_branch', name: 'Bad branch', relation_status: 'confirmed', operation_kind: 'branch', anchor_run_id: 'run_existing', runs: [] }
    project.sessions.push(session)
    const request = await prepareLaunchRequest({ ...input, session_id: session.session_id }, project, session)
    const runRoot = join(root, 'outputs', 'workflows', 'run_wrong')
    await mkdir(runRoot, { recursive: true })
    await writeFile(join(runRoot, 'workflow_manifest.json'), JSON.stringify({ run_id: 'run_wrong', operation_id: request.operation_id, relation_type: 'independent', parent_run_id: null }), 'utf8')

    await expect(reconcileLaunchRequest(root, request.launch_id)).rejects.toMatchObject({ code: 'RELATIONSHIP_CONTRACT_MISMATCH' })
    expect(await readLaunchRequest(root, request.launch_id)).toMatchObject({ status: 'relation_mismatch', relationship_validation: { status: 'fail' } })
  })

  it('binds a Run created manually after opening the VS Code workspace', async () => {
    const { root, session, project, input } = await fixture()
    const request = await prepareLaunchRequest(input, project, session)
    const opened = await markWorkspaceOpened(root, request.launch_id)
    expect(opened.status).toBe('workspace_opened')

    const runId = 'run_created_in_vscode'
    const runRoot = join(root, 'outputs', 'workflows', runId)
    await mkdir(runRoot, { recursive: true })
    await writeFile(join(runRoot, 'workflow_manifest.json'), JSON.stringify({ run_id: runId, operation_id: request.operation_id }), 'utf8')

    const bound = await reconcileLaunchRequest(root, request.launch_id)
    expect(bound.status).toBe('bound')
    expect(bound.run_id).toBe(runId)
  })

  it('automatically binds a pending launch to its original WorkSession', async () => {
    const { root, session, project, input } = await fixture()
    const request = await prepareLaunchRequest(input, project, session)
    await markWorkspaceOpened(root, request.launch_id)
    const runId = 'run_auto_reconciled'
    const runRoot = join(root, 'outputs', 'workflows', runId)
    await mkdir(runRoot, { recursive: true })
    await writeFile(join(runRoot, 'workflow_manifest.json'), JSON.stringify({ run_id: runId, operation_id: request.operation_id }), 'utf8')

    const result = await reconcilePendingLaunchRequests(root)
    expect(result).toMatchObject({ checked: 1, bound: 1, pending: 0, failed: 0, errors: [] })
    const registry = (await readRelationshipRegistry(root)).registry
    expect(registry?.relations.some(relation => relation.source_id === session.session_id && relation.target_id === runId && relation.relation_type === 'HAS_RUN')).toBe(true)
    expect((await reconcilePendingLaunchRequests(root)).checked).toBe(0)
  })

  it('repairs a bound launch when the engine replaces its Run for the same OperationId', async () => {
    const { root, session, project, input } = await fixture()
    const request = await prepareLaunchRequest(input, project, session)
    const runsRoot = join(root, 'outputs', 'workflows')
    const initialRunId = '2026-07-23_132846__projectcase'
    await mkdir(join(runsRoot, initialRunId), { recursive: true })
    await writeFile(join(runsRoot, initialRunId, 'workflow_manifest.json'), JSON.stringify({ run_id: initialRunId, operation_id: request.operation_id, relation_type: 'independent' }), 'utf8')
    expect((await reconcileLaunchRequest(root, request.launch_id)).run_id).toBe(initialRunId)

    await rm(join(runsRoot, initialRunId), { recursive: true, force: true })
    const finalRunId = '2026-07-23_133005__projectcase'
    await mkdir(join(runsRoot, finalRunId), { recursive: true })
    await writeFile(join(runsRoot, finalRunId, 'workflow_manifest.json'), JSON.stringify({ run_id: finalRunId, operation_id: request.operation_id, relation_type: 'independent' }), 'utf8')
    await mkdir(join(runsRoot, '.control'), { recursive: true })
    await writeFile(join(runsRoot, '.control', 'workspace_registry.json'), JSON.stringify({ operations: [{ operation_id: request.operation_id, run_id: finalRunId }] }), 'utf8')

    expect(await reconcilePendingLaunchRequests(root)).toMatchObject({ checked: 1, bound: 1, errors: [] })
    expect(await readLaunchRequest(root, request.launch_id)).toMatchObject({ status: 'bound', run_id: finalRunId })
    const registry = (await readRelationshipRegistry(root)).registry!
    expect(registry.sessions.filter(item => item.session_id === session.session_id)).toHaveLength(1)
    expect(registry.relations).toContainEqual(expect.objectContaining({ source_id: session.session_id, target_id: initialRunId, relation_type: 'HAS_RUN', status: 'superseded' }))
    expect(registry.relations).toContainEqual(expect.objectContaining({ source_id: session.session_id, target_id: finalRunId, relation_type: 'HAS_RUN', status: 'confirmed' }))
  })

  it('binds a manually executed prepared prompt when its OperationId matches', async () => {
    const { root, session, project, input } = await fixture()
    const request = await prepareLaunchRequest(input, project, session)
    const runId = 'run_from_copied_prompt'
    const runRoot = join(root, 'outputs', 'workflows', runId)
    await mkdir(runRoot, { recursive: true })
    await writeFile(join(runRoot, 'workflow_manifest.json'), JSON.stringify({ run_id: runId, operation_id: request.operation_id }), 'utf8')

    const result = await reconcilePendingLaunchRequests(root)
    expect(result).toMatchObject({ checked: 1, bound: 1, pending: 0, failed: 0, errors: [] })
    const registry = (await readRelationshipRegistry(root)).registry
    expect(registry?.relations.some(relation => relation.source_id === session.session_id && relation.target_id === runId && relation.relation_type === 'HAS_RUN')).toBe(true)
  })

  it('keeps an opened VS Code workspace pending while no Run exists', async () => {
    const { root, session, project, input } = await fixture()
    const request = await prepareLaunchRequest(input, project, session)
    await markWorkspaceOpened(root, request.launch_id)
    await expect(reconcileLaunchRequest(root, request.launch_id)).rejects.toMatchObject({ code: 'LAUNCH_RUN_PENDING' })
  })

  it('marks an exited CLI without a Run as failed instead of pending forever', async () => {
    const { root, session, project, input } = await fixture()
    const request = await prepareLaunchRequest(input, project, session)
    const spawnProcess = vi.fn(() => ({ pid: 2147483647, unref: vi.fn() }))
    await executeLaunchRequest(root, request.launch_id, true, { spawnProcess: spawnProcess as any })
    await writeFile(request.terminal_process_path!, JSON.stringify({ process_id: 2147483647 }), 'utf8')

    const reconciled = await reconcileLaunchRequest(root, request.launch_id)
    expect(reconciled.status).toBe('failed')
    expect(reconciled.error?.code).toBe('CLI_PROCESS_EXITED_WITHOUT_RUN')
  })
})
