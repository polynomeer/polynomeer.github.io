---
title: Error Handling in HTTP APIs
date: 2025-08-22
categories: [Notes, Web]
tags: [HTTP, Error Handling, API]
---

## 에러 처리는 왜 설계 대상인가

API를 설계할 때 성공 응답만 정의하고 에러 응답을 나중으로 미루면, 클라이언트와 운영자가 가장 자주 보게 되는 실패 상황이 오히려 제일 불명확해진다.

좋은 에러 응답은 다음 역할을 해야 한다.

- 클라이언트가 재시도 가능 여부를 판단하게 한다.
- 잘못된 요청인지, 서버 장애인지 구분하게 한다.
- 운영자가 로그와 모니터링에서 빠르게 원인을 찾게 한다.

세 역할은 서로 다른 독자를 향한다. 재시도 판단은 클라이언트 코드가, 원인 구분은 클라이언트 개발자와 사용자가, 원인 추적은 운영자가 읽는다. 그래서 에러 응답 하나에 기계가 읽을 정보와 사람이 읽을 정보, 그리고 서버 로그로 이어지는 연결 고리가 함께 들어가야 한다.

## 최소한 맞춰야 할 것

- 적절한 HTTP 상태 코드
- 일관된 응답 포맷
- 사람이 읽을 수 있는 메시지
- 기계가 분기할 수 있는 에러 코드
- 요청 추적용 식별자

## 상태 코드를 어떻게 쓸까

- `400`: 요청 자체가 잘못됨
- `401`: 인증되지 않음
- `403`: 권한 없음
- `404`: 리소스 없음
- `409`: 상태 충돌
- `422`: 의미는 맞지만 비즈니스 검증 실패
- `500`: 서버 내부 오류
- `503`: 일시적 장애 또는 의존 시스템 문제

실패를 모두 `400`이나 `500`으로 뭉개면 클라이언트도, 운영자도 판단이 어려워진다.

헷갈리기 쉬운 몇 가지는 HTTP 명세(RFC 9110)의 정의로 구분할 수 있다([RFC 9110, Section 15](https://www.rfc-editor.org/rfc/rfc9110.html#section-15)).

- `401`과 `403`: `401`은 요청에 유효한 인증 정보가 없다는 뜻이고, 클라이언트는 알맞은 `Authorization` 헤더를 붙여 다시 요청할 수 있다. `403`은 서버가 요청을 이해했지만 수행을 거부한다는 뜻이라, 같은 자격 증명으로 다시 보내도 결과가 같다.
- `400`과 `422`: `422 Unprocessable Content`는 요청의 형식은 서버가 이해했지만 내용을 처리할 수 없을 때 쓴다. JSON 문법이 깨졌다면 `400`, JSON은 올바른데 "종료일이 시작일보다 앞선다" 같은 의미상 문제가 있다면 `422`가 된다. 모든 검증 실패를 `400`으로 통일하는 팀도 많으므로, 어느 쪽이든 팀 안에서 기준을 하나로 정하는 것이 더 중요하다.
- `409`: 요청 자체는 올바르지만 리소스의 현재 상태와 충돌할 때다. 이미 취소된 주문을 다시 취소하거나, 낙관적 락의 버전이 맞지 않는 경우가 해당한다.
- `503`: 일시적으로 요청을 처리할 수 없는 상태다. 언제 다시 시도하면 되는지 `Retry-After` 헤더로 알려 줄 수 있다.

상태 코드는 클라이언트의 다음 행동을 정한다. 대략 4xx는 "요청을 고치지 않으면 다시 보내도 실패한다", 5xx는 "같은 요청이 나중에는 성공할 수 있다"로 읽힌다. 그래서 재시도 로직은 보통 5xx와 네트워크 오류만 대상으로 삼는다. 다만 `500`을 재시도하는 것은 그 요청이 여러 번 실행되어도 안전할 때만 의미가 있다. 상태 코드 분류 전반은 [HTTP 웹 기본 지식 7](/posts/http-basics-07-status-codes/)에, 재시도와 멱등성의 관계는 [Stateless와 Idempotent](/posts/stateless-and-idempotent/)에 정리했다.

## 실무에서 중요한 포인트

### 검증 오류와 시스템 오류를 분리

사용자 입력 오류와 서버 장애는 전혀 다른 종류의 실패다. 응답 구조, 로그 레벨, 알람 기준도 달라야 한다.

검증 오류는 서비스가 정상적으로 동작한 결과다. 잘못된 입력을 걸러 낸 것이므로 `WARN`이나 `INFO` 수준으로 남기고 알람은 울리지 않는 것이 보통이다. 반대로 `500`은 서버가 예상하지 못한 상황이므로 스택 트레이스와 함께 `ERROR`로 남기고, 비율이 높아지면 알람을 울려야 한다. 둘을 같은 수준으로 남기면 사용자 입력 오류가 많은 날마다 알람이 울리고, 결국 진짜 장애 알람도 무시하게 된다.

### 내부 예외를 그대로 노출하지 않기

스택 트레이스나 DB 오류 원문을 클라이언트에 그대로 보내면 보안과 사용자 경험 모두에 좋지 않다.

RFC 9457의 보안 고려 사항도 같은 점을 짚는다. 에러 응답을 만들 때는 HTTP 인터페이스를 통해 스택 덤프 같은 구현 세부 사항이 드러나지 않게 하라고 권한다([RFC 9457, Section 5](https://www.rfc-editor.org/rfc/rfc9457.html#section-5)). 테이블 이름, SQL, 라이브러리 버전은 공격자에게 유용한 정보다. 클라이언트에는 일반화된 메시지와 추적 ID만 주고, 자세한 원인은 그 추적 ID로 서버 로그에서 찾는다.

### 실패도 계약으로 관리

성공 응답만 API 계약이 아니다. 프론트엔드나 외부 연동 시스템은 실패 응답도 계약으로 소비한다.

클라이언트가 `"재고가 부족합니다"`라는 메시지 문자열로 분기하고 있다면, 서버에서 문구를 바꾸는 순간 클라이언트가 깨진다. 분기는 변하지 않는 에러 코드로 하고, 메시지는 사람에게 보여 주는 용도로만 쓰게 해야 한다. 에러 코드 목록도 API 문서에 성공 응답과 같은 수준으로 적어 두고, 코드를 없애거나 의미를 바꾸는 일은 응답 필드를 없애는 것과 같은 호환성 변경으로 다뤄야 한다.

## Problem Details 같은 표준

에러 응답 포맷을 직접 정의할 수도 있지만, 가능하면 `Problem Details` 같은 표준 형식을 쓰는 편이 좋다. 팀이 커질수록 예외 응답의 일관성이 중요해지기 때문이다.

RFC 9457(Problem Details for HTTP APIs)은 RFC 7807을 대체한 표준으로, `application/problem+json` 미디어 타입과 다섯 가지 표준 필드를 정의한다([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)).

| 필드 | 의미 |
| --- | --- |
| `type` | 문제 유형을 식별하는 URI. 없으면 `about:blank`로 본다 |
| `title` | 문제 유형에 대한 짧은 요약 |
| `status` | HTTP 상태 코드(응답 상태 코드와 같아야 하는 참고 값) |
| `detail` | 이번 발생에 대한 구체적인 설명 |
| `instance` | 이번 발생을 식별하는 URI |

표준 필드 외에 필요한 값은 확장 필드로 더할 수 있고, 클라이언트는 모르는 확장 필드를 무시해야 한다. 위에서 말한 "기계가 분기할 에러 코드"는 `type` URI가 맡을 수 있고, 요청 추적용 식별자는 확장 필드로 넣으면 된다. RFC의 예시를 따라 쓰면 다음과 같은 모양이 된다.

```http
HTTP/1.1 403 Forbidden
Content-Type: application/problem+json

{
  "type": "https://example.com/probs/out-of-credit",
  "title": "You do not have enough credit.",
  "detail": "Your current balance is 30, but that costs 50.",
  "instance": "/account/12345/msgs/abc",
  "balance": 30
}
```

Spring Framework 6부터는 이 형식을 `ProblemDetail` 클래스로 지원한다. `@ExceptionHandler`에서 `ProblemDetail`을 반환하면 `application/problem+json`으로 직렬화되고, `ResponseEntityExceptionHandler`를 상속하면 Spring MVC가 던지는 내장 예외도 같은 형식으로 응답한다. Spring Boot에서는 `spring.mvc.problemdetails.enabled=true`로 이를 켤 수 있다([Spring Framework Reference, Error Responses](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html)). 필드별 설명과 Spring 적용 예는 [Problem Details for HTTP APIs](/posts/problem-detail/)에, 예외 처리 구조는 [Spring 예외 처리 전략 정리](/posts/spring-exception-handling/)에 정리했다.

## 정리

에러 처리는 예외 상황을 덧붙이는 작업이 아니라 API 품질을 결정하는 핵심 설계다. 성공 응답만큼 실패 응답도 명확해야 시스템이 운영 가능해진다.

## 참고

- [RFC 9110, HTTP Semantics, Section 15 Status Codes](https://www.rfc-editor.org/rfc/rfc9110.html#section-15)
- [RFC 9457, Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Spring Framework Reference, Error Responses](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html)
