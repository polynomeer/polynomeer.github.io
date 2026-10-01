---
title: "@ControllerAdvice와 @RestControllerAdvice 정리"
date: 2024-09-07
categories: [Notes, Spring]
tags: [Spring, ControllerAdvice, Exception Handling]
---

## 왜 필요한가

컨트롤러마다 예외를 직접 잡아서 응답을 만들기 시작하면 다음 문제가 생긴다.

- 응답 포맷이 제각각이다.
- 상태 코드 기준이 컨트롤러마다 다르다.
- 예외 로깅 정책이 흩어진다.

`@ControllerAdvice`는 이런 공통 처리 규칙을 한곳에 모으기 위한 장치다. 컨트롤러 안의 `@ExceptionHandler`는 그 컨트롤러에만 적용되지만, `@ControllerAdvice` 클래스에 두면 모든 컨트롤러에 적용된다([Spring 문서](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-advice.html)).

## @ControllerAdvice와 @RestControllerAdvice의 차이

- `@ControllerAdvice`: MVC 전역 예외 처리, 바인딩 처리, 공통 모델 속성 등에 사용
- `@RestControllerAdvice`: `@ControllerAdvice + @ResponseBody`

그래서 예외 핸들러의 반환값이 뷰 이름이 아니라 응답 본문으로 쓰인다([@RestController 글](/posts/rest-controller-annotation/)과 같은 원리다).

API 서버라면 대부분 `@RestControllerAdvice`를 사용하면 된다.

## 어디에 쓰는가

- 예외를 공통 JSON 응답으로 변환
- 검증 실패 메시지 표준화
- 특정 예외를 특정 상태 코드로 매핑
- 로깅/알림 기준 통일

## 기본 예시

```java
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(IllegalArgumentException e) {
        return ResponseEntity.badRequest()
            .body(new ErrorResponse("INVALID_INPUT", e.getMessage()));
    }
}
```

이렇게 하면 컨트롤러에서 `throw new IllegalArgumentException(...)`만 던져도 공통 포맷으로 응답할 수 있다.

## 범위를 좁히는 것도 가능하다

기본값은 모든 컨트롤러에 적용하는 것이다. 애너테이션 속성으로 패키지(`basePackages`), 대상 컨트롤러에 붙은 애너테이션(`annotations`), 타입(`assignableTypes`) 기준으로 범위를 제한할 수 있다.

```java
@RestControllerAdvice(basePackages = "com.example.api")
public class ApiExceptionHandler {
}
```

관리자 페이지, 외부 공개 API, 내부 백오피스 API의 응답 정책이 다를 때 유용하다.

컨트롤러 안에도 `@ExceptionHandler`가 있다면 우선순위를 알아 둬야 한다. 전역(`@ControllerAdvice`) 예외 핸들러는 컨트롤러 안의 로컬 핸들러보다 뒤에 적용된다.

## 실무에서 자주 같이 처리하는 항목

- `MethodArgumentNotValidException`
- `BindException`
- `HttpMessageNotReadableException`
- `ConstraintViolationException`
- 커스텀 비즈니스 예외 ([예외 설계 글](/posts/exception/) 참고)

검증 실패는 단순히 400으로 끝내지 말고, 어떤 필드가 왜 실패했는지 일관된 구조로 내려주는 것이 좋다.

## 설계할 때 주의할 점

- 너무 포괄적인 `Exception.class` 핸들러만 두지 말 것
- 예외 메시지를 그대로 외부에 노출할지 구분할 것
- 로깅 레벨을 예외 성격에 맞게 나눌 것
- 도메인 예외와 인프라 예외를 같은 응답으로 뭉개지 말 것

예를 들어 잘못된 입력과 DB 연결 실패는 모두 "에러"지만 운영 관점에서의 심각도는 다르다.

## 추천 패턴

실무에서는 아래 정도의 계층이 가장 다루기 쉽다.

- 비즈니스 예외: 4xx
- 인증/인가 예외: 401, 403
- 검증 예외: 400
- 처리 불가한 시스템 예외: 500

핸들러는 이 분류를 HTTP 응답으로 변환하는 얇은 어댑터 역할만 하게 두는 것이 좋다.

## 정리

`@ControllerAdvice`를 쓰는 목적은 API가 실패할 때 돌려주는 응답 형식과 상태 코드를 한곳에서 정하는 것이다. 컨트롤러는 요청 처리에 집중하고, 실패 응답의 모양과 정책은 전역 핸들러가 맡는다.

## 참고

- [Spring Framework Reference — Controller Advice](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-advice.html)
