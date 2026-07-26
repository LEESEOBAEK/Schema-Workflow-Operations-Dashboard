# Schema Workflow Dashboard vNext

Continuation launch contract: the dashboard preserves the full UTF-8 request in `user-request.md`, then passes that file through `--supplemental-input-file` with `--supplemental-input-sha256`. Summaries are navigation aids only and cannot replace fulfillment input.

Nuxt 4 기반의 워크플로 운영 대시보드 프로토타입입니다. Hybrid 화면이 현재 기준 화면이며, Mock 데이터와 실제 워크플로 ProjectRoot 읽기를 분리해 지원합니다.

## 요청 원문 보존

- CLI 준비 시 사용자가 입력한 전체 요청은 `<ProjectRoot>/.schema-workflow/launch/requests/<LaunchId>/user-request.md`에 먼저 저장됩니다.
- `request.json`에는 원문 파일 경로, SHA-256, 문자 수, UTF-8 바이트 수가 기록됩니다.
- CLI 프롬프트에는 긴 원문을 복사하지 않고 이 파일과 무결성 정보만 전달합니다. Context Capsule은 탐색용 요약이며 완료 판정 기준이 아닙니다.
- 시작 전 원문 파일이 변경되거나 경로가 Launch 디렉터리 밖을 가리키면 실행을 거부합니다.
- 서버가 허용하는 요청 원문 상한은 UTF-8 기준 1 MiB이며, 초과하면 조용히 자르지 않고 오류를 표시합니다.

## 실행

```powershell
Set-Location .\apps\dashboard-vnext
corepack enable
pnpm install
pnpm dev --port 3215
```

- 기준 화면: `http://localhost:3215/hybrid`
- 루트 주소 `http://localhost:3215/`도 기준 화면으로 연결됩니다.

## 실제 데이터 모드

`.env.example`을 `.env`로 복사하고 ProjectRoot를 지정합니다.

```dotenv
NUXT_DASHBOARD_DATA_MODE=live
NUXT_DASHBOARD_PROJECT_ROOTS=C:\path\to\project-root
NUXT_DASHBOARD_MAX_SOURCE_BYTES=1048576
NUXT_DASHBOARD_METADATA_PATH=.data/dashboard-metadata.json
NUXT_DASHBOARD_PROJECT_CATALOG_PATH=.data/project-catalog.json
NUXT_DASHBOARD_TRUSTED_AUTO_ROOTS=
NUXT_DASHBOARD_TRUSTED_AUTO_REGISTRY_PATH=
NUXT_SCHEMA_WORKFLOW_LAUNCHER=C:\Users\<user>\.schema-workflow-candidate\bin\schema-workflow.ps1
NUXT_SCHEMA_WORKFLOW_PACKAGE_ROOT=C:\path\to\extracted-schema-workflow-release
```

여러 ProjectRoot는 세미콜론(`;`)으로 구분합니다. `.env`는 Git에 포함되지 않습니다. 설정을 변경한 뒤에는 개발 서버를 재시작합니다.

## 프로젝트와 작업 세션

- 환경 변수의 ProjectRoot는 기본 프로젝트로 유지됩니다.
- 화면의 `프로젝트 추가`에서 기존 폴더를 등록하거나 새 폴더를 명시적으로 만들 수 있습니다.
- 선택 정보는 `.data/project-catalog.json`에 저장되며 프로젝트 원본은 변경하지 않습니다.
- `새 작업`에서 독립 작업, 이어가기, 분기를 선택합니다.
- 이어가기와 분기는 기존 Run을 기준으로 선택해야 하며, 결과 Run에는 각각 `CONTINUES` 또는 `BRANCHES_FROM` 관계가 기록됩니다.
- Catalog에서 프로젝트를 제거해도 실제 폴더와 산출물은 삭제되지 않습니다.

## Mock 모드

```dotenv
NUXT_DASHBOARD_DATA_MODE=mock
```

Mock 모드는 `fixtures/dashboard_mock_state.json`을 사용합니다. 실제 데이터 모드에서 경로 또는 파일 문제가 발생해도 Mock으로 자동 대체하지 않습니다.

## 데이터 경계

- Dashboard는 ProjectRoot의 `outputs/workflows`를 읽기만 합니다.
- 원본 Manifest, Artifact, Evidence 및 Fulfillment 파일을 수정하지 않습니다.
- 손상·누락·과대 파일은 경고와 `unknown`, `unresolved`, `evidence_insufficient` 상태로 표시합니다.
- 표시 정보는 Dashboard의 `.data/dashboard-metadata.json`에 저장합니다.
- 확정 관계는 ProjectRoot의 `.schema-workflow/relations`에 Relationship Gateway만 저장합니다.
- Dashboard는 프로젝트와 프롬프트를 준비하고 VS Code에서 수동 작업을 시작하도록 돕습니다.
- 별도 PowerShell 자동 실행은 반복 작업을 위한 고급 선택 기능으로 유지합니다.

## 관계 확인

- `unresolved` 또는 `conflict` 세션에서 `관계 확인`을 선택합니다.
- 세션 이름과 연결할 Run을 확인한 뒤 사용자가 확정합니다.
- 기존 관계는 삭제하지 않고 `superseded` 상태와 이벤트 이력으로 보존합니다.
- Project별 revision이 달라지면 저장을 중단하고 새로고침을 요구합니다.
- 존재하지 않는 Run과 순환 `CONTINUES` 관계는 거절합니다.

관계 저장 위치:

```text
<ProjectRoot>/.schema-workflow/relations/relationship-registry.json
<ProjectRoot>/.schema-workflow/relations/relation-events.jsonl
```

## VS Code 작업 준비

1. Hybrid 화면에서 연결할 작업 세션을 선택합니다.
2. `작업 준비`를 누르면 대시보드가 사용자 단위 Engine 상태를 먼저 확인합니다.
3. 통합 배포판에서 Engine이 없으면 `엔진 설치`를 눌러 설치·활성화·doctor 검증을 수행합니다.
4. 사용할 플랫폼을 선택합니다.
5. 대시보드가 프로젝트 스킬의 설치 여부, 버전 및 관리 파일 무결성을 확인합니다.
6. `미설치`이면 `설치`를 눌러 현재 프로젝트에만 스킬을 설치합니다. 변경되거나 소유권이 불명확한 기존 스킬은 자동으로 덮어쓰지 않습니다.
7. 스킬 상태가 `설치됨`인지 확인하고 문제 상황을 입력한 뒤 `프롬프트 준비`를 누릅니다.
8. 전체 프롬프트를 복사하고 `VS Code에서 열기`를 눌러 해당 ProjectRoot를 엽니다.
9. VS Code 터미널에서 표시된 플랫폼 명령을 실행하고 복사한 프롬프트를 붙여넣습니다.
10. 작업이 Run을 생성하면 `Run 연결 확인`을 눌러 동일 OperationId의 Run을 선택한 세션에 연결합니다.

`NUXT_SCHEMA_WORKFLOW_PACKAGE_ROOT`는 `release-manifest.json`과
`installer/Install-SchemaWorkflow.ps1`이 들어 있는 압축 해제 배포판을
가리킵니다. 소스 저장소만 실행하고 이 값을 설정하지 않은 경우 대시보드는
Engine 상태를 표시하지만 원격 코드를 임의로 내려받거나 설치하지 않습니다.

Codex와 Antigravity는 `<ProjectRoot>/.agents/skills/schema-workflow`를 공유하고 Claude Code는 `<ProjectRoot>/.claude/skills/schema-workflow`를 사용합니다. Claude Code에 새로 설치한 스킬을 인식시키려면 열려 있는 CLI 세션을 다시 시작합니다. 설치 이력은 사용자 폴더의 `.schema-workflow-dashboard/skill-events.jsonl`에 기록됩니다.

Antigravity는 대화형 진행을 유지하면서 권한 확인만 자동화하기 위해 `agy --dangerously-skip-permissions --mode accept-edits`를 표시합니다. 최초 프로젝트 등록을 선택하면 `--new-project`가 추가됩니다.

PowerShell 자동 실행은 `고급 자동 실행 설정`에서만 선택합니다. `격리 경로 자동 실행`을 선택한 뒤 대시보드에서 현재 프로젝트와 플랫폼을 승인해야 사용할 수 있습니다. Codex 자동 실행은 `workspace-write` 샌드박스를 사용하여 선택한 ProjectRoot 안의 작업만 허용하며, 전체 시스템 권한 우회 옵션을 사용하지 않습니다. 승인 기록은 기본적으로 사용자 폴더의 `.schema-workflow-dashboard/trusted-projects.json`에 저장되며 대시보드에서 해제할 수 있습니다. `NUXT_DASHBOARD_TRUSTED_AUTO_ROOTS`는 관리자가 상위 경로를 별도로 허용해야 할 때만 사용합니다. Antigravity 첫 실행은 `현재 폴더를 Antigravity에 최초 등록`을 명시해야 합니다.

## 반복 구현 운영

- 첫 실행은 `새 작업`으로 만들고 이후 같은 목표를 계속 구현할 때는 `이어가기` 작업을 만들어 기준 Run을 선택합니다.
- `Run 연결 완료`는 대시보드 관계 등록이 끝났다는 뜻이며 제품 또는 사용자 목표가 완료됐다는 뜻이 아닙니다.
- `artifact_ready`는 한 반복의 산출물 준비 상태로만 취급합니다.
- 생성되는 CLI 프롬프트는 구현, 빌드, 전체 회귀 테스트, 실패 분석, 최소 수정 순환을 요구합니다.
- `validation_needed`는 다음 구현 후보로 유지하고, 실제 `blocked` 상태나 사용자 결정이 필요한 위험 작업에서만 중단합니다.
- 최종 완료는 사용자 원문에 선언한 테스트와 제품 수용 조건이 모두 검증됐을 때만 판정합니다.

## 검증

```powershell
pnpm typecheck
pnpm test
pnpm build
```
## 표시 정보 편집

- Hybrid 집중 보기에서 실행을 선택하고 `편집` 버튼을 누릅니다.
- 작업 세션 이름은 세션을 더블클릭하거나 선택 세션의 `이름 편집` 버튼으로 변경합니다.
- 세션 표시 이름은 ProjectRoot와 세션 ID 조합으로 구분하여 다른 프로젝트의 동명 세션과 충돌하지 않습니다.
- 표시명, 사용자 메모, 태그와 운영 상태를 변경할 수 있습니다.
- 운영 상태는 `활성`(현재 판단에 사용), `대체됨`(새 결과로 교체), `보관됨`(참고 이력 유지)으로 구분합니다.
- 통과·보류 같은 엔진 판정과 운영 상태는 서로 독립적이며, 운영 상태를 바꿔도 원본 Run과 엔진 판정은 변경되지 않습니다.
- 원본 용어와 전체 Run ID는 고정되어 항상 함께 표시됩니다.
- 편집 데이터는 `.data/dashboard-metadata.json`에 별도로 저장되며 Workflow 원본은 변경하지 않습니다.
- 표시명을 비우면 원본 용어가 자동으로 사용됩니다.
- 변경 이력은 Run별 최근 100건까지 보존됩니다.
