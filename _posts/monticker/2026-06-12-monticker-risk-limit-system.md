---
title: "주문 전 동기 리스크 게이트 설계 — VaR, 집중도, 일일손실 5가지 규칙"
date: 2026-06-12
categories: [Monticker, MatchingEngine]
tags: [monticker, risk-management, var, pre-trade, kotlin, paper-trading]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 9
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: writing
---

## 왜 모의투자에도 리스크 한도가 필요한가

모의투자는 가상 돈을 쓴다. 잃어도 실제 손해는 없다. 그런데 왜 리스크 한도가 필요할까?

사용자가 투자 전략을 연습하는 과정에서 **나쁜 습관**을 체계적으로 방지하지 않으면 학습 효과가 떨어진다. "어차피 가상이니까"라는 심리로 현실에서는 불가능한 집중 투자나 손실 무시 패턴이 굳어진다.

리스크 한도는 교육적 장치다. "이 주문은 실제 시장에서 위험하다"는 것을 체결 전에 명시적으로 알려준다.

---

## 아키텍처: 동기 게이트

```
POST /api/matching/orders
  │
  ▼
RiskChecker.preCheck()  ← 동기 실행, 통과 못하면 즉시 REJECTED 반환
  │
  ├── DailyLossLimitRule
  ├── ConcentrationRule
  ├── VaRLimitRule
  ├── PositionCountRule
  └── TradingFrequencyRule
  │
  ▼ (모든 규칙 통과 시)
OrderBook.submit(order)  ← 체결 엔진
```

리스크 체크는 **동기**로 실행된다. 비동기로 하면 체결이 발생한 후 리스크 초과를 발견하는 타이밍 문제가 생긴다. 동기 게이트는 주문 체결 전에 반드시 통과해야 한다.

---

## 5가지 리스크 규칙

### 1. DailyLossLimitRule — 일일 손실 한도

오늘 실현된 손실이 총 자산의 N% 이상이면 추가 주문을 차단한다.

```kotlin
class DailyLossLimitRule(
    private val jdbcTemplate: JdbcTemplate,
    private val limitPct: Double = 0.03,  // 기본 3%
) : RiskRule {

    override fun check(userId: Long, order: OrderRequest, context: RiskContext): RuleResult {
        val todayLoss = jdbcTemplate.queryForObject("""
            SELECT COALESCE(SUM(realized_pnl), 0)
            FROM fills f
            JOIN orders o ON o.id = f.order_id
            WHERE o.user_id = ?
              AND DATE(f.filled_at) = CURRENT_DATE
              AND f.realized_pnl < 0
        """, BigDecimal::class.java, userId) ?: BigDecimal.ZERO

        val totalAsset = context.totalAsset
        val lossRatio = todayLoss.abs().toDouble() / totalAsset.toDouble()

        return if (lossRatio >= limitPct) {
            RuleResult.blocked(
                rule = "DAILY_LOSS",
                detail = "오늘 손실 ${String.format("%.1f", lossRatio * 100)}% / 한도 ${limitPct * 100}%",
                current = lossRatio * 100,
                limit = limitPct * 100
            )
        } else {
            RuleResult.passed("DAILY_LOSS", lossRatio * 100, limitPct * 100)
        }
    }
}
```

### 2. ConcentrationRule — 집중도 한도

주문 후 특정 종목의 비중이 포트폴리오의 N%를 초과하면 차단한다.

```kotlin
class ConcentrationRule(
    private val limitPct: Double = 0.30,  // 기본 30%
) : RiskRule {

    override fun check(userId: Long, order: OrderRequest, context: RiskContext): RuleResult {
        val currentValue  = context.holdingsByStock[order.stockId] ?: BigDecimal.ZERO
        val orderValue    = order.estimatedValue  // 주문 예상 금액
        val projectedValue = currentValue + orderValue
        val projectedPct   = projectedValue.toDouble() / context.totalAsset.toDouble()

        return if (projectedPct >= limitPct) {
            RuleResult.blocked("CONCENTRATION",
                "${order.symbol} 주문 후 비중 ${String.format("%.1f", projectedPct * 100)}% / 한도 ${limitPct * 100}%",
                projectedPct * 100, limitPct * 100)
        } else {
            RuleResult.passed("CONCENTRATION", projectedPct * 100, limitPct * 100)
        }
    }
}
```

### 3. VaRLimitRule — VaR 한도

Value at Risk(VaR)는 주어진 신뢰 수준에서 최대 예상 손실이다. "95% 신뢰 수준으로 하루 최대 손실이 총 자산의 5%를 넘지 않는다"는 식이다.

monticker는 역사적 시뮬레이션 방식을 사용한다. 보유 종목들의 과거 일별 수익률에서 하위 5th 백분위를 VaR로 계산한다.

```kotlin
class VaRLimitRule(
    private val jdbcTemplate: JdbcTemplate,
    private val limitPct: Double = 0.05,
    private val confidenceLevel: Double = 0.95,
) : RiskRule {

    override fun check(userId: Long, order: OrderRequest, context: RiskContext): RuleResult {
        // 보유 종목별 최근 250일 일별 수익률 수집
        val returns = fetchDailyReturns(context.holdingStockIds)
        if (returns.isEmpty()) return RuleResult.passed("VAR", 0.0, limitPct * 100)

        // 포트폴리오 수익률 = 비중 가중 합산
        val portfolioReturns = calculatePortfolioReturns(returns, context.weights)

        // 하위 (1-confidenceLevel) 백분위 = VaR
        portfolioReturns.sort()
        val varIndex = ((1 - confidenceLevel) * portfolioReturns.size).toInt()
        val varValue = portfolioReturns[varIndex].abs()

        return if (varValue >= limitPct) {
            RuleResult.blocked("VAR",
                "95% VaR ${String.format("%.1f", varValue * 100)}% / 한도 ${limitPct * 100}%",
                varValue * 100, limitPct * 100)
        } else {
            RuleResult.passed("VAR", varValue * 100, limitPct * 100)
        }
    }
}
```

### 4. PositionCountRule — 보유 종목 수 한도

과도한 분산은 관리가 어렵다.

```kotlin
class PositionCountRule(
    private val maxPositions: Int = 10
) : RiskRule {

    override fun check(userId: Long, order: OrderRequest, context: RiskContext): RuleResult {
        val currentCount = context.holdingsByStock.size
        val isNewPosition = !context.holdingsByStock.containsKey(order.stockId)

        return if (isNewPosition && currentCount >= maxPositions) {
            RuleResult.blocked("POSITION_COUNT",
                "보유 종목 ${currentCount}개 / 한도 ${maxPositions}개",
                currentCount.toDouble(), maxPositions.toDouble())
        } else {
            RuleResult.passed("POSITION_COUNT", currentCount.toDouble(), maxPositions.toDouble())
        }
    }
}
```

### 5. TradingFrequencyRule — 주문 빈도 한도

1시간 내 주문 횟수를 제한해 충동 매매 패턴을 방지한다.

```kotlin
class TradingFrequencyRule(
    private val jdbcTemplate: JdbcTemplate,
    private val maxOrdersPerHour: Int = 5,
) : RiskRule {

    override fun check(userId: Long, order: OrderRequest, context: RiskContext): RuleResult {
        val recentCount = jdbcTemplate.queryForObject("""
            SELECT COUNT(*) FROM orders
            WHERE user_id = ?
              AND created_at >= NOW() - INTERVAL '1 hour'
              AND status NOT IN ('CANCELLED')
        """, Int::class.java, userId) ?: 0

        return if (recentCount >= maxOrdersPerHour) {
            RuleResult.blocked("TRADING_FREQUENCY",
                "1시간 내 주문 ${recentCount}회 / 한도 ${maxOrdersPerHour}회",
                recentCount.toDouble(), maxOrdersPerHour.toDouble())
        } else {
            RuleResult.passed("TRADING_FREQUENCY", recentCount.toDouble(), maxOrdersPerHour.toDouble())
        }
    }
}
```

---

## RiskCheckResult — 응답 형식

```kotlin
data class RiskCheckResult(
    val approved: Boolean,
    val checks: List<RuleResult>,
    val blockedBy: String?,
    val severity: Severity,
)

enum class Severity { INFO, WARNING, BLOCKED }
```

API 응답 예시:

```json
{
  "approved": false,
  "blockedBy": "일일 손실 한도 초과",
  "severity": "BLOCKED",
  "checks": [
    {
      "rule": "DAILY_LOSS",
      "passed": false,
      "detail": "오늘 손실 3.4% / 한도 3.0%",
      "current": 3.4,
      "limit": 3.0
    },
    {
      "rule": "CONCENTRATION",
      "passed": true,
      "detail": "삼성전자 비중 22.1% / 한도 30.0%",
      "current": 22.1,
      "limit": 30.0
    }
  ]
}
```

---

## Dry-run API

실제 주문 없이 리스크 결과만 확인할 수 있다. 프론트엔드에서 "주문 전 리스크 확인" 버튼에 연결한다.

```http
POST /api/risk/check
Content-Type: application/json

{
  "stockId": 1,
  "side": "BUY",
  "quantity": 100,
  "orderType": "MARKET"
}
```

---

## 정리

- 리스크 게이트는 체결 엔진 **앞**에서 동기로 실행된다. 비동기로 하면 타이밍 문제가 생긴다.
- 5가지 규칙(일일손실·집중도·VaR·종목수·주문빈도)이 독립적인 클래스로 구현되어 새 규칙 추가가 쉽다.
- Dry-run API로 주문 전에 사용자가 리스크 결과를 미리 확인할 수 있다.

다음 시리즈(Series 4)에서는 체결 결과를 어떻게 원장에 기록하는지, **이벤트 소싱 패턴으로 잔고를 저장하지 않고 재구성**하는 방법을 다룬다.
