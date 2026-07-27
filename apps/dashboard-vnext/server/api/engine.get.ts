import { dirname } from 'node:path'
import { inspectEngineReadiness } from '../utils/engineReadiness'
import { defaultSchemaWorkflowInstallRoot, normalizeSchemaWorkflowChannel } from '../utils/schemaWorkflowRuntime'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const channel = normalizeSchemaWorkflowChannel(config.schemaWorkflowChannel)
  const configuredLauncher = String(config.schemaWorkflowLauncher || '').trim()
  const installRoot = configuredLauncher
    ? dirname(dirname(configuredLauncher))
    : defaultSchemaWorkflowInstallRoot(channel)
  return inspectEngineReadiness({
    channel,
    installRoot,
    launcherPath: configuredLauncher || undefined,
    packageRoot: String(config.schemaWorkflowPackageRoot || '').trim() || undefined,
  })
})
