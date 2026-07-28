import { describe, expect, it } from 'vitest'
import { executionTemplates, renderExecutionTemplate, templateOperationKind } from '../server/utils/executionTemplateCatalog'

describe('execution template catalog', () => {
  it('provides templates for the full project lifecycle', () => {
    expect(executionTemplates().map(template => template.kind)).toEqual([
      'project_start',
      'feature_change',
      'maintenance_fix',
      'completion_review',
      'continuation',
      'branch',
    ])
  })

  it('renders a project execution copy with traceability and validation boundaries', () => {
    const markdown = renderExecutionTemplate({
      projectRoot: 'C:\\Projects\\demo',
      templateId: 'maintenance-fix',
      title: '검색 결과 중복 수정',
      situation: '동일한 Run이 검색 결과에 두 번 표시된다.',
      anchorRunId: 'run_001',
      constraints: '엔진 원본 데이터는 변경하지 않는다.',
      createdAt: '2026-07-27T12:00:00.000Z',
    })

    expect(markdown).toContain('TemplateId: `maintenance-fix`')
    expect(markdown).toContain('기준 Run: `run_001`')
    expect(markdown).toContain('## 3. 문제 재현')
    expect(markdown).toContain('요구사항과 작업 연결')
    expect(markdown).toContain('validation_needed')
    expect(markdown).toContain('엔진 원본 데이터는 변경하지 않는다.')
  })

  it('maps every template to the same WorkSession operation contract', () => {
    expect(templateOperationKind('project_start')).toBe('independent')
    expect(templateOperationKind('feature_change')).toBe('continue')
    expect(templateOperationKind('maintenance_fix')).toBe('continue')
    expect(templateOperationKind('completion_review')).toBe('continue')
    expect(templateOperationKind('continuation')).toBe('continue')
    expect(templateOperationKind('branch')).toBe('branch')
  })
})
