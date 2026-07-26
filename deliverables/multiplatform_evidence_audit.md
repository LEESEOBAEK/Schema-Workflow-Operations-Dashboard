# Multi-Platform Evidence Audit

## 판정

기존 운영 Database만으로 Codex, Claude Code, Antigravity의 **기본 Workflow
호환성은 PASS**로 판정한다. 새 문제를 플랫폼마다 3~5건씩 다시 실행할
필요는 없다.

이 판정은 각 플랫폼에서 Workflow Run 생성, 완료 상태 기록, Artifact
등록이 실제로 관찰됐다는 의미다. 모든 관계 유형과 자동 실행 권한이
플랫폼마다 동일하다는 의미는 아니다.

## 분석 범위

- 원본: 비공개 로컬 운영 Database
- 방법: `.control/recovery`를 제외한 canonical `workflow_manifest.json`,
  `workflow_status.json`, `artifacts_manifest.json` 읽기
- 원본 변경: 없음
- 플랫폼 판별: Database 최상위 프로젝트 경로명

## 플랫폼별 집계

| 플랫폼 | Canonical Run | 독립 | 분기 | 완료 상태 | Artifact 등록 Run | 판정 |
|---|---:|---:|---:|---:|---:|---|
| Codex | 2 | 2 | 0 | 1 | 2 | PASS |
| Claude Code | 15 | 15 | 0 | 10 | 15 | PASS |
| Antigravity | 7 | 3 | 4 | 5 | 6 | PASS |
| 합계 | 24 | 20 | 4 | 16 | 23 | PASS |

완료 상태는 `request_completed`를 기준으로 집계했다. 실행 중, 검토 대기,
초기 중단 상태도 정상적인 운영 이력으로 보존되므로 실패로 일괄 계산하지
않았다.

## 대표 근거

### Codex

- Run: `2026-07-19_115419__스타트업_브랜드_디자인_(2)__396bd39d`
- 관계: `independent`
- 상태: `request_completed`
- Artifact: 2개 등록
- OperationId: `op_dashboard_843b8415457b4a5c9a559d9309d19673`

### Claude Code

- Run: `2026-07-21_203440__02_NVIDIA_RAPIDS__09a54a9b`
- 관계: `independent`
- 상태: `request_completed`
- Artifact: 12개 등록
- OperationId: `op_dashboard_ac00c2195b884af0b343ab30607f7b12`

### Antigravity

- Run: `2026-07-19_215436__분기B-3__a4e1e471`
- 관계: `branch`
- Parent Run: `2026-07-19_210610__개인_생산성_앱_브랜드_디자인__c5b4e646`
- 상태: `request_completed`
- Artifact: 7개 등록
- OperationId: `op_dashboard_0f9cc5b73bfd41e08986679d0abe1abe`

Antigravity에는 독립 Run과 네 개의 분기 Run이 함께 존재하며, 별도 Run
`2026-07-19_003525__소상공인(카페·식당·쇼핑몰)_브랜드_디자인__4de4b280`
에서는 `continuation_completed` 상태도 확인됐다.

## 남은 경계

- 플랫폼별로 모든 관계 유형을 같은 수량으로 실행한 통제 실험은 아니다.
- 경로명에 플랫폼 정보가 없는 나머지 Run은 플랫폼별 수치에서 제외했다.
- 이 감사는 기본 호환성 근거이며 자동 실행 권한과 성능 보장은 별도다.
