---
title: 왜 이벤트가 안 먹히지? @TransactionalEventListener가 무시되는 이유와 해결법
date: 2025-04-15
categories: [Archive, Spring]
tags: [Spring, Transaction]
---


맞습니다. `@TransactionalEventListener`는 **트랜잭션이 존재해야만 작동**합니다. 보다 정확히 말하면:

- `@TransactionalEventListener(phase = AFTER_COMMIT)`와 같이 설정하면,
  - **현재 트랜잭션이 정상적으로 커밋될 때만** 이벤트 리스너가 실행됩니다.
  - **트랜잭션이 없으면 실행되지 않습니다.**

---

### 그래서, 이런 케이스는 고려해야 할까요?

**1. 이벤트 발행 시점에 트랜잭션이 없을 가능성이 있는가?**  
   - 예: 스케줄러, 비동기 서비스, 테스트 코드, 혹은 단순 조회 컨트롤러 등에서 이벤트를 발행한다면 **트랜잭션이 없을 수 있습니다.**
   - 이런 경우 `@TransactionalEventListener`는 무시되며 **리스너가 실행되지 않습니다.**

**2. 해결 방안은?**
- **명시적으로 트랜잭션을 감싸거나**,  
- **대체 리스너 사용 고려**: `ApplicationListener` 또는 `@EventListener`로 대체하고 내부에서 트랜잭션을 시작할 수 있습니다.
- 또는 `@TransactionalEventListener(fallbackExecution = true)` 옵션을 주면 **트랜잭션이 없을 때도 실행되도록 강제**할 수 있지만, 이 경우에도 `AFTER_COMMIT`은 무시됩니다 (즉시 실행됨).

---

### 결론

**사용자가 이벤트를 발행하는 컨텍스트에서 트랜잭션이 항상 존재한다는 전제가 성립하지 않으면, 반드시 고려해야 할 이슈**입니다.  
실무에서는 다음처럼 정리합니다:

| 상황 | 처리 방법 |
|------|-----------|
| 트랜잭션 내에서만 발행되는 이벤트 | `@TransactionalEventListener(AFTER_COMMIT)` 사용 |
| 트랜잭션이 없을 수도 있음 | `@EventListener` + 필요시 수동 트랜잭션 처리 |
| 트랜잭션이 없어도 강제 실행 | `@TransactionalEventListener(fallbackExecution = true)` (주의 필요) |

---

### 1. `@TransactionalEventListener(AFTER_COMMIT)` – **트랜잭션 내에서만 작동**

```java
@Component
public class OrderEventHandler {

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleOrderCreated(OrderCreatedEvent event) {
        System.out.println("Committed order: " + event.getOrderId());
        // 예: Kafka 발행, 이메일 전송
    }
}
```

```java
@Service
public class OrderService {

    @Transactional
    public void createOrder() {
        // 주문 생성 로직
        eventPublisher.publishEvent(new OrderCreatedEvent(orderId));
    }
}
```

> 이 경우는 트랜잭션 안에서만 이벤트가 발행되어야 하고, 정상 커밋이 돼야만 핸들러가 호출됩니다.

---

### 2. `@EventListener` + 수동 트랜잭션 처리 – **트랜잭션이 없어도 실행되게 하되, 내부에서 트랜잭션 보장**

```java
@Component
@RequiredArgsConstructor
public class OrderEventHandler {

    private final OrderRepository orderRepository;
    private final PlatformTransactionManager transactionManager;

    @EventListener
    public void handle(OrderCreatedEvent event) {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.executeWithoutResult(tx -> {
            // 트랜잭션 내에서 안전하게 처리
            orderRepository.markAsProcessed(event.getOrderId());
        });
    }
}
```

> 이 패턴은 트랜잭션 여부와 무관하게 항상 실행되며, **핸들러 내부에서 트랜잭션을 제어**합니다.

---

### 3. `@TransactionalEventListener(fallbackExecution = true)` – **트랜잭션 없어도 실행되게**

```java
@Component
public class OrderEventHandler {

    @TransactionalEventListener(
        phase = TransactionPhase.AFTER_COMMIT,
        fallbackExecution = true
    )
    public void handle(OrderCreatedEvent event) {
        System.out.println("Handled even without tx: " + event.getOrderId());
    }
}
```

> fallbackExecution을 설정하면 트랜잭션이 없을 때도 실행되지만, `AFTER_COMMIT`은 무시되고 **즉시 실행**됩니다. 그래서 `AFTER_COMMIT`을 기대하고 쓰는 경우에는 부작용이 생길 수 있어요.
