---
title: Problem Details for HTTP APIs
date: 2025-08-08
categories: [Archive, Web]
tags: [HTTP, Problem Details]
---

Problem Details란 **에러나 예외 상황에 대한 표준화된 응답 형식**을 제공하는 개념이다. 특히 HTTP API에서 오류 정보를 구조적으로 전달할 때 많이 쓰인다.

------

## 1. 정의

- **출처**: [RFC 7807 — Problem Details for HTTP APIs](https://datatracker.ietf.org/doc/html/rfc7807)
- 목적: 오류를 단순히 상태 코드로만 전달하는 대신, **JSON이나 XML 형식으로 에러의 세부 정보**를 제공
- 일반적인 HTTP 상태 코드(예: `404 Not Found`)보다 **사람과 기계 모두가 이해하기 쉬운** 구조를 가짐

------

## 2. 기본 구조 (JSON 예시)

```json
{
  "type": "https://example.com/probs/out-of-credit",
  "title": "You do not have enough credit.",
  "status": 403,
  "detail": "Your current balance is 30, but that costs 50.",
  "instance": "/account/12345/transactions/abc"
}
```

- **type**: 문제 유형을 나타내는 URI (문서화된 설명 페이지로 연결될 수도 있음)
- **title**: 문제의 간단한 설명 (고정된 문자열)
- **status**: HTTP 상태 코드
- **detail**: 구체적인 상황 설명 (요청마다 달라질 수 있음)
- **instance**: 문제 발생한 리소스의 URI

------

## 3. 장점

- **표준화**: 클라이언트가 예외 처리 로직을 일관성 있게 작성 가능하다. 기본 규격이 표준으로 정의되어 있으므로, 별도의 규격 정의에 관한 소통이나 설계 과정이 없이 기본 필드만으로 클라이언트에서 핸들링이 가능하다.

- **확장 가능**: 표준 필드 외에도 추가 필드를 자유롭게 포함 가능하다. 기본 필드만으로는 클라이언트에서 핸들링이 어렵거나 복잡한 제어나 분기가 필요한 경우 얼마든지 필드를 확장해서 사용할 수 있다.


예를 들면, 아래와 같은 확장형도 가능하다.

```json
{
  "type": "https://example.com/validation-error",
  "title": "Invalid request parameters",
  "status": 400,
  "errors": {
    "email": "Invalid email format",
    "password": "Must be at least 8 characters"
  }
}
```

------

## 4. 활용 예시

- **Java/Spring**: `ProblemDetail` 클래스는 Spring 6+에서 추가되었다.

  ```java
  ProblemDetail problemDetail = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
  problemDetail.setTitle("Resource not found");
  problemDetail.setDetail("The product with ID 123 does not exist.");
  ```

- **.NET**: ASP.NET Core 6+의 `ProblemDetails` 클래스

- **Node.js**: Express 미들웨어에서 RFC 7807 형식 응답 생성

------

## 5. 요약

`ProblemDetail`은  **HTTP API에서 오류 정보를 명확하고 일관된 구조로 제공하기 위한 표준화된 응답 형식**이다. 이것을 사용함으로써 디버깅이 용이해지고, API 문서와의 연결도 가능하며, 클라이언트-서버 간 오류 처리 일관성 확보할 수 있다.

실무에서 직접 `ProblemDetail`을 사용해 보았을 때 몇 가지 장점이 있었다. 우선, 프론트 엔드 개발자에게 에러 규격에 대한 복잡한 설명을 할 필요가 없어서 명료했다. 그리고 여기에서 제공하는 정보만으로도 충분히 다양한 상황에서 요구하는 핸들링을 적용할 수 있었다. 필요 시 필드를 확장해서 복잡한 핸들링 요구사항도 대응할 수 있었다.

한계 또한 존재하는데, Spring 6와 Spring Boot 3 에서 ProblemDetail을 기본 지원하지만, 모든 프레임워크에서 기본적으로 제공하는 것은 아니다. 그리고 기존의 서비스와 호환성을 유지하기는 어렵다는 단점이 있다. 예를 들어, 아래와 같은 에러 응답 규격이 있는 서버가 있다면,

```json
{ "code": "USER_NOT_FOUND", "message": "사용자를 찾을 수 없습니다" }
```

이미 클라이언트에서 code를 활용하여 핸들링하거나 코드를 매핑하여 분기처리하고 있을 수 있으므로, 급작스럽게 ProblemDetail로 바꾸기 부담스러울 수 있다.

반면, 표준 API나 공공 API같은 표준화가 필요한 영역이나 신규 프로젝트의 대규모 API인 경우에는 유용하게 사용될 수 있을 것이다. 실제로 나 또한 신규 프로젝트에서 ProblemDetail을 사용해서 생산성이 증가했던 경험이 있다.

---

## 6. 참고자료

- https://datatracker.ietf.org/doc/html/rfc7807