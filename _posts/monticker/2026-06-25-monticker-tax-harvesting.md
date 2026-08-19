---
title: "손익통산으로 세금 줄이기 — Tax-Loss Harvesting 시뮬레이션"
date: 2026-06-25
categories: [Monticker, QuantAnalytics]
tags: [monticker, tax, tax-harvesting, kotlin, investment, education]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 19
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: draft
---

> **주의**: 이 기능은 모의투자 전용 교육 시뮬레이션입니다. 실제 세무 신고나 절세 전략으로 사용할 수 없습니다.

## 손익통산이란

한국 주식 투자에서 양도소득세는 이익이 난 종목에만 부과되지 않는다. 같은 해에 발생한 이익과 손실을 합산(통산)한 후 순이익에 과세한다.

```
[손익통산 전]
  NVDA 매도 이익: +1,200,000원 → 양도세 264,000원 (22%)
  삼성전자 손실: -500,000원 (아직 보유 중, 미실현)

  납부 세금: 264,000원

[손익통산 후 — 삼성전자 매도]
  NVDA 이익: +1,200,000원
  삼성전자 손실: -500,000원 (실현)
  과세표준: 700,000원 → 양도세 154,000원

  절세액: 264,000 - 154,000 = 110,000원
```

평가손실 중인 종목을 연말 전에 매도해 손실을 실현시키면 세금을 줄일 수 있다. 이를 **Tax-Loss Harvesting**이라고 한다.

---

## 구현: TaxOptimizerService

```kotlin
@Service
class TaxOptimizerService(
    private val jdbcTemplate: JdbcTemplate,
    private val priceService: PriceService,
) {
    // 절세 후보 종목 추출
    fun findHarvestingCandidates(userId: Long): HarvestingResult {
        // 1. 올해 실현 손익 합산
        val realizedPnl = getRealizedPnl(userId)

        // 2. 현재 보유 중인 평가손실 종목 목록
        val holdings = getHoldingsWithPnl(userId)
        val losers   = holdings.filter { it.unrealizedPnl < BigDecimal.ZERO }

        if (losers.isEmpty() || realizedPnl <= BigDecimal.ZERO) {
            return HarvestingResult(
                realizedPnl = realizedPnl,
                candidates  = emptyList(),
                summary     = "손익통산 대상이 없습니다.",
            )
        }

        // 3. 각 손실 종목의 절세 효과 계산
        val candidates = losers.map { holding ->
            val harvestableAmount = holding.unrealizedPnl.abs()
            val offsettable = minOf(harvestableAmount, realizedPnl)
            val taxSaving   = offsettable.multiply(BigDecimal("0.22"))

            HarvestingCandidate(
                stockId        = holding.stockId,
                symbol         = holding.symbol,
                currentPrice   = holding.currentPrice,
                avgCost        = holding.avgCost,
                quantity       = holding.quantity,
                unrealizedPnl  = holding.unrealizedPnl,
                estimatedTaxSaving = taxSaving,
            )
        }.sortedByDescending { it.estimatedTaxSaving }

        return HarvestingResult(
            realizedPnl = realizedPnl,
            candidates  = candidates,
            summary     = buildSummary(realizedPnl, candidates),
        )
    }
}
```

---

## 실현 손익 계산

```kotlin
private fun getRealizedPnl(userId: Long): BigDecimal {
    return jdbcTemplate.queryForObject("""
        SELECT COALESCE(SUM(realized_pnl), 0)
        FROM fills f
        JOIN orders o ON o.id = f.order_id
        WHERE o.user_id = ?
          AND EXTRACT(YEAR FROM f.filled_at) = EXTRACT(YEAR FROM NOW())
    """, BigDecimal::class.java, userId) ?: BigDecimal.ZERO
}
```

---

## 매도 시뮬레이션

후보 종목을 실제 매도하면 세금이 어떻게 달라지는지 시뮬레이션한다.

```kotlin
fun simulate(userId: Long, stockIdsToSell: List<Long>): TaxSimulationResult {
    val currentRealizedPnl = getRealizedPnl(userId)
    val holdings = getHoldingsWithPnl(userId)

    // 선택한 종목들의 손실 합산
    val additionalLoss = stockIdsToSell.sumOf { stockId ->
        holdings.find { it.stockId == stockId }?.unrealizedPnl ?: BigDecimal.ZERO
    }

    val beforePnl    = currentRealizedPnl
    val afterPnl     = currentRealizedPnl + additionalLoss  // 손실 반영
    val beforeTax    = calculateTax(beforePnl)
    val afterTax     = calculateTax(afterPnl)
    val taxSaving    = beforeTax - afterTax

    return TaxSimulationResult(
        beforeRealizedPnl = beforePnl,
        afterRealizedPnl  = afterPnl,
        beforeTax         = beforeTax,
        afterTax          = afterTax,
        estimatedSaving   = taxSaving,
        caveat            = "모의투자 시뮬레이션 결과입니다. 실제 세무 신고에 사용하지 마세요.",
    )
}

private fun calculateTax(pnl: BigDecimal): BigDecimal {
    if (pnl <= BigDecimal.ZERO) return BigDecimal.ZERO
    return pnl.multiply(BigDecimal("0.22"))  // 양도소득세 22% (단순화)
}
```

---

## 응답 예시

```json
{
  "realizedPnl": 1200000,
  "candidates": [
    {
      "symbol": "005930",
      "currentPrice": 68000,
      "avgCost": 75000,
      "quantity": 10,
      "unrealizedPnl": -70000,
      "estimatedTaxSaving": 15400
    },
    {
      "symbol": "NVDA",
      "currentPrice": 120.5,
      "avgCost": 135.0,
      "quantity": 5,
      "unrealizedPnl": -72500,
      "estimatedTaxSaving": 15950
    }
  ],
  "summary": "두 종목 모두 매도 시 예상 절세액: 31,350원 (연간 실현이익 1,200,000원 기준)",
  "caveat": "모의투자 시뮬레이션입니다. 실제 세무 신고에 사용하지 마세요."
}
```

---

## 한계와 고지

실제 세금 계산은 훨씬 복잡하다.

1. **보유 기간**: 단기(1년 미만)와 장기 양도세율이 다를 수 있다.
2. **종목 유형**: 상장 주식과 비상장 주식, 해외 주식 세율이 다르다.
3. **기본공제**: 연간 250만 원 기본공제 적용 여부.
4. **지방소득세**: 양도소득세의 10% 추가.

monticker는 이를 단순화해 교육 목적으로만 제공하고, 모든 응답에 면책 고지를 포함한다.

---

## 정리

- Tax-Loss Harvesting은 평가손실 종목을 연내 매도해 손익을 통산하고 세금을 줄이는 전략이다.
- monticker는 후보 종목을 추출하고 절세액을 시뮬레이션하는 교육 기능을 제공한다.
- 실제 세무 신고에는 사용할 수 없으며, 모든 응답에 면책 고지를 포함한다.

다음 시리즈(Bonus)에서는 311개 테스트를 작성한 경험을 기반으로 **MockK로 JdbcTemplate 목킹하기**를 다룬다.
