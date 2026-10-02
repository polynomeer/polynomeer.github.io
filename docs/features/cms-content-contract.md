# CMS 콘텐츠 계약 (Stage 0)

출처: `polynomeer-cms-detailed-design.docx` (설계 기준일 2026-10-02, 분석 기준 commit `2c8afcce`).
이 문서는 그 설계서를 이 저장소의 실제 상태에 맞춰 고친 작업 계획이고, Stage 0의 구현 명세다.

## 왜 Stage 0 부터인가

설계서의 최종 형태는 Cloudflare Worker + Durable Object + 비공개 R2 + GitHub OAuth 로
돌아가는 관리자 CMS다. 계정과 secret과 배포 환경이 필요하고, 이 저장소 안에서 끝나지 않는다.

설계서 자신이 20장에서 1단계 앞에 **0단계 "저장소 계약 고정"** 을 둔다. 현재 commit 의
fixture, 공개 필터, 분류와 토픽 규칙을 확정하고 전체 콘텐츠를 읽기 전용으로 색인하는 일이다.
이 단계는 클라우드가 없어도 되고, 저장소 안에서 완결되며, CMS 를 만들지 않더라도 그 자체로
쓸모가 있다 — 지금 `check-post-consistency.rb` 가 잡지 않는 것들을 잡는다.

그래서 Stage 0 만 먼저 구현한다. 1단계 이후는 계정과 비용과 운영 책임이 걸린 결정이라
사람이 정할 일이다.

## 설계서가 이 저장소에 대해 틀리게 적은 것

설계서는 `2c8afcce` 를 읽고 썼다. 그 뒤로 main 이 9 commit 움직였고(요약 탭, 인용 목록
상한 제거, 시리즈 패널 압축, 미리보기 캐시 등), 아래는 그와 별개로 확인한 사실이다.

| 설계서 서술 | 실제 (이 문서 작성 시점) | 계약에 반영한 결정 |
| --- | --- | --- |
| `published` 를 status 와 공존하는 Jekyll boolean 으로 다루고 모순을 검사 | `_posts` 전체에서 `published:` 0건, `draft:` 0건. `AGENTS.md` 는 두 키를 **금지**한다 | 공존 규칙을 넣지 않는다. 두 키가 나타나면 **오류**로 막는다 |
| `_posts/**` 파일 1,246개 | 1,253개. 그중 날짜 접두사가 있는 것 1,082개 | 날짜 없는 **171개**를 `not-a-post` 로 분류해 따로 센다 |
| status 누락은 published 로 해석 | 맞다. 그리고 누락이 **1,100개**로 다수다 | 누락을 정상으로 보고, 파일에 써 넣지 않는다 |
| 유형은 경로 첫 폴더명 소문자화 | 맞다. 등록된 유형 9개(`til notes book conference techblog lecture problemsolving recruit reference`) | 그대로 쓴다 |
| `monticker` 등 미등록 폴더는 '기타 경로' | 맞다. `_posts/` 최상위에 `monticker` 가 있다 | `unregistered` 로 표시만 하고 옮기지 않는다 |
| `_posts/TIL` 대소문자 불일치 | 맞다. 디렉터리는 `TIL`, 유형 ID 는 `til` | 소문자화해 맞추되 경로는 건드리지 않는다 |
| `timezone` 이 비어 있다 | 맞다 (`_config.yml:12`) | 새 글 날짜에 `+09:00` 을 명시하도록 요구한다 |
| `cms` 를 Jekyll `exclude` 에 추가 | 현재 `exclude` 에 `docs`, `tools` 는 있고 `cms` 는 없다 | 그 디렉터리를 만들 때 함께 넣는다. Stage 0 은 만들지 않는다 |

설계서의 나머지 서술(상태 필터 동작, `post-revisions.rb` 의 6줄·10건 제한, PWA 캐시 활성,
Supabase 댓글 로그인을 관리자 세션으로 인정하지 않을 것)은 확인한 범위에서 맞다.

## 기존 검사와 겹치지 않게 나누기

`scripts/check-post-consistency.rb` 는 이미 돌고 있고 pre-commit 에 걸려 있다. 남겨 둔다.
다만 설계서 19장이 지적한 대로 **오류로 막아야 할 것을 경고로 흘린다.** 특히 front matter
YAML 이 깨진 파일을 `warn` 한 줄 찍고 건너뛴 뒤 exit 0 으로 끝낸다.

| | `check-post-consistency.rb` | Stage 0 `validate-content.rb` |
| --- | --- | --- |
| 다루는 범위 | 날짜 있는 글만 | `_posts/**` 전부 + 사전(`_topics`, `_series_pages`, `_content_types`, `_post_statuses`) |
| YAML 파손 | 경고 후 건너뜀, exit 0 | **오류** |
| 금지 키 | 안 봄 | **오류** |
| 알 수 없는 status | 안 봄 | **오류** |
| 시리즈 참조·순서 | 안 봄 | **오류** |
| 토픽 `posts`/`featured` 참조 | 안 봄 | **오류** |
| 태그·분류 표기 충돌 | 오류 | 안 봄 (중복하지 않는다) |
| 끊어진 내부 링크 | 경고 | 안 봄 |

## Stage 0 범위

1. **콘텐츠 모델** — `_posts` 의 모든 파일을 읽어 경로, 분류, 상태, 시리즈, 토픽 소속,
   유효성 등급을 가진 레코드로 만든다. 원문 YAML 의 주석·순서·따옴표는 건드리지 않는다
   (Stage 0 은 **읽기 전용**이다).
2. **색인** — 위 레코드를 JSON 으로 낸다. 이후 단계의 목록·검색 API 가 이 모양을 그대로 쓴다.
   `--index` 는 그중 제목과 상태만 뽑아 `cms/content-index.json` 에 쓰고, 편집기 목록이 이것을
   읽는다. 트리 읽기는 경로와 sha 만 주므로 제목은 달리 올 데가 없다.
3. **검증** — 계약 위반을 오류로 내고 exit 1 한다.

구현하지 않는 것: 쓰기, 인증, Worker, 이미지, PR 생성. 설계서 1단계부터의 일이다.

### 유효성 등급

| 등급 | 뜻 | 수 |
| --- | --- | --- |
| `post` | 날짜 접두사가 있어 Jekyll 이 글로 내보내는 파일 | 1,082 |
| `not-a-post` | `_posts` 안이지만 날짜 접두사가 없어 Jekyll 이 무시하는 파일 | 171 |
| `broken` | front matter YAML 이 파싱되지 않는 파일 | 0 |

### 오류로 막는 것

- front matter YAML 파싱 실패 또는 매핑이 아님 (`broken`)
- `published:` 또는 `draft:` 키 사용 (`AGENTS.md` 금지 항목)
- `status` 가 `_post_statuses` 에 없는 값
- `series` 가 `_series_pages` 의 `series_id` 에 없음
- 같은 시리즈 안에서 `series_order` 중복
- `series_order` 가 음수이거나 정수가 아님
- `_topics` 의 `posts` / `featured` / `exclude` 가 없는 slug 를 가리킴
- `categories` / `tags` 가 배열이 아님

### 경고로만 두는 것

- 미등록 최상위 폴더 (`monticker`, 25건)
- 날짜 없는 파일 (171건 — 과거 자료라 지금 고칠 일이 아니다)
- front matter 가 아예 없는 글 (15건, 아래 참고)
- `series` 는 있는데 `series_order` 가 없음

### 처음 돌렸을 때 틀린 쪽은 규칙이었다

초안 규칙으로 main 을 검사하니 오류 17건이 나왔다. 둘 다 콘텐츠가 아니라 규칙이 틀렸다.

- **front matter 없는 글 16건을 `broken` 오류로 잡았다.** 그런데 이 파일들은 `_site` 에
  멀쩡히 렌더된다 — 날짜 접두사만 있으면 Jekyll 이 `_config.yml` 의 defaults 를 적용하고
  제목을 파일명에서 가져온다. `_posts/notes/programming/2024-09-07-closure.md` 는 `# Closure`
  한 줄로 시작해 `/posts/closure/` 로 나간다. 빌드를 깨뜨리지 않으므로 오류가 아니다.
  다만 편집기 입장에서는 고칠 `title` 도 `status` 도 없으니 경고로 남긴다.
- **`series_order: 0` 을 "양의 정수가 아님" 으로 잡았다.** `batch-structure-improvement`
  시리즈는 "Part 0 — 왜 이 배치는 가끔 터질까?" 로 시작해 0..5 로 간다. 의도된 값이다.
  규칙을 음이 아닌 정수로 바꿨다.

글은 하나도 고치지 않았다. 계약은 이 블로그를 적는 것이지 이상적인 블로그를 적는 것이 아니다.

## 수용 기준과 실측

| 기준 | 결과 |
| --- | --- |
| main 에서 오류 0 | `0 error(s), 41 warning(s)` |
| 색인이 `_posts` 전체를 덮는다 | 1,253개 = post 1,082 + not-a-post 171, 누락 0 |
| 색인이 실제 빌드와 일치한다 | `published` 984개가 `_site/posts/` 985개와 1:1. 남는 하나는 목록 페이지 `index.html` |
| 고의로 깨뜨린 fixture 가 걸린다 | YAML 파손·금지 키·없는 시리즈·순서 중복 네 종 모두 exit 1 |
| 정상 fixture 는 통과한다 | exit 0 |

세 번째 줄이 설계서 22장 수용 기준 1번("하위 경로를 누락 없이 색인하고 비정규 파일은 구분")에
해당한다. 색인이 published 라고 부른 글은 전부 빌드되어 있고, 빌드된 것 중 색인에 없는 것은
없다.

## 파일

| 경로 | 하는 일 |
| --- | --- |
| `scripts/cms/content_contract.rb` | `_posts` 와 사전을 읽어 파일당 레코드 하나로 만든다. 읽기 전용 |
| `scripts/cms/validate-content.rb` | 계약을 검사해 오류면 exit 1. `--json` 은 색인, `--quiet` 는 오류만 |
| `tests/cms/fixtures/` | 축소 저장소 5개(정상 + 위반 4종) |
| `tests/cms/run-fixtures.sh` | fixture 와 실제 저장소를 함께 검사 |

`CMS_CONTENT_ROOT` 로 검사 대상 루트를 바꿀 수 있다. 고의로 깨진 글을 진짜 `_posts` 에
넣지 않고 fixture 로 돌리기 위한 것이다.

`scripts` 와 `tests` 는 `_config.yml` 의 `exclude` 에 넣었다. `scripts/` 는 전부터
`_site/scripts/` 로 복사돼 사이트에 그대로 올라가고 있었고(링크하는 곳은 없다), fixture 에는
일부러 깨뜨린 글이 들어 있다.

## 결정 사항 (2026-10-02)

| 질문 | 결정 | 근거 |
| --- | --- | --- |
| 관리자 GitHub ID | `62940574` | `api.github.com/users/polynomeer` 조회값 |
| Worker 도메인 | `workers.dev` 기본값 | 커스텀 도메인은 코드 변경 없이 나중에 붙인다 |
| 비공개 초안 저장소 | **쓰지 않는다.** 초안은 지금처럼 `status: draft` 로 저장소에 둔다 | 아래 |
| 날짜 없는 171개 | 그대로 둔다 | 아래 |

### DO 와 R2 를 버린 이유

설계서에서 Durable Object 와 비공개 R2 가 필요한 근거는 수용 기준 7번
"비공개 초안은 공개 Git에 남지 않습니다" 하나다. 그런데 이 블로그는 이미 반대로 돌아간다.

- `status: draft` 80편, `status: archived` 18편이 **전부 공개 저장소에 커밋되어 있다**
- 그중 하나를 `raw.githubusercontent.com` 에서 받아 보면 **HTTP 200** 이다. 누구나 읽는다
- `_data/post_statuses.yml` 이 draft 를 정의하는 말은 "Still in progress and not ready for
  **normal publication**" 이다. 기밀이 아니라 사이트에 아직 안 내보냄이다

즉 설계서는 "사이트에서 숨김" 을 "비밀" 로 읽고 그 위에 저장 계층을 하나 더 세웠다.
이 블로그의 실제 운영과 맞지 않으므로 버린다. 숨김은 `published-status-filter.rb` 가 이미
하고 있고, 백업은 git 이 한다.

이 결정으로 설계서 12장(저장 레이어) 전체와 월 비용, 백업 의무, 두 저장소 동기화가 사라진다.
1단계에 남는 것은 "GitHub OAuth 로 본인 확인 → 저장소에 commit 또는 PR" 뿐이다.

반대로 초안을 정말 비공개로 돌리고 싶다면 그것은 CMS 과제가 아니라 이미 공개된 98편을
어떻게 할지의 콘텐츠 과제이고, 지운다고 git 이력과 색인에서 사라지지도 않는다.

### 171개를 그대로 두는 이유

`lecture/refactoring` 26, `recruit/Interview` 21, `problemsolving/Programmers` 17 … 오래된
수강·독서·문제풀이 노트다. 171개 중 167개가 front matter 조차 없는 평범한 마크다운이고,
파일명에 공백이 있는 것도 있다. Jekyll 이 무시하므로 서버에 올라가지 않고 비용도 없다.
검증기가 `not-a-post` 로 분류해 세고 있으니 사고가 날 일도 없다. 글로 승격하려면 171개에
날짜·제목·상태·분류를 붙여야 하고 사이트가 그만큼 불어난다. 거슬릴 때 `_posts` 밖으로
옮긴다.

## Stage 1 범위 (결정 반영 후)

| | 설계서 1단계 | 실제로 만들 것 |
| --- | --- | --- |
| Worker origin + GitHub OAuth + 관리자 1인 제한 | 필요 | 필요 |
| Durable Object | 필요 | 버림 |
| 비공개 R2 | 필요 | 버림 |
| 서버 임시저장, 두 저장소 동기화 | 필요 | 버림 |
| 초안 저장 | DO | 기존 `status: draft` commit |

의존성을 두지 않는다. 세션 서명, OAuth state, 허용 목록, GitHub 요청 구성은 전부 순수
함수라 Web Crypto 만으로 쓰고 `node --test` 로 검사한다. Cloudflare 에 묶이는 부분은
`fetch` 핸들러 하나뿐이고, 배포할 때 wrangler 를 더하면 된다.

## Stage 1 구현 현황

| 파일 | 하는 일 | 검사 |
| --- | --- | --- |
| `cms/src/auth.js` | 세션 서명·검증, OAuth state, 허용 목록, 쿠키 | 14 |
| `cms/src/github.js` | 원자적 commit, CAS ref, 브랜치 생성, 멱등 재시도, 멱등 PR | 10 |
| `cms/src/worker.js` | 라우트와 인가, 경로 제한, 제목 색인 병합, 오류 매핑 | 28 |
| `cms/src/ui/markdown.js` | 미리보기가 작성자 입력을 실행하지 않음, 이미지 주소 해석 | 17 |
| `cms/src/ui/frontmatter.js` | 원문 보존 분리·결합 | 10 |
| `cms/src/ui/images.js` | 업로드 파일명, 이름 충돌, 크기 등급 | 9 |

```bash
cd cms && npm test   # 88 tests, 의존성 0
```

설정하고 쓰는 방법은 [`docs/guides/cms-usage-guide.md`](../guides/cms-usage-guide.md)에 따로 적었다.

### 배포할 때 필요한 것

`cms/wrangler.jsonc` 에 공개 설정만 들어 있다. secret 은 git 에 넣지 않고 넣는다.

```bash
cd cms
npx wrangler secret put SESSION_SECRET        # 32자 이상
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler deploy
```

GitHub OAuth App 의 Authorization callback URL 은 배포된 Worker 주소 + `/auth/callback` 이다.
`repo` scope 를 요구하는데, 저장소 contents 에 commit 할 수 있는 가장 좁은 고전 scope 가
그것이다. 더 좁히려면 GitHub App 으로 바꿔야 하고 설계서 21장이 그 경로를 적어 두었다.

### 편집 화면

`cms/src/ui` 의 정적 파일 네 개다. 프레임워크도 번들러도 없다. 브라우저가
`markdown.js` 와 `frontmatter.js` 를 그대로 import 하므로 **테스트가 검사하는 바로 그 코드가
화면에서 돈다** — 중간에 빌드 단계가 없다.

- **미리보기의 안전성은 순서에서 나온다.** 소스를 먼저 전부 escape 하고, 그다음에 아는 문법만
  태그로 바꾼다. 작성자가 친 것은 요소가 될 수 없으므로 `<script>` 와 `onerror=` 는 글자로
  보인다. 설정을 틀릴 sanitizer 도, 빠뜨릴 allowlist 도 없다. `javascript:` 와 `data:` 링크는
  `#` 가 된다.
- **Liquid 는 실행하지 않고 몇 행에 있는지 알려 준다.** 플러그인을 돌릴 수 없는데 그럴듯하게
  그리면 틀린 미리보기가 된다.
- **Front matter 는 YAML 로 다시 직렬화하지 않는다.** 한 필드를 고치면 그 한 줄만 바뀐다.
  주석·순서·따옴표·모르는 필드가 노력이 아니라 구조로 보존된다.
- **로컬 복구.** 타이핑할 때마다 `localStorage` 에 넣고, 서버 사본과 다를 때만 "복구본
  불러오기" 를 띄운다. 저장에 실패하면 지우지 않는다 — 화면 밖에 있는 유일한 사본이다.

### 로컬에서 눌러 보기

```bash
node cms/tools/dev-server.js   # http://127.0.0.1:4010
```

GitHub 를 가짜로 세우고 진짜 Worker 를 돌린다. 읽기는 실제 `_posts` 를 읽고, 쓰기는 커밋하지
않고 로그만 찍는다. OAuth 만은 흉내 낼 수 없어(실제 앱과 왕복이 필요하다) 관리자로 로그인된
상태로 시작한다.

확인한 것: 글 1,272개 목록과 검색, 실제 글 열기, 미리보기 렌더링, 저장 → tree·commit·PR,
성공 시 로컬 사본 삭제, 강제 종료 후 복구본 감지, 375px 1열·가로 넘침 0.

정적 파일 주소는 배포본과 같다(`/app.js`, `/app.css`). 한쪽에서만 되는 주소가 남지 않도록
dev 서버도 접두사를 떼지 않는다.

### 아직 없는 것

수정 이력 보기, 메타데이터 사전 편집, 새 글의 유형·경로 직접 지정, 이미지 리사이즈.

