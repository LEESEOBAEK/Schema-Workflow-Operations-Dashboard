# Public Package Validation

검증일: 2026-07-27

Dashboard 상태: Portable Bundle candidate 검증 완료

운영 소스 기준: Lab 09·Lab 16 working candidate

## 포함 범위

- `apps/dashboard-vnext`: Nuxt Dashboard 소스와 자동 테스트
- `packaging`: Windows 통합 배포 빌드·설치·실행 스크립트
- `fixtures/dashboard_mock_state.json`: 익명 Mock 데이터
- `deliverables`: 프로젝트 설명, 검증 보고서와 화면 이미지
- `LICENSE`, `THIRD_PARTY_NOTICES.md`: 공개 및 제3자 라이선스

## 제외 범위

- `.env`, `.data`, 로그, 캐시
- `node_modules`, `.nuxt`, `.output`
- `.schema-workflow`, `.agents`, `outputs`
- 실제 운영 Database와 사용자 설치 폴더
- 사용자 홈 절대 경로와 계정명

제외 대상은 로컬에 남아 있어도 Git의 공개 후보 파일에는 포함되지 않는다.

## 독립 재현 검증

포트폴리오 폴더의 독립 복제 소스에서 수행했다.

| 검사 | 결과 |
|---|---:|
| 고정 lockfile 설치 | PASS |
| Dashboard Vitest | 69/69 PASS |
| Engine·배포 회귀 | 132/132 PASS |
| Nuxt typecheck | PASS |
| Nuxt production build | PASS |
| 격리된 사용자 경로 통합 설치 | Engine 활성화·doctor·Dashboard build PASS |
| 공백이 포함된 Windows 경로 | PASS |
| Markdown 상대 링크 | 오류 0 |
| 공개 후보 내 사용자 경로·계정명 | 발견 0 |
| Secret·운영 Database 원본 | 포함 0 |

## 판정

포트폴리오 폴더는 문서 묶음이 아니라 Mock 모드로 설치·테스트·빌드할 수 있는 공개 저장소다. 실제 운영용 Engine은 커밋된 소스로 다시 빌드한 GitHub Release 통합 배포판으로 제공해야 하며, 현재 검증된 `dirty` preview는 공개 배포하지 않는다. 원격 저장소는 `https://github.com/LEESEOBAEK/Schema-Workflow-Operations-Dashboard`에 연결했다.
