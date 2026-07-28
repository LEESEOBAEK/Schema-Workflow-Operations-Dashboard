export type RelationStatus = 'confirmed' | 'unresolved' | 'conflict' | 'superseded'
export type RelationshipType = 'HAS_SESSION' | 'HAS_RUN' | 'CONTINUES' | 'BRANCHES_FROM' | 'SUPPORTED_BY' | 'PRODUCED' | 'HAS_DECISION'
export type RunStatus = 'pass' | 'evidence_insufficient' | 'hold' | 'unknown'
export type RunDisplayStatus = 'active' | 'superseded' | 'archived'
export type RunReviewStatus = 'unreviewed' | 'approved' | 'changes_requested' | 'deferred'
export type SessionSortMode = 'manual' | 'newest' | 'oldest' | 'name'
export type DashboardMode = 'mock' | 'live'
export type LaunchPlatform = 'codex' | 'claude' | 'antigravity'
export type LaunchMode = 'confirm_launch' | 'trusted_auto'
export type OperationKind = 'independent' | 'continue' | 'branch'
export type EngineRelationType = 'independent' | 'continuation' | 'branch'
export type ResultRunPolicy = 'create_new' | 'reuse_anchor'
export type SkillInstallationState = 'not_installed' | 'current' | 'update_required' | 'modified' | 'unmanaged' | 'invalid'
export type EngineReadinessStatus = 'ready' | 'not_installed' | 'invalid'
export type SchemaWorkflowChannel = 'stable' | 'candidate'
export type PipelineReviewStatus = 'PASS' | 'EVIDENCE_NEEDED' | 'HOLD' | 'NOT_RUN'

export interface RunReferenceDetail {
  id: string
  title: string
  summary: string
  status?: string
  path?: string
  type?: string
  role?: string
}

export type ExecutionTemplateKind = 'project_start' | 'feature_change' | 'maintenance_fix' | 'completion_review' | 'continuation' | 'branch'

export interface ExecutionTemplateOption {
  template_id: string
  version: string
  kind: ExecutionTemplateKind
  name: string
  description: string
  use_when: string
  required_inputs: string[]
}

export interface ExecutionTemplateCatalog {
  templates: ExecutionTemplateOption[]
}

export interface ExecutionTemplateRenderResult {
  template: ExecutionTemplateOption
  markdown: string
  saved: boolean
  output_path: string | null
  session_id: string | null
  relationship_revision: number | null
  operation_kind: OperationKind | null
}

export interface PipelineReviewStage {
  id: 'brief' | 'relation' | 'execution' | 'evidence' | 'artifacts' | 'validation'
  label: string
  status: PipelineReviewStatus
  summary: string
  source_path?: string
}

export interface PipelineReviewIssue {
  code: string
  severity: 'error' | 'warning' | 'information'
  message: string
  source_path?: string
}

export interface PipelineReviewBriefSection {
  id: string
  title: string
  content: string
}

export interface PipelineReviewRun {
  run_id: string
  label: string
  status: RunStatus
  platform: LaunchPlatform
  created_at: string
  next_action: string
  source_path: string
  evidence: RunReferenceDetail[]
  artifacts: RunReferenceDetail[]
  warnings: string[]
}

export interface PipelineReviewOverview {
  project_root: string
  session_id: string
  session_name: string
  operation_kind: OperationKind
  relation_status: RelationStatus
  anchor_run_id: string | null
  status: PipelineReviewStatus
  template: ExecutionTemplateOption | null
  brief: {
    available: boolean
    path: string | null
    title: string
    current_situation: string
    markdown: string
    sections: PipelineReviewBriefSection[]
    placeholder_count: number
    validation_marker_count: number
    unchecked_item_count: number
  }
  runs: PipelineReviewRun[]
  stages: PipelineReviewStage[]
  issues: PipelineReviewIssue[]
  summary: {
    run_count: number
    pass_count: number
    evidence_count: number
    artifact_count: number
    warning_count: number
  }
}

export interface EngineReadinessState {
  status: EngineReadinessStatus
  channel: SchemaWorkflowChannel
  install_root: string
  launcher_path: string
  active_release: string | null
  package_root: string | null
  package_release: string | null
  package_available: boolean
  can_install: boolean
  message: string
}

export interface ProjectSkillStatus {
  platform: LaunchPlatform
  state: SkillInstallationState
  target: string
  installed_version: string | null
  expected_version: string
  channel: string | null
  changed_files: string[]
  compatible_platforms: string[]
  restart_required: boolean
  message: string
}

export interface ProjectSkillManagementState {
  project_root: string
  engine_release: string | null
  expected_skill_version: string
  skills: ProjectSkillStatus[]
}

export interface TrustedAutoGrant {
  grant_id: string
  project_root: string
  platform: LaunchPlatform
  approved_at: string
  approved_by: 'user'
}

export interface TrustedAutoRegistry {
  schema_version: '1.0.0'
  revision: number
  grants: TrustedAutoGrant[]
  updated_at: string
}

export interface TrustedAutoStatus {
  project_root: string
  platform: LaunchPlatform
  approved: boolean
  grant: TrustedAutoGrant | null
  revision: number
  source: 'dashboard' | 'environment' | null
}

export interface DashboardWarning {
  code: string
  message: string
  created_at?: string
  source_path?: string
  run_id?: string
}

export interface RunMetadataUpdate {
  run_id: string
  display_title: string
  user_note: string
  tags: string[]
  display_status?: RunDisplayStatus
  review_status?: RunReviewStatus
  review_note?: string
}

export interface SessionMetadataUpdate {
  project_root: string
  session_id: string
  display_name: string
}

export interface SessionOrderUpdate {
  project_root: string
  sort_mode: SessionSortMode
  session_ids: string[]
}

export interface WorkflowRun {
  run_id: string
  status: RunStatus
  platform: 'codex' | 'claude' | 'antigravity'
  next_action: string
  artifact_count: number
  evidence_count: number
  operation_id?: string
  workspace_id?: string
  parent_run_id?: string | null
  relation_type?: string
  artifact_ids?: string[]
  evidence_ids?: string[]
  artifact_details?: RunReferenceDetail[]
  evidence_details?: RunReferenceDetail[]
  created_at?: string
  source_path?: string
  warnings?: string[]
  system_label?: string
  display_title?: string
  user_note?: string
  tags?: string[]
  metadata_updated_at?: string
  display_status?: RunDisplayStatus
  review_status?: RunReviewStatus
  review_note?: string
  reviewed_at?: string
}

export interface WorkSession {
  session_id: string
  name: string
  system_name?: string
  metadata_updated_at?: string
  relation_status: RelationStatus
  candidate_project_ids?: string[]
  root_run_id?: string
  relation_id?: string
  relation_revision?: number
  operation_kind?: OperationKind
  anchor_run_id?: string | null
  execution_brief_path?: string | null
  template_id?: string | null
  runs: WorkflowRun[]
}

export interface WorkflowProject {
  project_id: string
  name: string
  source_root?: string
  relationship_revision?: number
  session_sort_mode?: SessionSortMode
  session_manual_order?: string[]
  sessions: WorkSession[]
}

export interface RelationConflict {
  relation_id: string
  source_id: string
  target_id: string
  reason: string
}

export interface DashboardSource {
  mode: DashboardMode
  read_at: string
  project_roots: string[]
  active_project_root?: string
  warnings: DashboardWarning[]
}

export interface DashboardState {
  schema_version: string
  projects: WorkflowProject[]
  conflicts: RelationConflict[]
  source?: DashboardSource
  relationship_revision?: number
}

export interface RelationshipRecord {
  schema_version: '1.0.0'
  relation_id: string
  source_id: string
  relation_type: RelationshipType
  target_id: string
  status: RelationStatus
  evidence_refs: string[]
  created_at: string
  created_by: 'user' | 'relationship_gateway' | 'migration'
  supersedes_relation_id: string | null
}

export interface ConfirmSessionRequest {
  project_root: string
  expected_revision: number
  session_id: string
  session_name: string
  run_ids: string[]
  evidence_refs: string[]
  operation_kind?: OperationKind
  anchor_run_id?: string | null
}

export interface CreateWorkSessionRequest {
  project_root: string
  expected_revision: number
  session_name: string
  operation_kind: OperationKind
  anchor_run_id?: string | null
  execution_brief_path?: string | null
  template_id?: string | null
}

export interface RemoveWorkSessionRequest {
  project_root: string
  expected_revision: number
  session_id: string
  session_name?: string
  run_ids?: string[]
}

export interface ProjectCatalogEntry {
  source_root: string
  display_name: string
  origin: 'environment' | 'catalog'
  added_at: string
}

export interface ProjectCatalogState {
  schema_version: '1.0.0'
  revision: number
  active_project_root: string | null
  projects: ProjectCatalogEntry[]
  updated_at: string
}

export interface ContextCapsule {
  capsule_version: '1.0.0'
  project_id: string
  session_id: string
  pending_run: true
  relation_status: RelationStatus
  operation_kind: OperationKind
  anchor_run_id?: string
  relationship_contract: RelationshipContract
  required_action: 'start_workflow'
  source_refs: string[]
  evidence_refs?: string[]
  artifact_refs?: string[]
  summary: string
}

export interface RelationshipContract {
  contract_version: '1.0.0'
  operation_kind: OperationKind
  result_run_policy: ResultRunPolicy
  expected_relation_type: EngineRelationType
  anchor_run_id: string | null
  delivery_policy: 'required'
}

export interface RelationshipValidation {
  status: 'pending' | 'pass' | 'fail'
  checked_at: string | null
  expected: RelationshipContract
  actual_run_id: string | null
  actual_relation_type: string | null
  actual_parent_run_id: string | null
  operation_source: 'run' | 'continuation' | null
  errors: string[]
}

export interface RequestIntegrity {
  algorithm: 'sha256'
  sha256: string
  character_count: number
  byte_count: number
  source_path: string
  verified: boolean
}

export interface LaunchPrepareRequest {
  project_root: string
  session_id: string
  platform: LaunchPlatform
  mode: LaunchMode
  task: string
  run_name: string
  antigravity_new_project?: boolean
}

export interface LaunchRequestRecord {
  schema_version: '1.0.0'
  launch_id: string
  operation_id: string
  project_id: string
  project_root: string
  session_id: string
  session_name: string
  operation_kind: OperationKind
  anchor_run_id: string | null
  relationship_contract: RelationshipContract
  relationship_validation: RelationshipValidation
  platform: LaunchPlatform
  schema_workflow_channel: SchemaWorkflowChannel
  mode: LaunchMode
  task: string
  request_integrity: RequestIntegrity
  run_name: string
  antigravity_new_project: boolean
  status: 'prepared' | 'workspace_opened' | 'launched' | 'bound' | 'relation_mismatch' | 'failed'
  created_at: string
  workspace_opened_at?: string | null
  launched_at: string | null
  bound_at: string | null
  run_id: string | null
  command_preview: string
  request_dir: string
  capsule_path: string
  prompt_path: string
  script_path: string
  workspace_script_path?: string
  bridge_script_path?: string
  terminal_process_path?: string
  process_id?: number
  terminal_process_id?: number
  execution_log_path?: string
  platform_log_path?: string
  process_result_path?: string
  exit_code?: number | null
  process_exited_at?: string | null
  error?: { code: string; message: string }
}
