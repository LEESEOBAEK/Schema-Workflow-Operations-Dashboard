# Demo

이 폴더는 운영 원본 없이 Project·WorkSession·Run·Operation·Evidence·Artifact 관계를 검토하기 위한 익명 데이터입니다.

## 파일

- `sample-project.json`: Project와 세 개 WorkSession
- `mock-workflow.json`: 독립·이어가기·분기 Run, 원문 hash, Evidence, Artifact
- `dashboard_mock_state.json`: 실제 Nuxt Dashboard가 읽는 화면 fixture
- `validate-demo.mjs`: ID 참조·parent 관계·SHA-256 형식·절대 경로를 검사

## 데이터 계약 검증

```powershell
node .\demo\validate-demo.mjs
```

기대 출력:

```text
Demo validation passed: 1 project, 3 sessions, 4 runs, 4 operations, 6 evidence, 6 artifacts.
```

## UI 데모

새로운 Dashboard source checkout에서:

```powershell
Copy-Item .\deliverables\demo\dashboard_mock_state.json .\fixtures\dashboard_mock_state.json
Set-Location .\apps\dashboard-vnext
corepack enable
corepack prepare pnpm@11.7.0 --activate
corepack pnpm install --frozen-lockfile
$env:NUXT_DASHBOARD_DATA_MODE = "mock"
corepack pnpm dev --port 3215
```

`http://localhost:3215/hybrid`에서 다음 흐름을 확인합니다.

1. 독립 작업: parent 없는 새 Run
2. 이어가기: anchor Run을 잇는 validation Run
3. 분기: anchor Run에서 모바일 검토 Run 생성
4. 관계 근거 부족: `evidence_insufficient`와 검토 경고
5. 결과 검토: Evidence/Artifact 개수와 다음 행동

운영 원본을 덮어쓰지 않도록 fresh checkout 또는 별도 demo branch에서 실행하십시오.
