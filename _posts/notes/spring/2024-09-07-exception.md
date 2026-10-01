---
title: Spring 애플리케이션에서 예외를 설계하는 방법
date: 2024-09-07
categories: [Notes, Spring]
tags: [Spring, Exception, Design]
---

## 예외를 어떻게 봐야 하는가

예외는 "실패" 그 자체라기보다 "정상 흐름에서 벗어난 상황"을 표현하는 장치다. 그래서 모든 실패를 예외로 취급하지 않는다.

예를 들어 사용자가 로그인 화면에서 비밀번호를 틀리는 일은 충분히 예상 가능한 입력 실패다. 반면, 의도하지 않은 상태 값 변조나 시스템 계약을 깨는 요청은 예외에 가깝다.

즉, 예외 설계의 출발점은 "어떤 실패를 시스템이 비정상으로 간주할 것인가"를 정하는 일이다.

## 예외를 분기 처리 수단으로 남용하지 말 것

다음과 같은 코드는 흔하지만 좋지 않다.

```java
try {
    policy.validate(request);
} catch (Exception e) {
    return false;
}
```

이 방식은 정상 흐름과 실패 흐름을 모두 흐리게 만든다. 예외는 정말 예외적인 상황에 쓰고, 예상 가능한 검증 실패는 명시적 반환이나 도메인 검증 로직으로 다루는 편이 낫다.

## 커스텀 예외는 왜 필요한가

프레임워크 예외만 그대로 쓰기 시작하면 애플리케이션의 의도가 드러나지 않는다.

예를 들어 아래 둘은 의미가 다르다.

- 주문이 존재하지 않음
- 현재 상태에서는 주문 취소가 허용되지 않음

둘 다 4xx일 수는 있지만, 도메인 의미와 운영 대응은 다르다. 따라서 예외는 비즈니스 의미 단위로 나누는 것이 좋다.

## 기본 설계 원칙

### 1. 예외 이름은 상황을 설명해야 한다

- `OrderNotFoundException`
- `InvalidOrderStateException`
- `PaymentAlreadyApprovedException`

### 2. 필요하면 원인 예외를 함께 보존한다

```java
public class ExternalApiException extends RuntimeException {
    public ExternalApiException(String message, Throwable cause) {
        super(message, cause);
    }
}
```

Java는 이를 연쇄 예외(chained exception)로 지원한다. `Throwable(String, Throwable)` 생성자에 넘긴 원인은 `getCause()`로 다시 꺼낼 수 있다([Java Tutorials, Chained Exceptions](https://docs.oracle.com/javase/tutorial/essential/exceptions/chained.html)). 원인(root cause)을 넘기지 않고 새 예외만 던지면 그 연결이 끊겨 운영 시 추적이 어려워진다.

### 3. 예외 계층은 응답 정책과 연결되어야 한다

예외를 너무 세밀하게 쪼개더라도 결국 HTTP 응답이 모두 같다면 계층이 과도할 수 있다. 반대로 처리 방식이 다르다면 분리할 가치가 있다.

## 상태 코드와의 매핑

예외 설계는 결국 HTTP 상태 코드와 연결된다.

- 잘못된 입력: 400
- 인증 실패: 401
- 권한 없음: 403
- 리소스 없음: 404
- 상태 충돌: 409
- 서버 오류: 500

상태 코드의 의미는 [RFC 9110 15절](https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes)이 정의한다. 예를 들어 409는 대상 리소스의 현재 상태와 충돌해 요청을 완료할 수 없을 때 쓴다. 앞의 "현재 상태에서는 주문 취소가 허용되지 않음"이 이 경우다.

순서는 도메인 실패를 먼저 정의하고, 그다음 적절한 응답으로 매핑한다. 상태 코드를 먼저 고르고 예외를 거기에 맞추면 서로 다른 도메인 실패가 같은 예외로 뭉친다.

## 실무에서 자주 놓치는 부분

- `printStackTrace()`에 의존함
- 내부 테이블 구조나 SQL 메시지를 외부에 노출함
- 모든 예외를 한 핸들러에서 뭉개 버림 ([@ControllerAdvice](/posts/controller-advice/)에서 예외별로 나눠 매핑)
- 예외가 너무 많아져도 기준이 없음

예외 수가 많은 것 자체는 문제는 아니다. 다만 분류 기준이 명확해야 한다.

## 좋은 예외 설계의 기준

- 도메인 의미가 드러난다.
- 응답 정책과 자연스럽게 연결된다.
- 운영 로그에서 원인을 추적할 수 있다.
- 정상 흐름 제어를 예외에 의존하지 않는다.

## 정리

예상 가능한 입력 실패는 반환값으로 다루고, 시스템이 비정상으로 간주하는 실패만 도메인 의미가 드러나는 예외로 던진다. 원인 예외를 보존하고 예외를 응답 정책과 연결해 두면, 컨트롤러와 서비스는 실패를 던지기만 하고 응답 변환은 전역 핸들러가 맡는 식으로 책임이 나뉜다.

## 참고

- [The Java Tutorials — Chained Exceptions](https://docs.oracle.com/javase/tutorial/essential/exceptions/chained.html)
- [RFC 9110 — HTTP Semantics, 15. Status Codes](https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes)
