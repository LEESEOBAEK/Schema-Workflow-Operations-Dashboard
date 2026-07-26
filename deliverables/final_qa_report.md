# Final QA Report

## 범위

README, 문서 6종, 지원 QA 보고서, demo JSON/validator, desktop/mobile 이미지에 대해 링크·명령·화면·기능·라이선스·공개 제외 규칙을 검사한다.

## 자동 검사

최종 실행:

```powershell
node .\demo\validate-demo.mjs
```

| 검사 | 결과 |
|---|---|
| Demo 관계 계약 | PASS — 1 Project, 3 Session, 4 Run, 4 Operation, 6 Evidence, 6 Artifact |
| Markdown 상대 링크 | PASS — broken 0 |
| JSON parse | PASS — error 0 |
| 절대 사용자 경로 | PASS — match 0 |
| secret-like pattern | PASS — match 0 |
| 금지 파일/디렉터리 | PASS — 0 |
| Mermaid fence | PASS — error 0 |
| Desktop PNG | PASS — CSS viewport 1440×1000 @2x, PNG 2880×2000, 247,041 bytes |
| Mobile PNG | PASS — CSS viewport 390×844 @2x, PNG 780×1688, 132,499 bytes |
| 최종 전체 회귀 | PASS — 171/171 |
| 제품 source fingerprint | PASS — pre/post content·Git status 일치 |
| Audit fingerprint | PASS — 32 files, metadata digest 일치 |
| Database fingerprint | PASS — 73,782 files, metadata digest 일치 |
| 대표 README final_output 등록 | PASS — artifact `portfolio_readme`, DeliverablePath `deliverables/README.md` |

## 수동 검사

| 항목 | 결과 | 설명 |
|---|---|---|
| Desktop 화면 | PASS | 오류 페이지 없이 Project/상태/경고/세션/Run detail 표시 |
| Mobile 화면 | PASS | 핵심 카드·상단 조작 영역·긴 제목 표시, 가로 overflow 없음 |
| 운영 원본 노출 | PASS | Mock 데이터만 렌더링 |
| 기능 과장 | PASS | 부분/검증 중/계획과 측정 필요 구분 |
| 라이선스 | PASS | MIT LICENSE 추가, 외부 폰트 라이선스 분리 유지 |
| public URL | PASS | GitHub 공개 저장소 주소 확정 및 README 반영 |

## 근거 일치

- 171/171 테스트는 5개 Python suite 110건과 Dashboard Vitest 61건의 합계다.
- 9 Project는 계약 파일이 있는 ProjectRoot만 센 값이다.
- 68 Run은 canonical `workflow_manifest.json`을 센 값이다.
- Build time은 production build 로그이며 runtime performance로 표현하지 않았다.
- 데스크톱과 모바일 이미지는 각각 CSS viewport 1440×1000 및 390×844에서 2배 픽셀 밀도로 다시 생성했다.
- 모바일 이미지 생성 시 document client/scroll width `390/390`을 확인했다.

## 최종 판정

**포트폴리오 산출물 QA는 PASS.** 프로젝트 라이선스는 MIT로 확정했고 GitHub 공개 저장소 주소도 README에 반영했다. 공식 정의서 지정 경로의 외부 교체는 제품·감사·Database 불변성 통과와 분리해 기록한다.
