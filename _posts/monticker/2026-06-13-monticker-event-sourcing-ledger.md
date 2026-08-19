---
title: "잔고를 저장하지 말고 재구성하라 — 이벤트 소싱 원장 설계"
date: 2026-06-13
categories: [Monticker, InvestmentWallet]
tags: [monticker, event-sourcing, ledger, kotlin, cqrs, investment-wallet]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 10
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: writing
---

## 잔고를 저장하면 무엇이 문제인가

가장 단순한 방법은 현재 잔고를 `users` 테이블의 `balance` 컬럼에 저장하는 것이다.

```sql
UPDATE users SET balance = balance - 100000 WHERE id = 1;
```

이 방법은 간단하지만 세 가지 문제가 있다.

**1. 이력이 사라진다.** "왜 잔고가 이렇게 됐지?"를 물으면 답을 찾을 수 없다.

**2. 버그 복구가 어렵다.** 집계 로직에 버그가 있었다면, 과거 잔고를 재계산할 방법이 없다.

**3. 감사(Audit)가 불가능하다.** 금융 시스템에서는 모든 돈의 흐름이 추적되어야 한다.

이벤트 소싱(Event Sourcing)은 이 문제를 근본적으로 해결한다.

> **잔고를 저장하지 않는다. 잔고를 만든 이벤트들을 저장한다.**

---

## 이벤트 소싱의 원리

```
이벤트 스트림 (시간순):
  10:00  DEPOSIT         +100,000원
  10:05  CASH_RESERVED   -50,000원  (매수 주문)
  10:07  FILL            +100주 (50,200원에 체결)
  10:07  FEE             -75원  (수수료 0.015%)
  10:10  SETTLEMENT      정산 완료

현재 잔고 = 이벤트들을 순서대로 재생(replay)한 결과
  100,000 - 50,000 - 75 = 49,925원 (현금)
  + 100주 × 시가 (평가액)
```

저장하는 것은 이벤트 스트림이다. 잔고는 계산된다.

---

## ledger_events 테이블 설계

```sql
CREATE TABLE ledger_events (
    id              BIGSERIAL    PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users(id),
    event_type      VARCHAR(30)  NOT NULL,
    amount          NUMERIC(18,2),        -- 양수: 입금/증가, 음수: 출금/감소
    balance_after   NUMERIC(18,2),        -- 스냅샷 (replay 가속용)
    paper_order_id  BIGINT       REFERENCES paper_orders(id),
    stock_id        BIGINT       REFERENCES stocks(id),
    description     TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

`balance_after`가 있는 이유가 있다. 순수 이벤트 소싱이라면 잔고를 계산할 때 전체 이벤트를 replay해야 한다. 이벤트가 수천 개가 되면 느려진다. `balance_after`는 각 이벤트 시점의 잔고 스냅샷이다. 특정 시점부터의 replay를 O(1)로 시작할 수 있다.

---

## 이벤트 유형

```kotlin
enum class LedgerEventType {
    DEPOSIT,            // 초기 예수금 충전
    WITHDRAWAL,         // 인출
    CASH_RESERVED,      // 매수 주문 시 예약금 차감
    CASH_UNRESERVED,    // 주문 취소 시 예약금 반환
    FILL,               // 체결 (매수: 현금 차감 + 주식 증가, 매도: 주식 차감 + 현금 증가)
    FEE,                // 수수료 차감
    SETTLEMENT,         // 정산 완료 (T+2)
    DIVIDEND,           // 배당금 (향후)
}
```

---

## LedgerService 구현

```kotlin
@Service
class LedgerService(private val jdbcTemplate: JdbcTemplate) {

    fun recordDeposit(userId: Long, amount: BigDecimal): LedgerEvent {
        val previousBalance = getCurrentBalance(userId)
        val newBalance = previousBalance + amount

        return insertEvent(LedgerEvent(
            userId       = userId,
            eventType    = LedgerEventType.DEPOSIT,
            amount       = amount,
            balanceAfter = newBalance,
            description  = "예수금 충전",
        ))
    }

    fun recordFill(fill: Fill): LedgerEvent {
        val order = fill.order
        val previousBalance = getCurrentBalance(order.userId)

        val (amount, description) = when (order.side) {
            Side.BUY  -> {
                // 매수: 예약금에서 체결금 차감
                val cost = fill.price.multiply(fill.quantity.toBigDecimal())
                val fee  = cost.multiply(BigDecimal("0.00015"))
                Pair(-(cost + fee), "매수 체결 ${order.symbol} ${fill.quantity}주 @ ${fill.price}")
            }
            Side.SELL -> {
                // 매도: 현금 증가 (세금 차감)
                val proceeds = fill.price.multiply(fill.quantity.toBigDecimal())
                val tax      = proceeds.multiply(BigDecimal("0.002"))
                Pair(proceeds - tax, "매도 체결 ${order.symbol} ${fill.quantity}주 @ ${fill.price}")
            }
        }

        return insertEvent(LedgerEvent(
            userId       = order.userId,
            eventType    = LedgerEventType.FILL,
            amount       = amount,
            balanceAfter = previousBalance + amount,
            paperOrderId = order.id,
            stockId      = order.stockId,
            description  = description,
        ))
    }

    fun getCurrentBalance(userId: Long): BigDecimal {
        // 최신 스냅샷 조회 (balance_after)
        return jdbcTemplate.queryForObject("""
            SELECT COALESCE(balance_after, 0)
            FROM ledger_events
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 1
        """, BigDecimal::class.java, userId) ?: BigDecimal.ZERO
    }
}
```

---

## Wallet 집계 — 현재 상태 계산

사용자의 돈이 현재 어디에 있는지를 4가지 상태로 표현한다.

```kotlin
data class WalletState(
    val availableCash: BigDecimal,    // 즉시 사용 가능한 현금
    val reservedCash: BigDecimal,     // 미체결 주문에 묶인 현금
    val holdingsValue: BigDecimal,    // 보유 주식 평가액
    val settlementPending: BigDecimal,// 체결 후 정산 대기 중인 금액
)
```

```kotlin
@Service
class WalletService(
    private val jdbcTemplate: JdbcTemplate,
    private val priceService: PriceService,
) {
    fun getWalletState(userId: Long): WalletState {
        // 현금 잔고 = 최신 ledger_events balance_after
        val cash = getCurrentBalance(userId)

        // 예약금 = 미체결 매수 주문 합산
        val reserved = jdbcTemplate.queryForObject("""
            SELECT COALESCE(SUM(price * remaining_quantity), 0)
            FROM orders
            WHERE user_id = ? AND side = 'BUY' AND status IN ('PENDING', 'PARTIALLY_FILLED')
        """, BigDecimal::class.java, userId) ?: BigDecimal.ZERO

        // 평가액 = 보유 주식 × 현재가
        val holdings = getHoldings(userId)
        val holdingsValue = holdings.sumOf { h ->
            val currentPrice = priceService.getLatestPrice(h.stockId)
            currentPrice * h.quantity.toBigDecimal()
        }

        return WalletState(
            availableCash    = cash - reserved,
            reservedCash     = reserved,
            holdingsValue    = holdingsValue,
            settlementPending = BigDecimal.ZERO,
        )
    }
}
```

---

## Replay 기능

하루치 투자 이벤트를 시간순으로 재생해 학습한다.

```kotlin
@Service
class ReplayService(private val jdbcTemplate: JdbcTemplate) {

    fun getDailyReplay(userId: Long, date: LocalDate): List<ReplayEvent> {
        val events = jdbcTemplate.query("""
            SELECT le.*, o.symbol, o.side, o.quantity, o.price as order_price
            FROM ledger_events le
            LEFT JOIN paper_orders o ON le.paper_order_id = o.id
            WHERE le.user_id = ?
              AND DATE(le.created_at) = ?
            ORDER BY le.created_at ASC
        """, { rs, _ ->
            ReplayEvent(
                eventType    = LedgerEventType.valueOf(rs.getString("event_type")),
                amount       = rs.getBigDecimal("amount"),
                balanceAfter = rs.getBigDecimal("balance_after"),
                symbol       = rs.getString("symbol"),
                description  = rs.getString("description"),
                timestamp    = rs.getTimestamp("created_at").toInstant(),
            )
        }, userId, date)

        return events
    }
}
```

이 API를 사용하면 "어제 내가 어떤 순서로 주문했고, 잔고가 어떻게 변했는지"를 시간순 스트림으로 복기할 수 있다.

---

## 정리

- 이벤트 소싱은 잔고를 저장하지 않고 이벤트를 저장한다. 잔고는 replay로 계산한다.
- `balance_after` 스냅샷으로 replay 성능을 O(전체 이벤트 수) → O(1)로 개선한다.
- 체결(FILL) 이벤트에는 수수료(0.015%)와 세금(0.2%)이 자동으로 차감된다.
- Replay API로 하루치 투자 흐름을 시간순으로 복기할 수 있다.

다음 편에서는 주문 시점의 감정을 태그로 기록하고, 그 감정과 수익률의 상관관계를 분석하는 **감정 태그 시스템**을 다룬다.
