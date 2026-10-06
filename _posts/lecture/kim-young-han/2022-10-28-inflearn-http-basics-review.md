---
title: "HTTP 웹 기본 지식 복습: 섹션별 학습 시리즈"
date: 2022-10-28 21:12:00 +0900
status: published
categories: [Lecture, HTTP]
tags: [HTTP, REST, Cache]
mermaid: true
description: "HTTP 강의를 10개 섹션으로 나누어 복습하는 시리즈 안내. 네트워크부터 메서드, 헤더, 캐시까지 연결한다."
---

> 이 글은 김영한님의 [모든 개발자를 위한 HTTP 웹 기본 지식](https://www.inflearn.com/course/http-웹-네트워크/dashboard?cid=326277) 강의를 학습한 내용을 정리한 글입니다.
>
> [학습성과](/learning-evidence/inflearn-http-basics/)

HTTP 요청을 보낼 수 있다는 것과 그 요청의 의미를 설명할 수 있다는 것은 다르다. 응답이 유실되었을 때 재시도해도 되는지, 사용자별 응답을 저장해도 되는지, 같은 연결에서 여러 요청을 처리하는 것이 무상태성과 모순되는지에는 프로토콜의 기준이 필요하다.

이 시리즈는 강의의 섹션 구분에 맞춰 학습한 핵심을 정리한다. 도입과 마무리는 학습 방향을, 나머지 글은 기술 개념과 혼동하기 쉬운 경계를 다룬다. 도서 서비스라는 별도의 예시와 직접 구성한 다이어그램을 사용하고, 명세에 따른 보충 설명을 구분했다.

[시리즈 상세 페이지에서 순서대로 읽기](/series/http-web-basics/)

## 섹션별 글

| 순서 | 강의 섹션 | 복습 글 |
| --- | --- | --- |
| 1 | 소개 | [웹 프레임워크 앞에서 확인할 것들](/posts/http-basics-01-introduction/) |
| 2 | 인터넷 네트워크 | [IP, TCP, 포트, DNS의 역할 나누기](/posts/http-basics-02-network/) |
| 3 | URI와 웹 브라우저 요청 흐름 | [URL 한 줄에서 요청과 응답까지](/posts/http-basics-03-uri/) |
| 4 | HTTP 기본 | [무상태, 연결 재사용, 메시지 구조](/posts/http-basics-04-http/) |
| 5 | HTTP 메서드 | [메서드의 의미와 재시도 판단](/posts/http-basics-05-methods/) |
| 6 | HTTP 메서드 활용 | [폼 전송에서 리소스 중심 API 설계까지](/posts/http-basics-06-api-design/) |
| 7 | HTTP 상태코드 | [상태 코드가 클라이언트의 다음 행동을 정한다](/posts/http-basics-07-status-codes/) |
| 8 | HTTP 헤더1 - 일반 헤더 | [표현과 협상, 인증과 쿠키를 헤더로 연결하기](/posts/http-basics-08-headers/) |
| 9 | HTTP 헤더2 - 캐시와 조건부 요청 | [캐시의 저장, 신선도, 재검증을 구분하기](/posts/http-basics-09-cache/) |
| 10 | 다음으로 | [배운 개념을 작은 API의 설계 기준으로 바꾸기](/posts/http-basics-10-next-steps/) |

## 도입의 세 질문과 이어지는 글

처음에 던진 세 질문은 각각 명세의 한 문장에서 답이 시작된다. 시리즈의 어느 글로 이어지는지 함께 적어 둔다.

| 질문 | 명세가 주는 기준 | 이어지는 글 |
| --- | --- | --- |
| 응답이 유실되었을 때 재시도해도 되는가 | 같은 요청을 여러 번 보내도 의도한 효과가 한 번 보낸 것과 같은 메서드가 멱등하며, 클라이언트는 응답을 읽기 전에 통신이 실패하면 멱등 요청을 자동으로 반복할 수 있다 ([RFC 9110 9.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#name-idempotent-methods)) | 5편 메서드, 7편 상태 코드 |
| 사용자별 응답을 저장해도 되는가 | `Cache-Control: private`는 공유 캐시가 응답을 저장하면 안 되고, 브라우저 같은 개인 캐시는 저장해도 된다는 뜻이다 ([RFC 9111 5.2.2.7](https://www.rfc-editor.org/rfc/rfc9111.html#name-private)) | 8편 헤더, 9편 캐시 |
| 같은 연결에서 여러 요청을 처리하는 것이 무상태성과 모순되는가 | 무상태는 각 요청 메시지의 의미를 단독으로 이해할 수 있고, 연결과 메시지의 관계가 해석에 영향을 주지 않는다는 뜻이다 ([RFC 9110 3.3](https://www.rfc-editor.org/rfc/rfc9110.html#name-connections-clients-and-ser)). HTTP/1.1은 기본적으로 지속 연결을 쓴다 ([RFC 9112 9.3](https://www.rfc-editor.org/rfc/rfc9112#name-persistence)) | 4편 HTTP 기본 |

세 번째 질문의 답은 무상태가 "연결을 매번 끊는다"는 뜻이 아니라는 데 있다. 연결은 전송 계층의 재사용이고, 무상태는 메시지 의미의 독립성이다. 둘은 서로 다른 층의 이야기라서 함께 성립한다.

## 요청의 흐름으로 연결하기

```mermaid
flowchart LR
    A[주소와 전송] --> B[대상과 메서드]
    B --> C[응답의 상태와 표현]
    C --> D[사용자 식별]
    D --> E[저장과 재검증]
```

처음에는 순서대로 읽고, 이후에는 문제에 맞춰 돌아오면 된다. 재시도가 고민이라면 메서드와 상태 코드 글을, 개인화된 응답을 캐시하려면 쿠키와 캐시 글을 함께 본다.

본문의 메시지와 설계 예시는 이해를 위한 구성이지 실행 결과가 아니다. 원 강의의 상세 설명은 각 글의 참고 링크에서 이어 볼 수 있다.

## 참고

- [모든 개발자를 위한 HTTP 웹 기본 지식](https://www.inflearn.com/course/http-웹-네트워크/dashboard?cid=326277) — 인프런
- [학습성과](/learning-evidence/inflearn-http-basics/)
