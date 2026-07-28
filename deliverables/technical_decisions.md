# Technical Decisions

> 이 문서는 Stable Dashboard `1.0.6` 기준의 주요 설계 결정을 설명합니다. 각 결정은 선택한 이유와 함께 감수한 비용을 기록합니다.

## TD-01. 모듈러 모놀리스

**결정:** Engine, Dashboard, Relationship Gateway, Release Manager를 책임별 모듈로 분리하되 로컬 단일 배포 단위로 운영한다.

**이유:** 개인 로컬 환경에서 마이크로서비스의 네트워크·배포·관측 비용은 문제 규모보다 크다.

**트레이드오프:** 모듈 경계가 코드 규율에 의존한다. 원격 다중 사용자 요구가 생기면 서비스 분리를 재검토한다.

## TD-02. Manifest는 읽기 전용 단일 진실 공급원

**결정:** Dashboard가 Workflow manifest를 수정하지 않는다. 관계와 UI 메타데이터는 별도 저장한다.

**이유:** 표시 편집이나 관계 수정이 Engine 판정을 오염시키면 감사 가능성이 사라진다.

**트레이드오프:** 원본과 파생 Registry 간 세대 불일치를 진단·재생성해야 한다.

## TD-03. AI와 결정론적 검증 책임 분리

**결정:** AI는 해석·생성을 담당하고 Python이 schema, state transition, SHA-256, path, delivery gate를 검증한다.

**이유:** 자연어 “완료”와 실제 파일·근거·관계 상태는 다를 수 있다.

**트레이드오프:** 01~07 계약 파일이 늘어나고 학습 비용이 생긴다. 대신 실패 지점과 재현 경로가 명시된다.

## TD-04. 전체 원문은 파일, Capsule은 bounded summary

**결정:** `user-request.md`에 UTF-8 원문을 저장하고 SHA-256·문자 수·바이트 수를 기록한다. Capsule summary는 탐색에만 쓴다.

**이유:** 긴 프롬프트를 CLI 문자열이나 요약에 반복하면 잘림·인코딩·계약 약화가 발생한다.

**트레이드오프:** launch 파일 수가 늘고 legacy 요청과 호환 계층이 필요하다.

## TD-05. WorkSession과 Run을 분리

**결정:** 사용자의 작업 맥락은 WorkSession, Engine 실행은 Run으로 모델링하고 `OperationId`로 연결한다.

**이유:** 한 작업 세션이 재시도·이어가기·분기 Run을 가질 수 있고, 한 Run 생성 실패가 세션 자체를 없애면 안 된다.

**트레이드오프:** 관계 Registry, reconciliation, revision conflict 처리가 필요하다.

## TD-06. Relationship Gateway 단일 쓰기 경로

**결정:** `HAS_SESSION`, `HAS_RUN`, `CONTINUES`, `BRANCHES_FROM` 변경은 Gateway만 수행한다.

**이유:** 존재하지 않는 Run, 순환 관계, 중복 active relation, revision 충돌을 한 경계에서 거절해야 한다.

**트레이드오프:** 단순 JSON 수정도 Gateway 계약을 거쳐야 한다.

## TD-07. OperationId는 멱등 키

**결정:** Dashboard가 OperationId를 먼저 만들고 외부 CLI와 Engine이 그대로 사용한다.

**이유:** 플랫폼 프로세스와 Run 생성 사이에 네트워크 API가 없으므로 파일 기반 reconciliation key가 필요하다.

**트레이드오프:** Engine이 같은 OperationId를 다른 관계 계약으로 재사용하지 못하도록 immutable operation contract가 필요하다.

## TD-08. 외부 AI CLI

**결정:** Codex·Claude Code·Antigravity를 Dashboard에 내장하지 않고 PowerShell/VS Code 흐름으로 연결한다.

**이유:** 인증·권한·세션 수명·모델 업데이트를 Dashboard가 소유하지 않게 한다.

**트레이드오프:** 플랫폼별 실행 로그와 종료 상태가 균일하지 않다. “프로세스 종료”를 “요청 완료”로 간주할 수 없다.

## TD-09. Candidate-first release

**결정:** 사용자 단위 Candidate 채널에서 활성 포인터와 release manifest hash를 검증한 후 Stable 승격을 판단한다.

**이유:** Engine, 스킬, Dashboard 계약은 함께 변하며 실제 운영 데이터에서 먼저 검증해야 한다.

**트레이드오프:** Candidate와 source working tree 사이의 버전 차이를 문서화해야 한다.

## TD-10. Atomic write + lock + revision

**결정:** Registry와 Operation write는 temp/replace, lock, expected revision을 사용한다.

**이유:** 8×10 병렬 stress와 동시 continuation에서 유실·중복 owner를 방지한다.

**검증:** Workspace Governance 38/38 통과.

**트레이드오프:** Windows 파일 잠금과 일시적 EPERM에 retry/error preservation이 필요하다.

## TD-11. Completion은 fulfillment scope로 판정

**결정:** `artifact_ready`, `approved`, `deployed` gate와 원문 acceptance criteria를 분리한다.

**이유:** 일부 산출물 생성, CLI 종료, 보고서 생성, validation_needed는 사용자 최종 목표 완료가 아니다.

**트레이드오프:** continuation이 오래 대기할 수 있으며 명시적 abort/review 운영이 필요하다.

## TD-12. 공개 자료는 익명 집계와 Mock 데이터만

**결정:** 운영 Database 원본을 복제하지 않고 Project/Run/상태 수와 대표 결함 유형만 공개한다.

**이유:** 실제 경로·프롬프트·개인정보·대용량 산출물은 포트폴리오 설명에 필요하지 않다.

**트레이드오프:** 외부 독자가 모든 원시 근거를 재현할 수는 없다. 대신 산출물 내부의 수치 방법·검증 시각·digest를 제공한다.

## TD-13. 완성형 템플릿을 먼저 축적하고 구성요소 분리는 나중에 수행

**결정:** 프로젝트 시작·기능 추가·유지보수·완료 검토는 바로 사용할 수 있는 완성형 Markdown 템플릿으로 제공한다. 반복 사용으로 공통 패턴이 확인되기 전에는 지나치게 작은 조립 부품으로 분해하지 않는다.

**이유:** 현재 성과를 낸 단위는 완성형 실행 문서이며, 이른 추상화는 선택 항목과 운영 복잡도만 늘릴 수 있다.

**트레이드오프:** 초기에는 템플릿 사이에 일부 중복이 남는다. 사용 기록이 쌓인 뒤 공통 사고·직무·상황·역할 요소를 추출해야 한다.

## TD-14. 실행 템플릿과 Engine Workflow를 분리

**결정:** 템플릿은 현재 상황과 사용자 결정을 담은 실행 기준을 생성하고, Engine Workflow는 그 기준을 구조화·실행·검증한다. 템플릿 선택이 Engine 상태를 직접 변경하지 않는다.

**이유:** 템플릿과 실행기를 결합하면 문서 표현 변경이 Workflow 계약 변경으로 번지고, 원본 템플릿과 프로젝트 실행본의 경계가 사라진다.

**트레이드오프:** 템플릿 → WorkSession → Operation → Run 연결을 별도로 추적해야 한다.

## TD-15. 자동 검증과 사용자 검토를 독립 상태로 유지

**결정:** `pass`, `evidence_insufficient`, `hold`는 Engine 검증 상태로 유지하고, `reviewed_at`과 사용자 메모는 Dashboard Metadata Store에 별도로 저장한다.

**이유:** 자동 검증 통과는 사용자가 결과를 읽고 승인했다는 뜻이 아니다. 반대로 사용자가 확인했다고 해서 근거 부족 판정이 통과로 바뀌어서도 안 된다.

**트레이드오프:** 화면에는 두 상태가 동시에 나타나므로 용어와 집계 기준을 명확히 설명해야 한다.

## TD-16. 파이프라인 명세는 사후 상세 검토 화면으로 사용

**결정:** 파이프라인 명세 화면은 별도의 원본 명세 편집기가 아니라 실행 후 요청, Operation, Run, Evidence, Artifact와 fulfillment를 대조하는 projection으로 사용한다.

**이유:** 시작 전 실행 기준은 템플릿이 이미 담당한다. 같은 내용을 별도 명세 편집기로 중복 관리하면 사용 흐름이 복잡해지고 어느 문서가 최신인지 불명확해진다.

**트레이드오프:** 누락된 원본 계약은 화면에서 보완하지 않고 근거 부족으로 표시해야 한다.
