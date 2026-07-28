# Portfolio Case Study

> 현재 공개 기준: Dashboard `1.0.6` / Dashboard Vitest `92/92` / Nuxt typecheck·production build 통과
>
> 이 문서는 초기 운영 감사에서 발견한 문제와 이후 `1.0.6`까지 확장된 해결 과정을 함께 설명합니다. 당시 수치는 개발 기준선으로, 현재 수치는 릴리스 상태로 구분합니다.

## 한 문장

분산된 AI CLI 작업을 “채팅과 폴더”가 아니라 **보존된 요청, 관계 계약, Run, Evidence, Artifact, fulfillment gate**로 운영하도록 만든 로컬 Workflow Operations Dashboard입니다.

![데스크톱 집중 보기](docs/images/dashboard-desktop.png)

## 문제 정의

AI 에이전트가 파일을 만들고 “완료”라고 보고해도 다음 질문은 남았습니다.

- 어떤 Project와 WorkSession에서 시작한 작업인가?
- 같은 요청의 재시도인가, 독립 작업인가, 기존 Run의 이어가기·분기인가?
- 원문이 요약되거나 잘리지 않았는가?
- 통과 상태가 실제 Evidence와 Artifact에 의해 뒷받침되는가?
- 플랫폼을 바꾸거나 시간이 지난 뒤에도 다음 행동을 복원할 수 있는가?

특히 여러 CLI가 같은 ProjectRoot를 사용할 때 duplicate Run, 잘못된 parent, stale relationship, operation 상태 불일치, deliverable 누락이 발생할 수 있었습니다.

## 제약

- Windows 11 개인 로컬 환경
- JSON·JSONL·Markdown 중심 파일 저장소
- Workflow manifest는 수정 금지
- 외부 AI CLI의 권한·프로세스 수명은 Dashboard와 다름
- 운영 데이터는 개인정보와 대용량 파일을 포함
- 제품 소스는 이번 포트폴리오 작업에서 읽기 전용

## 접근

### 1. AI의 “판단”과 Engine의 “검증”을 분리

AI는 원문 해석과 결과 작성을 수행하지만, Python은 schema, path, operation identity, relationship, hash, state transition, deliverable을 검증합니다. 이를 01~07 레이어로 기록해 “어디까지 분석됐고 실제 결과는 무엇인지”를 분리했습니다.

### 2. WorkSession과 Run을 분리

WorkSession은 사용자가 이해하는 작업 맥락, Run은 Engine 실행입니다. Dashboard가 OperationId를 먼저 만들고 외부 CLI가 생성한 Run manifest에서 같은 ID를 찾아 연결합니다.

### 3. 관계를 선택이 아닌 계약으로 취급

독립·이어가기·분기는 `operation_kind`, `result_run_policy`, `expected_relation_type`, `anchor_run_id`, `delivery_policy`로 고정됩니다. Engine 결과가 계약과 다르면 자동 연결하지 않고 mismatch로 남깁니다.

### 4. 전체 원문을 파일과 SHA-256으로 보존

긴 요청을 CLI prompt에 중복 삽입하지 않고 `user-request.md`를 원본으로 사용합니다. 시작 전 SHA-256, 문자 수, UTF-8 바이트 수를 다시 확인하며 Context Capsule summary는 완료 계약으로 사용하지 않습니다.

### 5. 원본과 파생 데이터를 분리

- Engine manifest/Evidence/Artifact: 읽기 전용
- Relationship Registry: Gateway 소유
- Dashboard 표시 정보: 별도 `.data`
- Candidate install: Release Manager 소유

이 경계 덕분에 표시명을 바꿔도 Engine pass/fail이 바뀌지 않습니다.

## 유지보수 감사가 바꾼 설계

읽기 전용 감사에서는 다음 대표 문제 유형이 실제로 확인됐습니다.

- 같은 세션·Run의 active 관계 중복
- legacy Registry 관계와 manifest relation의 불일치
- 통과한 fulfillment 뒤에도 `running`이 남는 stale 상태
- deliverable과 QA 기록의 SHA-256 불일치
- 대용량 파일·글꼴·평면 산출물 중복
- 오래된 launch에서 원문 파일·session reference·relationship contract 누락

이 결과를 “예외 데이터”로 버리지 않고 Gateway·Read Adapter·completion semantics의 회귀 후보로 전환했습니다.

## 대표 개선 5건

### 사례 1. Run 교체 뒤 세션이 구 Run에 묶임

**상황:** 같은 OperationId가 초기 Run에 연결된 뒤 Engine이 최종 Run을 생성하면 bound launch가 더 이상 reconciliation 대상이 아니었습니다.

**추론:** 화면의 관계 Registry보다 `.control/workspace_registry.json`의 operation→run 매핑이 더 권위 있는 reconciliation 근거입니다.

**개선:** authoritative Run을 먼저 조회하고, bound launch도 Run이 사라지거나 매핑이 바뀌면 재검사합니다. 구 HAS_RUN은 superseded, 신 Run은 confirmed로 보존합니다.

**검증:** 초기 replacement Run 회귀를 포함한 Dashboard `61/61` 통과 후, 현재 `1.0.6` 전체 `92/92`에서 재검증했습니다.

**상태:** 최초 수정은 Dashboard `0.1.0-candidate.1`에 포함됐고, 현재 Stable `1.0.6`과 공개 소스에 반영됐습니다.

### 사례 2. Windows 도구가 만든 UTF-8 BOM JSON을 손상으로 오인

**상황:** `JSON.parse`가 BOM을 포함한 Evidence JSON을 invalid로 판정해 완료 Run을 unknown으로 낮출 수 있었습니다.

**추론:** 저장 계약은 UTF-8이며 Windows 도구의 BOM은 데이터 객체 손상이 아닙니다.

**개선:** bounded read 후 첫 BOM만 제거하고 JSON object 계약은 그대로 검증합니다.

**검증:** BOM Evidence가 pass와 evidence id를 보존하는 테스트를 추가했고, 현재 Dashboard 전체 `92/92`에 포함됩니다.

**상태:** Stable `1.0.6` 반영 및 공개 소스 동기화 완료.

### 사례 3. 반복 산출물을 사용자 최종 목표로 오인

**상황:** `artifact_ready`, CLI 종료, 일부 테스트 통과가 전체 요청 완료처럼 해석될 수 있었습니다.

**추론:** completion은 도구 이벤트가 아니라 원문 acceptance criteria의 충족 여부여야 합니다.

**개선:** launch contract에 목표·검증 조건 작업 목록, 구현→빌드→전체 회귀→실패 분석→최소 수정 순환, validation_needed 처리 규칙을 포함했습니다.

**검증:** prompt contract 테스트와 fulfillment/governance 회귀 통과.

### 사례 4. 작업 템플릿과 수동 세션 생성이 서로 다른 결과를 만듦

**상황:** 상단 새 작업, 작업 세션의 추가 버튼, 작업 템플릿이 서로 다른 흐름을 사용하면서 세션 이름·기준 Run·제약조건과 Operation 연결 상태가 달라질 수 있었습니다.

**추론:** 템플릿은 별도 실행기가 아니라 동일한 WorkSession 생성 계약에 입력을 보강하는 계층이어야 합니다.

**개선:** 프로젝트 시작·기능 추가·유지보수·완료 검토 템플릿을 공통 catalog로 관리하고, 생성 결과를 동일한 세션 API와 Operation 계약으로 연결했습니다. 원본 템플릿과 프로젝트 실행본도 분리했습니다.

**검증:** template catalog, API, session binding 회귀 테스트를 포함한 Dashboard `92/92` 통과.

### 사례 5. 자동 통과와 사용자 검토 완료가 같은 숫자로 보임

**상황:** 실행 검증을 통과한 Run이 상단 통과 수에는 잡히지만 사용자가 아직 읽지 않았다는 사실이 검토 대기 수와 일관되게 연결되지 않았습니다.

**추론:** 자동 검증 상태와 사용자 검토 상태는 목적이 다르므로 하나의 상태값으로 합치면 안 됩니다.

**개선:** Engine 판정은 읽기 전용으로 유지하고 사용자 검토 여부를 별도 메타데이터로 저장했습니다. 상단 검토 대기 수, 검토 목록과 상세 화면이 같은 미검토 Run 집합을 사용하도록 공통 selector를 도입했습니다.

**검증:** review count와 queue filtering 전용 테스트를 추가하고 전체 `92/92`를 통과했습니다.

## 검증 결과

### 현재 공개 릴리스

- Dashboard Vitest: **92/92**
- Nuxt typecheck: **pass**
- Nuxt production build: **pass**
- 운영판과 공개 소스: **90/90 파일 SHA-256 일치**
- README·문서 인덱스 내부 링크: **29/29 유효**
- 공개 안전성 검사: 사용자 절대경로·비밀값 신규 노출 **0건**
- 실제 Mock render: desktop/mobile @2x 대표 이미지 보존

### 개발 기준선

- Python workflow/router/fulfillment/governance: **110/110**
- 초기 Dashboard 후보판: **61/61**
- 당시 통합 자동 회귀: **171/171**
- 읽기 전용 운영 스냅샷: 9 governed Projects, 68 canonical Runs

개발 기준선의 환경·실패 이력·운영 집계는 [validation_report.md](validation_report.md), 현재 릴리스 동기화 근거는 [release_1.0.6_sync_report.md](release_1.0.6_sync_report.md)에 분리해 보존합니다.

## 모바일 화면 개선

![모바일 실제 렌더링](docs/images/dashboard-mobile.png)

초기 390×844 검수에서 Project 조작 영역과 긴 제목이 오른쪽으로 넘치는 문제를 확인했습니다. 모바일 버튼을 2열과 전체 너비 행으로 재배치하고 긴 제목·세션명·실행 식별자에 줄바꿈 경계를 추가했습니다. 후속 검수에서 문서 너비와 화면 너비가 `390/390`으로 일치해 가로 넘침이 없음을 확인했고, 포트폴리오 이미지는 데스크톱과 모바일 모두 2배 픽셀 밀도인 2880×2000 및 780×1688 PNG로 캡처했습니다.

## 작성자 기여

| 기여 영역 | 수행 내용 | 근거 |
|---|---|---|
| 문제 정의 | 채팅/폴더 중심 운영의 provenance·completion 문제를 Project/Session/Run 관계 문제로 재정의 | 정의서와 ontology |
| 추론 QA | summary와 원문, pass와 운영 상태, artifact_ready와 최종 완료를 분리 | launch/fulfillment contract |
| 요구사항 결정 | 읽기 전용 원본, Gateway 단일 쓰기, 외부 CLI, Candidate-first를 선택 | ADR과 구현 |
| 검증 | 개발 기준선 171개 회귀와 현재 Dashboard 92개 테스트, typecheck, build, 실제 렌더 검토 | validation/sync report |
| 운영 개선 | 감사 발견을 reconciliation, BOM, stale relation, completion, review queue 회귀로 전환 | current source와 tests |

## 이력서용 3줄

1. Codex·Claude Code·Antigravity 작업을 Project–WorkSession–Run–Evidence–Artifact 계약으로 추적하는 Nuxt/Python 로컬 운영 대시보드를 설계·검증했습니다.
2. 전체 요청 SHA-256 보존, Relationship Gateway, atomic write/revision lock, fulfillment completion gate를 구현해 중복 관계·경로 이탈·잘못된 완료 판정을 줄였습니다.
3. 9개 운영 Project·68개 Run의 읽기 전용 감사에서 출발해 개발 기준선 171/171, 현재 Dashboard 92/92, typecheck·production build와 공개 소스 90/90 일치까지 검증했습니다.

## GitHub 저장소 소개문

Evidence-backed local console for governing AI-agent work across Projects, WorkSessions, Runs, Operations, Evidence, and Artifacts—without letting UI metadata or AI completion claims overwrite the source of truth.

## 면접용 문제 해결 사례

### 1. “완료”의 정의를 바꾼 사례

- 문제: 파일 생성이나 CLI 종료가 사용자 목표 완료로 오인됨
- 판단: 완료는 이벤트가 아니라 원문 기준의 observable acceptance criteria
- 실행: 07 fulfillment, DeliverablePath, SHA-256, continuation delivery gate 도입
- 결과: partial artifact와 final request completion을 구조적으로 구분

### 2. 분산 프로세스를 연결한 사례

- 문제: Dashboard가 준비한 작업과 외부 CLI가 만든 Run 사이에 직접 API가 없음
- 판단: 사전 생성 OperationId와 immutable relationship contract가 최소 공통 키
- 실행: launch request → CLI → manifest → reconciliation → WorkSession bind
- 결과: 플랫폼이 달라도 동일 Project 관계를 복원할 수 있는 파일 계약 확보

### 3. 감사 결함을 회귀 테스트로 전환한 사례

- 문제: duplicate HAS_RUN, replacement Run, BOM JSON, stale 상태가 실제 데이터에서 관측됨
- 판단: 운영 결함은 수동 정리보다 Gateway/Adapter 경계 테스트로 고정해야 재발 방지 가능
- 실행: authoritative operation lookup, stale relation supersede, BOM read 보강
- 결과: 당시 Dashboard 61/61과 Governance 38/38을 포함한 171/171 통과, 현재 Dashboard 92/92로 회귀 범위 확장

## 결과

이 프로젝트의 핵심 결과는 “대시보드 화면” 하나가 아니라, AI 작업을 장기간 운영할 때 필요한 **원문·관계·근거·산출물·자동 검증·사용자 검토의 분리**입니다. Stable `1.0.6`에서는 실행 템플릿과 파이프라인 상세 검토까지 연결했고, MIT 공개 저장소가 운영판과 동일한 Dashboard 소스를 독립적으로 테스트·빌드할 수 있도록 동기화했습니다.
