# Validation Report

> **Historical baseline:** 이 보고서는 2026-07-26 초기 후보판 감사와 당시 운영 스냅샷을 보존한 문서입니다. 현재 Dashboard `1.0.6`의 검증 결과는 [release_1.0.6_sync_report.md](release_1.0.6_sync_report.md)와 [feature_status_matrix.md](feature_status_matrix.md)를 우선합니다. 아래 `61/61`, `171/171`, 운영 Project·Run 수치는 당시 재현 근거이므로 최신값으로 덮어쓰지 않았습니다.

검증 시각: 2026-07-26 (Asia/Seoul)

## 판정 요약

| 영역 | 결과 |
|---|---|
| 01~06 Schema Workflow 분석 검증 | pass, 경고 0 |
| 07 fulfillment 계약 | ready, 결과 증거 등록 전에는 미완료 유지 |
| Python 자동 회귀 | 110/110 pass |
| Dashboard Vitest | 61/61 pass |
| Nuxt typecheck | pass |
| Production build | 조건부 pass |
| Desktop render | pass |
| Mobile render | pass, responsive overflow 후속 수정 확인 |
| 공개 링크/명령/라이선스 | PASS, GitHub URL·명령·MIT 및 제3자 고지 확인 |
| 원본 불변성 | 제품·감사·Database는 pass, 공식 정의서는 외부 변경 감지 |

## 자동 테스트

| Suite | 통과/전체 |
|---|---:|
| Workflow smoke | 4/4 |
| Fulfillment contract | 21/21 |
| Router C trigger red tests | 35/35 |
| Router end-to-end flow | 12/12 |
| Workspace Governance | 38/38 |
| Dashboard Vitest | 61/61 |
| **총계** | **171/171** |

Workspace Governance는 원본 runner가 출력 경로를 하드코딩해 읽기 전용 원본에 쓸 수 없었습니다. 동일 `GovernanceRegressionTests` 38건을 프로젝트 밖 격리 경로에서 실행했고 모두 통과했습니다.

## 실패 분석과 최소 수정 순환

| 시도 | 증상 | 원인 | 최소 조치 | 최종 |
|---|---|---|---|---|
| Python #1 | nested output 생성 실패 | Windows 긴 경로/부모 생성 | 짧은 output root | 재시도 |
| Python #2 | `C:\tmp` access denied | sandbox 권한 | 승인된 격리 경로 | 38/38 |
| Governance harness #1 | 34 환경 오류 | 포트폴리오 상위 ProjectRoot 오인 | ProjectRoot 밖 temp | 38/38 |
| pnpm #1 | command not found | PATH | corepack 확인 | 재시도 |
| pnpm #2 | EPERM + registry fetch | pnpm 자동 상태 점검이 원본 write/network 요구 | 기존 Vitest 직접 실행 | 61/61 |
| Build #1 | Jiti cache EPERM | node_modules Junction이 원본 cache로 연결 | `JITI_FS_CACHE=false` | 재시도 |
| Build #2 | Nuxt lock EPERM | 자동 buildDir이 junction cache 하위 | 격리 복제본 `.nuxt` | 재시도 |
| Build #3 | `vue-tsc` not found | `.bin` PATH 누락 | clone `.bin` 추가 | 재시도 |
| Build #4 | TS5042 | integrated checker가 project와 source files 동시 전달 | 독립 typecheck 유지, 중복 checker off | build pass |
| Build #5 | pnpm ignored builds | `allowBuilds` 값이 미완성 자리표시자 | `@parcel/watcher`, `esbuild`만 명시적으로 허용 | 원본 통합 build pass |
| Screenshot #1 | connection refused | 서버 프로세스 조기 종료 | server와 capture 동일 실행 | 재시도 |
| Screenshot #2 | 빈/거부 화면 | Chrome 자식이 비동기 완료 전 서버 종료 | 12초 render wait | 정상 |

실패 시도는 최종 통과 수에 포함하지 않았습니다.

## Nuxt 검증 상세

- Framework: Nuxt 4.4.8 / Nitro 2.13.4 / Vite 7.3.6 / Vue 3.5.40
- Dashboard candidate: `0.1.0-candidate.1`, commit `b9d1438`
- Vitest: 10 files, 61 tests pass
- 독립 `nuxi typecheck`: pass
- production client: 1,694 modules, 3.20s
- production server: 161 modules, 2.44s
- Nitro output: 4.37MB, gzip 978KB

빌드 시간과 산출물 크기는 이번 격리 환경의 **build metric**입니다. Dashboard API latency, 메모리, 10초 탐색 성공 기준의 성능 수치가 아닙니다.

### build 제한 해결

과거 격리 QA 환경에서 발생한 `TS5042`는 현재 원본 작업 트리와 Nuxt 4.4.8 조합에서 재현되지 않았습니다. 실제 `pnpm build` 차단 원인은 `pnpm-workspace.yaml`의 `allowBuilds` 값이 Boolean이 아닌 자리표시자로 남아 있어 `@parcel/watcher`와 `esbuild` 설치 스크립트가 거절된 것이었습니다.

두 의존성만 명시적으로 허용한 뒤 원본 `typescript.typeCheck=true` 설정에서 `pnpm build`, `pnpm typecheck`, Dashboard 테스트 61/61이 모두 통과했습니다.

## 운영 데이터 집계

원본 파일은 복사·수정·이동·삭제하지 않고 manifest와 Registry 수만 집계했습니다.

| 지표 | 값 |
|---|---:|
| 최상위 디렉터리 | 10 |
| 거버넌스 계약 Project | 9 |
| canonical Run | 68 |
| completed | 44 |
| running | 19 |
| waiting/review | 3 |
| failed | 2 |
| WorkSession | 41 |
| Operation | 106 |
| Launch Request | 94 |

계약이 없는 최상위 디렉터리 1개는 운영 Project 수에서 제외했습니다.

## 대표 유지보수 결함

감사 근거로 확인된 유형:

- duplicate active session↔Run relation
- Registry relation과 manifest relation의 legacy drift
- fulfillment pass 뒤 stale running/continuation owner
- deliverable과 QA 기록의 SHA-256 불일치
- 대용량 중복 파일과 provenance 없는 작업 스크립트
- legacy launch의 원문/session reference/relationship contract 누락

현재 작업 트리에서 검증된 개선:

- replacement Run authoritative reconciliation
- stale HAS_RUN relation supersede event
- UTF-8 BOM Evidence JSON 수용
- Codex trusted auto를 full bypass에서 workspace-write sandbox로 축소
- 반복 완료 규칙을 launch contract에 명시

이 개선은 Dashboard `0.1.0-candidate.1`, commit `b9d1438`에 포함됐으며 테스트를 통과했습니다.

## 실제 화면 검증

- Desktop: CSS viewport 1440×1000, 2배 픽셀 밀도 PNG 2880×2000, Mock Project 1, WorkSession 3, Run 4
- Mobile: CSS viewport 390×844, 2배 픽셀 밀도 PNG 780×1688, 같은 Mock 데이터
- 개인정보/운영 원본: 없음
- 오류 페이지/빈 화면: 최종 이미지에서 없음
- Desktop 핵심 상태·경고·세션·Run detail: 식별 가능
- Mobile: 상태·세션 카드 식별 가능, 상단 조작 영역과 긴 제목이 화면 안에 표시됨
- 후속 폭 검사: 390px viewport에서 document client/scroll width `390/390`, 가로 overflow 없음

## 성능

2026-07-26 production build에서 11개 catalog Project와 112개 화면 투영 Run을 대상으로 `/api/dashboard`를 측정했다.

| 지표 | 결과 |
|---|---:|
| 최초 응답 | 158.97 ms |
| 후속 응답 중앙값 | 96.43 ms |
| 후속 응답 P95 | 109.91 ms |
| 측정 후 Working Set | 127.59 MB |

현재 개인 로컬 운영 규모의 기준선은 통과했다. 500 Run 이상 대규모 성능은 아직 검증하지 않았다. 상세 조건은 [performance_baseline.md](performance_baseline.md)를 따른다.

| 항목 | 상태 |
|---|---|
| 68 canonical Run 데이터가 중단 없이 열리는지 | PASS, 전체 catalog 투영 112 Run에서도 응답 완료 |
| API 응답시간 | PASS, warm median 96.43ms / P95 109.91ms |
| 메모리 사용량 | 기준선 확보, 측정 후 Working Set 127.59MB |
| 10초 내 구조 파악 | 사용자 테스트 필요 |
| 대용량 지연 로딩 효과 | 측정 필요 |

## 원본 불변성

### 초기 감사 당시 제품 소스

- HEAD: `2e7410df596175868a9dcfcd588000a4ccdb6a55`
- tracked+untracked source file count: 138
- 사전 content digest: `b179af466b4a662a9eac940f56c2627f5ec1098a47236d8bb47464f21d649ac3`
- 사전 Git status digest: `eb4af3d5ad3854bc70fdbb6182e8450cd84044a25e407998e5d580ca668f4b63`

사후 HEAD·file count·content digest·Git status digest가 모두 사전 값과 일치했습니다. 기존 수정 11개와 신규 5개는 작업 시작 전 사용자 변경으로 보존했습니다.

### 감사/Database

- Audit: 32 files, metadata digest `02f32c5596a0e757917f3e94c84d2b4bd680fc1692a4facbb6dd2272785c8ad6`
- Database: 73,782 files, metadata digest `6fee97716c4aa04db6365e7a8a457db8babff66e87f9d6d34c313fff77c42985`

사후 비교에서 Audit와 Database의 file count·metadata digest가 모두 일치했습니다.

### 공식 정의서

초기 지정 파일 SHA-256은 `ac45c4eed9ff9643f74f8755f7e1fab995ecefb925bc1b268e20f49d829fd242`였습니다. 작업 중 해당 경로가 없어지고 `_Portfolio_v1.2.md`가 SHA-256 `c0181439a486efffc0e055e0c15dd48cde9d362e42a06837e2aaffe813bb198b`로 나타났습니다.

이 포트폴리오 작업은 외부 원본에 쓰지 않았으므로 **동시 외부 변경 감지**로 분류하며, 새 파일을 공식 정의서로 임의 승격하지 않았습니다.

## 최종 제한

- MIT LICENSE 추가 및 외부 폰트 라이선스 분리 고지 완료
- GitHub 공개 저장소 연결 완료
- 통합 빌드 제한 해결 완료
- 기존 Database의 플랫폼 식별 Run 24개로 Codex·Claude Code·Antigravity 기본 호환성 PASS
- 500 Run 이상 대규모 runtime performance 미측정
- 공식 정의서 동시 외부 변경
