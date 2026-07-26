<script setup lang="ts">
import { AlertTriangle, ArrowRight, Box, Check, CheckCircle2, ChevronRight, CircleHelp, Clock3, Code2, Columns3, Copy, FileCheck2, FileInput, FileText, FolderPlus, GitBranch, GripVertical, LayoutList, Link2, Play, Plus, Search, ShieldCheck, TerminalSquare, Trash2, UserCheck, Pencil, Save, X } from 'lucide-vue-next'
import type { DashboardState, LaunchMode, LaunchPlatform, LaunchRequestRecord, OperationKind, ProjectCatalogState, ProjectSkillManagementState, ProjectSkillStatus, RunDisplayStatus, SessionSortMode, TrustedAutoStatus, WorkflowRun, WorkSession } from '../../shared/types/dashboard'
import { buildRunChoices } from '~/utils/runChoices'
const { data, refresh } = await useFetch<DashboardState>('/api/dashboard')
const { data: projectCatalog, refresh: refreshProjectCatalog } = await useFetch<ProjectCatalogState>('/api/projects')
const activeProjectRoot = ref('')
const activeCatalogProject = computed(() => projectCatalog.value?.projects.find(item => item.source_root.toLowerCase() === activeProjectRoot.value.toLowerCase()))
const project = computed(() => data.value?.projects.find(item => item.source_root?.toLowerCase() === activeProjectRoot.value.toLowerCase()) ?? data.value?.projects[0])
const sessions = computed(() => project.value?.sessions ?? [])
const sessionSortMode = computed<SessionSortMode>(() => project.value?.session_sort_mode ?? 'manual')
const sessionOrderDraft = ref<string[]>([])
const visibleSessions = computed(() => {
  if (!sessionOrderDraft.value.length) return sessions.value
  const byId = new Map(sessions.value.map(session => [session.session_id, session]))
  return sessionOrderDraft.value.map(id => byId.get(id)).filter((session): session is WorkSession => Boolean(session))
})
const allRuns = computed(() => buildRunChoices(sessions.value))
const activeRuns = computed(() => allRuns.value.filter(run => (run.display_status ?? 'active') === 'active'))
const source = computed(() => data.value?.source)
const firstConflict = computed(() => data.value?.conflicts[0])
const passCount = computed(() => activeRuns.value.filter(run => run.status === 'pass').length)
const reviewCount = computed(() => activeRuns.value.filter(run => run.status !== 'pass').length)
const passedRuns = computed(() => activeRuns.value.filter(run => run.status === 'pass'))
const relationSessions = computed(() => sessions.value.filter(session => session.relation_status !== 'confirmed'))
const relationIssueCount = computed(() => relationSessions.value.length + (data.value?.conflicts.length ?? 0))
const selectedSessionId = ref('session_slime_visual')
const selectedRunId = ref('run_slime_002')
const viewMode = ref<'focus' | 'board'>('focus')
const selectedSession = computed(() => sessions.value.find(session => session.session_id === selectedSessionId.value) ?? sessions.value[0])
const selectedRun = computed(() => allRuns.value.find(run => run.run_id === selectedRunId.value) ?? allRuns.value[0])
const suggestedContinuationRun = computed(() => {
  const runs = selectedSession.value?.runs ?? []
  return [...runs].sort((left, right) => (right.created_at ?? right.run_id).localeCompare(left.created_at ?? left.run_id))[0]
})
const selectedAnchorRun = computed(() => allRuns.value.find(run => run.run_id === sessionAnchorRunId.value))
const attentionRuns = computed(() => activeRuns.value.filter(run => run.status !== 'pass'))
const passRun = computed(() => activeRuns.value.find(run => run.status === 'pass'))
const holdRun = computed(() => activeRuns.value.find(run => run.status === 'hold'))
const evidenceRun = computed(() => activeRuns.value.find(run => run.status === 'evidence_insufficient'))
const editMode = ref(false)
const draftTitle = ref('')
const draftNote = ref('')
const draftTags = ref('')
const draftDisplayStatus = ref<RunDisplayStatus>('active')
const metadataSaving = ref(false)
const metadataError = ref('')
const sessionMetadataEditOpen = ref(false)
const sessionDisplayNameDraft = ref('')
const sessionMetadataSaving = ref(false)
const sessionMetadataError = ref('')
const relationMode = ref(false)
const relationSaving = ref(false)
const relationError = ref('')
const relationSessionName = ref('')
const launchModeOpen = ref(false)
const launchPlatform = ref<LaunchPlatform>('codex')
const launchSafetyMode = ref<LaunchMode>('confirm_launch')
const launchTask = ref('')
const launchRunName = ref('')
const antigravityNewProject = ref(false)
const preparedLaunch = ref<LaunchRequestRecord | null>(null)
const preparedPrompt = ref('')
const launchBusy = ref(false)
const launchError = ref('')
const launchNotice = ref('')
const autoTrustStatus = ref<TrustedAutoStatus | null>(null)
const autoTrustBusy = ref(false)
const skillState = ref<ProjectSkillManagementState | null>(null)
const skillBusy = ref(false)
const skillError = ref('')
const selectedSkill = computed(() => {
  const projectRoot = project.value?.source_root
  if (!projectRoot || skillState.value?.project_root.toLowerCase() !== projectRoot.toLowerCase()) return null
  return skillState.value.skills.find(skill => skill.platform === launchPlatform.value) ?? null
})
const projectEditorOpen = ref(false)
const projectRootDraft = ref('')
const projectNameDraft = ref('')
const createProjectDirectory = ref(true)
const projectSaving = ref(false)
const projectRemoving = ref(false)
const projectError = ref('')
const sessionEditorOpen = ref(false)
const sessionNameDraft = ref('')
const sessionOperationKind = ref<OperationKind>('independent')
const sessionAnchorRunId = ref('')
const sessionSaving = ref(false)
const sessionError = ref('')
const draggedSessionId = ref('')
const sessionOrderSaving = ref(false)
const sessionOrderError = ref('')
const pendingLaunchSyncBusy = ref(false)
let pendingLaunchTimer: ReturnType<typeof setInterval> | null = null

watch(() => data.value?.source?.active_project_root, (value) => {
  if (value && !activeProjectRoot.value) activeProjectRoot.value = value
}, { immediate: true })

async function syncPendingLaunches() {
  if (!project.value?.source_root || source.value?.mode !== 'live' || pendingLaunchSyncBusy.value) return
  pendingLaunchSyncBusy.value = true
  try {
    const result = await $fetch<{ checked: number; bound: number; pending: number; failed: number; errors: Array<{ code: string; message: string }> }>('/api/launch/reconcile-pending', {
      method: 'POST', body: { project_root: project.value.source_root },
    })
    if (result.errors.length) launchError.value = `Run 자동 연결 실패: ${result.errors[0]?.message ?? result.errors[0]?.code}`
    if (result.bound > 0) {
      launchNotice.value = `${result.bound}개 Run을 기존 작업 세션에 자동 연결했습니다.`
      launchError.value = ''
      await refresh()
    }
  } catch (error) { launchError.value = error instanceof Error ? error.message : 'Run 자동 연결 상태를 확인하지 못했습니다.' }
  finally { pendingLaunchSyncBusy.value = false }
}

onMounted(() => {
  void syncPendingLaunches()
  pendingLaunchTimer = setInterval(() => void syncPendingLaunches(), 5000)
})
onBeforeUnmount(() => { if (pendingLaunchTimer) clearInterval(pendingLaunchTimer) })
watch(() => project.value?.source_root, () => void syncPendingLaunches())

async function selectProjectRoot() {
  if (!activeProjectRoot.value) return
  await $fetch('/api/projects', { method: 'PATCH', body: { source_root: activeProjectRoot.value } })
  selectedSessionId.value = ''
  selectedRunId.value = ''
  await refresh()
}

function openProjectEditor() {
  projectRootDraft.value = ''
  projectNameDraft.value = ''
  createProjectDirectory.value = true
  projectError.value = ''
  projectEditorOpen.value = true
}

async function saveProject() {
  if (!projectRootDraft.value.trim() || projectSaving.value) return
  projectSaving.value = true
  projectError.value = ''
  try {
    const response = await $fetch<{ active_project_root: string | null }>('/api/projects', { method: 'POST', body: { source_root: projectRootDraft.value, display_name: projectNameDraft.value, create_directory: createProjectDirectory.value } })
    activeProjectRoot.value = response.active_project_root ?? projectRootDraft.value
    await Promise.all([refresh(), refreshProjectCatalog()])
    projectEditorOpen.value = false
  } catch (error: any) { projectError.value = error?.data?.statusMessage ?? '프로젝트를 추가하지 못했습니다.' }
  finally { projectSaving.value = false }
}

async function removeActiveProject() {
  const entry = activeCatalogProject.value
  if (!entry || entry.origin !== 'catalog' || projectRemoving.value) return
  const confirmed = window.confirm(`'${entry.display_name}' 프로젝트를 대시보드 목록에서 제거할까요?\n\n실제 프로젝트 폴더와 산출물은 삭제되지 않습니다.`)
  if (!confirmed) return
  projectRemoving.value = true
  projectError.value = ''
  try {
    const response = await $fetch<ProjectCatalogState>('/api/projects', { method: 'DELETE', query: { source_root: entry.source_root } })
    activeProjectRoot.value = response.active_project_root ?? ''
    selectedSessionId.value = ''
    selectedRunId.value = ''
    await Promise.all([refresh(), refreshProjectCatalog()])
  } catch (error: any) {
    projectError.value = error?.data?.statusMessage ?? '프로젝트를 목록에서 제거하지 못했습니다.'
    window.alert(projectError.value)
  } finally { projectRemoving.value = false }
}

function openSessionEditor() {
  if (!project.value?.source_root || source.value?.mode !== 'live') return
  sessionNameDraft.value = ''
  sessionOperationKind.value = 'independent'
  sessionAnchorRunId.value = ''
  sessionError.value = ''
  sessionEditorOpen.value = true
}

function openContinuationSessionEditor() {
  const session = selectedSession.value
  const anchor = suggestedContinuationRun.value
  if (!session || !anchor || !project.value?.source_root || source.value?.mode !== 'live') return
  launchModeOpen.value = false
  sessionNameDraft.value = `${session.name} 이어가기`.slice(0, 120)
  sessionOperationKind.value = 'continue'
  sessionAnchorRunId.value = anchor.run_id
  sessionError.value = ''
  sessionEditorOpen.value = true
}

async function saveWorkSession() {
  if (!project.value?.source_root || !sessionNameDraft.value.trim() || sessionSaving.value) return
  sessionSaving.value = true
  sessionError.value = ''
  try {
    const response = await $fetch<{ session_id: string }>('/api/work-sessions', { method: 'POST', body: { project_root: project.value.source_root, expected_revision: project.value.relationship_revision ?? 0, session_name: sessionNameDraft.value, operation_kind: sessionOperationKind.value, anchor_run_id: sessionOperationKind.value === 'independent' ? null : sessionAnchorRunId.value } })
    selectedSessionId.value = response.session_id
    selectedRunId.value = ''
    await refresh()
    sessionEditorOpen.value = false
  } catch (error: any) { sessionError.value = error?.data?.statusMessage ?? '작업 세션을 만들지 못했습니다.' }
  finally { sessionSaving.value = false }
}

async function openLaunchPanel() {
  if (!selectedSession.value || !project.value?.source_root || source.value?.mode !== 'live') return
  launchTask.value = ''
  launchRunName.value = selectedSession.value.name
  launchPlatform.value = 'codex'
  launchSafetyMode.value = 'confirm_launch'
  antigravityNewProject.value = false
  preparedLaunch.value = null
  preparedPrompt.value = ''
  launchError.value = ''
  launchNotice.value = ''
  skillState.value = null
  skillError.value = ''
  launchModeOpen.value = true
  await Promise.all([refreshAutoTrustStatus(), refreshSkillState()])
}

async function refreshAutoTrustStatus() {
  if (!project.value?.source_root || source.value?.mode !== 'live') {
    autoTrustStatus.value = null
    return
  }
  autoTrustBusy.value = true
  try {
    autoTrustStatus.value = await $fetch<TrustedAutoStatus>('/api/launch/trust', { query: { project_root: project.value.source_root, platform: launchPlatform.value } })
  } catch (error: any) {
    autoTrustStatus.value = null
    launchError.value = error?.data?.statusMessage ?? '자동 실행 승인 상태를 확인하지 못했습니다.'
  } finally { autoTrustBusy.value = false }
}

async function refreshSkillState() {
  if (!project.value?.source_root || source.value?.mode !== 'live') {
    skillState.value = null
    return
  }
  skillBusy.value = true
  skillError.value = ''
  const requestedRoot = project.value.source_root
  try {
    const response = await $fetch<ProjectSkillManagementState>('/api/skills', { query: { project_root: requestedRoot } })
    if (project.value?.source_root.toLowerCase() === requestedRoot.toLowerCase()) skillState.value = response
  } catch (error: any) {
    skillState.value = null
    skillError.value = error?.data?.statusMessage ?? '스킬 설치 상태를 확인하지 못했습니다.'
  } finally { skillBusy.value = false }
}

async function installSelectedSkill() {
  if (!project.value?.source_root || skillBusy.value || selectedSkill.value?.state !== 'not_installed') return
  const confirmed = window.confirm(`${project.value.source_root}\n\n${platformLabel(launchPlatform.value)}용 Schema Workflow 스킬을 설치할까요?`)
  if (!confirmed) return
  skillBusy.value = true
  skillError.value = ''
  launchNotice.value = ''
  try {
    skillState.value = await $fetch<ProjectSkillManagementState>('/api/skills', {
      method: 'POST',
      body: { project_root: project.value.source_root, platform: launchPlatform.value, confirmed: true },
    })
    launchNotice.value = `${platformLabel(launchPlatform.value)} 스킬 설치와 무결성 확인을 완료했습니다.${launchPlatform.value === 'claude' ? ' 열려 있는 Claude Code는 다시 시작하세요.' : ''}`
  } catch (error: any) {
    skillError.value = error?.data?.statusMessage ?? '스킬을 설치하지 못했습니다.'
  } finally { skillBusy.value = false }
}

function skillStateLabel(skill: ProjectSkillStatus | null): string {
  if (!skill) return '상태 확인 필요'
  return {
    not_installed: '미설치',
    current: `설치됨 · v${skill.installed_version}`,
    update_required: `업데이트 필요 · v${skill.installed_version ?? '?'}`,
    modified: '파일 변경 감지',
    unmanaged: '관리되지 않는 스킬',
    invalid: '설치 정보 오류',
  }[skill.state]
}

async function approveAutoTrust() {
  if (!project.value?.source_root || autoTrustBusy.value) return
  const confirmed = window.confirm(`${project.value.source_root}\n\n이 프로젝트에서 ${platformLabel(launchPlatform.value)} 자동 승인 실행을 허용할까요?`)
  if (!confirmed) return
  autoTrustBusy.value = true
  launchError.value = ''
  try {
    autoTrustStatus.value = await $fetch<TrustedAutoStatus>('/api/launch/trust', { method: 'POST', body: { project_root: project.value.source_root, platform: launchPlatform.value, approved: true } })
    launchNotice.value = `${platformLabel(launchPlatform.value)} 자동 실행을 이 프로젝트에만 승인했습니다.`
  } catch (error: any) {
    launchError.value = error?.data?.statusMessage ?? '자동 실행을 승인하지 못했습니다.'
  } finally { autoTrustBusy.value = false }
}

async function revokeAutoTrust() {
  if (!project.value?.source_root || autoTrustBusy.value || autoTrustStatus.value?.source !== 'dashboard') return
  if (!window.confirm(`${platformLabel(launchPlatform.value)} 자동 실행 승인을 해제할까요?`)) return
  autoTrustBusy.value = true
  launchError.value = ''
  try {
    autoTrustStatus.value = await $fetch<TrustedAutoStatus>('/api/launch/trust', { method: 'DELETE', query: { project_root: project.value.source_root, platform: launchPlatform.value } })
    launchNotice.value = '이 프로젝트의 자동 실행 승인을 해제했습니다.'
  } catch (error: any) {
    launchError.value = error?.data?.statusMessage ?? '자동 실행 승인을 해제하지 못했습니다.'
  } finally { autoTrustBusy.value = false }
}

watch([launchPlatform, () => project.value?.source_root], () => {
  if (launchModeOpen.value) {
    skillState.value = null
    void Promise.all([refreshAutoTrustStatus(), refreshSkillState()])
  }
})

async function prepareLaunch() {
  if (!project.value?.source_root || !selectedSession.value || launchBusy.value) return
  launchBusy.value = true
  launchError.value = ''
  launchNotice.value = ''
  try {
    const response = await $fetch<{ status: string; request: LaunchRequestRecord; prompt_text: string }>('/api/launch/prepare', {
      method: 'POST',
      body: {
        project_root: project.value.source_root,
        session_id: selectedSession.value.session_id,
        platform: launchPlatform.value,
        mode: launchSafetyMode.value,
        task: launchTask.value,
        run_name: launchRunName.value,
        antigravity_new_project: antigravityNewProject.value,
      },
    })
    preparedLaunch.value = response.request
    preparedPrompt.value = response.prompt_text
    launchNotice.value = '프롬프트가 준비되었습니다. 복사한 뒤 VS Code 터미널의 에이전트에게 붙여넣으세요.'
  } catch (error: any) {
    launchError.value = error?.data?.statusMessage ?? 'CLI 실행을 준비하지 못했습니다.'
  } finally { launchBusy.value = false }
}
async function copyPreparedPrompt() {
  if (!preparedPrompt.value) return
  launchError.value = ''
  try {
    await navigator.clipboard.writeText(preparedPrompt.value)
    launchNotice.value = '전체 워크플로 프롬프트를 클립보드에 복사했습니다.'
  } catch {
    launchError.value = '프롬프트를 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인하세요.'
  }
}
async function openPreparedWorkspace() {
  if (!preparedLaunch.value || launchBusy.value) return
  launchBusy.value = true
  launchError.value = ''
  try {
    const response = await $fetch<{ status: string; open_uri: string; request: LaunchRequestRecord }>('/api/launch/open-vscode', {
      method: 'POST',
      body: { project_root: preparedLaunch.value.project_root, launch_id: preparedLaunch.value.launch_id },
    })
    preparedLaunch.value = response.request
    window.location.assign(response.open_uri)
    launchNotice.value = '지정한 작업 폴더를 VS Code에서 열었습니다. 터미널에서 플랫폼 CLI를 실행한 뒤 복사한 프롬프트를 붙여넣으세요.'
  } catch (error: any) {
    launchError.value = error?.data?.statusMessage ?? 'VS Code 작업 공간을 열지 못했습니다.'
  } finally { launchBusy.value = false }
}
async function executePreparedLaunch() {
  if (!preparedLaunch.value || launchBusy.value) return
  launchBusy.value = true
  launchError.value = ''
  try {
    const response = await $fetch<{ status: string; request: LaunchRequestRecord }>('/api/launch/execute', {
      method: 'POST',
      body: { project_root: preparedLaunch.value.project_root, launch_id: preparedLaunch.value.launch_id, confirmed: true },
    })
    preparedLaunch.value = response.request
    launchNotice.value = response.request.mode === 'confirm_launch' ? '새 PowerShell 창을 열었습니다. 작업 반복이 멈춘 뒤 Run 연결 확인을 누르세요.' : '새 PowerShell 창에서 프로젝트 격리 자동 실행을 시작했습니다. 작업 반복이 멈춘 뒤 Run 연결 확인을 누르세요.'
  } catch (error: any) {
    launchError.value = error?.data?.statusMessage ?? 'CLI를 시작하지 못했습니다.'
  } finally { launchBusy.value = false }
}
async function reconcilePreparedLaunch() {
  if (!preparedLaunch.value || launchBusy.value) return
  launchBusy.value = true
  launchError.value = ''
  try {
    const response = await $fetch<{ status: string; request?: LaunchRequestRecord; message?: string }>('/api/launch/reconcile', {
      method: 'POST', body: { project_root: preparedLaunch.value.project_root, launch_id: preparedLaunch.value.launch_id },
    })
    if (response.request) preparedLaunch.value = response.request
    if (response.status === 'bound') {
      launchNotice.value = `Run ${response.request?.run_id ?? ''}을 현재 작업 세션에 연결했습니다. 이는 관계 연결 완료이며 제품 완료 판정은 아닙니다.`
      await refresh()
    } else if (response.status === 'failed') {
      const failureMessage = response.request?.error?.message ?? 'CLI 프로세스가 Run을 생성하지 않고 종료되었습니다.'
      const logMessage = response.request?.execution_log_path ? ` 실행 로그: ${response.request.execution_log_path}` : ''
      launchError.value = `${failureMessage}${logMessage}`
      launchNotice.value = ''
      preparedLaunch.value = null
    } else if (response.status === 'relation_mismatch') {
      launchError.value = response.request?.relationship_validation.errors.join(' ') || response.message || '작업 관계 계약이 Run manifest와 일치하지 않습니다.'
      launchNotice.value = 'Run 연결을 보류했습니다. 관계 계약을 수정한 뒤 다시 확인하세요.'
    } else launchNotice.value = response.message ?? '아직 실행 결과를 찾지 못했습니다. CLI 작업이 끝난 뒤 다시 확인하세요.'
  } catch (error: any) {
    launchError.value = error?.data?.statusMessage ?? 'Run 연결 상태를 확인하지 못했습니다.'
  } finally { launchBusy.value = false }
}

function startMetadataEdit(run: WorkflowRun | undefined = selectedRun.value) {
  if (!run) return
  selectedRunId.value = run.run_id
  draftTitle.value = run.display_title ?? ''
  draftNote.value = run.user_note ?? ''
  draftTags.value = (run.tags ?? []).join(', ')
  draftDisplayStatus.value = run.display_status ?? 'active'
  metadataError.value = ''
  editMode.value = true
}
function cancelMetadataEdit() {
  editMode.value = false
  metadataError.value = ''
}
async function saveMetadataEdit() {
  if (!selectedRun.value || metadataSaving.value) return
  metadataSaving.value = true
  metadataError.value = ''
  try {
    await $fetch('/api/run-metadata', {
      method: 'PATCH',
      body: {
        run_id: selectedRun.value.run_id,
        display_title: draftTitle.value,
        user_note: draftNote.value,
        tags: draftTags.value.split(',').map(tag => tag.trim()).filter(Boolean),
        display_status: draftDisplayStatus.value,
      },
    })
    await refresh()
    editMode.value = false
  } catch {
    metadataError.value = '저장하지 못했습니다. 입력 내용과 저장 경로를 확인해 주세요.'
  } finally {
    metadataSaving.value = false
  }
}
function startSessionMetadataEdit(session: WorkSession | undefined = selectedSession.value) {
  if (!session || source.value?.mode !== 'live') return
  selectedSessionId.value = session.session_id
  sessionDisplayNameDraft.value = session.name
  sessionMetadataError.value = ''
  sessionMetadataEditOpen.value = true
}
async function saveSessionMetadataEdit() {
  if (!project.value?.source_root || !selectedSession.value || sessionMetadataSaving.value) return
  sessionMetadataSaving.value = true
  sessionMetadataError.value = ''
  try {
    await $fetch('/api/session-metadata', {
      method: 'PATCH',
      body: {
        project_root: project.value.source_root,
        session_id: selectedSession.value.session_id,
        display_name: sessionDisplayNameDraft.value,
      },
    })
    await refresh()
    sessionMetadataEditOpen.value = false
  } catch (error: any) {
    sessionMetadataError.value = error?.data?.statusMessage ?? '작업 세션 이름을 저장하지 못했습니다.'
  } finally {
    sessionMetadataSaving.value = false
  }
}
function startRelationReview(session: WorkSession | undefined = selectedSession.value) {
  if (!session || source.value?.mode !== 'live') return
  selectedSessionId.value = session.session_id
  selectedRunId.value = session.runs[0]?.run_id ?? ''
  relationSessionName.value = session.name
  relationError.value = ''
  relationMode.value = true
}
async function confirmSelectedSession() {
  if (!project.value?.source_root || !selectedSession.value || relationSaving.value) return
  relationSaving.value = true
  relationError.value = ''
  try {
    await $fetch('/api/relationships', {
      method: 'POST',
      body: {
        project_root: project.value.source_root,
        expected_revision: project.value.relationship_revision ?? 0,
        session_id: selectedSession.value.session_id,
        session_name: relationSessionName.value,
        run_ids: selectedSession.value.runs.map(run => run.run_id),
        evidence_refs: [...new Set(selectedSession.value.runs.flatMap(run => run.evidence_ids ?? []))],
        operation_kind: selectedSession.value.operation_kind ?? 'independent',
        anchor_run_id: selectedSession.value.anchor_run_id ?? null,
      },
    })
    await refresh()
    relationMode.value = false
  } catch (error: any) {
    relationError.value = error?.data?.statusMessage ?? '관계를 저장하지 못했습니다. 새로고침 후 다시 확인해 주세요.'
  } finally {
    relationSaving.value = false
  }
}
watch(sessions, (value) => {
  if (!value.length) return
  if (!value.some(session => session.session_id === selectedSessionId.value)) selectedSessionId.value = value[0]!.session_id
  if (!allRuns.value.some(run => run.run_id === selectedRunId.value)) selectedRunId.value = value[0]!.runs[0]?.run_id ?? ''
}, { immediate: true })
function chooseSession(session: WorkSession) { selectedSessionId.value = session.session_id; selectedRunId.value = session.runs[0]?.run_id ?? '' }

async function saveSessionOrder(sortMode: SessionSortMode, sessionIds: string[]) {
  if (!project.value?.source_root || source.value?.mode !== 'live' || sessionOrderSaving.value) return
  sessionOrderSaving.value = true
  sessionOrderError.value = ''
  try {
    await $fetch('/api/session-order', {
      method: 'PATCH',
      body: { project_root: project.value.source_root, sort_mode: sortMode, session_ids: sessionIds },
    })
    await refresh()
    sessionOrderDraft.value = []
  } catch (error: any) {
    sessionOrderError.value = error?.data?.statusMessage ?? '작업 세션 순서를 저장하지 못했습니다.'
    sessionOrderDraft.value = []
  } finally {
    sessionOrderSaving.value = false
  }
}

function changeSessionSort(event: Event) {
  const mode = (event.target as HTMLSelectElement).value as SessionSortMode
  const manualOrder = project.value?.session_manual_order?.filter(id => sessions.value.some(session => session.session_id === id)) ?? []
  const missingIds = sessions.value.map(session => session.session_id).filter(id => !manualOrder.includes(id))
  void saveSessionOrder(mode, [...manualOrder, ...missingIds])
}

function startSessionDrag(event: DragEvent, session: WorkSession) {
  if (sessionSortMode.value !== 'manual' || source.value?.mode !== 'live') {
    event.preventDefault()
    return
  }
  draggedSessionId.value = session.session_id
  sessionOrderDraft.value = visibleSessions.value.map(item => item.session_id)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', session.session_id)
  }
}

function dropSession(target: WorkSession) {
  const sourceId = draggedSessionId.value
  if (!sourceId || sourceId === target.session_id) return
  const order = [...sessionOrderDraft.value]
  const fromIndex = order.indexOf(sourceId)
  const targetIndex = order.indexOf(target.session_id)
  if (fromIndex < 0 || targetIndex < 0) return
  order.splice(fromIndex, 1)
  order.splice(targetIndex, 0, sourceId)
  sessionOrderDraft.value = order
}

function finishSessionDrag() {
  const order = sessionOrderDraft.value.length ? [...sessionOrderDraft.value] : visibleSessions.value.map(session => session.session_id)
  draggedSessionId.value = ''
  if (order.length) void saveSessionOrder('manual', order)
}
function chooseRun(run?: WorkflowRun) { if (run) selectedRunId.value = run.run_id }
function displayStatusLabel(run?: WorkflowRun) {
  const status = run?.display_status ?? 'active'
  return status === 'superseded' ? '대체됨' : status === 'archived' ? '보관됨' : '활성'
}
function runDisplayName(run?: WorkflowRun) {
  if (run?.display_title) return run.display_title
  if (!run?.run_id) return '실행 정보 없음'
  const parts = run.run_id.split('__')
  const name = parts.length > 1 ? (parts[1] ?? run.run_id) : run.run_id
  return name.replace(/[-_]+/g, ' ').trim() || '이름 없는 실행'
}
function runSystemLabel(run?: WorkflowRun) {
  if (run?.system_label) return run.system_label
  if (!run?.run_id) return '원본 용어 없음'
  const parts = run.run_id.split('__')
  return (parts.length > 1 ? (parts[1] ?? run.run_id) : run.run_id).replace(/[-_]+/g, ' ').trim()
}
function runShortRef(run?: WorkflowRun) {
  if (!run?.run_id) return ''
  const parts = run.run_id.split('__')
  const rawDate = parts[0] ?? ''
  const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})$/)
  const date = match ? `${match[2]}.${match[3]} ${match[4]}:${match[5]}` : formatRunTime(run)
  const reference = parts.at(-1)?.slice(-8) ?? run.run_id.slice(-8)
  return `${date} · #${reference}`
}
function runLabel(run?: WorkflowRun) { return run?.status === 'pass' ? '통과' : run?.status === 'evidence_insufficient' ? '근거 부족' : run?.status === 'hold' ? '보류' : '확인 필요' }
function platformLabel(value?: string) { return value === 'claude' ? 'Claude Code' : value === 'antigravity' ? 'Antigravity' : 'Codex CLI' }
function manualCliCommand(request: LaunchRequestRecord) {
  const automatic = request.mode === 'trusted_auto'
  if (request.platform === 'antigravity') {
    return `agy${automatic ? ' --dangerously-skip-permissions --mode accept-edits' : ''}${request.antigravity_new_project ? ' --new-project' : ''}`
  }
  if (request.platform === 'claude') return automatic ? 'claude --dangerously-skip-permissions' : 'claude'
  return automatic ? 'codex --sandbox workspace-write' : 'codex'
}
function formatRunTime(run?: WorkflowRun) { return run?.created_at ? run.created_at.slice(0, 16).replace('T', ' ') : '시간 정보 없음' }
</script>

<template>
  <div class="hybrid-app">
    <header class="hybrid-header">
      <div class="hybrid-brand"><span><GitBranch :size="18" /></span><div><strong>Schema Workflow</strong><small>{{ source?.mode === 'live' ? 'Live Read-only' : 'Operations Workspace' }}</small></div></div>
      <div class="view-toggle" aria-label="화면 보기"><button :class="{ active: viewMode === 'focus' }" @click="viewMode = 'focus'"><LayoutList :size="15" />집중 보기</button><button :class="{ active: viewMode === 'board' }" @click="viewMode = 'board'"><Columns3 :size="15" />보드 보기</button></div>
      <div class="header-tools"><label class="search-control"><Search :size="16" /><input placeholder="작업, 실행, 근거 검색" /></label><label class="project-select"><span class="sr-only">프로젝트 선택</span><select v-model="activeProjectRoot" @change="selectProjectRoot"><option v-for="item in data?.projects ?? []" :key="item.source_root" :value="item.source_root">{{ item.name }}</option></select></label><button class="icon-action" title="프로젝트 추가" @click="openProjectEditor"><FolderPlus :size="16" /></button><button class="launch-button" :disabled="source?.mode !== 'live' || !selectedSession" @click="openLaunchPanel"><Code2 :size="16" />작업 준비</button></div>
    </header>

    <main class="hybrid-main">
      <section v-if="source?.mode === 'live'" class="source-state" :class="{ warning: source.warnings.length > 0 }"><ShieldCheck :size="16" /><div><strong>현재 프로젝트 · 원본 읽기 전용 · 관계 Registry 별도 기록</strong><span>{{ project?.source_root ?? 'ProjectRoot 미설정' }}</span></div><em v-if="source.warnings.length">경고 {{ source.warnings.length }}</em></section>
      <section class="project-control-bar"><label><span>프로젝트</span><select v-model="activeProjectRoot" @change="selectProjectRoot"><option v-for="item in data?.projects ?? []" :key="item.source_root" :value="item.source_root">{{ item.name }}</option></select></label><button type="button" class="secondary-action" @click="openProjectEditor"><FolderPlus :size="15" />프로젝트 추가</button><button type="button" class="danger-action" title="대시보드 목록에서 제거" :disabled="activeCatalogProject?.origin !== 'catalog' || projectRemoving" @click="removeActiveProject"><Trash2 :size="15" /><span>목록에서 제거</span></button><button type="button" class="primary-action" :disabled="source?.mode !== 'live' || !project" @click="openSessionEditor"><Plus :size="15" />새 작업</button></section>
      <section class="hero-row">
        <div><p class="eyebrow">{{ project?.name }} / 현재 워크스페이스</p><h1>다음 행동에 집중하고, 필요할 때 전체 흐름을 보세요</h1><p>한 작업을 깊게 검토하는 화면과 여러 작업의 위치를 보는 화면을 분리했습니다.</p></div>
        <div class="summary-block"><article><span class="ok"><Check :size="17" /></span><div><small>통과</small><strong>{{ passCount }}</strong></div></article><article><span class="wait"><Clock3 :size="17" /></span><div><small>검토 필요</small><strong>{{ reviewCount }}</strong></div></article><article><span class="risk"><AlertTriangle :size="17" /></span><div><small>충돌</small><strong>{{ data?.conflicts.length ?? 0 }}</strong></div></article></div>
      </section>

      <section class="compact-flow" aria-label="진행 단계">
        <article class="done"><span><Check :size="14" /></span><div><small>01</small><strong>입력 준비</strong></div></article><ChevronRight :size="16" />
        <article :class="relationIssueCount ? 'warning' : 'done'"><span><Link2 :size="14" /></span><div><small>02</small><strong>관계 확인</strong></div><em>{{ relationIssueCount }}</em></article><ChevronRight :size="16" />
        <article :class="reviewCount ? 'active' : 'done'"><span><Play :size="13" /></span><div><small>03</small><strong>실행·검증</strong></div><em>{{ reviewCount }}</em></article><ChevronRight :size="16" />
        <article><span><UserCheck :size="14" /></span><div><small>04</small><strong>사용자 검토</strong></div><em>{{ passedRuns.length }}</em></article>
      </section>

      <section v-if="firstConflict" class="conflict-line"><AlertTriangle :size="17" /><div><strong>관계 확인이 필요합니다.</strong><span>{{ firstConflict.reason }}</span></div><button :disabled="!relationSessions.length" @click="startRelationReview(relationSessions[0])">관계 검토 <ArrowRight :size="14" /></button></section>

      <div class="desktop-content">
        <template v-if="viewMode === 'focus'">
          <section class="attention-queue">
            <div class="section-title"><div><p class="eyebrow">우선 검토</p><h2>지금 확인할 작업</h2></div><span>{{ attentionRuns.length }}개 대기</span></div>
            <div class="queue-items"><button v-for="run in attentionRuns" :key="run.run_id" :class="['queue-item', run.status, run.display_status ?? 'active', { selected: run.run_id === selectedRun?.run_id }]" @click="chooseRun(run)" @dblclick.stop="startMetadataEdit(run)"><span class="queue-icon">{{ run.status === 'hold' ? 'Ⅱ' : '!' }}</span><span class="queue-copy"><small>{{ platformLabel(run.platform) }} · {{ displayStatusLabel(run) }}</small><strong>{{ runDisplayName(run) }}</strong><em :title="run.run_id">{{ runSystemLabel(run) }} · {{ runShortRef(run) }}</em></span><span class="queue-counts"><small><FileCheck2 :size="13" />{{ run.evidence_count }}</small><small><Box :size="13" />{{ run.artifact_count }}</small></span><ChevronRight :size="17" /></button></div>
          </section>

          <section class="focus-workspace">
            <aside class="session-panel"><div class="panel-label session-label"><span>작업 세션</span><div class="session-tools"><label title="작업 세션 정렬"><span class="sr-only">작업 세션 정렬</span><select :value="sessionSortMode" :disabled="source?.mode !== 'live' || sessionOrderSaving" @change="changeSessionSort"><option value="manual">수동 순서</option><option value="newest">최신순</option><option value="oldest">오래된순</option><option value="name">이름순</option></select></label><button type="button" title="새 작업 세션" :disabled="source?.mode !== 'live'" @click="openSessionEditor"><Plus :size="14" /></button></div></div><button v-for="session in visibleSessions" :key="session.session_id" :draggable="sessionSortMode === 'manual' && source?.mode === 'live'" :class="{ active: session.session_id === selectedSessionId, dragging: session.session_id === draggedSessionId }" :title="sessionSortMode === 'manual' ? '드래그하여 순서 변경 · 더블클릭하여 이름 편집' : '수동 순서를 선택하면 드래그할 수 있습니다.'" @click="chooseSession(session)" @dblclick.stop="startSessionMetadataEdit(session)" @dragstart="startSessionDrag($event, session)" @dragover.prevent @drop.prevent="dropSession(session)" @dragend="finishSessionDrag"><GripVertical class="drag-handle" :size="13" /><span :class="session.relation_status" /><div><strong>{{ session.name }}</strong><small>{{ session.operation_kind === 'continue' ? '이어가기' : session.operation_kind === 'branch' ? '분기' : '새 작업' }} · {{ session.runs.length }}개 실행</small></div><ChevronRight :size="15" /></button><p v-if="sessionOrderError" class="session-order-error">{{ sessionOrderError }}</p><div v-if="!sessions.length" class="empty-session"><strong>아직 작업이 없습니다.</strong><small>+ 버튼으로 첫 작업 세션을 만드세요.</small></div><div class="readonly-note"><ShieldCheck :size="17" /><span><strong>{{ source?.mode === 'live' ? 'Engine 원본 보호됨' : 'Mock 원본 보호됨' }}</strong><small>{{ sessionSortMode === 'manual' ? '드래그 순서는 자동 저장됩니다.' : '자동 정렬 중 · 수동 순서는 보존됩니다.' }}</small></span></div></aside>
            <div class="run-panel"><div class="panel-heading"><div><p class="eyebrow">{{ project?.name }}</p><h2>{{ selectedSession?.name }}</h2></div><div class="relation-tools"><button class="edit-trigger" title="작업 세션 이름 편집" @click="startSessionMetadataEdit()"><Pencil :size="13" />이름 편집</button><span class="relation-state" :class="selectedSession?.relation_status"><Check v-if="selectedSession?.relation_status === 'confirmed'" :size="13" /><CircleHelp v-else :size="13" />{{ selectedSession?.relation_status === 'confirmed' ? '연결 확인됨' : '연결 확인 필요' }}</span><button v-if="selectedSession?.relation_status !== 'confirmed' && source?.mode === 'live'" @click="startRelationReview()">관계 확인</button></div></div><div class="run-list"><button v-for="run in selectedSession?.runs" :key="run.run_id" :class="['run-row', run.display_status ?? 'active', { selected: run.run_id === selectedRun?.run_id }]" @click="chooseRun(run)" @dblclick.stop="startMetadataEdit(run)"><span class="run-status" :class="run.status">{{ run.status === 'pass' ? '✓' : run.status === 'hold' ? 'Ⅱ' : '!' }}</span><span class="run-name" :title="run.run_id"><strong>{{ runDisplayName(run) }} <em class="display-status" :class="run.display_status ?? 'active'">{{ displayStatusLabel(run) }}</em></strong><small>원본 {{ runSystemLabel(run) }} · {{ runShortRef(run) }} · {{ platformLabel(run.platform) }}</small></span><span class="run-outcome"><strong>{{ runLabel(run) }}</strong><small>{{ run.next_action }}</small></span><ChevronRight :size="17" /></button></div></div>
            <aside v-if="selectedRun" class="decision-panel"><div class="decision-head"><span>선택한 실행 · {{ displayStatusLabel(selectedRun) }}</span><button class="edit-trigger" title="표시 정보 편집" @click="startMetadataEdit"><Pencil :size="13" />편집</button></div><div class="identity-block" title="더블클릭하여 표시 정보 편집" @dblclick="startMetadataEdit(selectedRun)"><strong :title="selectedRun.run_id">{{ runDisplayName(selectedRun) }}</strong><small>원본 {{ runSystemLabel(selectedRun) }} · {{ runShortRef(selectedRun) }}</small><p v-if="selectedRun.user_note">{{ selectedRun.user_note }}</p><div v-if="selectedRun.tags?.length" class="metadata-tags"><span v-for="tag in selectedRun.tags" :key="tag">{{ tag }}</span></div></div><div class="decision-state" :class="selectedRun.status"><small>현재 판정</small><strong>{{ runLabel(selectedRun) }}</strong><p>{{ selectedRun.next_action }}</p></div><div class="evidence-health"><div><span>근거 충족도</span><strong>{{ selectedRun.evidence_count ? '충족' : '부족' }}</strong></div><div><i :style="{ width: selectedRun.evidence_count ? '82%' : '18%' }" /></div><small>근거 {{ selectedRun.evidence_count }}개 · 산출물 {{ selectedRun.artifact_count }}개</small></div><div class="asset-links"><button><FileCheck2 :size="16" /><span><strong>근거</strong><small>{{ selectedRun.evidence_count }}개 연결</small></span><ChevronRight :size="14" /></button><button><FileText :size="16" /><span><strong>산출물</strong><small>{{ selectedRun.artifact_count }}개 등록</small></span><ChevronRight :size="14" /></button></div><button class="review-action">이 실행 검토하기 <ArrowRight :size="15" /></button></aside>
          </section>
        </template>

        <section v-else class="refined-board">
          <div class="board-column"><header><span class="input"><FileInput :size="16" /></span><strong>입력 준비</strong><em>{{ project ? 1 : 0 }}</em></header><article><small>PROJECT</small><h3>{{ project?.name ?? 'ProjectRoot 확인 필요' }}</h3><p>{{ sessions.length }}개 세션 · {{ allRuns.length }}개 실행을 읽었습니다.</p><footer><span class="pass"><Check :size="12" />읽기 완료</span></footer></article></div>
          <div class="board-column relationship"><header><span><Link2 :size="16" /></span><strong>관계 확인</strong><em>{{ relationIssueCount }}</em></header><article v-if="relationIssueCount === 0"><small>RELATION</small><h3>관계 확인 완료</h3><p>현재 범위에서 누락되거나 충돌한 실행 관계가 없습니다.</p><footer><span class="pass"><Check :size="12" />confirmed</span></footer></article><button v-for="session in relationSessions" v-else :key="session.session_id" @click="chooseRun(session.runs[0])"><small>WORK SESSION</small><h3>{{ session.name }}</h3><p>{{ session.relation_status }}</p><footer><span class="hold">확인 필요</span></footer></button><article v-for="conflict in data?.conflicts" :key="conflict.relation_id" class="conflict"><small>RELATION</small><h3>{{ conflict.source_id }}</h3><p>{{ conflict.reason }}</p><footer><span>! conflict</span></footer></article></div>
          <div class="board-column execution featured"><header><span><Play :size="15" /></span><strong>실행·검증</strong><em>{{ attentionRuns.length }}</em></header><article v-if="attentionRuns.length === 0"><small>RUN</small><h3>추가 검토 없음</h3><p>현재 읽은 실행은 모두 통과 상태입니다.</p><footer><span class="pass"><Check :size="12" />clear</span></footer></article><button v-for="run in attentionRuns" v-else :key="run.run_id" @click="chooseRun(run)"><small>원본 {{ runSystemLabel(run) }} · {{ platformLabel(run.platform) }}</small><h3 :title="run.run_id">{{ runDisplayName(run) }}</h3><p>{{ run.next_action }}</p><footer><span class="evidence">{{ runLabel(run) }}</span><em>근거 {{ run.evidence_count }}</em></footer></button></div>
          <div class="board-column review"><header><span><UserCheck :size="16" /></span><strong>사용자 검토</strong><em>{{ passedRuns.length }}</em></header><button v-for="run in passedRuns" :key="run.run_id" @click="chooseRun(run)"><small>원본 {{ runSystemLabel(run) }} · {{ platformLabel(run.platform) }}</small><h3 :title="run.run_id">{{ runDisplayName(run) }}</h3><p>{{ run.next_action }}</p><div class="ready-box"><CheckCircle2 :size="17" /><span><strong>검토 준비 완료</strong><small>산출물 {{ run.artifact_count }} · 근거 {{ run.evidence_count }}</small></span></div><footer><span class="pass"><Check :size="12" />통과</span></footer></button></div>
        </section>
      </div>

      <div v-if="projectEditorOpen" class="editor-backdrop" @click.self="projectEditorOpen = false"><section class="metadata-editor" role="dialog" aria-modal="true"><header><div><small>Project Catalog</small><h2>프로젝트 추가</h2></div><button type="button" title="닫기" @click="projectEditorOpen = false"><X :size="18" /></button></header><form @submit.prevent="saveProject"><label><span>프로젝트 폴더 경로</span><input v-model="projectRootDraft" placeholder="C:\Users\...\새 프로젝트" required /></label><label><span>표시 이름</span><input v-model="projectNameDraft" placeholder="비워두면 폴더명을 사용합니다." /></label><label class="check-line"><input v-model="createProjectDirectory" type="checkbox" /><span>폴더가 없으면 새로 만들기</span></label><p v-if="projectError" class="metadata-error">{{ projectError }}</p><footer><button type="button" class="cancel-edit" @click="projectEditorOpen = false">취소</button><button type="submit" class="save-edit" :disabled="projectSaving"><FolderPlus :size="15" />{{ projectSaving ? '추가 중' : '프로젝트 추가' }}</button></footer></form></section></div>
      <div v-if="sessionEditorOpen" class="editor-backdrop" @click.self="sessionEditorOpen = false"><section class="metadata-editor" role="dialog" aria-modal="true"><header><div><small>WorkSession</small><h2>새 작업 만들기</h2></div><button type="button" title="닫기" @click="sessionEditorOpen = false"><X :size="18" /></button></header><div class="system-reference"><span>현재 프로젝트</span><strong>{{ project?.name }}</strong><small>{{ project?.source_root }}</small></div><form @submit.prevent="saveWorkSession"><label><span>작업 이름</span><input v-model="sessionNameDraft" maxlength="120" placeholder="예: 고객 문의 분석" required /></label><fieldset><legend>작업 방식</legend><div class="launch-options"><label v-for="option in (['independent', 'continue', 'branch'] as OperationKind[])" :key="option" :class="{ active: sessionOperationKind === option }"><input v-model="sessionOperationKind" type="radio" :value="option" /><span>{{ option === 'independent' ? '새 작업' : option === 'continue' ? '이어가기' : '분기' }}</span></label></div><small>이어가기와 분기는 반드시 기준 Run을 선택해야 합니다.</small></fieldset><label v-if="sessionOperationKind !== 'independent'"><span>기준 Run</span><select v-model="sessionAnchorRunId" required><option value="" disabled>기준 Run 선택</option><option v-for="run in allRuns" :key="run.run_id" :value="run.run_id">{{ runDisplayName(run) }} · {{ runShortRef(run) }}{{ run.linked_session_ids.length > 1 ? ` · 세션 ${run.linked_session_ids.length}개 연결` : '' }}</option></select><small v-if="selectedAnchorRun">동일 Run을 사용하는 작업 세션: {{ selectedAnchorRun.linked_session_names.join(', ') }}</small></label><p v-if="sessionError" class="metadata-error">{{ sessionError }}</p><footer><button type="button" class="cancel-edit" @click="sessionEditorOpen = false">취소</button><button type="submit" class="save-edit" :disabled="sessionSaving"><Plus :size="15" />{{ sessionSaving ? '생성 중' : '작업 만들기' }}</button></footer></form></section></div>
      <div v-if="launchModeOpen && selectedSession" class="editor-backdrop">
        <section class="metadata-editor launch-editor" role="dialog" aria-modal="true" aria-labelledby="launch-editor-title">
          <header><div><small>VS Code 작업 준비</small><h2 id="launch-editor-title">{{ selectedSession.name }}</h2></div><button type="button" title="닫기" @click="launchModeOpen = false"><X :size="18" /></button></header>
          <div class="system-reference"><span>ProjectRoot · {{ selectedSession.operation_kind === 'continue' ? '이어가기' : selectedSession.operation_kind === 'branch' ? '분기' : '새 작업' }}</span><strong>{{ project?.name }}</strong><small>{{ project?.source_root }}<template v-if="selectedSession.anchor_run_id"> · 기준 {{ selectedSession.anchor_run_id }}</template></small></div>
          <div v-if="!preparedLaunch && (selectedSession.operation_kind ?? 'independent') === 'independent' && suggestedContinuationRun" class="continuation-guide"><AlertTriangle :size="17" /><div><strong>기존 목표를 계속한다면 이어가기로 실행하세요.</strong><small>지금 준비하면 새 독립 Run이 생성됩니다. 최신 Run {{ runShortRef(suggestedContinuationRun) }}을 기준으로 이어가기 작업을 만들 수 있습니다.</small></div><button type="button" @click="openContinuationSessionEditor">이어가기 만들기</button></div>
          <form v-if="!preparedLaunch" @submit.prevent="prepareLaunch">
            <fieldset><legend>플랫폼</legend><div class="launch-options"><label v-for="option in (['codex', 'claude', 'antigravity'] as LaunchPlatform[])" :key="option" :class="{ active: launchPlatform === option }"><input v-model="launchPlatform" type="radio" :value="option" /><span>{{ platformLabel(option) }}</span></label></div><div class="skill-status" :class="selectedSkill?.state ?? 'loading'"><ShieldCheck :size="18" /><div><strong>{{ skillBusy ? '스킬 상태 확인 중' : skillStateLabel(selectedSkill) }}</strong><small>{{ selectedSkill?.message ?? '선택한 프로젝트의 스킬을 확인합니다.' }}</small><code v-if="selectedSkill">{{ selectedSkill.target }}</code></div><button v-if="selectedSkill?.state === 'not_installed'" type="button" :disabled="skillBusy" @click="installSelectedSkill">설치</button><button v-else type="button" :disabled="skillBusy" title="스킬 상태 새로고침" @click="refreshSkillState">확인</button></div><small v-if="skillState?.engine_release">활성 엔진 {{ skillState.engine_release }} · 요구 스킬 v{{ skillState.expected_skill_version }}</small><p v-if="skillError" class="metadata-error">{{ skillError }}</p></fieldset>
            <label><span>실행 이름</span><input v-model="launchRunName" maxlength="120" required /></label>
            <label><span>문제 상황</span><textarea v-model="launchTask" rows="10" placeholder="이번 작업에서 해결할 문제와 원하는 결과를 적어주세요. 장문은 원문 파일로 안전하게 보존됩니다." required /><small>{{ launchTask.length.toLocaleString() }}자 · 실행 준비 시 원문 파일과 SHA-256을 함께 기록합니다.</small></label>
            <label v-if="launchPlatform === 'antigravity'" class="check-line"><input v-model="antigravityNewProject" type="checkbox" /><span>현재 폴더를 Antigravity에 최초 등록</span></label>
            <details class="advanced-launch"><summary>고급 자동 실행 설정</summary><fieldset><legend>PowerShell 자동 실행 방식</legend><div class="launch-options two"><label :class="{ active: launchSafetyMode === 'confirm_launch' }"><input v-model="launchSafetyMode" type="radio" value="confirm_launch" /><span>확인 후 실행</span></label><label :class="{ active: launchSafetyMode === 'trusted_auto' }"><input v-model="launchSafetyMode" type="radio" value="trusted_auto" /><span>격리 경로 자동 실행</span></label></div><small>기본 운영은 VS Code 수동 작업입니다. 자동 실행은 반복 작업에만 사용하세요.</small><div v-if="launchSafetyMode === 'trusted_auto'" class="auto-trust-card" :class="{ approved: autoTrustStatus?.approved }"><ShieldCheck :size="18" /><div><strong>{{ autoTrustBusy ? '승인 상태 확인 중' : autoTrustStatus?.approved ? '이 프로젝트 자동 실행 허용' : '자동 실행 승인 필요' }}</strong><small>{{ autoTrustStatus?.source === 'environment' ? '환경 설정에서 허용된 경로입니다.' : autoTrustStatus?.grant ? `${platformLabel(launchPlatform)} · ${new Date(autoTrustStatus.grant.approved_at).toLocaleString('ko-KR')}` : '현재 프로젝트와 선택한 플랫폼에만 권한을 부여합니다.' }}</small></div><button v-if="!autoTrustStatus?.approved" type="button" :disabled="autoTrustBusy" @click="approveAutoTrust">승인</button><button v-else-if="autoTrustStatus.source === 'dashboard'" type="button" :disabled="autoTrustBusy" @click="revokeAutoTrust">해제</button></div></fieldset></details>
            <p v-if="launchError" class="metadata-error">{{ launchError }}</p>
            <footer><button type="button" class="cancel-edit" @click="launchModeOpen = false">취소</button><button type="submit" class="save-edit" :disabled="launchBusy || skillBusy || selectedSkill?.state !== 'current' || (launchSafetyMode === 'trusted_auto' && !autoTrustStatus?.approved)"><FileText :size="15" />{{ launchBusy ? '준비 중' : '프롬프트 준비' }}</button></footer>
          </form>
          <div v-else class="launch-review">
            <div class="launch-state"><span>{{ preparedLaunch.status === 'prepared' ? '프롬프트 준비 완료' : preparedLaunch.status === 'workspace_opened' ? 'VS Code 작업 대기' : preparedLaunch.status === 'launched' ? '자동 실행 중' : preparedLaunch.status === 'relation_mismatch' ? '관계 불일치 · 연결 보류' : 'Run 연결 완료 · 제품 완료와 별도' }}</span><strong>{{ platformLabel(preparedLaunch.platform) }} · {{ preparedLaunch.mode === 'trusted_auto' ? '프로젝트 격리 자동 작업' : 'VS Code 수동 작업' }}</strong><small>{{ preparedLaunch.operation_id }}</small></div>
            <dl><div><dt>문제 상황</dt><dd>{{ preparedLaunch.task }}</dd></div><div><dt>터미널 시작 명령</dt><dd><code>{{ manualCliCommand(preparedLaunch) }}</code></dd></div><div><dt>복사할 프롬프트 파일</dt><dd><code>{{ preparedLaunch.prompt_path }}</code></dd></div><div><dt>Context Capsule</dt><dd><code>{{ preparedLaunch.capsule_path }}</code></dd></div></dl>
            <p v-if="launchNotice" class="launch-notice">{{ launchNotice }}</p><p v-if="launchError" class="metadata-error">{{ launchError }}</p>
            <details v-if="preparedLaunch.status === 'prepared'" class="advanced-launch advanced-run"><summary>고급: PowerShell에서 자동 실행</summary><button type="button" class="cancel-edit" :disabled="launchBusy" @click="executePreparedLaunch"><Play :size="15" />{{ launchBusy ? '시작 중' : '자동 실행' }}</button></details>
            <footer><button type="button" class="cancel-edit" @click="preparedLaunch = null; preparedPrompt = ''">다시 작성</button><button v-if="preparedLaunch.status !== 'bound'" type="button" class="cancel-edit" @click="copyPreparedPrompt"><Copy :size="15" />프롬프트 복사</button><button v-if="preparedLaunch.status === 'prepared' || preparedLaunch.status === 'workspace_opened'" type="button" class="save-edit" :disabled="launchBusy" @click="openPreparedWorkspace"><Code2 :size="15" />{{ launchBusy ? '여는 중' : 'VS Code에서 열기' }}</button><button v-if="preparedLaunch.status === 'workspace_opened' || preparedLaunch.status === 'launched'" type="button" class="save-edit" :disabled="launchBusy" @click="reconcilePreparedLaunch"><Link2 :size="15" />{{ launchBusy ? '확인 중' : 'Run 연결 확인' }}</button><button v-if="preparedLaunch.status === 'bound'" type="button" class="save-edit" @click="launchModeOpen = false"><Check :size="15" />완료</button></footer>
          </div>
        </section>
      </div>
      <div v-if="sessionMetadataEditOpen && selectedSession" class="editor-backdrop" @click.self="sessionMetadataEditOpen = false"><section class="metadata-editor" role="dialog" aria-modal="true" aria-labelledby="session-metadata-editor-title"><header><div><small>작업 세션 표시 이름 편집</small><h2 id="session-metadata-editor-title">{{ selectedSession.name }}</h2></div><button type="button" title="닫기" @click="sessionMetadataEditOpen = false"><X :size="18" /></button></header><div class="system-reference"><span>고정 원본 이름</span><strong>{{ selectedSession.system_name ?? selectedSession.name }}</strong><small>{{ selectedSession.session_id }}</small></div><form @submit.prevent="saveSessionMetadataEdit"><label><span>표시 이름</span><input v-model="sessionDisplayNameDraft" maxlength="120" required /><small>대시보드에서만 바뀌며 원본 세션과 관계 기록은 유지됩니다.</small></label><p v-if="sessionMetadataError" class="metadata-error">{{ sessionMetadataError }}</p><footer><button type="button" class="cancel-edit" @click="sessionMetadataEditOpen = false">취소</button><button type="submit" class="save-edit" :disabled="sessionMetadataSaving"><Save :size="15" />{{ sessionMetadataSaving ? '저장 중' : '저장' }}</button></footer></form></section></div>
      <div v-if="editMode && selectedRun" class="editor-backdrop" @click.self="cancelMetadataEdit"><section class="metadata-editor" role="dialog" aria-modal="true" aria-labelledby="metadata-editor-title"><header><div><small>표시 정보 편집</small><h2 id="metadata-editor-title">{{ runDisplayName(selectedRun) }}</h2></div><button type="button" title="닫기" @click="cancelMetadataEdit"><X :size="18" /></button></header><div class="system-reference"><span>고정 원본 용어</span><strong>{{ runSystemLabel(selectedRun) }}</strong><small>{{ selectedRun.run_id }}</small></div><form @submit.prevent="saveMetadataEdit"><label><span>운영 상태</span><select v-model="draftDisplayStatus"><option value="active">활성 · 현재 판단에 사용</option><option value="superseded">대체됨 · 새 결과로 교체됨</option><option value="archived">보관됨 · 참고 이력만 유지</option></select><small>엔진 판정과 원본 Run은 바뀌지 않습니다.</small></label><label><span>표시명</span><input v-model="draftTitle" maxlength="120" :placeholder="runSystemLabel(selectedRun)" /><small>비워두면 원본 용어로 돌아갑니다.</small></label><label><span>사용자 메모</span><textarea v-model="draftNote" maxlength="2000" rows="5" placeholder="검토 내용이나 작업 목적을 기록하세요." /></label><label><span>태그</span><input v-model="draftTags" placeholder="예: 리서치, MVP, 재검토" /><small>쉼표로 구분하며 최대 8개까지 저장됩니다.</small></label><p v-if="metadataError" class="metadata-error">{{ metadataError }}</p><footer><button type="button" class="cancel-edit" @click="cancelMetadataEdit">취소</button><button type="submit" class="save-edit" :disabled="metadataSaving"><Save :size="15" />{{ metadataSaving ? '저장 중' : '저장' }}</button></footer></form></section></div>
      <div v-if="relationMode && selectedSession" class="editor-backdrop" @click.self="relationMode = false"><section class="metadata-editor relation-editor" role="dialog" aria-modal="true" aria-labelledby="relation-editor-title"><header><div><small>관계 확인</small><h2 id="relation-editor-title">작업 세션 확정</h2></div><button type="button" title="닫기" @click="relationMode = false"><X :size="18" /></button></header><div class="system-reference"><span>확정할 Run</span><strong>{{ selectedSession.runs.length }}개 실행</strong><small>{{ selectedSession.runs.map(run => run.run_id).join(' · ') }}</small></div><form @submit.prevent="confirmSelectedSession"><label><span>작업 세션 이름</span><input v-model="relationSessionName" maxlength="120" required /><small>이 이름 아래에 표시된 Run을 연결합니다.</small></label><div class="relation-warning"><AlertTriangle :size="16" /><p>Engine 원본은 변경하지 않습니다. 현재 관계는 별도 Registry에 기록되고 기존 관계가 있으면 이력으로 보존됩니다.</p></div><p v-if="relationError" class="metadata-error">{{ relationError }}</p><footer><button type="button" class="cancel-edit" @click="relationMode = false">취소</button><button type="submit" class="save-edit" :disabled="relationSaving"><Link2 :size="15" />{{ relationSaving ? '확인 중' : '관계 확정' }}</button></footer></form></section></div>

      <section class="mobile-pipeline" aria-label="모바일 작업 흐름">
        <div class="mobile-stage complete"><header><span><FileInput :size="16" /></span><div><small>01</small><strong>프로젝트·작업 세션</strong></div><em>{{ project ? '완료' : '확인' }}</em></header><article><h2>{{ project?.name ?? 'ProjectRoot 확인 필요' }}</h2><p>{{ sessions.length }}개 세션과 {{ allRuns.length }}개 실행을 읽었습니다.</p><span class="mobile-tag pass"><Check :size="12" />읽기 전용</span></article><button v-for="session in visibleSessions" :key="session.session_id" :class="{ 'mobile-session-selected': session.session_id === selectedSessionId }" @click="chooseSession(session)"><h2>{{ session.name }}</h2><p>{{ session.operation_kind === 'continue' ? '이어가기' : session.operation_kind === 'branch' ? '분기' : '새 작업' }} · {{ session.runs.length }}개 실행</p><span class="mobile-tag" :class="session.relation_status === 'confirmed' ? 'pass' : 'hold'"><Check v-if="session.relation_status === 'confirmed'" :size="12" />{{ session.relation_status === 'confirmed' ? '연결 확인' : '확인 필요' }}</span><ChevronRight :size="16" /></button><article v-if="!sessions.length"><h2>아직 작업 세션이 없습니다.</h2><p>위의 새 작업 버튼으로 첫 작업 세션을 만드세요.</p></article></div>
        <div class="mobile-stage relation"><header><span><Link2 :size="16" /></span><div><small>02</small><strong>관계 확인</strong></div><em>{{ relationIssueCount }}건</em></header><article v-if="relationIssueCount === 0"><h2>관계 확인 완료</h2><p>현재 범위에서 누락되거나 충돌한 관계가 없습니다.</p><span class="mobile-tag pass"><Check :size="12" />정상</span></article><button v-for="session in relationSessions" v-else :key="session.session_id" @click="startRelationReview(session)"><h2>{{ session.name }}</h2><p>{{ session.relation_status }}</p><span class="mobile-tag hold">보류</span><ChevronRight :size="16" /></button><article v-for="conflict in data?.conflicts" :key="conflict.relation_id" class="mobile-conflict"><h2>{{ conflict.source_id }}</h2><p>{{ conflict.reason }}</p><span class="mobile-tag conflict">! 충돌</span></article></div>
        <div class="mobile-stage execution"><header><span><Play :size="15" /></span><div><small>03</small><strong>실행·검증</strong></div><em>{{ attentionRuns.length }}건</em></header><article v-if="attentionRuns.length === 0"><h2>추가 검토 없음</h2><p>현재 실행은 모두 통과 상태입니다.</p><span class="mobile-tag pass"><Check :size="12" />정상</span></article><button v-for="run in attentionRuns" v-else :key="run.run_id" @click="chooseRun(run)"><h2 :title="run.run_id">{{ runDisplayName(run) }}</h2><p>{{ run.next_action }}</p><span class="mobile-tag evidence">! {{ runLabel(run) }}</span><small>원본 {{ runSystemLabel(run) }} · {{ runShortRef(run) }}</small><ChevronRight :size="16" /></button></div>
        <div class="mobile-stage review"><header><span><UserCheck :size="16" /></span><div><small>04</small><strong>사용자 검토</strong></div><em>{{ passedRuns.length }}건</em></header><button v-for="run in passedRuns" :key="run.run_id" @click="chooseRun(run)"><h2 :title="run.run_id">{{ runDisplayName(run) }}</h2><p>{{ run.next_action }}</p><span class="mobile-tag pass"><Check :size="12" />통과</span><small>원본 {{ runSystemLabel(run) }} · {{ runShortRef(run) }}</small><ChevronRight :size="16" /></button></div>
        <aside v-if="selectedRun" class="mobile-detail"><div><span class="run-status" :class="selectedRun.status">{{ selectedRun.status === 'pass' ? '✓' : selectedRun.status === 'hold' ? 'Ⅱ' : '!' }}</span><div><small>현재 선택 · {{ displayStatusLabel(selectedRun) }} · 원본 {{ runSystemLabel(selectedRun) }}</small><strong :title="selectedRun.run_id">{{ runDisplayName(selectedRun) }}</strong></div></div><p>{{ selectedRun.user_note || selectedRun.next_action }}</p><div><span>근거 {{ selectedRun.evidence_count }}</span><span>산출물 {{ selectedRun.artifact_count }}</span><button title="표시 정보 편집" @click="startMetadataEdit"><Pencil :size="14" />편집</button></div></aside>
      </section>
    </main>
  </div>
</template>

<style scoped>
@font-face{font-family:PretendardLocal;src:url('/fonts/PretendardVariable.woff2') format('woff2');font-weight:100 900;font-style:normal;font-display:swap}
.hybrid-app{min-height:100vh;font-family:PretendardLocal,"Segoe UI",sans-serif;background:#f3f6f5;color:#1c272b}.hybrid-header{height:66px;padding:0 24px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;background:#fff;border-bottom:1px solid #d8dfde;position:sticky;top:0;z-index:20}.hybrid-brand,.header-tools,.view-toggle,.hero-row,.summary-block,.compact-flow,.compact-flow article,.conflict-line,.section-title,.queue-item,.queue-counts,.panel-heading,.run-row,.decision-head,.evidence-health>div:first-child,.refined-board header,.refined-board footer,.mobile-stage header,.mobile-stage button,.mobile-detail>div,.mobile-detail>div:last-child{display:flex;align-items:center}.hybrid-brand{gap:10px}.hybrid-brand>span{width:34px;height:34px;display:grid;place-items:center;background:#173d34;color:#fff;border-radius:5px}.hybrid-brand div{display:grid;gap:2px}.hybrid-brand strong{font-size:13px}.hybrid-brand small{color:#75817d;font-size:9px}.view-toggle{gap:3px;padding:3px;background:#edf1ef;border-radius:5px}.view-toggle button{height:29px;padding:0 10px;display:flex;align-items:center;gap:6px;border:0;background:transparent;color:#687672;border-radius:4px;font-size:9px;font-weight:750}.view-toggle button.active{background:#fff;color:#1f5e47;box-shadow:0 1px 3px #16342c1c}.header-tools{justify-content:flex-end;gap:7px}.header-tools .search-control{width:min(210px,17vw);height:34px;padding:0 9px;display:flex;align-items:center;gap:7px;border:1px solid #dbe2e0;background:#f7f9f8;border-radius:5px;color:#75817d}.header-tools input{min-width:0;width:100%;border:0;outline:0;background:transparent;font-size:9px}.context-button,.launch-button{height:34px;padding:0 10px;display:flex;align-items:center;gap:6px;border-radius:5px;font-size:9px;font-weight:750}.context-button{border:1px solid #ccd5d2;background:#fff;color:#43524d}.launch-button{border:0;background:#1f7254;color:#fff}.hybrid-main{width:min(1280px,calc(100% - 40px));margin:auto;padding:30px 0 50px}.source-state{min-height:42px;margin-bottom:16px;padding:8px 11px;display:flex;align-items:center;gap:9px;color:#2f6c56;background:#edf7f2;border:1px solid #cfe3da;border-radius:5px}.source-state.warning{color:#955714;background:#fff8ed;border-color:#ead2ad}.source-state div{min-width:0;display:grid;gap:2px}.source-state strong{font-size:9px}.source-state span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:inherit;font:8px "Cascadia Code",monospace}.source-state em{margin-left:auto;font-size:8px;font-style:normal;font-weight:800}.hero-row{justify-content:space-between;gap:24px}.hero-row nav{display:flex;align-items:center;gap:8px;margin-bottom:8px}.hero-row nav a{display:flex;align-items:center;gap:4px;color:#516f65;text-decoration:none;font-size:9px;font-weight:750}.hero-row nav span{color:#7a8783;font-size:9px}.eyebrow{margin:0 0 6px;color:#6e7c77;font-size:9px;font-weight:800;text-transform:uppercase}.hero-row h1{margin:0;font-size:24px}.hero-row>div>p:last-child{margin:7px 0 0;color:#687672;font-size:11px}.summary-block{background:#fff;border:1px solid #d9e0de;border-radius:6px}.summary-block article{height:58px;min-width:96px;padding:0 12px;display:flex;align-items:center;gap:8px;border-right:1px solid #e2e7e5}.summary-block article:last-child{border-right:0}.summary-block article>span{width:29px;height:29px;display:grid;place-items:center;border-radius:5px}.summary-block .ok{color:#1f7254;background:#e8f3ed}.summary-block .wait{color:#a96014;background:#fbf0df}.summary-block .risk{color:#ad433e;background:#f9e9e7}.summary-block article div{display:grid;gap:2px}.summary-block small{color:#77837f;font-size:8px}.summary-block strong{font-size:16px}.compact-flow{margin-top:22px;padding:12px 16px;background:#fff;border:1px solid #d9e0de;border-radius:6px}.compact-flow>svg{flex:1;color:#b4bfbb}.compact-flow article{min-width:150px;gap:8px}.compact-flow article>span{width:31px;height:31px;display:grid;place-items:center;border:1px solid #ccd6d2;border-radius:50%;color:#72807b}.compact-flow article.done>span{color:#1f7254;background:#e8f3ed;border-color:#acd0c1}.compact-flow article.warning>span{color:#a96014;background:#fbf0df;border-color:#e1bd8a}.compact-flow article.active>span{color:#356f91;background:#e8f1f6;border-color:#adc5d3}.compact-flow article div{display:grid;gap:2px}.compact-flow small{color:#8a9591;font-size:8px}.compact-flow strong{font-size:10px}.compact-flow em{margin-left:auto;min-width:18px;padding:2px 5px;text-align:center;background:#edf1ef;border-radius:9px;color:#687672;font-size:8px;font-style:normal}.conflict-line{margin-top:12px;min-height:45px;padding:8px 11px;gap:9px;color:#a3453f;background:#fff8f7;border:1px solid #eacbc7;border-left:4px solid #b24942;border-radius:5px}.conflict-line div{flex:1;display:flex;align-items:center;gap:8px}.conflict-line strong{color:#563f3c;font-size:10px}.conflict-line span{color:#816b67;font-size:9px}.conflict-line button{height:28px;padding:0 8px;display:flex;align-items:center;gap:4px;border:1px solid #d9aaa6;background:#fff;color:#99413b;border-radius:4px;font-size:8px;font-weight:750}.attention-queue{margin-top:22px}.section-title{justify-content:space-between;margin-bottom:9px}.section-title h2{margin:0;font-size:15px}.section-title>span{color:#75817d;font-size:9px}.queue-items{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.queue-item{min-height:72px;padding:10px 12px;gap:10px;text-align:left;background:#fff;border:1px solid #dce3e0;border-radius:5px;color:inherit}.queue-item:hover,.queue-item.selected{border-color:#9ab9ad;background:#f8fbf9}.queue-icon{width:31px;height:31px;display:grid;place-items:center;border:1px solid currentColor;border-radius:50%;color:#a96014;background:#fbf0df;font-size:9px}.queue-item.hold .queue-icon{color:#657178;background:#edf0f1}.queue-copy{min-width:0;flex:1;display:grid;gap:3px}.queue-copy small{color:#7b8783;font-size:8px}.queue-copy strong{font-size:11px}.queue-copy em{overflow:hidden;text-overflow:ellipsis;color:#788580;font:8px "Cascadia Code",monospace;font-style:normal}.queue-counts{gap:8px}.queue-counts small{display:flex;align-items:center;gap:4px;color:#66746f;font-size:8px}.focus-workspace{margin-top:18px;display:grid;grid-template-columns:220px minmax(0,1fr) 290px;background:#fff;border:1px solid #d8dfdd;border-radius:6px;overflow:hidden}.session-panel{padding:13px;background:#f8faf9;border-right:1px solid #dce2e0}.panel-label{padding:0 7px 9px;color:#7b8783;font-size:9px;font-weight:800}.session-panel>button{width:100%;min-height:57px;padding:8px;display:grid;grid-template-columns:8px 1fr 15px;gap:7px;align-items:center;text-align:left;border:1px solid transparent;background:transparent;border-radius:5px}.session-panel>button.active{background:#fff;border-color:#d7e0dd}.session-panel>button>span{width:7px;height:7px;border-radius:50%;background:#9aa5a1}.session-panel>button>span.confirmed{background:#1f7254}.session-panel>button>span.unresolved{background:#b66a18}.session-panel>button div{min-width:0;display:grid;gap:4px}.session-panel strong,.session-panel small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.session-panel strong{font-size:10px}.session-panel small{color:#798581;font-size:8px}.readonly-note{margin-top:14px;padding:10px;display:flex;gap:8px;color:#326c56;background:#eaf4ef;border-radius:5px}.readonly-note span{display:grid;gap:3px}.readonly-note strong{font-size:9px}.readonly-note small{font-size:8px}.run-panel{min-width:0;padding:18px}.panel-heading{justify-content:space-between}.panel-heading h2{margin:0;font-size:16px}.relation-state{padding:4px 7px;display:flex;align-items:center;gap:4px;border-radius:999px;font-size:8px;font-weight:800}.relation-state.confirmed{color:#1f7254;background:#e8f3ed}.relation-state.unresolved{color:#a96014;background:#fbf0df}.run-list{margin-top:14px;display:grid;gap:7px}.run-row{min-height:66px;padding:9px 10px;display:grid;grid-template-columns:31px minmax(120px,1fr) minmax(140px,1fr) 16px;gap:9px;align-items:center;text-align:left;border:1px solid #dfe5e3;background:#fff;border-radius:5px;color:inherit}.run-row:hover,.run-row.selected{background:#f3f8f5;border-color:#a9c5ba}.run-status{width:29px;height:29px;display:grid;place-items:center;border:1px solid currentColor;border-radius:50%;font-size:9px}.run-status.pass{color:#1f7254;background:#e8f3ed}.run-status.evidence_insufficient{color:#a96014;background:#fbf0df}.run-status.hold{color:#657178;background:#edf0f1}.run-name,.run-outcome{min-width:0;display:grid;gap:4px}.run-name strong{font-size:10px;font-weight:800}.run-name small,.run-outcome small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#77837f;font-size:8px}.run-outcome strong{font-size:9px}.decision-panel{padding:15px;background:#f8faf9;border-left:1px solid #dce2e0}.decision-head{justify-content:space-between}.decision-head span{color:#7a8682;font-size:8px}.edit-trigger{height:27px;padding:0 7px;display:flex;align-items:center;gap:4px;border:1px solid #ccd6d2;background:#fff;color:#356957;border-radius:4px;font-size:8px;font-weight:800;cursor:pointer}.decision-state{margin-top:12px;padding:12px;border:1px solid #dce2e0;border-left:4px solid #6c7974;background:#fff;border-radius:5px}.decision-state.pass{border-left-color:#1f7254}.decision-state.evidence_insufficient{border-left-color:#a96014}.decision-state small{color:#78847f;font-size:8px}.decision-state strong{display:block;margin-top:4px;font-size:14px}.decision-state p{margin:5px 0 0;color:#6c7974;font-size:9px}.evidence-health{margin-top:10px;padding:11px;background:#fff;border:1px solid #dfe5e3;border-radius:5px}.evidence-health>div:first-child{justify-content:space-between;font-size:8px}.evidence-health>div:nth-child(2){height:5px;margin:8px 0;background:#e5eae8;border-radius:4px;overflow:hidden}.evidence-health i{display:block;height:100%;background:#2b775c}.evidence-health small{color:#75817d;font-size:8px}.asset-links{margin-top:8px;display:grid;gap:5px}.asset-links button{min-height:44px;padding:7px 8px;display:grid;grid-template-columns:16px 1fr 14px;gap:7px;align-items:center;text-align:left;border:1px solid #dfe5e3;background:#fff;border-radius:5px}.asset-links span{display:grid;gap:2px}.asset-links strong{font-size:8px}.asset-links small{color:#7a8682;font-size:7px}.review-action{width:100%;height:33px;margin-top:9px;display:flex;align-items:center;justify-content:center;gap:5px;border:0;background:#1f7254;color:#fff;border-radius:5px;font-size:9px;font-weight:750}.refined-board{margin-top:18px;display:grid;grid-template-columns:.85fr 1fr 1.2fr 1fr;gap:9px}.board-column{min-width:0;padding:8px;background:#eaf0ee;border:1px solid #d7dfdc;border-radius:6px}.board-column>header{height:38px;padding:0 4px;gap:7px}.board-column>header>span{width:27px;height:27px;display:grid;place-items:center;background:#e5f0eb;color:#3a725e;border-radius:5px}.board-column.relationship>header>span{background:#f8ead6;color:#9b5b17}.board-column.execution>header>span{background:#e6eff4;color:#356f91}.board-column.review>header>span{background:#edeaf5;color:#675c8c}.board-column header strong{font-size:9px}.board-column header em{margin-left:auto;min-width:17px;padding:2px 5px;text-align:center;background:#dce4e1;border-radius:9px;font-size:7px;font-style:normal}.board-column>article,.board-column>button{width:100%;margin-top:6px;padding:11px;display:block;text-align:left;background:#fff;border:1px solid #dbe2df;border-radius:5px;color:inherit}.board-column>button:hover,.board-column.featured>button{border-color:#93b3a7}.board-column small{color:#798581;font-size:7px}.board-column h3{margin:8px 0 4px;font-size:10px;overflow-wrap:anywhere}.board-column p{margin:0;color:#6d7a75;font-size:8px;line-height:1.45}.board-column footer{justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px solid #e6ebe9}.board-column footer span{font-size:7px}.board-column footer .pass{color:#1f7254}.board-column footer .hold{color:#68757a}.board-column footer .evidence{color:#a96014}.board-column article.conflict{border-left:3px solid #ad433e}.board-column article.conflict footer span{color:#ad433e}.mini-progress{height:5px;margin-top:10px;background:#e3e9e7;border-radius:4px;overflow:hidden}.mini-progress span{display:block;width:66%;height:100%;background:#b66b18}.ready-box{margin-top:9px;padding:8px;display:flex;align-items:center;gap:7px;color:#2f6c56;background:#edf7f2;border-radius:4px}.ready-box span{display:grid;gap:2px}.ready-box strong{font-size:8px}.identity-block{margin-top:9px;padding-bottom:10px;border-bottom:1px solid #e1e7e4;display:grid;gap:4px}.identity-block>strong{font-size:13px;overflow-wrap:anywhere}.identity-block>small{color:#75817d;font-size:7px;line-height:1.45}.identity-block>p{margin:4px 0 0;color:#51605b;font-size:9px;line-height:1.5}.metadata-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}.metadata-tags span{padding:3px 5px;color:#356957;background:#e8f3ed;border-radius:999px;font-size:7px;font-weight:750}.editor-backdrop{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:#17201d73;backdrop-filter:blur(2px)}.metadata-editor{width:min(520px,100%);max-height:calc(100vh - 40px);overflow:auto;background:#fff;border:1px solid #cbd6d2;border-radius:7px;box-shadow:0 22px 60px #10251d33}.metadata-editor>header{min-height:66px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e0e6e4}.metadata-editor>header div{display:grid;gap:3px}.metadata-editor>header small{color:#75817d;font-size:8px}.metadata-editor h2{margin:0;font-size:16px}.metadata-editor>header button{width:32px;height:32px;display:grid;place-items:center;border:0;background:#f1f4f3;color:#586660;border-radius:5px;cursor:pointer}.system-reference{margin:14px 16px 0;padding:10px 11px;display:grid;gap:3px;background:#f4f7f6;border-left:3px solid #73847e}.system-reference span{color:#77837f;font-size:8px}.system-reference strong{font-size:10px}.system-reference small{overflow-wrap:anywhere;color:#7b8783;font:7px "Cascadia Code",monospace}.metadata-editor form{padding:14px 16px 16px;display:grid;gap:12px}.metadata-editor label{display:grid;gap:5px}.metadata-editor label>span{font-size:9px;font-weight:800}.metadata-editor input,.metadata-editor textarea{width:100%;box-sizing:border-box;border:1px solid #cfd8d5;background:#fff;color:#1e2b27;border-radius:5px;font:11px PretendardLocal,"Segoe UI",sans-serif;outline:none}.metadata-editor input{height:38px;padding:0 10px}.metadata-editor textarea{padding:9px 10px;resize:vertical;line-height:1.5}.metadata-editor input:focus,.metadata-editor textarea:focus{border-color:#47836d;box-shadow:0 0 0 3px #3c7c6420}.metadata-editor label>small{color:#7a8782;font-size:8px}.metadata-error{margin:0;padding:8px 9px;color:#9d403a;background:#fff1ef;border-radius:4px;font-size:9px}.metadata-editor form>footer{display:flex;justify-content:flex-end;gap:7px;padding-top:3px}.metadata-editor form>footer button{height:34px;padding:0 12px;display:flex;align-items:center;justify-content:center;gap:5px;border-radius:5px;font-size:9px;font-weight:800;cursor:pointer}.cancel-edit{border:1px solid #ccd6d2;background:#fff;color:#53615c}.save-edit{border:0;background:#1f7254;color:#fff}.save-edit:disabled{opacity:.55;cursor:wait}.mobile-pipeline{display:none}
.relation-tools{display:flex;align-items:center;gap:6px}.relation-tools>button{height:27px;padding:0 8px;border:1px solid #d7a86c;background:#fff8ed;color:#915513;border-radius:4px;font-size:8px;font-weight:800;cursor:pointer}.relation-warning{padding:10px;display:flex;align-items:flex-start;gap:8px;color:#8f5518;background:#fff8ed;border:1px solid #ecd5b5;border-radius:5px}.relation-warning p{margin:0;font-size:9px;line-height:1.5}.conflict-line button:disabled{opacity:.5;cursor:not-allowed}
.launch-button:disabled{opacity:.45;cursor:not-allowed}.launch-editor{width:min(620px,100%)}.launch-editor fieldset{margin:0;padding:0;border:0;display:grid;gap:6px}.launch-editor legend{margin-bottom:6px;font-size:9px;font-weight:800}.launch-options{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.launch-options.two{grid-template-columns:repeat(2,1fr)}.launch-options label{height:38px;padding:0 10px;display:flex;align-items:center;justify-content:center;border:1px solid #d5ddda;background:#f7f9f8;border-radius:5px;cursor:pointer}.launch-options label.active{border-color:#3f7b65;background:#eaf4ef;color:#235c47}.launch-options input{position:absolute;opacity:0;pointer-events:none}.launch-options span{font-size:9px;font-weight:800}.launch-editor fieldset>small{color:#7a8782;font-size:8px}.check-line{display:flex!important;grid-template-columns:18px 1fr!important;align-items:center}.check-line input{width:15px!important;height:15px!important}.launch-review{padding:14px 16px 16px;display:grid;gap:12px}.launch-state{padding:11px;display:grid;gap:4px;background:#edf7f2;border-left:3px solid #34745b}.launch-state span{color:#34745b;font-size:8px;font-weight:800}.launch-state strong{font-size:11px}.launch-state small{overflow-wrap:anywhere;color:#6f7c77;font:8px "Cascadia Code",monospace}.launch-review dl{margin:0;display:grid;gap:8px}.launch-review dl>div{display:grid;gap:5px}.launch-review dt{font-size:8px;font-weight:800;color:#65736e}.launch-review dd{margin:0;color:#33413c;font-size:9px;line-height:1.5;overflow-wrap:anywhere}.launch-review code{display:block;padding:8px;background:#f3f6f5;border:1px solid #dce3e0;border-radius:4px;font-size:8px;line-height:1.5}.launch-notice{margin:0;padding:9px;color:#2d674f;background:#edf7f2;border-radius:4px;font-size:9px;line-height:1.5}.launch-review>footer{display:flex;justify-content:flex-end;gap:7px}.launch-review>footer button{height:34px;padding:0 12px;display:flex;align-items:center;gap:5px;border-radius:5px;font-size:9px;font-weight:800}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.project-select select,.project-control-bar select,.metadata-editor select{height:34px;border:1px solid #cfd8d5;background:#fff;color:#26342f;border-radius:5px;padding:0 28px 0 9px;font-size:9px}.project-select select{max-width:180px}.icon-action{width:34px;height:34px;display:grid;place-items:center;border:1px solid #ccd5d2;background:#fff;color:#356957;border-radius:5px}.project-control-bar{margin-bottom:16px;padding:9px 10px;display:flex;align-items:center;gap:7px;background:#fff;border:1px solid #d9e0de;border-radius:6px}.project-control-bar label{min-width:0;flex:1;display:flex;align-items:center;gap:8px}.project-control-bar label>span{font-size:9px;font-weight:800}.project-control-bar select{min-width:0;flex:1}.project-control-bar button{height:34px;padding:0 10px;display:flex;align-items:center;gap:5px;border-radius:5px;font-size:9px;font-weight:800}.secondary-action{border:1px solid #ccd5d2;background:#fff;color:#356957}.danger-action{border:1px solid #e2c7c4;background:#fff;color:#a2453f}.danger-action:disabled{opacity:.38;cursor:not-allowed}.primary-action{border:0;background:#1f7254;color:#fff}.primary-action:disabled{opacity:.45}.session-label{display:flex;align-items:center;justify-content:space-between}.session-label button{width:27px;height:27px;display:grid;place-items:center;border:1px solid #cbd7d2;background:#fff;color:#28664e;border-radius:4px}.empty-session{margin:6px 0 10px;padding:12px 8px;display:grid;gap:4px;color:#6b7873;background:#fff;border:1px dashed #cbd6d2;border-radius:5px}.empty-session strong{font-size:9px}.empty-session small{font-size:8px}.metadata-editor fieldset{margin:0;padding:0;border:0;display:grid;gap:6px}.metadata-editor legend{margin-bottom:6px;font-size:9px;font-weight:800}.metadata-editor fieldset>small{color:#7a8782;font-size:8px}.metadata-editor label>select{width:100%}
.mobile-session-selected{border-color:#79a894!important;background:#f0f7f4!important;box-shadow:inset 3px 0 #2e7559}
@media(max-width:1000px){.hybrid-header{grid-template-columns:1fr auto}.view-toggle{display:none}.header-tools .search-control,.context-button{display:none}.hybrid-main{width:calc(100% - 24px)}.compact-flow article{min-width:0;flex:1}.compact-flow article div{display:none}.compact-flow>svg{flex:0}.focus-workspace{grid-template-columns:190px 1fr}.decision-panel{grid-column:1/3;border-left:0;border-top:1px solid #dce2e0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px}.decision-state,.evidence-health{margin-top:0}.asset-links{margin-top:0}.review-action{grid-column:3;margin-top:0}.refined-board{grid-template-columns:repeat(2,1fr)}}
@media(max-width:700px){.hybrid-app{overflow-x:hidden}.hybrid-header{height:62px;padding:0 13px;grid-template-columns:minmax(0,1fr) auto;gap:8px}.hybrid-brand{min-width:0}.hybrid-brand div{min-width:0}.hybrid-brand strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hybrid-brand small,.header-tools{display:none}.hybrid-main{padding-top:20px}.hero-row{display:grid;min-width:0}.hero-row>div{min-width:0}.hero-row h1{max-width:100%;font-size:21px;overflow-wrap:anywhere}.hero-row>div>p:last-child{overflow-wrap:anywhere}.summary-block{width:100%;min-width:0}.summary-block article{min-width:0;flex:1}.compact-flow{padding:10px 8px}.compact-flow article{justify-content:center}.compact-flow article>span{width:29px;height:29px}.compact-flow>svg,.compact-flow article em{display:none}.conflict-line{align-items:flex-start;flex-wrap:wrap}.conflict-line div{min-width:0;display:grid;gap:3px}.conflict-line strong,.conflict-line span{overflow-wrap:anywhere}.conflict-line button{margin-left:26px}.desktop-content{display:none}.mobile-pipeline{margin-top:15px;display:grid;gap:9px}.mobile-stage{overflow:hidden;background:#eaf0ee;border:1px solid #d7dfdc;border-radius:6px}.mobile-stage>header{height:48px;padding:0 11px;gap:8px;background:#f7f9f8;border-bottom:1px solid #d9e0de}.mobile-stage>header>span{width:29px;height:29px;display:grid;place-items:center;background:#e5f0eb;color:#39705d;border-radius:5px}.mobile-stage.relation>header>span{color:#9b5b17;background:#f8ead6}.mobile-stage.execution>header>span{color:#356f91;background:#e6eff4}.mobile-stage.review>header>span{color:#675c8c;background:#edeaf5}.mobile-stage>header div{min-width:0;display:grid;gap:2px}.mobile-stage>header small,.mobile-stage>header strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mobile-stage>header small{color:#83908b;font-size:7px}.mobile-stage>header strong{font-size:10px}.mobile-stage>header em{margin-left:auto;padding:3px 6px;background:#e0e7e4;border-radius:9px;color:#697670;font-size:7px;font-style:normal}.mobile-stage>article,.mobile-stage>button{width:calc(100% - 16px);margin:8px;padding:11px;position:relative;display:block;text-align:left;background:#fff;border:1px solid #dce3e0;border-radius:5px;color:inherit}.mobile-stage button>svg{position:absolute;right:10px;top:50%;transform:translateY(-50%)}.mobile-stage h2{margin:0 30px 5px 0;font-size:11px;overflow-wrap:anywhere}.mobile-stage p{margin:0 30px 9px 0;color:#6d7975;font-size:9px;overflow-wrap:anywhere}.mobile-stage button>small{display:block;margin-top:7px;color:#7a8682;font-size:8px;overflow-wrap:anywhere}.mobile-tag{width:max-content;max-width:100%;padding:4px 6px;display:flex;align-items:center;gap:4px;border-radius:999px;font-size:7px;font-weight:800}.mobile-tag.pass{color:#1f7254;background:#e8f3ed}.mobile-tag.hold{color:#68757a;background:#edf0f1}.mobile-tag.conflict{color:#ad433e;background:#f9e9e7}.mobile-tag.evidence{color:#a96014;background:#fbf0df}.mobile-conflict{border-left:3px solid #ad433e!important}.mobile-detail{min-width:0;padding:12px;background:#fff;border:1px solid #ccd7d3;border-radius:6px}.mobile-detail>div:first-child{min-width:0;gap:8px}.mobile-detail>div:first-child div{min-width:0;display:grid;gap:2px}.mobile-detail small{color:#78847f;font-size:7px}.mobile-detail strong{font:9px "Cascadia Code",monospace;overflow-wrap:anywhere;word-break:break-word}.mobile-detail>p{margin:9px 0;color:#53615c;font-size:10px;overflow-wrap:anywhere}.mobile-detail>div:last-child{gap:10px;padding-top:9px;border-top:1px solid #e4e9e7}.mobile-detail>div:last-child span{min-width:0;color:#74817c;font-size:8px;overflow-wrap:anywhere}.mobile-detail button{margin-left:auto;height:29px;padding:0 8px;display:flex;align-items:center;gap:4px;border:0;background:#1f7254;color:#fff;border-radius:4px;font-size:8px;font-weight:750}}
@media(max-width:700px){.header-tools{display:flex}.header-tools .project-select,.header-tools .icon-action{display:none}.launch-button{min-width:0;padding:0 10px;justify-content:center;white-space:nowrap}.project-control-bar{width:100%;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.project-control-bar label{min-width:0;grid-column:1/-1}.project-control-bar button{min-width:0;max-width:100%;justify-content:center}.project-control-bar label>span{display:none}.project-control-bar .primary-action{grid-column:1/-1}.danger-action span{display:none}.danger-action{padding:0}.metadata-editor>header>div{min-width:0}.metadata-editor h2{overflow-wrap:anywhere}.system-reference strong,.system-reference small{overflow-wrap:anywhere}}
.advanced-launch{padding:9px 10px;border:1px solid #dce3e0;border-radius:5px;background:#f8faf9}.advanced-launch summary{cursor:pointer;color:#53635d;font-size:9px;font-weight:800}.advanced-launch[open] summary{margin-bottom:9px}.advanced-run button{height:32px;padding:0 10px;display:flex;align-items:center;gap:5px;border-radius:5px;font-size:9px;font-weight:800}.launch-review>footer{flex-wrap:wrap}.launch-review>footer button{justify-content:center}@media(max-width:700px){.launch-review>footer{display:grid;grid-template-columns:1fr 1fr}.launch-review>footer button{width:100%;padding:0 8px}.launch-review>footer .save-edit:last-child:nth-child(odd){grid-column:1/3}}
.auto-trust-card{margin-top:9px;padding:9px;display:grid;grid-template-columns:20px 1fr auto;align-items:center;gap:8px;color:#8d5317;background:#fff8ed;border:1px solid #ead2ad;border-radius:5px}.auto-trust-card.approved{color:#28664e;background:#edf7f2;border-color:#cfe3da}.auto-trust-card>div{min-width:0;display:grid;gap:2px}.auto-trust-card strong{font-size:9px}.auto-trust-card small{overflow-wrap:anywhere;color:inherit;font-size:8px;font-weight:400}.auto-trust-card button{height:28px;padding:0 8px;border:1px solid currentColor;background:#fff;color:inherit;border-radius:4px;font-size:8px;font-weight:800}.auto-trust-card button:disabled{opacity:.5}
.continuation-guide{margin:10px 16px 0;padding:10px;display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:8px;color:#8f5518;background:#fff8ed;border:1px solid #ecd5b5;border-radius:5px}.continuation-guide div{min-width:0;display:grid;gap:3px}.continuation-guide strong{font-size:9px}.continuation-guide small{color:inherit;font-size:8px;line-height:1.45}.continuation-guide button{height:29px;padding:0 9px;border:1px solid currentColor;background:#fff;color:inherit;border-radius:4px;font-size:8px;font-weight:800}
.skill-status{margin-top:4px;padding:9px;display:grid;grid-template-columns:20px minmax(0,1fr) auto;align-items:center;gap:8px;color:#8d5317;background:#fff8ed;border:1px solid #ead2ad;border-radius:5px}.skill-status.current{color:#28664e;background:#edf7f2;border-color:#cfe3da}.skill-status.modified,.skill-status.invalid,.skill-status.unmanaged{color:#9d403a;background:#fff1ef;border-color:#ebc9c5}.skill-status.loading{color:#5f6d68;background:#f4f7f6;border-color:#d9e1de}.skill-status>div{min-width:0;display:grid;gap:2px}.skill-status strong{font-size:9px}.skill-status small{color:inherit;font-size:8px;font-weight:400}.skill-status code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6d7a75;font:7px "Cascadia Code",monospace}.skill-status button{height:28px;padding:0 8px;border:1px solid currentColor;background:#fff;color:inherit;border-radius:4px;font-size:8px;font-weight:800}.skill-status button:disabled{opacity:.5}
.run-row.superseded,.run-row.archived{opacity:.64;background:#f5f7f6}.display-status{display:inline-flex;margin-left:5px;padding:2px 5px;border-radius:999px;font-size:7px;font-style:normal;vertical-align:middle}.display-status.active{color:#1f7254;background:#e8f3ed}.display-status.superseded{color:#8b5a18;background:#fbf0df}.display-status.archived{color:#657178;background:#e9edee}
.session-tools{display:flex;align-items:center;gap:4px}.session-tools label{display:block}.session-tools select{width:82px;height:27px;padding:0 20px 0 6px;border:1px solid #cbd7d2;background:#fff;color:#53625d;border-radius:4px;font-size:8px}.session-panel>button{padding:8px 6px;grid-template-columns:13px 8px minmax(0,1fr) 15px;gap:6px}.session-panel>button[draggable="true"]{cursor:grab}.session-panel>button[draggable="true"]:active{cursor:grabbing}.session-panel>button.dragging{opacity:.48;border-color:#77a28f;background:#edf6f2}.drag-handle{color:#9ba7a2}.session-panel>button:not([draggable="true"]) .drag-handle{opacity:.25}.session-order-error{margin:5px 5px 0;padding:6px 7px;color:#9d403a;background:#fff1ef;border-radius:4px;font-size:8px}.readonly-note span{min-width:0}.readonly-note small{white-space:normal}
</style>
