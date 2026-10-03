# CMS 배포 가이드

편집기(`cms/`)를 Cloudflare Workers 에 올리는 절차. 처음 한 번만 하면 된다.
올린 뒤의 사용법은 [`cms-usage-guide.md`](./cms-usage-guide.md), 왜 이렇게 만들었는지는
[`../features/cms-content-contract.md`](../features/cms-content-contract.md)에 있다.

## 무엇이 올라가는가

| | |
| --- | --- |
| Worker | `cms/src/worker.js`. 로그인과 GitHub 커밋을 처리한다 |
| 정적 파일 | `cms/src/ui/` 의 아홉 개. 편집 화면 자체다 |
| GitHub OAuth App | 본인 확인용. GitHub 쪽에 따로 만든다 |
| secret 3개 | Cloudflare 에만 넣는다. git 에 올리지 않는다 |

Durable Object 도 R2 도 데이터베이스도 쓰지 않는다. 글은 저장소에 커밋되고, 그게 전부다.

## 준비물

- Cloudflare 계정 (무료 플랜으로 충분하다)
- Node — 이 저장소에서 쓰는 버전이면 된다
- 블로그 저장소를 소유한 GitHub 계정

## 순서가 왜 이런가

OAuth App 에는 **Worker 주소**가 필요한데, 그 주소는 **배포해야** 나온다. 그래서 배포가 먼저다.

secret 없이 올라간 Worker 는 고장난 게 아니다. 화면은 뜨고 로그인만 안 된다. 2번에서 주소를
받고, 3~5번에서 로그인을 붙인다.

## 1. Cloudflare 에 로그인

```bash
cd cms && npx wrangler login
```

브라우저가 열린다. 계정이 없으면 거기서 만들면 된다. 끝나면 확인한다.

```bash
npx wrangler whoami
```

`You are not authenticated` 가 나오면 아직 안 된 것이다.

## 2. 먼저 배포해서 주소를 받는다

```bash
npx wrangler deploy
```

처음 배포하는 계정이면 `*.workers.dev` 하위 도메인을 하나 정하라고 묻는다. 정하고 나면 출력
마지막 줄에 주소가 찍힌다.

```
https://polynomeer-cms.<정한-이름>.workers.dev
```

**이 주소를 적어 둔다.** 아래에서 세 번 쓴다.

지금 열어 보면 "이 저장소의 관리자만 쓸 수 있습니다" 와 로그인 버튼이 보인다. 눌러도 아직
안 된다. 정상이다.

설정이 맞는지만 먼저 보고 싶으면 배포하지 않고 확인할 수 있다.

```bash
npx wrangler deploy --dry-run
```

## 3. GitHub OAuth App 만들기

<https://github.com/settings/developers> → **New OAuth App**.

| 항목 | 넣을 값 |
| --- | --- |
| Application name | 아무거나 (`polynomeer-cms`) |
| Homepage URL | 2번에서 받은 주소 |
| Authorization callback URL | 2번에서 받은 주소 + `/auth/callback` |

callback URL 은 **한 글자도 틀리면 안 된다.** 끝의 `/` 유무까지 Worker 가 보내는 값과 같아야
한다. Worker 는 `https://<주소>/auth/callback` 을 보낸다.

만들고 나서 두 가지를 챙긴다.

- **Client ID** — 화면에 그냥 보인다
- **Client secret** — `Generate a new client secret` 를 눌러 만든다. **그 화면을 벗어나면
  다시 못 본다.** 바로 다음 단계로 간다

이 App 은 `repo` scope 를 요구한다. 저장소 contents 에 commit 할 수 있는 가장 좁은 고전
scope 가 그것이다.

## 4. 관리자 GitHub ID 확인

로그인은 **숫자 ID** 하나만 허용한다. 이름이 아니라 숫자다.

```bash
curl -s https://api.github.com/users/polynomeer | grep '"id"'
```

`cms/wrangler.jsonc` 의 `ADMIN_GITHUB_IDS` 에 이미 `62940574` 가 들어 있다. 값이 같으면 할 일이
없다. 다르면 고치고 다시 `npx wrangler deploy` 한다. 이 값은 비밀이 아니라서 git 에 있어도 된다.

## 5. secret 세 개 넣기

세션 서명에 쓸 값을 먼저 만든다.

```bash
openssl rand -base64 48
```

출력을 복사해 두고, 세 개를 차례로 넣는다. 각 명령이 값을 물으면 붙여넣고 Enter 를 친다.
입력은 화면에 보이지 않는다.

```bash
npx wrangler secret put SESSION_SECRET        # 방금 만든 값
npx wrangler secret put GITHUB_CLIENT_ID      # 3번의 Client ID
npx wrangler secret put GITHUB_CLIENT_SECRET  # 3번의 Client secret
```

- `SESSION_SECRET` 은 **32자 이상**이어야 한다. 짧으면 Worker 가 거부한다
- secret 은 넣는 즉시 적용된다. 다시 배포하지 않아도 된다
- 세 값 모두 `wrangler.jsonc` 에 쓰지 않는다. 그 파일은 git 에 올라간다

넣은 목록은 볼 수 있다. 값은 못 본다.

```bash
npx wrangler secret list
```

## 6. 되는지 확인

주소를 열고 순서대로 본다.

1. **GitHub로 로그인** → GitHub 승인 화면 → 돌아온다
2. 머리줄에 `@polynomeer` 가 뜬다
3. 왼쪽 목록에 글이 1,200개 넘게 뜨고, 한글 제목으로 검색된다
4. 아무 글이나 열어 한 글자 고치고 **저장** → `커밋 ...` 과 `PR #…` 이 뜬다
5. GitHub 에서 그 PR 이 실제로 열렸는지 본다

여기까지 되면 끝이다.

## 잘 안 될 때

실시간 로그부터 본다.

```bash
npx wrangler tail
```

| 증상 | 원인 | 조치 |
| --- | --- | --- |
| 승인 후 돌아오는 길에 500 | `SESSION_SECRET` 이 없거나 32자 미만 | 5번을 다시 한다 |
| `Sign-in could not be verified` | callback URL 불일치, 또는 브라우저가 쿠키를 막음 | 3번의 URL 을 글자 그대로 확인 |
| `This account cannot sign in here` | `ADMIN_GITHUB_IDS` 가 로그인한 계정과 다름 | 4번 |
| `GitHub refused the authorization code` | Client ID 나 secret 이 틀림 | 5번을 다시 한다 |
| 로그인은 되는데 목록이 비어 있음 | `GITHUB_OWNER` / `GITHUB_REPO` 가 틀림 | `wrangler.jsonc` 고치고 재배포 |
| 글자만 나오고 모양이 없음 | 정적 파일이 안 올라감 | `npx wrangler deploy` 를 다시 |
| 저장이 502 | 토큰 권한 부족 | OAuth App 이 `repo` scope 인지 확인 |

로그인 실패 메시지는 일부러 뭉뚱그려 둔 것이 있다. 허용 목록에 없는 계정과 잘못된 토큰이
같은 응답을 받는다 — 이 화면이 누가 관리자인지 알려 주면 안 되기 때문이다.

## 고친 뒤 다시 올리기

```bash
npx wrangler deploy
```

전체가 다시 올라간다. 되돌리려면:

```bash
npx wrangler deployments list
npx wrangler rollback
```

## 비용과 공개 범위

`workers.dev` 무료 한도 안에서 돈다. 혼자 쓰는 편집기라 한도 근처에도 가지 않는다.

주소는 공개되지만 그 자체로는 문제가 아니다.

- 로그인하지 않으면 **로그인 화면 외에는 아무것도 없다.** `/api/*` 는 전부 세션을 요구한다
- 허용 목록은 **요청마다 다시 확인한다.** `ADMIN_GITHUB_IDS` 에서 ID 를 빼고 재배포하면 이미
  로그인된 세션도 다음 요청에서 끊긴다
- 쓰기는 `_posts/`, `assets/img/`, 사전 네 곳으로 제한된다. `_config.yml` 이나 워크플로는
  토큰에 권한이 있어도 Worker 가 거부한다
- GitHub 토큰은 서명된 HttpOnly 쿠키 안에만 있고 응답 본문이나 URL 에 나오지 않는다
- 화면에 `noindex, nofollow` 가 걸려 있다

주소를 더 가리고 싶으면 Cloudflare Access 를 Worker 앞에 두면 된다. 코드는 건드리지 않는다.

## 그만 쓸 때

```bash
npx wrangler delete
```

GitHub 쪽 OAuth App 도 지운다. 저장소에는 아무 흔적도 남지 않는다 — 편집기가 만든 것은
글 커밋뿐이다.
