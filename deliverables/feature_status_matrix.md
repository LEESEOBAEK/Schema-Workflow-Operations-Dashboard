# Feature Status Matrix

상태 정의:

- **구현 완료**: 코드와 자동 테스트 근거가 있음
- **부분 구현**: 핵심 동작은 있으나 알려진 제한 또는 release 미완료가 있음
- **운영 검증 중**: 실제 데이터에서 관측됐지만 목표 조건을 모두 측정하지 않음
- **향후 계획**: 설계/정의서에는 있으나 구현 근거가 부족함

| 기능 | 상태 | 구현 근거 | 검증 근거 | 제한/다음 행동 |
|---|---|---|---|---|
| 다중 ProjectRoot 읽기 | 구현 완료 | `server/utils/workflowReadAdapter.ts` | Vitest 61/61 중 adapter suite 통과 | 대용량 지연 로딩 수치 측정 필요 |
| Project·WorkSession·Run 계층 | 구현 완료 | shared types, read adapter, Hybrid UI | Mock/실데이터 투영 테스트 | legacy Run은 운영 정책에 따라 `evidence_insufficient` 또는 `unknown` |
| Evidence·Artifact·Fulfillment 표시 | 구현 완료 | read adapter와 Run detail UI | 손상·과대·BOM JSON 테스트 | 원본 품질이 낮으면 unknown/evidence insufficient |
| Relationship Gateway | 구현 완료 | `relationshipGateway.ts` | revision, missing Run, cycle, stale relation 테스트 | legacy Registry는 읽기 전용·근거 미확인 정책 적용 |
| 독립 작업 | 구현 완료 | operation/relationship contract | governance 독립 Run 테스트 | 없음 |
| 이어가기 | 구현 완료 | continuation owner와 delivery gate | governance lifecycle 테스트 | 사용자 검토 gate가 남을 수 있음 |
| 분기 | 구현 완료 | branch + `parent_run_id` | branch regression 통과 | UI에서 anchor 선택 필수 |
| Run 교체 reconciliation | 구현 완료 | `launchGateway.ts` | replacement Run 테스트 및 Dashboard candidate commit `b9d1438` | Engine 원본 상태와 관계 이벤트 분리 유지 |
| 원문 파일·SHA-256 보존 | 구현 완료 | launch gateway, request integrity | 관련 commit과 launch test | legacy 2026-07-19 데이터는 원문 파일 없음 |
| Context Capsule bounded summary | 구현 완료 | capsule contract | 길이·경계 테스트 | summary는 완료 계약으로 사용 금지 |
| 외부 Codex 연결 | 구현 완료 | launch command와 skill manager | 운영 감사에서 end-to-end 체인 확인 | 자동 실행은 workspace-write sandbox로 제한 |
| 외부 Claude/Antigravity 연결 | 구현 완료 | platform command와 skill family | 기존 Database 24개 플랫폼 식별 Run 감사, 기본 호환성 PASS | 플랫폼별 모든 관계 유형의 동수 통제 실험은 아님 |
| Project 스킬 점검/설치 | 구현 완료 | `projectSkillManager.ts` | 설치 상태 테스트 | 변경된 unmanaged 스킬은 자동 덮어쓰기 금지 |
| Candidate Release 상태/무결성 | 구현 완료 | launcher status/doctor | active `1.0.1-candidate.1` 정상 | Stable 승격 근거는 별도 |
| Dashboard 후보판 | 구현 완료 | Lab 09 `0.1.0-candidate.1` | typecheck, build, 61/61 tests, commit `b9d1438` | Engine Candidate와 별도 배포 |
| 표시명·메모·태그·운영 상태 | 구현 완료 | metadata store/UI | metadata tests | 원본 Engine status와 분리 유지 |
| WorkSession 수동 정렬 | 구현 완료 | API/UI와 metadata store | 관련 테스트 및 Dashboard candidate commit `b9d1438` | Engine 판단 상태와 분리 유지 |
| UTF-8 BOM JSON 읽기 | 구현 완료 | adapter 수정 | BOM regression 및 Dashboard candidate commit `b9d1438` | 없음 |
| 모바일 핵심 보기 | 구현 완료 | Hybrid responsive CSS | 390×844 @2x 실제 렌더링, PNG 780×1688, 가로 폭 390/390 | 상단 컨트롤·긴 제목 overflow 수정 및 재검수 완료 |
| 격리 경로 자동 실행 | 부분 구현 | trusted registry / launch mode | trusted root tests | 고위험 권한, 플랫폼별 차이 |
| 68 Run 규모 탐색 | 운영 기준선 확보 | 실제 운영 Database | production API 최초 158.97ms, warm P95 109.91ms | 500 Run 또는 P95 500ms 초과 시 재측정 |
| 감사·회귀 추세 시각화 | 향후 계획 | 정의서 Could/중기 계획 | 없음 | 데이터 모델·UI 설계 필요 |
| 대용량 파일 색인·지연 로딩 | 운영 검증 중 | bounded read와 size warning | 과대 파일 테스트 | 실제 latency benchmark 필요 |
| 다중 사용자·원격 배포 | 향후 계획 | 장기 계획 | 없음 | 개인 로컬 운영이 현재 경계 |
| 공개 소스 라이선스 | 구현 완료 | 루트 `LICENSE`, `THIRD_PARTY_NOTICES.md`, package `MIT` 표기 | MIT 전문과 폰트별 라이선스 파일 확인 | 외부 자산의 기존 라이선스 유지 |

## 정량 상태

| 지표 | 값 | 판정 |
|---|---:|---|
| Python 회귀 | 110/110 | 확인됨 |
| Dashboard Vitest | 61/61 | 확인됨 |
| 총 자동 테스트 | 171/171 | 서로 다른 suite의 단순 합계 |
| Nuxt typecheck | pass | 확인됨 |
| 표준 production build | pass | 명시적 typecheck와 Nuxt build를 연속 검증 |
| 독립 typecheck | pass | 원본 작업 트리 `pnpm typecheck` 검증 |
| 운영 Project | 9 governed / 10 top-level | `research`는 빈 일반 자료 폴더로 분류하여 운영 집계 제외 |
| canonical Run | 68 | 확인됨 |
| 런타임 성능 | 기준선 확보 | 11개 catalog Project, 112 projected Run, warm median 96.43ms, P95 109.91ms |
