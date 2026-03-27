---
title: @ControllerAdvice와 @RestControllerAdvice 정리
date: 2024-09-07
categories: [Notes, Spring]
tags: [Spring, ControllerAdvice, Exception Handling]
---

## 왜 필요한가

컨트롤러마다 예외를 직접 잡아서 응답을 만들기 시작하면 다음 문제가 생긴다.

- 응답 포맷이 제각각이다.
- 상태 코드 기준이 컨트롤러마다 다르다.
- 예외 로깅 정책이 흩어진다.

`@ControllerAdvice`는 이런 공통 처리 규칙을 한곳에 모으기 위한 장치다.

## @ControllerAdvice와 @RestControllerAdvice의 차이

- `@ControllerAdvice`: MVC 전역 예외 처리, 바인딩 처리, 공통 모델 속성 등에 사용
- `@RestControllerAdvice`: `@ControllerAdvice + @ResponseBody`

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

모든 컨트롤러에 적용하는 대신 특정 패키지나 애너테이션 기준으로 범위를 제한할 수 있다.

```java
@RestControllerAdvice(basePackages = "com.example.api")
public class ApiExceptionHandler {
}
```

관리자 페이지, 외부 공개 API, 내부 백오피스 API의 응답 정책이 다를 때 유용하다.

## 실무에서 자주 같이 처리하는 항목

- `MethodArgumentNotValidException`
- `BindException`
- `HttpMessageNotReadableException`
- `ConstraintViolationException`
- 커스텀 비즈니스 예외

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

`@ControllerAdvice`는 예외를 예쁘게 잡는 기능이 아니라, "API의 실패 계약을 일관되게 만드는 장치"로 보는 게 맞다. 컨트롤러는 요청 처리에 집중하고, 실패 응답의 모양과 정책은 전역 핸들러에서 책임지게 나누는 것이 유지보수에 유리하다.
