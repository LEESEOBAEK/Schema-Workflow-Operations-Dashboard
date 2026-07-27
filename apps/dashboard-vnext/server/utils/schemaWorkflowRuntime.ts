import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SchemaWorkflowChannel } from '../../shared/types/dashboard'

export function normalizeSchemaWorkflowChannel(value: unknown): SchemaWorkflowChannel {
  const channel = String(value || 'stable').trim().toLowerCase()
  if (channel === 'stable' || channel === 'candidate') return channel
  throw new Error(`Unsupported Schema Workflow channel: ${channel}`)
}

export function defaultSchemaWorkflowInstallRoot(channel: SchemaWorkflowChannel): string {
  return join(homedir(), channel === 'candidate' ? '.schema-workflow-candidate' : '.schema-workflow')
}

