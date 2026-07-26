<div align="center">

# Schema Workflow Operations Dashboard

**AI 에이전트 작업의 요청, 실행, 근거와 산출물을 한 화면에서 추적하는 로컬 운영 대시보드**

![Nuxt](https://img.shields.io/badge/Nuxt-4.4-00DC82?logo=nuxtdotjs&logoColor=white)
![Tests](https://img.shields.io/badge/tests-61%2F61%20passing-2EA043)
![Build](https://img.shields.io/badge/build-passing-2EA043)
![License](https://img.shields.io/badge/license-MIT-blue)
![Status](https://img.shields.io/badge/status-candidate-F2A900)

</div>

<p align="center">
  <img src="deliverables/docs/images/dashboard-desktop.png" alt="Schema Workflow Operations Dashboard desktop view" width="920">
</p>

<p align="center">
  <sub>Project → WorkSession → Run → Evidence · Artifact 관계를 실제 Nuxt 화면에 투영한 Mock 데모</sub>
</p>

## 무엇을 해결했나

여러 AI CLI를 함께 사용하면 요청 원문, 실행 기록과 결과 파일이 서로 다른 폴더에 흩어집니다. 이 프로젝트는 파일 기반 계약을 사용해 작업의 시작부터 완료 판정까지 연결하고, **완료**, **근거 부족**, **보류**를 구분해 보여줍니다.

| 문제 | 적용한 방법 | 결과 |
|---|---|---|
| 작업 기록이 여러 경로로 분산됨 | Project·WorkSession·Run 계층화 | 실행 위치와 관계 추적 |
| 완료 보고와 실제 산출물이 어긋남 | Evidence·Artifact·Fulfillment 분리 | 근거 기반 완료 판정 |
| 이어가기와 분기가 섞임 | 관계 계약과 revision 검증 | 작업 흐름 복원 가능 |
| 긴 요청이 전달 중 누락됨 | UTF-8 원문 파일과 SHA-256 보존 | 원문 무결성 확인 |

## 검증된 기준선

| 자동 검증 | 운영 데이터 | 성능 |
|---:|---:|---:|
| Dashboard `61/61` | 운영 Project `9` | API P95 `109.91ms` |
| 전체 회귀 `171/171` | canonical Run `68` | 투영 Run `112` |
| Typecheck · Build PASS | 3개 AI CLI 기본 호환 | Working Set `127.59MB` |

> 성능 수치는 현재 Windows 로컬 환경과 파일 규모의 기준선입니다. 500 Run 이상은 아직 검증하지 않았습니다.

## 반응형 화면

<table>
  <tr>
    <td width="32%" align="center">
      <img src="deliverables/docs/images/dashboard-mobile.png" alt="Mobile dashboard" width="260">
    </td>
    <td width="68%">
      <strong>작은 화면에서도 같은 판단 흐름을 유지합니다.</strong>
      <br><br>
      프로젝트와 작업 세션을 먼저 선택한 뒤 Run 상태, 다음 행동과 근거를 확인합니다.
      상단 조작 영역과 긴 제목은 390px 화면에서 가로 넘침 없이 검증했습니다.
    </td>
  </tr>
</table>

## 빠른 실행

Node.js 20 이상과 Corepack이 필요합니다.

```powershell
git clone https://github.com/LEESEOBAEK/Schema-Workflow-Operations-Dashboard.git
Set-Location .\Schema-Workflow-Operations-Dashboard\apps\dashboard-vnext
corepack enable
corepack pnpm install --frozen-lockfile
$env:NUXT_DASHBOARD_DATA_MODE = "mock"
corepack pnpm dev --port 3215
```

브라우저에서 `http://localhost:3215/hybrid`를 엽니다.

## 구조

```text
Schema-Workflow-Operations-Dashboard/
├─ apps/dashboard-vnext/   Nuxt Dashboard 소스와 테스트
├─ fixtures/               익명 Mock 데이터
├─ deliverables/           포트폴리오 문서와 검증 보고서
├─ LICENSE
└─ THIRD_PARTY_NOTICES.md
```

## 핵심 문서

| 먼저 읽기 | 설계·검증 |
|---|---|
| [프로젝트 상세 소개](deliverables/README.md) | [Architecture](deliverables/architecture.md) |
| [Portfolio Case Study](deliverables/portfolio_case_study.md) | [Feature Status Matrix](deliverables/feature_status_matrix.md) |
| [프로젝트 정의서](deliverables/project_definition_v1.3.md) | [Validation Report](deliverables/validation_report.md) |
| [공개 패키지 검증](deliverables/public_package_validation.md) | [Runtime Performance](deliverables/performance_baseline.md) |

<details>
<summary><strong>현재 범위와 제한 보기</strong></summary>

### 포함

- Windows 개인 로컬 운영
- Codex, Claude Code, Antigravity 실행 결과 읽기
- Project·WorkSession·Run 관계와 근거 표시
- 익명 Mock 모드와 공개 재현 테스트

### 아직 포함하지 않음

- 500 Run 이상 대규모 최적화
- 다중 사용자 권한과 원격 배포
- Windows 이외 운영 환경 보장
- AI CLI 버전 변화에 대한 자동 호환

</details>

## 공개 원칙

이 저장소에는 익명 Mock 데이터만 포함합니다. 실제 운영 Database, 사용자 절대 경로, `.env`, `.data`, 실행 로그와 사용자 설치 폴더는 Git에서 제외합니다. 프로젝트 코드는 MIT로 공개하며, 포함된 폰트와 패키지는 각각의 기존 라이선스를 따릅니다.
