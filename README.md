# Schema Workflow Operations Dashboard

AI 에이전트 작업을 Project, WorkSession, Run, Evidence, Artifact 단위로 추적하고, 근거가 부족한 완료 판정을 구분하는 로컬 운영 대시보드입니다.

![Dashboard desktop](deliverables/docs/images/dashboard-desktop.png)

## 공개 후보 상태

- Dashboard: `0.1.0-candidate.1`
- Source baseline: Lab 09 commit `b9d1438`
- License: MIT
- Dashboard tests: 61/61
- 전체 회귀 테스트: 171/171
- 현재 운영 규모 API P95: 109.91ms

## 빠른 실행

Node.js 20 이상과 Corepack이 필요합니다.

```powershell
Set-Location .\apps\dashboard-vnext
corepack enable
corepack pnpm install --frozen-lockfile
$env:NUXT_DASHBOARD_DATA_MODE = "mock"
corepack pnpm dev --port 3215
```

브라우저에서 `http://localhost:3215/hybrid`를 엽니다.

## 저장소 구성

- `apps/dashboard-vnext`: Nuxt Dashboard 소스와 테스트
- `fixtures`: 익명 Mock Dashboard 데이터
- `deliverables`: 포트폴리오 문서, 검증 보고서와 화면 이미지
- `LICENSE`: 프로젝트 MIT 라이선스
- `THIRD_PARTY_NOTICES.md`: 패키지와 폰트 라이선스 고지

## 주요 문서

- [상세 프로젝트 소개](deliverables/README.md)
- [Portfolio Case Study](deliverables/portfolio_case_study.md)
- [Architecture](deliverables/architecture.md)
- [Feature Status Matrix](deliverables/feature_status_matrix.md)
- [Validation Report](deliverables/validation_report.md)
- [Public Release Checklist](deliverables/public_release_checklist.md)
- [Public Package Validation](deliverables/public_package_validation.md)
- [Operations Data Policy](deliverables/operations_data_policy.md)
- [Runtime Performance Baseline](deliverables/performance_baseline.md)

## 공개 범위

이 저장소에는 익명 Mock 데이터만 포함합니다. 실제 운영 Database, 사용자 절대 경로, `.env`, `.data`, 실행 로그와 Schema Workflow 사용자 설치 폴더는 포함하지 않습니다.
