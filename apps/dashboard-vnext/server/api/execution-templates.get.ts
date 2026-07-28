import type { ExecutionTemplateCatalog } from '../../shared/types/dashboard'
import { executionTemplates } from '../utils/executionTemplateCatalog'

export default defineEventHandler((): ExecutionTemplateCatalog => ({
  templates: executionTemplates(),
}))
