---
title: 왜 이벤트가 안 먹히지? @TransactionalEventListener가 무시되는 이유와 해결법
date: 2025-04-15
categories: [Notes, Spring]
tags: [Spring, Transaction, Event]
---

`@TransactionalEventListener`는 이벤트를 발행한 트랜잭션의 생명주기에 맞춰 리스너를 실행하고 싶을 때 사용하는 도구다. 핵심은 "이벤트를 발행했다고 바로 실행되는 것이 아니라, 지정한 트랜잭션 시점까지 기다린다"는 점이다.

## 언제 쓰는가

- 주문 저장 후 메일 발송
- 결제 승인 후 메시지 발행
- 트랜잭션 커밋 이후 캐시 무효화
- 도메인 이벤트를 후속 처리로 넘기기

중요한 점은 "DB 반영이 확정된 뒤에만 실행해야 하는 작업"에 잘 맞는다는 것이다.

## phase를 이해해야 한다

- `BEFORE_COMMIT`
- `AFTER_COMMIT`
- `AFTER_ROLLBACK`
- `AFTER_COMPLETION`

실무에서는 대부분 `AFTER_COMMIT`을 사용한다. 커밋이 성공한 뒤에만 후속 작업을 실행하고 싶기 때문이다.

## 가장 많이 겪는 문제

### 1. 트랜잭션이 없으면 실행되지 않는다

`@TransactionalEventListener(phase = AFTER_COMMIT)`는 발행 시점에 트랜잭션이 있어야 의미가 있다. 트랜잭션이 없다면 기본적으로 실행되지 않는다.

예:

- 스케줄러
- 단순 조회 흐름
- 테스트 코드
- `@Async` 내부 발행

이런 곳에서는 기대와 다르게 리스너가 조용히 무시될 수 있다.

### 2. fallbackExecution은 주의해서 써야 한다

`fallbackExecution = true`를 주면 트랜잭션이 없어도 실행되지만, 그 순간 `AFTER_COMMIT`이라는 보장은 사라진다. 즉시 실행될 수 있다는 뜻이다.

## 예시

```java
@Component
public class OrderEventHandler {

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(OrderCreatedEvent event) {
        // 외부 메시지 발행, 메일 발송, 캐시 무효화 등
    }
}
```

이 패턴은 "주문 저장이 확정된 뒤" 후속 작업을 처리하는 데 적합하다.

## 그럼 @EventListener와 무엇이 다른가

- `@EventListener`: 발행 즉시 처리
- `@TransactionalEventListener`: 트랜잭션 phase에 맞춰 처리

외부 시스템 호출처럼 롤백되면 함께 무효가 되어야 하는 후속 작업은 `@TransactionalEventListener(AFTER_COMMIT)`이 더 적합하다.

## 실무 판단 기준

| 상황 | 추천 |
| --- | --- |
| 커밋 이후에만 실행되어야 함 | `@TransactionalEventListener(AFTER_COMMIT)` |
| 트랜잭션 유무와 무관하게 즉시 실행 | `@EventListener` |
| 트랜잭션이 없을 수도 있지만 그래도 실행 | fallback 사용 여부를 신중히 검토 |

## 정리

`@TransactionalEventListener`의 핵심은 "이벤트 처리 시점 제어"다. 이벤트를 발행했다는 사실보다, 그 이벤트가 트랜잭션의 어느 시점에서 안전하게 처리되어야 하는지가 더 중요하다.
