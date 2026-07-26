import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const sample = JSON.parse(await readFile(resolve(root, 'sample-project.json'), 'utf8'))
const workflow = JSON.parse(await readFile(resolve(root, 'mock-workflow.json'), 'utf8'))
const dashboard = JSON.parse(await readFile(resolve(root, 'dashboard_mock_state.json'), 'utf8'))

const fail = message => {
  throw new Error(`Demo validation failed: ${message}`)
}

const unique = (items, label) => {
  if (new Set(items).size !== items.length) fail(`${label} contains duplicates`)
}

const project = sample.project
if (!project || project.project_id !== dashboard.projects?.[0]?.project_id) fail('project binding mismatch')

const sessions = project.work_sessions ?? []
const runs = workflow.runs ?? []
const operations = workflow.operations ?? []
const evidence = workflow.evidence ?? []
const artifacts = workflow.artifacts ?? []

unique(sessions.map(item => item.session_id), 'session ids')
unique(runs.map(item => item.run_id), 'run ids')
unique(operations.map(item => item.operation_id), 'operation ids')
unique(evidence.map(item => item.evidence_id), 'evidence ids')
unique(artifacts.map(item => item.artifact_id), 'artifact ids')

const sessionIds = new Set(sessions.map(item => item.session_id))
const runIds = new Set(runs.map(item => item.run_id))
const evidenceIds = new Set(evidence.map(item => item.evidence_id))
const artifactIds = new Set(artifacts.map(item => item.artifact_id))

for (const operation of operations) {
  if (!sessionIds.has(operation.session_id)) fail(`unknown session ${operation.session_id}`)
  if (!runIds.has(operation.run_id)) fail(`unknown run ${operation.run_id}`)
}

for (const run of runs) {
  if (run.parent_run_id && !runIds.has(run.parent_run_id)) fail(`unknown parent ${run.parent_run_id}`)
  if (run.relation_type === 'independent' && run.parent_run_id !== null) fail(`independent run ${run.run_id} has parent`)
  if (run.relation_type === 'branch' && !run.parent_run_id) fail(`branch run ${run.run_id} has no parent`)
  for (const id of run.evidence_ids ?? []) if (!evidenceIds.has(id)) fail(`unknown evidence ${id}`)
  for (const id of run.artifact_ids ?? []) if (!artifactIds.has(id)) fail(`unknown artifact ${id}`)
}

if (!/^[a-f0-9]{64}$/.test(workflow.input_contract?.value ?? '')) fail('input SHA-256 format')

const serialized = JSON.stringify({ sample, workflow, dashboard })
if (/[A-Z]:\\\\Users\\\\|\/Users\/|\/home\//i.test(serialized)) fail('absolute user path found')
if (/sk-[a-z0-9_-]{16,}/i.test(serialized)) fail('secret-like token found')

console.log(
  `Demo validation passed: 1 project, ${sessions.length} sessions, ${runs.length} runs, ${operations.length} operations, ${evidence.length} evidence, ${artifacts.length} artifacts.`,
)
