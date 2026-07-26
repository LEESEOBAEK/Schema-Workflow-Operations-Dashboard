# Operations Data Policy

작성일: 2026-07-26

## 목적

운영 프로젝트, 일반 자료 폴더, 레거시 Run, 실험 중 생긴 런타임 흔적을 같은 대상으로 오인하지 않도록 분류 기준을 고정한다.

## 분류 기준

| 분류 | 판정 기준 | 대시보드 처리 |
|---|---|---|
| Governed Project | 프로젝트 계약과 `outputs/workflows`가 존재 | 운영 프로젝트로 표시 |
| Non-workflow Collection | Run과 프로젝트 계약이 없는 일반 자료 폴더 | 자동 초기화하지 않고 수집 대상에서 제외 |
| Legacy Run | 현재 계약 도입 전에 생성되어 원문, 관계 또는 fulfillment 근거가 일부 없음 | 읽기 전용으로 유지하고 `evidence_insufficient` 또는 `unknown` 표시 |
| Runtime Residue | 소스 트리 안에 실수로 생성된 관계·실행 기록 | 원본 해시를 확인한 뒤 별도 보관소로 이동하고 카탈로그에서 제거 |

## 확정된 예외

### `Database\research`

- 상태: `Non-workflow Collection`
- 근거: 폴더가 비어 있으며 프로젝트 계약, `outputs/workflows`, Run이 모두 없음
- 결정: 운영 프로젝트 수에 포함하지 않고 강제 초기화하지 않음
- 재분류 조건: 실제 Run을 생성할 프로젝트로 사용할 때 명시적으로 초기화

### 레거시 Run

- 누락된 원문이나 관계를 추정하여 채우지 않는다.
- 과거의 `ready_for_next_action`을 현재 계약의 완료 증명으로 승격하지 않는다.
- fulfillment가 유효해도 필수 Artifact 또는 Evidence 원본이 없으면 `evidence_insufficient`로 낮춘다.
- fulfillment 자체가 없으면 `unknown`으로 유지한다.
- 사용자가 근거를 보강하거나 명시적으로 재실행한 경우에만 현재 계약 상태로 승격한다.

### Lab 09 `apps\dashboard-vnext\07_`

- 상태: `Runtime Residue`
- 내용: 관계 기록 2개, 총 1,226 bytes
- 처리: 삭제하지 않고 비공개 운영 Database의 `_runtime_archive/lab09_dashboard_07_20260726`로 이동
- 검증: 이동 전후 파일 수 2개와 SHA-256 일치
- 카탈로그: 운영 프로젝트 목록에서 제거
- 재발 방지: `apps/dashboard-vnext/[0-9][0-9]_/`를 Git 제외 규칙에 추가

## 운영 원칙

1. 폴더가 존재한다는 이유만으로 운영 프로젝트로 간주하지 않는다.
2. 누락된 과거 근거를 AI가 임의 복원하지 않는다.
3. Runtime Residue는 삭제보다 격리와 추적을 우선한다.
4. 예외를 정상 데이터처럼 숨기지 않고 화면 상태와 문서에 표시한다.
