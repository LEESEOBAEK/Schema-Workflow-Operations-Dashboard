# Public Release Checklist

판정 기준:

- `PASS`: 공개 산출물에서 확인
- `VALIDATION_NEEDED`: 추가 측정·확인 필요
- `BLOCKED`: 공개 전 사용자/소유자 결정 필요

## 공개 대상

| 항목 | 판정 | 비고 |
|---|---|---|
| README와 기술 문서 6종 | PASS | 상대 링크 사용 |
| Final QA report | PASS | `final_qa_report.md` |
| 익명 Sample Project/Mock Workflow | PASS | 가상 ID만 사용 |
| Desktop/Mobile 이미지 | PASS | 실제 Nuxt Mock render, 모두 @2x |
| 익명 운영 집계 | PASS | 9 Project, 68 Run 등 |
| 기능 상태·제한사항 | PASS | 구현/부분/검증 중/계획 분리 |
| 제품 소스 | PASS | MIT 라이선스와 외부 자산 분리 고지 확정 |

## 반드시 제외

| 패턴/데이터 | 판정 |
|---|---|
| `.env`, secret, token, key | PASS — deliverables 미포함 |
| `.data` | PASS — 미포함 |
| `*.log`, execution log | PASS — 미포함 |
| cache, `node_modules` | PASS — 미포함 |
| `.nuxt`, `.output` | PASS — 미포함 |
| 사용자 설치 폴더 | PASS — 미포함 |
| 절대 사용자 경로 | PASS — Markdown/JSON scan 0건 |
| 운영 Database 원본 | PASS — 미복사 |
| 원본 manifest/Evidence/Artifact 사본 | PASS — 미복사 |
| 개인정보·실제 프로젝트명 | PASS — 공개 파일은 익명/가상 데이터 |
| 브라우저 profile | PASS — outputs에만 존재, deliverables 제외 |

## 내용 일치

| 검사 | 판정 | 근거 |
|---|---|---|
| 문서 7종 존재 | PASS | deliverables root |
| README↔문서 링크 | PASS | 상대 링크 오류 0 |
| README↔스크린샷 | PASS | 두 PNG 실파일 |
| README 명령 형식 | PASS | 저장소 내부 상대 경로로 독립 실행 가능 |
| 기능 설명↔코드 | PASS/부분 | feature matrix에 근거 수준 표시 |
| 테스트 수 | PASS | Python 110 + Dashboard 61 |
| 운영 수치 | PASS | 익명 manifest/Registry 집계 |
| 성능 수치 | PASS | 현재 규모의 production API 기준선을 실측하고 대규모 범위는 미측정으로 분리 |
| 라이선스 | PASS | MIT LICENSE, THIRD_PARTY_NOTICES, package license 표기 |

## 보안·개인정보

- [x] 운영 원본을 deliverables로 복사하지 않음
- [x] 실제 OperationId/RunId/Project명 대신 설명 또는 가상 ID 사용
- [x] 이미지가 Mock 모드임을 명시
- [x] 공개 문서에서 사용자 홈 절대 경로를 사용하지 않음
- [x] `.env` 예시는 값 없는 키 또는 명령형 환경 변수만 사용
- [x] 공개 소스와 제3자 의존성 라이선스 승인

## 재현성

- [x] Mock JSON schema validation 명령 제공
- [x] Dashboard dev 실행 명령 제공
- [x] 확인할 UI 상태 4개 명시
- [x] 실제 desktop/mobile 결과 첨부
- [x] public repository URL 확정
- [x] standard `pnpm build` 통합 검사 복구 및 원본 작업 트리 검증
- [x] 포트폴리오 독립 소스에서 install, 61/61 tests, typecheck, production build 통과
- [x] Dashboard `0.1.0-candidate.1`을 Lab 09 commit `b9d1438`로 고정

## Release gate

현재 판정: **문서 포트폴리오와 제품 소스의 독립 검증 및 GitHub 공개 저장소 연결 완료**

공개 전 필수 결정:

1. `[완료]` 저장소에 MIT LICENSE를 추가하고 제3자 자산을 분리 고지한다.
2. `[완료]` public repository URL을 README에 반영한다.
3. `[완료]` 명시적 typecheck와 Nuxt production build를 공백 경로에서 검증한다.
4. `[완료]` 모바일 상단 조작 영역과 긴 제목 overflow를 수정하고 390×844 @2x에서 재검수했다.
5. `[완료]` 공식 정의서를 v1.3으로 복구하고 포트폴리오 내부 스냅샷과 동기화했다.
