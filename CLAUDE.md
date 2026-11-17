# DejaRun (Codegeist 2026 출품작)

이 파일은 Claude Code가 이 저장소에서 작업할 때 따르는 프로젝트 지침이다.

## 1. 한 줄 요약

DejaRun은 연구개발 팀이 새 실험을 시작하려는 순간, Jira와 Confluence에 남아 있는 과거 실험 중 조건이 같은 것을 찾아 결과와 함께 보여주는 Forge 앱이다. 이미 한 실험을 모르고 다시 하는 일을 막는다.

- 대회: Atlassian Codegeist 2026 (Devpost), 주제 "Build with context. Ship with confidence."
- 카테고리: Apps for Specialized Industries (소재, 화학, 공정 연구개발)
- 대상 사용자: 실험을 계획하는 연구원과 실험 자원을 배분하는 랩 매니저
- 해결하는 문제: 실험 기록이 개인 보고서와 티켓에 흩어져 있고 담당자가 바뀌면 사라진다. 특히 실패한 실험은 공유되지 않아 같은 조건이 반복되고, 재료와 장비 시간과 몇 주의 일정이 낭비된다.
- 개발 인원: 1명. 범위를 넓히지 말고 아래 MVP를 끝까지 동작하게 만드는 것이 우선이다.
- 제출 마감: 2026년 12월 22일로 알려져 있음 (2차 출처 기준. 정확한 날짜와 시각, 시간대는 Devpost 대회 페이지에서 확인 후 수정)

## 2. 심사 기준과 그에 따른 개발 원칙

다섯 항목이 각 20%다. 모든 구현 결정은 이 기준에 비추어 판단한다.

| 심사 항목 | 이 프로젝트에서의 의미 |
|---|---|
| Technological Implementation | 키워드 검색 래퍼로 보이면 실패. 실험 조건을 구조화해 수치 허용오차까지 비교하고, 왜 중복인지 파라미터 단위로 설명해야 한다. 하드코딩된 데모 경로 금지 |
| Design | 실험 등록, 중복 경고, 판단(연결 또는 사유를 남기고 진행), 기록까지 끊기지 않는 흐름. 빈 상태, 로딩, 오류 화면 포함 |
| Potential Impact | 대상을 연구개발 랩으로 좁게 유지. 절감한 실험 수를 화면에 보여준다 |
| Innovation | 실패한 실험과 문서에만 남은 과거 실험까지 찾아낸다. 중복을 무조건 막지 않고 재현 실험 같은 정당한 반복은 사유와 함께 허용한다 |
| Presentation | 5분 미만 영상에서 처음부터 끝까지 시연 가능해야 하므로, 시드 데이터와 데모 시나리오를 코드로 관리 |

## 3. 절대 규칙

1. 실제 회사의 데이터, 시스템명, 문서 양식, 코드, 배합이나 공정 조건을 쓰지 않는다. 데모 데이터는 전부 가상이다.
2. 데모 도메인은 9절에 정한 접착제 배합과 코팅 경화 두 가지로 한정한다. 다른 산업 분야의 예시를 임의로 추가하지 않는다.
3. 앱의 모든 UI 문구, 에이전트 프롬프트, README, 주석은 영어로 쓴다. 심사위원이 영어권이다.
4. 외부로 데이터를 내보내지 않는다(egress 없음). 저장은 Forge 호스팅 스토리지만 사용해 Runs on Atlassian 요건을 유지한다.
5. API 토큰이나 자격 증명을 파일에 쓰거나 로그에 남기지 않는다. `forge login`은 사용자가 직접 터미널에서 실행한다.
6. Forge의 모듈 이름, 매니페스트 구조, 스코프는 기억에 의존하지 말고 공식 문서로 확인한 뒤 작성한다. Rovo 관련 모듈은 최근에 바뀐 것이 많다.
7. 확인이 안 되는 기능은 추측으로 구현하지 말고, 무엇이 불확실한지 사용자에게 알린다.

## 4. 문서 확인 방법

작업 전에 Forge MCP 서버를 Claude Code에 연결해 매니페스트와 모듈 정보를 조회한다. 연결 방법은 아래 페이지에 있다.

- Forge MCP 서버: https://developer.atlassian.com/platform/forge/forge-mcp/
- Forge 시작하기: https://developer.atlassian.com/platform/forge/getting-started/
- rovo:agent: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/
- action: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/
- rovo:mcp: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/
- rovo:skill: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-skill/
- Teamwork Graph 연동 방식: https://developer.atlassian.com/platform/teamwork-graph/ways-to-integrate/

착수 시 반드시 확인할 것:

- 하나의 Forge 앱이 Jira와 Confluence 데이터를 함께 읽는 현재 권장 방식 (앱 호환성 설정, 필요한 스코프)
- 이슈 생성과 수정 이벤트를 받는 트리거 모듈의 이벤트 이름
- 워크플로 전환을 조건부로 막는 모듈(workflow validator)의 현재 사용 가능 여부와 제약
- Confluence 페이지 본문(표 포함)을 읽는 REST API 버전과 스코프
- Forge 스토리지의 현재 권장 API와 인덱스 조회 방식 (KVS, Custom Entities)
- Forge CLI가 요구하는 Node.js LTS 버전
- Teamwork Graph API의 현재 상태와 호출 방법 (6절의 "Teamwork Graph 연동" 참고)
- 개발 사이트에서 Rovo 채팅과 에이전트를 쓸 수 있는지. 무료 개발 사이트에서 안 되면 어떤 요금제나 체험판이 필요한지

Teamwork Graph 관련 문서:

- 변경 이력: https://developer.atlassian.com/platform/teamwork-graph/changelog/
- 제한 사항: https://developer.atlassian.com/platform/teamwork-graph/limitations-and-considerations/
- 연동 방식 개요: https://developer.atlassian.com/platform/teamwork-graph/ways-to-integrate/

## 5. 핵심 개념

- **Experiment record**: 실험 한 건의 구조화된 기록. Jira 이슈 하나에 대응한다.
- **Parameter schema**: 프로젝트가 실험을 기술하는 데 쓰는 항목 정의. 사용자가 설정 화면에서 만든다. 항목마다 이름, 유형(범주형 또는 수치형), 단위, 허용오차, 가중치를 가진다.
- **Prior run match**: 새 실험과 과거 실험의 비교 결과. 유사도 점수, 판정, 항목별 일치 여부를 담는다.
- **Decision**: 경고를 받은 사용자의 선택. 과거 실험에 연결하고 중단하거나, 사유를 적고 진행한다.

### Experiment record 필드

| 필드 | 설명 |
|---|---|
| objective | 실험 목적 (짧은 문장과 목적 태그) |
| system | 대상 물질계 또는 제품 (범주형) |
| method | 시험 방법 (범주형) |
| parameters | 스키마에 정의된 조건 값 목록 (이름, 값, 단위) |
| outcome | 결과 상태: success, failed, inconclusive, planned |
| findings | 결과 요약 한두 문장 |
| report | 근거 Confluence 페이지 링크 |
| source | 등록 경로: jira_form, confluence_backfill |

### 유사도 판정 (결정적 코드로 구현)

1. 범주형 항목(system, method, 범주형 파라미터)은 값이 같으면 일치.
2. 수치형 항목은 단위를 표준 단위로 환산한 뒤, 차이가 항목의 허용오차 이내면 일치. 허용오차는 절대값 또는 비율로 설정한다.
3. 항목별 일치 여부에 가중치를 곱해 0에서 1 사이 점수를 낸다. 한쪽에만 값이 있는 항목은 불일치가 아니라 "비교 불가"로 따로 표시하고 점수 분모에서 뺀다.
4. 판정: 점수가 중복 임계값 이상이면 Duplicate, 유사 임계값 이상이면 Similar, 그 미만이면 New. 임계값은 프로젝트 설정에서 바꿀 수 있다.
5. 결과에는 항상 항목별 비교표(새 값, 과거 값, 일치 여부)를 포함한다. 점수만 보여주지 않는다.

단위 환산은 MVP에서 온도(°C, K), 시간(min, h), 농도(wt%, ppm), 압력(kPa, bar)만 지원한다.

에이전트는 판정을 뒤집지 않는다. 에이전트의 역할은 자연어 질문을 구조화된 조건으로 바꾸고, 판정 결과와 과거 실험의 교훈을 설명하고, 문서에서 조건을 추출해 등록을 제안하는 것이다.

## 6. 기능 범위

### MVP (반드시 완성)

1. **파라미터 스키마 설정 화면** (Jira project settings 또는 admin page): 항목 추가, 수정, 삭제, 임계값 설정. 예시 스키마 불러오기.
2. **실험 등록**: 이슈 화면의 패널에서 스키마에 따라 조건을 입력하고 저장.
3. **중복 점검 엔진**: 5절의 판정 로직. 이슈가 생성되거나 조건이 수정되면 자동 실행.
4. **Prior runs 패널** (Jira issue panel): 일치한 과거 실험 목록, 항목별 비교표, 과거 결과와 보고서 링크. 버튼 두 개: "Link as repeat" (과거 실험에 이슈 링크를 걸고 기록), "Proceed with reason" (사유 입력 후 진행, 사유는 기록으로 남김).
5. **Duplicate 판정 시 알림**: 이슈에 댓글을 달아 담당자에게 알린다. 같은 판정으로 댓글이 반복되지 않게 한다.
6. **실험 레지스트리 페이지** (Jira project page): 전체 실험 목록, 결과 상태별 필터, 중복으로 판정되어 중단된 건수와 사유를 남기고 진행한 건수.
7. **Confluence 백필**: 지정한 스페이스의 실험 보고서 페이지에서 조건 표를 읽어 Experiment record 후보를 만든다. 표의 머리글이 스키마 항목 이름과 일치하면 코드로 추출하고, 사용자가 확인한 뒤 등록한다.
8. **Rovo 에이전트 "Prior Run Agent"** (`rovo:agent`): 아래 액션을 사용한다.
9. **시드 스크립트**: 9절의 가상 데이터를 만든다.

### 에이전트 액션 (`action` 모듈)

| 키 | 역할 |
|---|---|
| `find-prior-runs` | 조건을 받아 과거 실험을 검색하고 판정과 비교표 반환 |
| `get-experiment-record` | 이슈 키로 실험 기록 조회 |
| `compare-experiments` | 두 실험의 항목별 차이 반환 |
| `summarize-learnings` | 특정 물질계나 방법에 대해 과거 실험들의 결과를 모아 반환 (성공 조건, 실패 조건 구분) |
| `propose-record-from-page` | Confluence 페이지에서 조건을 추출해 등록 후보 반환 |
| `register-experiment` | 실험 기록 생성 또는 수정 (사용자 확인 후 실행) |
| `link-as-repeat` | 두 실험을 반복 관계로 연결 (사용자 확인 후 실행) |

액션의 이름과 설명은 에이전트가 언제 호출할지 판단하는 근거이므로 구체적으로 쓴다. 쓰기 동작은 실행 전에 대상을 보여주고 확인받도록 프롬프트에 명시한다. 에이전트 프롬프트에는 "기록에 없는 실험 결과를 지어내지 않는다, 근거 이슈 키와 페이지 링크를 항상 함께 제시한다"를 넣는다.

### 보너스 상 대응 (MVP 완료 후)

1. **MCP**: `rovo:mcp` 모듈에 위 액션들을 도구로 등록한다. 외부 MCP 클라이언트에서 "이 조건으로 실험한 적 있나"를 묻는 장면을 시연할 수 있으면 영상에 넣는다.
2. **재사용 스킬**: `rovo:skill`로 "실험 계획 전 선행 실험 확인" 절차를 SKILL.md로 패키징한다. 모듈 제공 상태를 먼저 확인한다.
3. **워크플로 차단**: 사용 가능하면, Duplicate 판정을 받은 이슈가 Decision 없이 "In Progress"로 넘어가지 못하게 한다. 불가능하거나 제약이 크면 생략한다.
4. **Teamwork Graph**: 아래 "Teamwork Graph 연동" 절을 따른다.
5. **Marketplace**: 제출 직전에 등록 신청하고 리뷰 티켓 링크를 확보한다. Preview 단계 API를 쓰는 앱이 등록 심사 대상이 되는지 먼저 확인하고, 안 되면 Teamwork Graph 상과 Marketplace 상 중 하나를 사용자가 고르게 한다.

### Teamwork Graph 연동 (MVP 완료 후, 보너스 상 대상)

목적은 중복 경고에 "누가 했는가, 누구에게 물어보면 되는가"를 붙이는 것이다. 조건 비교는 우리 엔진이 하고, 사람과 연결된 작업의 맥락은 Teamwork Graph에서 읽는다. 우리가 계산한 유사도를 그래프 모양으로 그리는 것은 이 연동이 아니다.

2026년 11월 17일 개발 사이트에서 실제로 호출해 본 결과, 팀 조회(`atlassianUserInTeams`)는 프런트엔드와 백엔드 모두 실패했다(팀 서비스 403). 그래서 팀이 아니라 사람을 기준으로 설계한다. 팀 조회에 의존하는 기능은 만들지 않는다. 호출 결과와 오류 문구는 `docs/platform-notes.md` 7절에 있다.

구현할 기능:

1. **Who ran it**: Prior runs 패널에서 과거 실험의 Jira 담당자와, 그 실험 보고서 페이지의 작성자와 기여자를 보여준다. "Ask the people who ran it" 영역. 보고서로만 남은 실험(백필)은 담당자가 없으므로 그래프가 유일한 출처다. 쿼리: `confluencePageCreator`, `confluencePageContributors` (동작 확인됨).
2. **What they are running now**: 각 사람 아래에 그 사람이 지금 맡고 있는 미완료 업무 항목을 보여준다. 쿼리: `atlassianUserAssignedJiraWorkItems`, 코드에서 `statusCategory.key`가 `done`이 아닌 것만 남긴다 (동작 확인됨). 사람 한 명당 호출 한 번이므로 표시 인원에 상한을 둔다.
3. **Connected context**: 보고서 페이지에서 링크된 다른 페이지를 근거 목록에 추가한다. 쿼리: `confluencePageLinkedConfluencePages` (쿼리는 받아들여졌으나 실제 결과는 미확인. 구현 전에 링크가 있는 페이지로 시험한다). 업무 항목 간 링크는 그래프에 curated query가 없으므로 Jira REST API로 읽는다.
4. **Others on this system**: 같은 물질계(system)로 계획 중이거나 진행 중인 실험과 그 담당자를 알려준다. 우리 기록과 Jira 데이터만 쓰며 그래프는 쓰지 않는다. 팀 이름은 표시하지 않는다.

에이전트 액션 추가: `get-run-owners` (과거 실험의 담당자와 보고서 작성자, 기여자 반환), `find-people-on-system` (같은 물질계를 실험 중인 다른 사람 반환).

스코프: `read:graph:user:atlassian`, `read:graph:issue:jira`, `read:graph:page:confluence`. `read:graph:team:atlassian`은 쓰지 않는다. 이 스코프가 있으면 설치에 조직 관리자 권한이 필요하다.

착수 전 확인할 것. 아래는 2026년 11월 기준으로 알려진 내용이며 일부는 공식 문서가 아닌 개발자 글에서 나온 것이므로, 반드시 공식 문서와 실제 호출로 재확인한다.

- API는 2026년 10월 15일에 Preview 단계가 되었다고 변경 이력에 적혀 있다. 일부 문서에는 얼리 액세스 프로그램(EAP) 표기와 "App not allowlisted" 오류 설명이 남아 있다. 별도 신청이나 허용 목록 등록이 필요한지는 hello world 수준의 호출로 직접 확인한다.
- 스코프는 `read:graph:<object>:<product>` 형태의 객체 단위 스코프를 쓴다. 넓은 범위의 `read:graph:jira`, `read:graph:confluence`는 폐기 예정으로 알려져 있다.
- 새 앱은 curated query(Atlassian이 정의한 타입 지정 GraphQL 필드)를 쓴다. 필요한 순회가 없으면 persisted Cypher query를 검토한다. 요청 시점에 임의의 Cypher를 보내는 방식은 새 앱에서 쓸 수 없다.
- 팀 조회용 curated query(`atlassianUserInTeams`, `atlassianTeamMembers`)는 스키마에 있지만 개발 사이트에서 403으로 실패한다. Confluence 페이지 관련 query는 동작한다.
- 모든 호출은 사용자 권한으로만 가능하다. 이슈 이벤트 트리거에서는 호출할 수 없으므로, 사람이 화면을 보거나 에이전트 액션을 실행할 때 조회한다.
- 결과는 페이지 단위로 오므로 페이지네이션과 상한을 구현한다.
- 오류가 HTTP 200으로 올 수 있고, 스코프가 없거나 호출 제한에 걸리면 빈 결과가 올 수 있다고 보고되어 있다. 빈 결과를 "없음"으로 단정하지 말고 `errors`를 확인한다.

설계 원칙:

- 모든 Teamwork Graph 호출은 `src/clients/twg.js` 한 곳에 모은다.
- 호출이 실패하거나 권한이 없으면 해당 영역만 숨기고 Jira 데이터(담당자, 보고자)로 대체한다. 앱의 핵심 기능은 Teamwork Graph 없이 동작해야 한다.
- 조사 결과와 실제 호출 결과는 `docs/platform-notes.md`에 기록한다.

### 범위 밖

- 전자 연구노트(ELN), LIMS, 장비 데이터 연동
- 실험계획법(DOE) 설계, 통계 분석, 결과 예측
- 임베딩이나 외부 LLM을 호출하는 의미 검색
- 다국어 지원

## 7. 권장 구조

```
manifest.yml
src/
  index.js            # 리졸버, 트리거, 액션 핸들러 진입점
  engine/
    similarity.js     # 점수 계산과 판정
    units.js          # 단위 환산
    compare.js        # 항목별 비교표 생성
  data/
    schema.js         # 파라미터 스키마 CRUD
    records.js        # 실험 기록 저장, 조회, 검색용 인덱스
    decisions.js      # 연결과 사유 기록
  backfill/
    parseTable.js     # Confluence 표에서 조건 추출
  actions/            # 에이전트 액션 하나당 파일 하나
  clients/
    jira.js
    confluence.js
  seed/               # 데모 데이터 생성
src/frontend/         # UI Kit 화면
docs/
  demo-script.md      # 5분 영상 시나리오
  judging-notes.md    # 심사 항목별 대응 근거
README.md             # 설치 방법, 심사위원용 테스트 안내
```

UI는 UI Kit을 기본으로 한다. Custom UI는 UI Kit으로 구현이 불가능한 화면이 있을 때만 쓴다. `engine/` 아래는 Forge API에 의존하지 않는 순수 함수로 작성하고 단위 테스트를 붙인다.

## 8. 작업 순서

각 단계가 끝나면 `forge lint`, `forge deploy`, 개발 사이트에서 직접 확인까지 마친 뒤 다음으로 넘어간다. 단계마다 무엇을 확인했는지 사용자에게 보고한다.

1. 환경 확인: `node -v`, `forge --version`, `forge whoami`. 안 되어 있으면 사용자에게 필요한 조치를 안내하고 멈춘다.
2. 앱 생성과 hello world 수준의 issue panel 배포, 설치.
3. 4절의 확인 항목 조사와 스코프 확정. 결과를 `docs/platform-notes.md`에 기록.
4. 유사도 엔진과 단위 환산을 순수 함수로 구현하고 테스트 작성.
5. 파라미터 스키마 데이터 모델과 설정 화면.
6. 실험 등록 패널과 기록 저장.
7. 이슈 이벤트 트리거로 자동 점검, Prior runs 패널, Decision 기록.
8. 레지스트리 페이지.
9. Confluence 백필.
10. 시드 스크립트로 데이터 구성 후 전체 흐름 점검.
11. Rovo 에이전트와 액션.
12. `rovo:mcp` 등록.
13. Teamwork Graph 연동 (6절의 사람 기준 설계. 3단계에서 호출 가능을 확인함).
14. 빈 상태, 오류, 권한 부족 화면 정리.
15. README, 설치 링크 공유 설정, 데모 시나리오 문서.

3단계 조사에서 Teamwork Graph API를 이슈 패널에서 호출해 보았다. 업무 항목과 Confluence 페이지 조회는 되고 팀 조회는 실패했으며, 그 결과로 13단계를 사람 기준으로 재설계했다. 이슈 패널과 리졸버에 남아 있는 시험 호출 코드는 4단계 착수 전에 제거한다.

## 9. 데모 데이터 (가상)

조직: Halden Materials Lab (지어낸 이름)

- **프로젝트 A, "Bio-based Adhesive Formulation"**
  - 스키마: resin type(범주), hardener ratio(wt%), filler loading(wt%), cure temperature(°C), cure time(min), substrate(범주)
  - 방법: lap shear test, peel test
- **프로젝트 B, "Coating Cure Process"**
  - 스키마: coating type(범주), film thickness(µm), cure temperature(°C), cure time(min), humidity(%RH)
  - 방법: pencil hardness, cross-cut adhesion

과거 실험은 프로젝트당 15건 안팎으로 만들고 다음을 반드시 포함한다.

- 실패로 끝난 실험 여러 건 (findings에 실패 원인 기재)
- 이슈 없이 Confluence 보고서로만 남은 실험 5건 이상 (백필 시연용)
- 담당자가 서로 다른 실험
- 조건이 거의 같지만 한 항목만 허용오차 밖인 쌍 (Similar 판정 시연용)

데모 시나리오의 핵심 장면:

1. 연구원이 프로젝트 A에 새 실험 이슈를 만든다. 조건은 8개월 전 실패한 실험과 경화 온도만 2°C 다르다(허용오차 이내).
2. 패널에 Duplicate 판정과 비교표, 당시 실패 원인, 보고서 링크가 뜬다.
3. 연구원이 "Link as repeat"로 중단하거나, 충전제 함량을 바꿔 Similar로 내려간 뒤 진행한다.
4. Rovo 에이전트에게 "Has anyone tested this resin above 120°C on aluminum?"이라고 묻고 근거와 함께 답을 받는다.
5. 프로젝트 B에서 같은 앱이 다른 스키마로 동작하는 것을 보여준다.

회사명, 인명, 제품명은 모두 지어낸 것을 쓴다.

## 10. 제출물 점검표

- [ ] 심사위원용 설치 링크와 테스트 안내 (README)
- [ ] 5분 미만 데모 영상, YouTube 공개
- [ ] 카테고리와 지원하는 보너스 상 명시, 보너스 상별 증빙
- [ ] 기술 요건 충족 설명 (Forge 사용, 연동한 Atlassian 제품)
- [ ] Devpost 제출 양식 전체 작성
