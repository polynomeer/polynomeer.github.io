# CMS 사용 가이드

관리자용 글 편집기(`cms/`)를 설정하고 쓰는 방법.
설계 배경과 그렇게 만든 이유는 [`docs/features/cms-content-contract.md`](../features/cms-content-contract.md)에 있다.

## 지금 되는 것

| | 상태 |
| --- | --- |
| GitHub OAuth 로그인, 관리자 1인 제한 | 구현, 테스트 완료 |
| 글 목록·검색·열기 | 구현, 로컬 확인 완료 |
| 본문·front matter 편집, 미리보기 | 구현, 로컬 확인 완료 |
| 저장 (main 직접 commit 또는 PR) | 구현, 가짜 GitHub 로 확인 완료 |
| 이미지 업로드 화면 | 없음 (API 는 base64 로 받는다) |
| 수정 이력 보기, 메타데이터 사전 편집 | 없음 |

실제 GitHub 와의 OAuth 왕복만은 로컬에서 확인할 수 없다. OAuth App 과 secret 이 있어야 하므로
**배포한 뒤 한 번 로그인해 보는 것이 그 부분의 유일한 검증**이다.

## 한 번만 하는 준비

### 1. GitHub OAuth App 만들기

<https://github.com/settings/developers> → New OAuth App.

| 항목 | 값 |
| --- | --- |
| Application name | 아무거나 |
| Homepage URL | 배포될 Worker 주소 |
| Authorization callback URL | 배포될 Worker 주소 + `/auth/callback` |

주소를 아직 모르면 `npx wrangler deploy` 를 먼저 돌려 받은 뒤 App 에 채워 넣는다.

`repo` scope 를 요구한다. 저장소 contents 에 commit 할 수 있는 가장 좁은 고전 scope 가 그것이다.
더 좁히려면 OAuth App 대신 GitHub App 으로 바꿔야 한다.

### 2. secret 넣고 배포

```bash
cd cms
npx wrangler secret put SESSION_SECRET        # 32자 이상, 직접 만든 임의 문자열
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler deploy
```

세 값 모두 `wrangler.jsonc` 에 쓰지 않는다. 그 파일은 git 에 올라간다.
`GITHUB_CLIENT_ID` 는 비밀이 아니지만, OAuth App 을 바꿀 때 배포 없이 교체하려고 같이 둔다.

`wrangler.jsonc` 의 공개 설정은 네 개다. 관리자 GitHub 숫자 ID(`ADMIN_GITHUB_IDS`),
저장소 owner 와 이름, 기본 브랜치.

## 로그인

1. Worker 주소를 연다.
2. **GitHub로 로그인** 을 누른다.
3. GitHub 에서 승인한다.
4. 편집 화면으로 돌아온다. 머리줄에 `@계정명` 이 보이면 된 것이다.

세션은 8시간이다. 스크립트가 읽을 수 없는 쿠키에 서명해 담으며, GitHub 토큰도 그 안에 들어
있어 응답 본문이나 URL 에는 절대 나오지 않는다.

허용 목록은 **요청마다 다시 확인한다.** `ADMIN_GITHUB_IDS` 에서 ID 를 빼고 배포하면 이미
로그인된 세션도 다음 요청에서 끊긴다. 세션 만료를 기다릴 필요가 없다.

## 편집 화면

```
┌── 글 찾기 ─────┬── _posts/notes/.../2024-09-07-closure.md ──────┐
│ [검색        ] │ [본문] [Front matter] [미리보기]                │
│ 1 / 1272       │ ┌───────────────────────────────────────────┐ │
│ · 글 목록      │ │ 마크다운                                   │ │
│ [새 글]        │ └───────────────────────────────────────────┘ │
│                │ [x] PR로 올리기            [저장]              │
└────────────────┴───────────────────────────────────────────────┘
```

### 글 열기

검색창에 경로 일부를 친다. 목록은 최대 200개까지 그린다.

검색은 **경로로만 걸린다.** 목록 API 가 트리 한 번 읽기로 경로만 받아 오고 제목을 읽지 않기
때문이다. 목록에 보이는 이름도 제목이 아니라 파일명이다. 제목까지 찾으려면 1,272개 파일을 전부
읽어야 해서 지금은 하지 않는다.

### 새 글

**새 글** → 제목을 입력하면 이렇게 채워진다.

| | |
| --- | --- |
| 경로 | `_posts/notes/<오늘 날짜>-<슬러그>.md` |
| 날짜 | 서울 시간 기준 오늘, `09:00:00 +0900` |
| `status` | `draft` |
| `categories` | `[Notes]` |

유형이 `notes` 가 아니거나 하위 폴더가 필요하면 **경로를 직접 고칠 방법이 아직 없다.**
`lecture/` 나 `TIL/` 에 쓸 글은 저장소에서 파일을 만들고 편집기로 여는 쪽이 빠르다.

슬러그는 한글을 그대로 남긴다. 한글 제목이면 한글 파일명이 된다. 기존 글은 거의 영문 슬러그이니
영문 제목으로 만들거나 저장 전에 경로를 확인한다.

### 세 개의 탭

- **본문** — 마크다운. front matter 는 여기 없다.
- **Front matter** — 원문을 **그대로** 고친다. YAML 로 다시 쓰지 않으므로 한 필드를 고치면 그
  한 줄만 바뀐다. 주석, 필드 순서, 따옴표 방식, 편집기가 모르는 필드가 그대로 남는다.
- **미리보기** — 마크다운을 그려 준다. 소스를 전부 escape 한 뒤 아는 문법만 태그로 바꾸므로
  글에 적은 `<script>` 는 글자로 보인다. `javascript:` 와 `data:` 링크는 `#` 이 된다.

미리보기는 **Jekyll 이 아니다.** Liquid 태그는 실행하지 않고 몇 행에 있는지만 알려 준다.
include, 플러그인, 테마 스타일은 반영되지 않는다. 최종 모양은 `bundle exec jekyll serve` 로 본다.

### 저장

**저장** 또는 `Cmd/Ctrl + S`.

| PR로 올리기 | 하는 일 |
| --- | --- |
| 체크 (기본값) | `cms/<슬러그>` 브랜치에 commit 하고 main 으로 PR 을 연다. 브랜치가 없으면 main 에서 새로 딴다 |
| 해제 | main 에 바로 commit 한다 |

커밋 메시지는 `post: update <파일명>` 으로 고정이다. 저장소의 Conventional Commits 규칙과
`type: summary` 형태로 맞지만 scope 는 붙지 않는다.

한 번의 저장은 **commit 하나**다. 글과 이미지를 같이 올려도 쪼개지지 않으므로, 이미지가 아직
없는 글로 사이트가 빌드되는 일이 없다.

PR 을 재시도해도 PR 이 두 개가 되지 않는다. 같은 브랜치에 열린 PR 이 있으면 그것을 쓴다.

### 저장이 실패했을 때

| 화면에 나오는 말 | 뜻 | 할 일 |
| --- | --- | --- |
| 브랜치가 그 사이 바뀌었습니다 | 다른 곳에서 같은 브랜치가 움직였다. 덮어쓰지 않고 멈춘 것이다 | 글을 다시 열고 편집 내용을 다시 적용한다 |
| 이미 반영되어 있었습니다 | 앞선 시도가 이미 커밋됐고 응답만 유실됐다 | 아무것도 하지 않아도 된다 |
| 저장 실패: … | 그 외 | 아래 |

**실패해도 편집 내용은 지워지지 않는다.** 타이핑할 때마다 `localStorage` 에 `cms:draft:<경로>`
로 남기고, 저장에 성공했을 때만 지운다. 브라우저가 죽어도 그 글을 다시 열면 **복구본
불러오기** 가 뜬다. 서버 사본과 다를 때만 뜨므로 평소에는 보이지 않는다.

시크릿 창이나 저장소 용량 초과로 `localStorage` 를 못 쓰면 복구 기능만 조용히 빠지고 편집과
저장은 그대로 된다.

## 쓸 수 있는 범위

Worker 가 요청을 받기 전에 경로로 막는다.

| | 허용 |
| --- | --- |
| 읽기 | `_posts/` |
| 쓰기 | `_posts/`, `assets/img/` |

`_config.yml`, 워크플로, 플러그인, 레이아웃은 편집기로 건드릴 수 없다. 편집 작업이 아니기
때문이고, 토큰이 `repo` scope 를 들고 있어도 Worker 가 거부한다.

## 로컬에서 눌러 보기

```bash
node cms/tools/dev-server.js
```

<http://127.0.0.1:4010> 에서 **진짜 Worker** 가 돈다. GitHub 만 가짜다.

- 읽기는 저장소의 실제 `_posts` 를 읽는다
- 쓰기는 커밋하지 않고 터미널에 `would write:` 로 찍는다
- OAuth 는 흉내 낼 수 없어 관리자로 로그인된 상태에서 시작한다

배포본과 경로가 같다. 정적 파일은 `/app.js`, `/app.css` 로 나가며, 둘 중 한쪽에서만 되는
주소는 없다.

## 검사

```bash
cd cms && npm test
```

의존성 0, 테스트 65개.

| 파일 | 검사하는 것 | 개수 |
| --- | --- | --- |
| `test/auth.test.js` | 세션 서명·검증, OAuth state, 허용 목록, 쿠키 | 14 |
| `test/github.test.js` | 원자적 commit, CAS ref, 멱등 재시도, 멱등 PR | 10 |
| `test/worker.test.js` | 라우트와 인가, 경로 제한, 브랜치 생성, 오류 매핑 | 21 |
| `test/markdown.test.js` | 미리보기가 작성자 입력을 실행하지 않는지 | 10 |
| `test/frontmatter.test.js` | 원문 보존 분리·결합 | 10 |

특히 다음 세 가지는 테스트가 깨지도록 묶여 있다. 고칠 때 같이 보면 된다.

- commit 트리에 `base_tree` 를 항상 보낸다. 빠뜨리면 그 한 번의 commit 이 저장소 전체를 지운다
- ref 갱신은 `force: false` 다. 브랜치가 움직였으면 조용히 덮어쓰지 않고 409 로 끝낸다
- 응답 본문에 GitHub 토큰이 나오지 않는다

## 아직 없는 것

- 이미지 업로드 화면. API 는 `{ path, content, encoding: 'base64' }` 로 받을 수 있다
- 수정 이력 보기
- 메타데이터 사전(토픽·시리즈·분류) 편집
- 새 글의 유형과 경로 직접 지정
- 제목 검색
