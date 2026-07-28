import type { ExecutionTemplateKind, ExecutionTemplateOption, OperationKind } from '../../shared/types/dashboard'

export interface ExecutionTemplateInput {
  projectRoot: string
  templateId: string
  title: string
  situation: string
  anchorRunId?: string
  constraints?: string
  createdAt: string
}

const templates: ExecutionTemplateOption[] = [
  {
    template_id: 'project-start',
    version: '0.1.0',
    kind: 'project_start',
    name: '새 프로젝트 시작',
    description: '현재 상황에서 문제, 목표, 범위와 첫 실행 기준을 확정합니다.',
    use_when: '새로운 프로젝트나 독립 작업을 처음 시작할 때',
    required_inputs: ['작업 제목', '현재 상황'],
  },
  {
    template_id: 'feature-change',
    version: '0.1.0',
    kind: 'feature_change',
    name: '기능 추가·변경',
    description: '기존 기준을 보존하면서 새로운 요구사항과 영향 범위를 연결합니다.',
    use_when: '기존 프로젝트에 기능을 추가하거나 동작을 변경할 때',
    required_inputs: ['작업 제목', '변경 상황', '기준 Run 또는 기존 명세'],
  },
  {
    template_id: 'maintenance-fix',
    version: '0.1.0',
    kind: 'maintenance_fix',
    name: '유지보수·버그 수정',
    description: '증상, 재현 조건, 원인 후보, 수정 경계와 회귀 검증을 관리합니다.',
    use_when: '오류 수정, 운영 보완, 리팩터링 또는 성능 개선이 필요할 때',
    required_inputs: ['작업 제목', '증상 또는 개선 상황', '기준 Run 또는 기존 명세'],
  },
  {
    template_id: 'completion-review',
    version: '0.1.0',
    kind: 'completion_review',
    name: '완료 검토',
    description: '최초 목표와 결과를 대조하고 남은 문제와 후속 작업을 정리합니다.',
    use_when: '구현이나 실험을 마감하고 완료 여부를 판단할 때',
    required_inputs: ['검토 제목', '완료 결과', '기준 Run 또는 기존 명세'],
  },
  {
    template_id: 'continuation',
    version: '0.1.0',
    kind: 'continuation',
    name: '이어가기',
    description: '기존 목표와 결정을 계승하고 다음 작업만 추가합니다.',
    use_when: '새 세션에서 기존 작업을 같은 방향으로 계속할 때',
    required_inputs: ['작업 제목', '추가 상황', '기준 Run'],
  },
  {
    template_id: 'branch',
    version: '0.1.0',
    kind: 'branch',
    name: '분기 실험',
    description: '기존 기준을 보존한 채 대안 방향을 독립적으로 실험합니다.',
    use_when: '원본을 유지하면서 다른 설계나 구현을 비교할 때',
    required_inputs: ['실험 제목', '분기 이유', '기준 Run'],
  },
]

export function executionTemplates(): ExecutionTemplateOption[] {
  return templates.map(template => ({ ...template, required_inputs: [...template.required_inputs] }))
}

export function executionTemplate(templateId: string): ExecutionTemplateOption | undefined {
  return templates.find(template => template.template_id === templateId)
}

export function templateOperationKind(kind: ExecutionTemplateKind): OperationKind {
  if (kind === 'project_start') return 'independent'
  if (kind === 'branch') return 'branch'
  return 'continue'
}

function kindSpecificSections(kind: ExecutionTemplateKind): string {
  const sections: Record<ExecutionTemplateKind, string> = {
    project_start: `## 3. 프로젝트 정의
- 해결할 핵심 문제: [작성 필요]
- 최종 목표: [작성 필요]
- 대상 사용자·사용 환경: [작성 필요]
- 성공 기준: [작성 필요]

## 4. 범위와 제외 범위
- 포함 범위: [작성 필요]
- 제외 범위: [작성 필요]
- 향후 확장: [작성 필요]`,
    feature_change: `## 3. 변경 정의
- 기존 동작: [근거 확인 필요]
- 요청한 변경: [작성 필요]
- 변경 이유: [작성 필요]
- 영향받는 기능·데이터·화면: validation_needed

## 4. 호환성 경계
- 유지해야 할 기존 계약: [작성 필요]
- 허용되는 변경: [작성 필요]
- 금지되는 변경: [작성 필요]`,
    maintenance_fix: `## 3. 문제 재현
- 관찰된 증상: [작성 필요]
- 재현 절차: validation_needed
- 기대 결과: [작성 필요]
- 실제 결과: [작성 필요]

## 4. 원인과 수정 경계
- 확인된 원인: validation_needed
- 원인 후보: [가설로만 기록]
- 수정 대상: [작성 필요]
- 수정 금지 영역: [작성 필요]`,
    completion_review: `## 3. 완료 대조
- 최초 목표: [기준 명세에서 연결]
- 실제 결과: [작성 필요]
- 충족한 요구사항: validation_needed
- 미충족·부분 충족 항목: validation_needed

## 4. 마감 판단
- 완료 가능 항목: [작성 필요]
- 보류 항목: [작성 필요]
- 후속 작업: [작성 필요]`,
    continuation: `## 3. 계승 기준
- 계승할 목표: [기준 Run에서 연결]
- 유지할 결정: validation_needed
- 완료된 범위: validation_needed
- 이번에 추가할 범위: [작성 필요]

## 4. 이어가기 경계
- 변경하지 않을 항목: [작성 필요]
- 다시 검토할 항목: [작성 필요]
- 다음 완료 기준: [작성 필요]`,
    branch: `## 3. 분기 정의
- 기준 방향: [기준 Run에서 연결]
- 분기 이유: [작성 필요]
- 실험할 대안: [작성 필요]
- 원본에 영향을 주지 않는 경계: [작성 필요]

## 4. 비교 기준
- 공통 평가 기준: [작성 필요]
- 대안별 측정 항목: [작성 필요]
- 승격·폐기 조건: [작성 필요]`,
  }
  return sections[kind]
}

export function renderExecutionTemplate(input: ExecutionTemplateInput): string {
  const template = executionTemplate(input.templateId)
  if (!template) throw new Error('EXECUTION_TEMPLATE_NOT_FOUND')
  const anchor = input.anchorRunId?.trim() || '없음'
  const constraints = input.constraints?.trim() || '별도 제약 입력 없음'

  return `# ${input.title.trim()}

## 문서 정보
- TemplateId: \`${template.template_id}\`
- TemplateVersion: \`${template.version}\`
- TemplateKind: \`${template.kind}\`
- ProjectRoot: \`${input.projectRoot}\`
- 기준 Run: \`${anchor}\`
- 생성 시각: \`${input.createdAt}\`
- 문서 역할: 프로젝트 실행본

> 이 문서는 재사용 원본 템플릿을 현재 프로젝트 상황에 적용한 실행 기준입니다. 사실이 확인되지 않은 항목은 임의로 채우지 않고 \`validation_needed\`로 유지합니다.

## 1. 현재 상황
${input.situation.trim()}

## 2. 적용 목적
- 사용 시점: ${template.use_when}
- 이번 실행에서 원하는 결과: [작성 필요]
- 사용자 결정이 필요한 항목: validation_needed
- 입력된 제약: ${constraints}

${kindSpecificSections(template.kind)}

## 5. 요구사항과 작업 연결
| 요구사항 ID | 요구사항 | 파생 작업 | 완료 조건 | 상태 |
|---|---|---|---|---|
| REQ-001 | [작성 필요] | WORK-001 | [작성 필요] | validation_needed |

## 6. 실행 단계와 전환 조건
| 단계 | 수행 내용 | 필요한 근거 | 다음 단계 조건 | 막힐 때 돌아갈 기준 |
|---|---|---|---|---|
| 1 | 상황과 입력 검토 | 제공된 입력 | 핵심 누락이 표시됨 | 현재 상황 |
| 2 | 범위와 요구사항 확정 | 사용자 결정 | 필수 요구사항 승인 | 적용 목적 |
| 3 | 구현 또는 산출 | 승인된 요구사항 | 결과 파일 등록 | 요구사항과 작업 연결 |
| 4 | 검증과 사용자 검토 | 근거·산출물 | 승인·수정 필요·보류 기록 | 완료 조건 |

## 7. 역할과 책임
- AI 에이전트: 분석 후보, 작업안, 검증 자료를 작성한다.
- 사용자: 목표, 범위, 고위험 결정과 최종 승인을 담당한다.
- 자동화 엔진: 입력·관계·근거·산출물·상태를 기록하고 계약을 검증한다.

## 8. 검증 기준
- [ ] 최초 상황과 현재 작업의 연결이 설명된다.
- [ ] 모든 필수 요구사항에 완료 조건이 있다.
- [ ] 각 작업이 어떤 요구사항에서 파생되었는지 추적된다.
- [ ] 사실·해석·가설·사용자 결정을 구분한다.
- [ ] 근거와 산출물이 실제 원본 경로에 연결된다.
- [ ] 막혔을 때 돌아갈 기준점이 명시된다.

## 9. 변경 및 결정 기록
| 시각 | 변경·결정 | 이유 | 영향받는 요구사항·작업 | 결정자 |
|---|---|---|---|---|
| ${input.createdAt} | 실행본 생성 | ${template.name} 템플릿 적용 | 전체 | 사용자 |

## 10. 다음 행동
- 다음 필수 행동: 빈 필드와 \`validation_needed\` 항목 검토
- 완료 판정: 사용자 검토 기록 필요
`
}
