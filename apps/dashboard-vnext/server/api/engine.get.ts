import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { inspectEngineReadiness } from '../utils/engineReadiness'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const configuredLauncher = String(config.schemaWorkflowLauncher || '').trim()
  const installRoot = configuredLauncher
    ? dirname(dirname(configuredLauncher))
    : join(homedir(), '.schema-workflow-candidate')
  return inspectEngineReadiness({
    installRoot,
    launcherPath: configuredLauncher || undefined,
    packageRoot: String(config.schemaWorkflowPackageRoot || '').trim() || undefined,
  })
})
