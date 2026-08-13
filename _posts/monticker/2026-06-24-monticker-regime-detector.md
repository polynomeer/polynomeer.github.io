---
title: "ADX로 시장 국면 분류하기 — BULL·BEAR·SIDEWAYS·HIGH_VOL"
date: 2026-06-24
categories: [Monticker, QuantAnalytics]
tags: [monticker, regime-detection, adx, market-regime, kotlin, technical-analysis]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 18
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
published: false
---

## 시장 국면이 왜 중요한가

같은 전략도 시장 국면에 따라 성과가 크게 다르다. 추세 추종 전략은 추세가 없는 횡보장에서 계속 손실을 낸다. 역추세 전략은 강한 추세장에서 손실을 낸다.

백테스트 결과에 국면별 성과를 분해하면 전략의 약점이 드러난다.

```
이 전략의 국면별 성과:
  BULL  구간: 수익률 +18.2%, MDD  -4.1%  ✅ 좋음
  BEAR  구간: 수익률  -8.4%, MDD -22.3%  ❌ 취약
  SIDEWAYS:   수익률  +1.1%, MDD  -6.7%  ⚠️ 보통

→ 하락장에서 MDD가 5배 확대됩니다. 하락장 진입 시 포지션 축소를 권장합니다.
```

---

## ADX(Average Directional Index)란

ADX는 J. Welles Wilder가 개발한 추세 강도 지표다. 추세의 방향이 아니라 **강도**를 측정한다.

```
ADX < 20:  추세 없음 (횡보)
ADX 20-40: 보통 추세
ADX > 40:  강한 추세
ADX > 60:  매우 강한 추세
```

ADX를 방향(DI+, DI-)과 조합하면 추세의 강도와 방향을 동시에 알 수 있다.

---

## ADX 계산 알고리즘

```kotlin
data class AdxResult(
    val adx   : Double,
    val diPlus : Double,   // +DI: 상승 방향 강도
    val diMinus: Double,   // -DI: 하락 방향 강도
)

fun computeAdx(candles: List<DailyCandle>, period: Int = 14): AdxResult {
    if (candles.size < period * 2) return AdxResult(0.0, 0.0, 0.0)

    val trList   = mutableListOf<Double>()  // True Range
    val dmPlusList  = mutableListOf<Double>()  // +DM
    val dmMinusList = mutableListOf<Double>()  // -DM

    // 1. True Range와 방향적 이동(DM) 계산
    for (i in 1 until candles.size) {
        val prev = candles[i - 1]
        val curr = candles[i]

        val tr = maxOf(
            curr.high.toDouble() - curr.low.toDouble(),
            Math.abs(curr.high.toDouble() - prev.close.toDouble()),
            Math.abs(curr.low.toDouble() - prev.close.toDouble()),
        )
        trList.add(tr)

        val upMove   = curr.high.toDouble() - prev.high.toDouble()
        val downMove = prev.low.toDouble() - curr.low.toDouble()

        dmPlusList.add(if (upMove > downMove && upMove > 0) upMove else 0.0)
        dmMinusList.add(if (downMove > upMove && downMove > 0) downMove else 0.0)
    }

    // 2. Wilder 스무딩 (지수이동평균의 변형)
    fun wilderSmooth(data: List<Double>, period: Int): List<Double> {
        val result = mutableListOf<Double>()
        var smooth = data.take(period).sum()
        result.add(smooth)
        for (i in period until data.size) {
            smooth = smooth - smooth / period + data[i]
            result.add(smooth)
        }
        return result
    }

    val smoothTR    = wilderSmooth(trList, period)
    val smoothDMPlus  = wilderSmooth(dmPlusList, period)
    val smoothDMMinus = wilderSmooth(dmMinusList, period)

    // 3. DI+ , DI- 계산
    val diPlusList  = smoothDMPlus.zip(smoothTR) { dm, tr -> if (tr == 0.0) 0.0 else dm / tr * 100 }
    val diMinusList = smoothDMMinus.zip(smoothTR) { dm, tr -> if (tr == 0.0) 0.0 else dm / tr * 100 }

    // 4. DX → ADX (Wilder 스무딩)
    val dxList = diPlusList.zip(diMinusList) { p, m ->
        val sum = p + m
        if (sum == 0.0) 0.0 else Math.abs(p - m) / sum * 100
    }

    val adxValues = wilderSmooth(dxList, period)

    return AdxResult(
        adx    = adxValues.last(),
        diPlus  = diPlusList.last(),
        diMinus = diMinusList.last(),
    )
}
```

Wilder 스무딩은 EMA와 유사하지만 `α = 1/period`를 사용한다. 표준 EMA보다 느리게 반응해 ADX에 적합하다.

---

## 국면 분류 알고리즘

```kotlin
enum class MarketRegime {
    BULL,       // 상승장
    BEAR,       // 하락장
    SIDEWAYS,   // 횡보장
    HIGH_VOL,   // 고변동성 (추세 무관)
}

fun classifyRegime(candles: List<DailyCandle>, window: Int = 60): MarketRegime {
    if (candles.size < window) return MarketRegime.SIDEWAYS

    val adxResult = computeAdx(candles.takeLast(window))

    // 변동성: 최근 20일 연환산 표준편차
    val returns = candles.takeLast(21)
        .zipWithNext { a, b -> (b.close.toDouble() - a.close.toDouble()) / a.close.toDouble() }
    val volatility = returns.standardDeviation() * Math.sqrt(252.0)

    // 60일 선형회귀 기울기 (추세 방향)
    val trend = linearRegressionSlope(candles.takeLast(window).map { it.close.toDouble() })

    // 과거 1년 변동성의 80th 백분위 계산
    val historicalVol = computeHistoricalVolatilityPercentile(candles, percentile = 0.8)

    return when {
        volatility > historicalVol -> MarketRegime.HIGH_VOL  // 변동성 최우선
        adxResult.adx < 20        -> MarketRegime.SIDEWAYS   // 추세 강도 낮음
        trend > 0 && adxResult.diPlus > adxResult.diMinus -> MarketRegime.BULL
        trend < 0 && adxResult.diMinus > adxResult.diPlus -> MarketRegime.BEAR
        else                       -> MarketRegime.SIDEWAYS
    }
}

private fun linearRegressionSlope(values: List<Double>): Double {
    val n = values.size.toDouble()
    val xMean = (n - 1) / 2
    val yMean = values.average()
    val numerator   = values.indices.sumOf { i -> (i - xMean) * (values[i] - yMean) }
    val denominator = values.indices.sumOf { i -> (i - xMean) * (i - xMean) }
    return if (denominator == 0.0) 0.0 else numerator / denominator
}
```

---

## 국면 기록과 백테스트 연동

```kotlin
@Service
class RegimeDetectorService(
    private val candleRepository: CandleRepository,
    private val jdbcTemplate: JdbcTemplate,
) {
    fun detectAndRecord(stockId: Long) {
        val candles = candleRepository.findRecentDays(stockId, 300)
        val regime  = classifyRegime(candles)

        // 마지막 기록과 동일한 국면이면 스킵 (변화 없음)
        val lastRegime = getLastRegime(stockId)
        if (lastRegime == regime) return

        jdbcTemplate.update("""
            INSERT INTO regime_history (stock_id, regime, started_at, adx, volatility)
            VALUES (?, ?, NOW(), ?, ?)
        """, stockId, regime.name, computeAdx(candles).adx,
             computeVolatility(candles))
    }

    // 백테스트 결과에서 각 거래가 어떤 국면에서 발생했는지 맵핑
    fun enrichWithRegime(trades: List<SimulatedTrade>, stockId: Long): List<TradeWithRegime> {
        return trades.map { trade ->
            val regimeAtEntry = getRegimeAt(stockId, trade.entryDate)
            trade.copy(regime = regimeAtEntry)
        }
    }
}
```

---

## 국면별 성과 분해 (PhasePerformance)

```kotlin
fun computePhasePerformance(
    trades: List<TradeWithRegime>
): Map<MarketRegime, PhaseStats> {
    return MarketRegime.entries.associateWith { regime ->
        val regimeTrades = trades.filter { it.regime == regime }
        if (regimeTrades.isEmpty()) return@associateWith PhaseStats.empty()

        PhaseStats(
            tradeCount    = regimeTrades.size,
            totalReturn   = regimeTrades.sumOf { it.netPnl } / initialCapital,
            winRate       = regimeTrades.count { it.netPnl > 0 }.toDouble() / regimeTrades.size,
            mdd           = calculateMdd(regimeTrades),
        )
    }
}
```

---

## 정리

- ADX는 추세 방향이 아닌 **추세 강도**를 측정한다. ADX < 20이면 추세 없음.
- 분류 우선순위: HIGH_VOL → SIDEWAYS(ADX<20) → BULL/BEAR(방향 판단)
- 60일 선형회귀 기울기로 추세 방향을, DI+/DI-로 매수/매도 압력을 확인한다.
- 백테스트 결과에 국면별 성과를 분해하면 전략의 환경적 취약점이 드러난다.

다음 편에서는 모의투자 세금 시뮬레이션인 **Tax Harvesting — 손익통산으로 세금 줄이기**를 다룬다.
