# Feature Status Matrix

현재 공개 기준: Dashboard `1.0.6`

상태 정의:

- **구현 완료**: 현재 코드와 자동 테스트 근거가 있음
- **제한적 운영**: 개인 로컬 환경에서 사용할 수 있지만 적용 범위가 제한됨
- **기준선 확보**: 특정 시점의 운영 데이터로 측정했으며 일반 성능 보장은 아님
- **향후 계획**: 설계 의도는 있으나 현재 릴리스의 완료 기능이 아님
- **역사적 근거**: 과거 후보판에서 확인한 개발 과정의 검증 기록

## 현재 기능

| 영역 | 기능 | 상태 | 구현·검증 근거 | 알려진 제한 |
|---|---|---|---|---|
| 탐색 | 다중 ProjectRoot 카탈로그 | 구현 완료 | Read Adapter와 catalog 테스트 | 대규모 프로젝트 지연 로딩은 미검증 |
| 탐색 | Project → WorkSession → Run 계층 | 구현 완료 | shared types, adapter, Hybrid UI | legacy Run은 관계 근거에 따라 unknown 가능 |
| 탐색 | 검색과 프로젝트·세션 선택 유지 | 구현 완료 | search/selection 전용 테스트 | 전문 검색 엔진은 사용하지 않음 |
| 세션 | 새 작업·이어가기·분기 | 구현 완료 | Operation/Relationship 계약 테스트 | 이어가기·분기는 기준 Run 필요 |
| 세션 | 세션 이름·메모·태그 편집 | 구현 완료 | Metadata Store와 API 테스트 | Engine 원본 상태와 별도 저장 |
| 세션 | 수동 순서·날짜 정렬·삭제 | 구현 완료 | session metadata/API 테스트 | 삭제는 UI 관계 제거이며 원본 Run 삭제가 아님 |
| 템플릿 | 프로젝트 시작 템플릿 | 구현 완료 | Execution Template catalog/API 테스트 | 템플릿 자동 추천은 현재 범위 아님 |
| 템플릿 | 기능 추가·유지보수·완료 검토 템플릿 | 구현 완료 | catalog와 WorkSession 생성 흐름 | 직무별 세부 템플릿은 후속 축적 대상 |
| 템플릿 | 원본 템플릿과 프로젝트 실행본 분리 | 구현 완료 | 생성 API와 저장 계약 | 구성요소 자동 추출은 향후 계획 |
| 관계 | Relationship Gateway | 구현 완료 | revision, missing Run, cycle, stale relation 테스트 | legacy Registry 자동 확정 금지 |
| 관계 | OperationId 기반 Run 자동 연결 | 구현 완료 | reconciliation/replacement Run 테스트 | CLI가 OperationId를 보존해야 함 |
| 관계 | UTF-8 원문과 SHA-256 보존 | 구현 완료 | launch integrity 테스트 | 원문 파일이 없는 legacy 작업은 복구 불가 |
| 검증 | Evidence·Artifact·Fulfillment 표시 | 구현 완료 | 정상·손상·BOM·과대 JSON 테스트 | 원본 근거가 없으면 상태를 상향하지 않음 |
| 검증 | 파이프라인 상세 검토 | 구현 완료 | Pipeline Review API/UI 테스트 | 편집기가 아닌 읽기·대조용 projection |
| 검증 | 통과·근거 부족·보류 구분 | 구현 완료 | Adapter/상태 투영 테스트 | 업무 도메인별 판단 규칙은 Engine 책임 |
| 검토 | 사용자 미검토 Run 집계 | 구현 완료 | review count/queue 테스트 | 자동 통과와 사용자 승인 의미를 분리 |
| 검토 | 사용자 검토 완료·메모 | 구현 완료 | Review dialog와 Metadata Store | 원본 Engine 판정을 변경하지 않음 |
| 실행 | Codex·Claude Code·Antigravity 준비 | 제한적 운영 | platform command와 skill manager 테스트 | CLI 인증·프로세스 수명은 외부 플랫폼 책임 |
| 실행 | 프로젝트 스킬 상태 확인·설치 | 구현 완료 | Project Skill Manager 테스트 | unmanaged 수정본은 자동 덮어쓰기 금지 |
| 실행 | 격리 경로 자동 실행 | 제한적 운영 | trusted root/launch mode 테스트 | 고위험 권한과 플랫폼별 차이 존재 |
| 배포 | Windows 통합 Bundle | 구현 완료 | Stable `1.0.6` 설치·doctor·production smoke | Windows 개인 로컬 운영 기준 |
| 배포 | Candidate → Stable 활성화 | 구현 완료 | release pointer, manifest integrity, doctor | 다중 사용자 중앙 배포는 범위 밖 |
| UI | 집중 화면·전체 보드·모바일 화면 | 구현 완료 | 실제 Mock 렌더와 반응형 검수 | 초광폭 보드 밀도는 후속 UI 개선 후보 |
| 공개 | 익명 Mock 모드 | 구현 완료 | 독립 install, tests, typecheck, build | 실제 운영 Database는 포함하지 않음 |
| 공개 | MIT 및 제3자 고지 | 구현 완료 | `LICENSE`, `THIRD_PARTY_NOTICES.md` | 외부 자산은 각 원래 라이선스 유지 |

## 현재 정량 검증

| 지표 | 결과 | 해석 |
|---|---:|---|
| Dashboard Vitest | `92/92 PASS` | 현재 공개 소스 기준 |
| Nuxt typecheck | PASS | TypeScript 계약 확인 |
| Nuxt production build | PASS | 운영 빌드 생성 확인 |
| 운영판·공개판 파일 비교 | `90/90` | Dashboard·packaging 추적 파일 SHA-256 일치 |
| README 내부 링크 | `29/29` | 루트와 문서 인덱스 기준 |
| 공개 안전성 검사 | 신규 노출 0 | 사용자 절대경로·비밀값·Runtime 데이터 제외 |

## 개발 기준선과 운영 측정

다음 수치는 현재 릴리스의 일반 성능 보장이 아니라 개발 과정에서 확보한 읽기 전용 기준선입니다.

| 기준선 | 값 | 용도 |
|---|---:|---|
| 초기 Python 회귀 | `110/110` | Workflow·Router·Fulfillment·Governance 경계 검증 |
| 초기 Dashboard 후보판 | `61/61` | 공개 포트폴리오 감사 시작점 |
| 초기 통합 회귀 | `171/171` | 서로 다른 suite의 당시 단순 합계 |
| 운영 스냅샷 | 9 governed Projects / 68 canonical Runs | 실제 데이터 구조 감사 |
| API 성능 스냅샷 | 11 catalog Projects / 112 projected Runs / warm P95 109.91 ms | 현재 규모의 기준선 |

## 후속 범위

| 항목 | 상태 | 시작 조건 |
|---|---|---|
| 직무·도메인별 실행 템플릿 확장 | 향후 계획 | 반복 사용 사례와 검증 데이터 축적 |
| 템플릿 구성요소 자동 추출 | 향후 계획 | 완성형 템플릿 간 공통 패턴 확인 |
| 감사·회귀 추세 시각화 | 향후 계획 | 비교 가능한 장기 Run 데이터 확보 |
| 대용량 색인·지연 로딩 | 향후 계획 | 500 Run 또는 체감 지연 기준 초과 |
| 다중 사용자·원격 협업 | 향후 계획 | 개인 로컬 운영 경계를 벗어나는 요구 발생 |
