---
title: "카카오 「PlayMCP: 제로부터 시작하는 MCP 플랫폼 개발」 리뷰 — Host·Client에 레지스트리와 인증 바인딩을 더하면 마켓이 되고, Stateful 프로토콜을 원격에서 쓰는 대가는 따로 있다"
date: 2025-10-15
categories: [TechBlog, Kakao]
tags: [Tech Blog Review, Kakao, MCP, LLM, AI Agent, OAuth, Streamable HTTP, Platform Engineering]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 13
source_url: https://tech.kakao.com/posts/734
---

원문: [PlayMCP: 제로부터 시작하는 MCP 플랫폼 개발](https://tech.kakao.com/posts/734) — kakao tech, 베니·클룽·홀든(AI에이전트플랫폼), 2025-09-08

## 한 줄 요약

"오늘 3시에 무슨 회의 있어?"에 답만 만드는 것이 아니라 캘린더를 열어 확인하는 AI가 필요하고, 도구 연결의 표준이 MCP다. PlayMCP(2025-07-31 오픈)는 카카오 AI 서비스에 붙을 MCP 서버를 실험·준비하는 개발자 플랫폼으로, MCP의 Host와 Client를 구현한 위에 **서버 레지스트리(마켓)**와 **사용자-서버 인증 바인딩**을 더했다. 원격 서버만 지원하며 Streamable HTTP를 쓰는데, 원래 로컬 데스크톱의 long-lived 연결을 전제로 설계된 Stateful 프로토콜을 분산 웹 환경에서 운영하는 어색함(스케일링, 서버리스 부적합, 세션이 인스턴스에 종속, Initialization 필수)을 솔직히 짚는다. 인증은 커스텀 헤더 Key/Token과 OAuth(PKCE 포함) 둘로 추상화했고, PlayMCP가 OAuth의 Client 역할을 대행한다.

## 배경: USB 포트가 없던 컴퓨터

MCP 이전에도 LLM은 검색하고 코딩했다. MCP가 주목받는 이유는 **LLM과 도구를 잇는 통일된 규격**을 냈기 때문이다. 이전에는 도구 개발자가 모델마다 다른 방식으로 연동해야 했고(독자 규격 포트만 있는 컴퓨터), 서비스 제공자는 사용자가 원하는 모든 도구를 직접 붙일 수 없어 제한된 도구만 지원했다. MCP는 AI 세계의 USB-C를 지향한다. PlayMCP에서는 MCP 서버 탐색, 서버를 적용한 AI 채팅에서 Tool Selection과 Argument Binding을 로그 뷰어로 확인, 내 원격 MCP 서버 등록(임시 등록으로 조용히 테스트 후 공개)이 된다.

## 구조: Host + Client + α

MCP는 Host(Claude Desktop 같은 AI 앱, 여러 Client를 조율), Client(서버와 1:1 연결), Server(컨텍스트 제공) 셋이다. PlayMCP는 Host와 Client를 구현하고 여기에 둘을 더했다.

- **MCP Server Registry**: 연결 정보(엔드포인트, 인증 방식)와 탐색용 메타데이터(설명, 툴 정보). 마켓 기능.
- **User-MCP Server Bindings**: 사용자가 채팅에 적용한 서버 목록과 서버별 사용자 인증 정보.

사용자가 프롬프트를 입력하면 PlayMCP는 프롬프트, 레지스트리의 연결 정보, 바인딩의 인증 정보를 MCP Host 컴포넌트에 넘기고, Host가 Client로 서버에 연결해 도구를 LLM에 노출한다. Host 기능과 마켓 기능을 다른 컴포넌트로 분리해 책임을 단순하게 했다.

## 전송: Streamable HTTP와 Stateful의 대가

STDIO(같은 머신의 로컬 프로세스와 표준 입출력)가 더 친숙하지만, PlayMCP는 카카오 AI 서비스에 통합할 서버를 발굴하는 목표가 있어 **원격 서버만** 지원한다. 표준은 Streamable HTTP로, 단일 HTTP 요청/응답을 기본으로 하고 SSE를 옵션으로 둔다.

MCP는 Stateful로 설계됐다. 로컬 데스크톱에서 long-lived 연결 위에 RPC를 주고받는 모델이 자연스러웠기 때문이다. 원격에서도 장점은 있다. 툴 목록 변경 같은 서버 발신 알림(Notification, Sampling)이 가능하고 끊겨도 세션으로 스트림을 재개할 수 있다. 하지만 단점이 뚜렷하다.

- long-lived 연결은 스케일링이 어렵다.
- 서버리스에 맞지 않다.
- 연결이 특정 인스턴스에 종속되어 재연결 시 같은 인스턴스로 라우팅하지 않으면 세션이 무효화된다.
- MCP의 철학은 서버 구현을 단순하게 유지하는 것인데 Stateful 서버는 복잡하다.

그래서 Streamable HTTP는 Stateless(POST) 기본 + Stateful(SSE) 옵션이라는 절충이고, PlayMCP도 SSE를 지원하지만 등록될 대부분의 서버는 Stateless일 것으로 본다. 또 하나의 어색함은 모든 Operation 전에 **Initialization Phase를 반드시 거쳐야** 한다는 제약이다. 원격 환경과 초기 설계 철학이 일부 충돌하며, 커뮤니티도 이를 인지하고 논의 중이다.

## 인증: 두 가지로 추상화

사용자별 보호 리소스를 다루려면 인증이 필요하고, MCP는 Streamable HTTP에서 HTTP 표준 인증, 특히 OAuth를 권장한다. PlayMCP는 둘을 제공한다.

**Key/Token(커스텀 헤더).** 구현이 쉬워 많은 서버가 쓴다. 등록 시 헤더 이름과 설명을 입력한다.

**OAuth 2.0.** 네 역할이 이렇게 매핑된다. Resource Owner = PlayMCP 사용자, Resource Server = MCP 서버, **Client = PlayMCP**, Authorization Server = 서버별 외부 인증 서버. PlayMCP가 사용자 인증 정보를 저장·관리하고 서버 연결 시 전달하므로 Client 역할과 정확히 일치한다. 다만 PlayMCP가 서버 제공자를 대신해 AS에 Client를 등록할 수는 없으므로, **제공자가 미리 AS에 Client를 등록**하고 그 정보를 PlayMCP에 넘겨야 한다. 현재 Authorization Code Grant만 지원하며, `code_verifier`/`code_challenge`로 **PKCE**를 구현했다. 흐름은 인증 유도 팝업 → AS의 authorization endpoint로 리다이렉트(client_id, redirect_uri, code_challenge, state) → 로그인·동의 → code와 state로 redirect_uri → PlayMCP가 code_verifier로 토큰 발급 → access_token 저장 → 원래 화면으로.

## Lifecycle: 레지스트리와 채팅

**레지스트리**는 등록 정보 조회 → Initialization Phase(protocolVersion, capabilities, serverInfo) → 필요 시 `tools/list`로 툴 정보를 수집한다.

**AI 채팅**은 `Dialogue`(content, role ∈ {USER, ASSISTANT, TOOL}, 토큰 사용량) 엔티티로 대화를 관리한다. "오늘 날씨 어때?"가 USER로 저장되고, 모델이 Tool Selection(쓸지, 무엇을)과 Argument Binding(`date="2025-08-25"`)을 돌려주면 도구를 호출해 결과를 TOOL로 추가하고, 모델이 그것으로 답을 만들어 ASSISTANT로 저장한다. 이 반복이 **Agent Loop**이고 중심에 Agent(PlayMCP)가 있다. 채팅 시작 시 Dialogue 세션(MCP 정보와 툴 정보의 조합, 한 Agent Loop 동안의 논리 세션)을 만들고, 모델과 SSE로 연결해 delta 단위로 받으며 클라이언트에도 SSE로 그대로 흘린다.

## 서버 개발자를 위한 팁

Kotlin SDK 예시로 `tools/list`와 `tools/call`을 구현하고 capabilities를 명시하면 된다(2025-08-25 기준 Kotlin SDK는 Streamable HTTP 미지원). 실용적 조언 둘: **툴 스펙은 영어로** 쓰면 토큰이 적게 든다(토크나이저의 언어 간 불공정 논문 인용). 툴 응답은 직렬화 데이터보다 **JSON·YAML·Markdown으로 포맷팅한 문자열**이 모델이 잘 이해한다(프롬프트 포맷 영향 논문 인용). 테스트에서는 툴이 여러 개일 때 기대한 Tool Selection이 되는지, Argument Binding이 맞는지, 툴 간 병렬·순차 실행이 의도대로인지를 본다.

## 읽고 남는 질문

- 레지스트리가 서버의 툴 정보를 캐시할 텐데, 서버가 툴을 바꿨을 때(Stateless라 알림을 못 받음) 얼마나 자주 다시 `tools/list`를 하는지가 마켓의 신뢰성에 중요하다.
- 사용자 access_token을 PlayMCP가 저장한다. 암호화·만료·refresh token 갱신·revoke 처리가 어떻게 되는지가 없다. "안전하게 입력받는다"가 저장 이후까지 이어지는지 궁금하다.
- 등록된 서버가 악의적이거나 프롬프트 인젝션을 담은 툴 설명을 줄 때(툴 설명은 모델에 그대로 들어간다) 심사·격리 장치가 있는지. 마켓이라면 이 위험이 가장 크다.

## 한 줄로 가져가기

MCP 호스트를 만드는 것은 SDK로 금방이고, 플랫폼이 되려면 그 위에 레지스트리와 사용자별 인증 바인딩이 필요하다. 그리고 로컬용으로 설계된 Stateful 프로토콜을 원격 분산 환경에 올릴 때는 "무엇을 포기하고 Stateless로 갈 것인가"를 먼저 정해야 한다.
