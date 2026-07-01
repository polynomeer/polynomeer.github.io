---
title: "TreeMap으로 CLOB 호가창 구현하기 — 가격/시간 우선 매칭과 슬리피지"
date: 2026-06-10
categories: [Monticker, MatchingEngine]
tags: [monticker, clob, order-book, treemap, matching-engine, paper-trading]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 8
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
---

## CLOB이란

거래소는 주문을 어떻게 체결하는가?

실제 거래소의 체결 방식은 **CLOB(Central Limit Order Book)** 이다. 모든 매수/매도 지정가 주문을 하나의 장부에 모아두고, 가격과 시간 순서에 따라 매칭한다.

```
매도호가 (asks)                   매수호가 (bids)
  73,300 × 500주                   72,800 × 1,200주
  73,200 × 800주  ← 최우선 매도     73,000 × 300주
                                   73,100 × 400주  ← 최우선 매수
```

최우선 매도가(73,200) ≤ 최우선 매수가(73,100)가 되면 체결이 발생한다. monticker의 모의투자는 이 구조를 코드로 구현한다.

---

## 자료구조 선택: TreeMap

호가창은 두 가지 연산이 핵심이다.

1. **최우선 호가 조회**: 매도는 가장 낮은 가격, 매수는 가장 높은 가격
2. **가격 레벨 탐색**: 체결 시 여러 가격 레벨을 순서대로 순회

이 두 연산을 O(log n)에 처리하는 것이 `TreeMap`이다.

```kotlin
class OrderBook(val stockId: Long) {
    // 매도호가: 낮은 가격이 앞 (자연 정렬)
    val asks: TreeMap<BigDecimal, ArrayDeque<Order>> = TreeMap()

    // 매수호가: 높은 가격이 앞 (역순 정렬)
    val bids: TreeMap<BigDecimal, ArrayDeque<Order>> = TreeMap(reverseOrder())
}
```

가격 레벨마다 `ArrayDeque<Order>`를 두는 이유는 **시간 우선** 원칙 때문이다. 같은 가격에 먼저 들어온 주문이 먼저 체결된다. Deque는 앞에서 꺼내고(체결) 뒤에 추가하는(신규 주문) 연산이 O(1)이다.

---

## 주의: firstKey()의 함정

```kotlin
// BAD: bids가 비어있으면 NoSuchElementException
fun getBestBid(): BigDecimal? = bids.firstKey().takeIf { bids.isNotEmpty() }
// takeIf 평가 전에 firstKey()가 먼저 실행된다!

// GOOD: isEmpty를 먼저 확인
fun getBestBid(): BigDecimal? = if (bids.isEmpty()) null else bids.firstKey()
fun getBestAsk(): BigDecimal? = if (asks.isEmpty()) null else asks.firstKey()
```

이 버그는 주문장이 비어있을 때(새벽 시간, 초기 상태) `NoSuchElementException`을 발생시킨다. Kotlin의 `takeIf`가 lazy하지 않다는 점에서 나오는 실수다.

---

## 주문 매칭 알고리즘

```kotlin
fun match(incomingOrder: Order): List<Fill> {
    val fills = mutableListOf<Fill>()
    val oppositeBook = if (incomingOrder.side == Side.BUY) asks else bids
    var remainingQty = incomingOrder.quantity

    while (remainingQty > 0 && oppositeBook.isNotEmpty()) {
        val bestPrice = oppositeBook.firstKey()

        // 가격 조건 확인 (LIMIT 주문만)
        val priceMatch = when (incomingOrder.orderType) {
            OrderType.MARKET -> true  // 시장가는 항상 체결
            OrderType.LIMIT  -> when (incomingOrder.side) {
                Side.BUY  -> incomingOrder.price!! >= bestPrice  // 매수 지정가 ≥ 매도 최우선
                Side.SELL -> incomingOrder.price!! <= bestPrice  // 매도 지정가 ≤ 매수 최우선
            }
        }

        if (!priceMatch) break

        val priceLevel = oppositeBook[bestPrice]!!
        while (priceLevel.isNotEmpty() && remainingQty > 0) {
            val resting = priceLevel.first()
            val fillQty = minOf(remainingQty, resting.remainingQuantity)

            fills.add(Fill(
                aggressorOrderId = incomingOrder.id,
                restingOrderId   = resting.id,
                price            = bestPrice,
                quantity         = fillQty,
                filledAt         = Instant.now(),
            ))

            resting.fill(fillQty)
            remainingQty -= fillQty

            if (resting.remainingQuantity == 0) {
                priceLevel.removeFirst()  // 완전 체결된 주문 제거
            }
        }
        if (priceLevel.isEmpty()) oppositeBook.remove(bestPrice)
    }

    return fills
}
```

시장가 주문(`MARKET`)은 가격 조건 없이 최우선 반대 호가부터 순서대로 체결한다. 지정가 주문(`LIMIT`)은 체결 조건이 맞을 때까지만 체결하고 나머지는 호가창에 등록 대기한다.

---

## 슬리피지 시뮬레이션

대량 시장가 주문은 여러 가격 레벨에 걸쳐 체결된다. 이를 **슬리피지(slippage)** 라고 한다.

```
시장가 매수 주문: 1,000주

매도호가:
  50,000원 × 300주  ← 여기서 300주 체결
  50,100원 × 400주  ← 여기서 400주 체결
  50,200원 × 500주  ← 여기서 300주 체결 (1,000주 완료)

평균 체결가:
  (50,000×300 + 50,100×400 + 50,200×300) / 1,000
  = (15,000,000 + 20,040,000 + 15,060,000) / 1,000
  = 50,100원

단순 최우선가(50,000원)보다 100원 불리 — 이것이 슬리피지
```

monticker에서는 이 슬리피지가 자동으로 시뮬레이션된다. 사용자가 대량 주문을 넣으면 여러 가격 레벨에서 부분 체결이 일어나고, 평균 체결가가 최우선 호가보다 불리해진다.

---

## 부분 체결과 주문 상태 전이

```kotlin
enum class OrderStatus {
    PENDING,            // 접수됨
    PARTIALLY_FILLED,   // 부분 체결
    FILLED,             // 전량 체결
    CANCELLED           // 취소
}

data class Order(
    val id: Long,
    val stockId: Long,
    val side: Side,
    val orderType: OrderType,
    val price: BigDecimal?,
    val quantity: Int,
    var filledQuantity: Int = 0,
    var status: OrderStatus = OrderStatus.PENDING,
) {
    val remainingQuantity: Int get() = quantity - filledQuantity

    fun fill(qty: Int) {
        filledQuantity += qty
        status = if (remainingQuantity == 0) OrderStatus.FILLED
                 else OrderStatus.PARTIALLY_FILLED
    }
}
```

---

## RiskChecker와의 연동

주문이 OrderBook에 도달하기 전에 RiskChecker를 거친다.

```kotlin
@Service
class MatchingService(
    private val orderBookService: MatchingOrderBookService,
    private val riskChecker: RiskChecker,
    private val ledgerService: LedgerService,
) {
    fun submitOrder(userId: Long, request: OrderRequest): OrderResponse {
        // 1. 리스크 사전 체크 (동기, 통과 못하면 REJECTED 즉시 반환)
        val riskResult = riskChecker.preCheck(userId, request)
        if (!riskResult.approved) {
            return OrderResponse.rejected(riskResult.blockedBy)
        }

        // 2. 주문 생성 및 호가창 제출
        val order = orderBookService.submitOrder(userId, request)

        // 3. 체결 결과 원장 기록
        order.fills.forEach { fill ->
            ledgerService.recordFill(fill)
        }

        return OrderResponse.from(order)
    }
}
```

Spring Bean 이름 충돌을 주의해야 한다. `matching` 모듈의 `OrderBookService`와 `marketdata` 모듈의 `OrderBookService`가 이름이 같아서 충돌이 발생한다. `@Service("matchingOrderBookService")`로 명시적으로 이름을 지정해 해결한다.

---

## 정리

- `TreeMap<BigDecimal, ArrayDeque<Order>>`로 O(log n) 가격 탐색과 O(1) 시간 우선 체결을 구현한다.
- `bids.firstKey().takeIf { bids.isNotEmpty() }` 패턴은 버그다. `if (bids.isEmpty()) null else bids.firstKey()`를 사용한다.
- 시장가 주문은 여러 가격 레벨에 걸쳐 체결되어 슬리피지가 자동으로 시뮬레이션된다.

다음 편에서는 주문이 체결 엔진에 도달하기 전에 동기적으로 실행되는 **리스크 한도 시스템**을 다룬다.
