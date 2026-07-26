# Schema Workflow Operations Dashboard

> License: [MIT](LICENSE). Third-party fonts and packages included in the
> product source retain their respective licenses.

AI 에이전트의 “작업 완료” 보고를 그대로 믿는 대신, **요청 원문·관계 계약·Run·근거·산출물·검증 상태를 파일 기반 계약으로 연결**하는 로컬 운영 대시보드입니다.

![실제 Mock 데이터로 렌더링한 데스크톱 화면](docs/images/dashboard-desktop.png)

> 현재 공개 판정: **포트폴리오 문서·Mock 데모·MIT 라이선스·독립 빌드·GitHub 게시 완료**

공개 저장소: [LEESEOBAEK/Schema-Workflow-Operations-Dashboard](https://github.com/LEESEOBAEK/Schema-Workflow-Operations-Dashboard)

검증된 Dashboard 후보판은 `0.1.0-candidate.1`이며 Lab 09 commit
`b9d1438`로 고정했습니다. Python Engine Candidate와 Dashboard는 서로
다른 배포 경계를 유지합니다.

## 무엇을 해결했나

여러 AI CLI를 함께 쓰면 작업은 ProjectRoot, 터미널, 채팅, 결과 폴더로 흩어집니다. 파일이 생겼어도 “어떤 요청에서 시작했고, 어떤 Run이 유효하며, 근거와 결과가 실제로 연결됐는가?”를 다시 확인하기 어렵습니다.

이 프로젝트는 다음 경계를 둡니다.

- AI: 해석과 산출물 생성
- Python Engine: 입력 구조화, 계약, 검증, Run 상태
- Relationship Gateway: 새 작업·이어가기·분기 관계와 revision
- Nuxt Dashboard: 읽기 전용 원본을 운영 화면으로 투영
- Candidate Release Manager: 설치본 활성화와 manifest 무결성

## 핵심 사례

- **Project → WorkSession → Run → Evidence/Artifact** 계층을 한 화면에서 추적
- `OperationId`로 외부 CLI가 만든 Run을 원래 작업 세션에 재연결
- 독립·이어가기·분기마다 `relation_type`, anchor, parent 계약 검증
- 전체 UTF-8 요청을 파일로 보존하고 SHA-256·문자 수·바이트 수 검증
- Workflow manifest는 읽기 전용으로 두고 표시 메타데이터와 관계 저장소 분리
- `artifact_ready`를 사용자 최종 목표 완료로 오인하지 않는 fulfillment gate
- Codex·Claude Code·Antigravity를 내장하지 않고 외부 실행자로 연결

자세한 관계와 처리 흐름은 [architecture.md](architecture.md), 기능별 근거 수준은 [feature_status_matrix.md](feature_status_matrix.md)에서 확인할 수 있습니다.

## 검증된 현재 상태

2026-07-26 읽기 전용 스냅샷 기준:

| 항목 | 확인값 | 근거 수준 |
|---|---:|---|
| 거버넌스 계약이 있는 운영 Project | 9 | Database 최상위 ProjectRoot 집계 |
| canonical Run | 68 | `workflow_manifest.json` 실파일 집계 |
| WorkSession | 41 | 관계 Registry 집계 |
| Operation | 106 | `.control/operations` 집계 |
| Python 회귀 | 110/110 통과 | 5개 runner |
| Dashboard Vitest | 61/61 통과 | 10개 test file |
| Nuxt typecheck | 통과 | 격리 복제본 `nuxi typecheck` |
| Production build | 통과 | 명시적 typecheck 후 Nuxt production build |
| 런타임 응답시간·메모리 | **기준선 확보** | production API warm median 96.43ms, P95 109.91ms, 측정 후 Working Set 127.59MB |

운영 스냅샷에는 완료 44, 실행 중 19, 사용자 검토 대기 3, 실패 2 Run이 있었습니다. 이는 제품 품질 점수가 아니라 “대시보드가 구분해서 보여줘야 하는 실제 운영 상태”입니다.

## 5분 Mock 데모

### 1. 데이터 계약만 재현

Node.js 20 이상에서:

```powershell
node .\demo\validate-demo.mjs
```

성공하면 Sample Project, 독립·이어가기·분기 Operation, Run parent 관계, Evidence와 Artifact 연결, 원문 SHA-256 형식을 검증합니다.

### 2. 실제 Dashboard 실행

이 포트폴리오 패키지에는 공개 가능한 Dashboard 소스인 `apps/dashboard-vnext`와 익명 Mock fixture인 `fixtures`가 포함되어 있습니다.

```powershell
corepack enable
corepack prepare pnpm@11.7.0 --activate
Copy-Item .\deliverables\demo\dashboard_mock_state.json .\fixtures\dashboard_mock_state.json
Set-Location .\apps\dashboard-vnext
corepack pnpm install --frozen-lockfile
$env:NUXT_DASHBOARD_DATA_MODE = "mock"
corepack pnpm dev --port 3215
```

브라우저에서 `http://localhost:3215/hybrid`를 열고 다음을 확인합니다.

1. `Release Readiness Demo` Project가 표시된다.
2. 독립 작업·이어가기·분기 WorkSession이 구분된다.
3. Run 카드에서 pass, evidence insufficient, superseded 상태가 분리된다.
4. 관계 검토 경고와 Evidence/Artifact 수가 보인다.

Mock 데이터의 구조와 기대 결과는 [demo/README.md](demo/README.md)에 있습니다.

## 실제 화면

| Desktop 1440×1000 @2x | Mobile 390×844 @2x |
|---|---|
| ![Desktop dashboard](docs/images/dashboard-desktop.png) | ![Mobile dashboard](docs/images/dashboard-mobile.png) |

두 이미지는 동일한 익명 Mock 데이터로 실제 Nuxt 화면을 렌더링한 결과입니다. 데스크톱은 CSS viewport 1440×1000, 모바일은 390×844를 사용했으며, 모두 2배 픽셀 밀도(실제 PNG 2880×2000 및 780×1688)로 캡처했습니다. 모바일 화면은 상단 조작 영역과 긴 제목의 가로 넘침을 수정했으며 문서 너비와 화면 너비가 일치하는 것도 확인했습니다.

## 문서 지도

- [Portfolio Case Study](portfolio_case_study.md) — 문제 정의, 개선 과정, 작성자 기여, 면접 사례
- [Architecture](architecture.md) — 시스템·데이터·처리 흐름 Mermaid
- [Feature Status Matrix](feature_status_matrix.md) — 구현 완료/부분 구현/운영 검증 중/향후 계획
- [Technical Decisions](technical_decisions.md) — 결정과 트레이드오프
- [Validation Report](validation_report.md) — 테스트, 운영 집계, 실패 분석, 제한사항
- [Multi-Platform Evidence Audit](multiplatform_evidence_audit.md) — 기존 Database 기반 Codex·Claude Code·Antigravity 호환성 근거
- [Operations Data Policy](operations_data_policy.md) — 일반 자료 폴더·legacy Run·runtime residue 분류와 처리 기준
- [Runtime Performance Baseline](performance_baseline.md) — 현재 로컬 운영 규모의 API 응답시간과 메모리 기준선
- [Public Release Checklist](public_release_checklist.md) — 공개/제외 대상과 release gate
- [Public Package Validation](public_package_validation.md) — 독립 설치·테스트·빌드와 개인정보 제외 검사
- [Final QA Report](final_qa_report.md) — 링크·명령·화면·기능·라이선스 최종 점검

## 안전한 공개 범위

포함:

- 설계와 상태를 설명하는 Markdown
- 익명화된 집계
- 가상 ID만 사용하는 Sample/Mock JSON
- 실제 앱을 Mock 모드로 렌더링한 화면

제외:

- `.env`, `.data`, 로그, 캐시, `node_modules`, `.nuxt`, `.output`
- 사용자 설치 폴더와 절대 사용자 경로
- 운영 Database 원본, 원본 manifest 사본, 개인정보
- 공개 권한이 확인되지 않은 제3자 자산

## 현재 제한

- 프로젝트 코드는 MIT로 공개하며 외부 폰트와 패키지는 각각의 기존 라이선스를 유지합니다.
- Windows 공백 경로에서도 동작하도록 `pnpm build`가 명시적 typecheck 후 Nuxt production build를 순서대로 실행합니다.
- 다중 플랫폼 기본 호환성은 기존 Database의 플랫폼 식별 Run 24개로 검증했습니다. 현재 11개 catalog Project와 112개 화면 투영 Run의 production API 기준선은 warm median 96.43ms, P95 109.91ms입니다. 대규모 확장 성능은 별도 범위입니다.
- 공식 정의서 지정 파일은 작업 중 외부에서 `_Portfolio_v1.2.md`로 교체되어, 초기 해시와 사후 경로가 불일치합니다.

## GitHub 소개문

> Evidence-backed operations dashboard for tracing AI work across Projects, WorkSessions, Runs, Operations, Evidence, and Artifacts—with preserved prompts, relationship contracts, and honest completion gates.

공개 전 마지막 판단은 [public_release_checklist.md](public_release_checklist.md)의 `BLOCKED` 항목을 기준으로 합니다.
