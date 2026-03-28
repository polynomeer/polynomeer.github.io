---
title: Preflight Request
date: 2024-09-07
categories: [Notes, Web]
tags: [CORS, Preflight, Browser]
---

## Preflight Request란

Preflight Request는 브라우저가 실제 cross-origin 요청을 보내기 전에, 그 요청이 허용되는지 먼저 확인하는 `OPTIONS` 요청이다. 개발자가 직접 보내는 경우보다 브라우저가 자동으로 발생시키는 경우가 대부분이다.

이 요청은 보통 다음 정보를 담는다.

- `Origin`
- `Access-Control-Request-Method`
- `Access-Control-Request-Headers`

즉 브라우저가 "이 출처에서 이 메서드와 이 헤더를 써도 되는가"를 먼저 묻는 과정이다.

## 언제 발생하나

모든 CORS 요청에 항상 preflight가 붙는 것은 아니다. 단순 요청(simple request)이 아니면 preflight가 발생한다.

대표적인 경우:

- `PUT`, `PATCH`, `DELETE` 같은 메서드 사용
- 커스텀 헤더 추가
- 특정 `Content-Type` 사용 (`application/json` 포함)

그래서 프런트엔드에서 JSON 요청을 보냈는데 `OPTIONS`가 하나 더 보이는 상황이 흔하다.

## 왜 중요한가

Preflight는 보안과 성능 둘 다에 영향을 준다.

- 서버가 CORS 정책을 명확히 드러내게 한다.
- 요청이 하나 더 늘어나므로 지연이 생길 수 있다.
- 설정이 잘못되면 본 요청 전에 막힌다.

즉 CORS 장애를 볼 때는 실제 API가 아니라 preflight가 먼저 실패하는 경우를 의심해야 한다.

## Spring에서 볼 포인트

Spring Boot에서는 `@CrossOrigin`이나 전역 `CorsRegistry` 설정으로 처리하는 경우가 많다. 중요한 것은 단순히 `allowOrigins("*")`를 넣는 것이 아니라, 실제 허용해야 하는 출처, 메서드, 헤더, credential 정책을 명확히 정하는 것이다.

특히:

- 인증 쿠키를 쓸 경우 `credentials` 정책
- 허용할 메서드 범위
- 허용할 커스텀 헤더
- `maxAge`를 통한 캐시 시간

이 네 가지를 함께 봐야 한다.

## 정리

Preflight Request는 CORS의 부가 현상이 아니라, 브라우저가 cross-origin 요청의 안전성을 먼저 확인하는 절차다. CORS 이슈를 디버깅할 때는 본 요청보다 `OPTIONS` 응답부터 확인하는 습관이 중요하다.
