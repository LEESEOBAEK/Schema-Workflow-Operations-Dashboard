# Dashboard 1.0.6 Synchronization Report

## 목적

운영 기준 Dashboard 소스와 공개 포트폴리오 저장소의 기능 차이를 제거하고, 실제 사용자 데이터 없이 동일한 코드가 독립적으로 테스트·빌드되는지 확인한다.

## 동기화 기준

- 운영 소스: `SchemaWorkflowDevelopment/Lab/lab_09`
- 기능 커밋: `a958dda` (`Align dashboard review queue counts`)
- 버전 커밋: `14f62f9` (`Prepare dashboard release 1.0.6`)
- 공개 대상: `apps/dashboard-vnext`, `packaging`
- 보존 대상: 포트폴리오 README, `deliverables`, 익명 fixtures
- 제외 대상: `.schema-workflow`, `.schema-workflow.json`, `outputs`, `.env`, `.data`, 로그와 설치된 Engine

## 반영 결과

- 운영판 추적 파일 90개를 포트폴리오판과 대조했다.
- 공통 파일을 최신 운영 코드로 동기화하고 누락 파일 18개를 추가했다.
- 동기화 후 90개 파일의 SHA-256이 운영 소스와 모두 일치했다.
- 포트폴리오 전용 산출물과 익명 Mock 데이터는 유지했다.
- Dashboard 버전을 `1.0.6`으로 갱신했다.

## 주요 추가 기능

- 실행 템플릿 생성과 작업 세션 연결
- 파이프라인 상세 검토
- 근거·산출물 상세 목록
- 사용자 검토 상태와 표시 정보 편집
- 작업 세션 정렬과 제거
- 이어가기 Run 자동 연결 보강
- 통과 Run의 사용자 미검토 상태를 상단 검토 대기 수에 반영
- 미검토 Run만 사용자 검토 목록에 표시

## 검증

| 검증 항목 | 결과 |
|---|---|
| Dashboard Vitest | `92/92 PASS` |
| Nuxt typecheck | PASS |
| Nuxt production build | PASS |
| 운영 소스 파일 일치 | `90/90` |
| README 내부 링크 | 누락 0 |
| 사용자 절대경로·비밀값 검사 | 신규 노출 0 |
| Runtime·생성 폴더 Git 유입 | 0 |

## 해석 범위

이 보고서는 공개 Dashboard 소스와 패키징 스크립트가 운영판 `1.0.6`과 일치한다는 근거다. 과거 `0.1.0-candidate.1` 기준으로 작성된 설계·성능·검증 문서는 당시 개발 과정의 역사적 증거로 보존하며, 현재 릴리스 상태는 이 문서와 저장소 루트 README를 우선한다.

Python Engine 설치본, 실제 운영 Database와 개인 프로젝트 산출물은 공개 저장소에 포함하지 않는다. Windows 통합 Engine·Dashboard 번들은 별도 Release 자산으로 배포하는 경계를 유지한다.
