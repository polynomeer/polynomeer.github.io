---
title: "룰 엔진: RSI·MACD 조건식을 JSON DSL로 — Quant Lab 설계"
date: 2026-06-16
categories: [Monticker, QuantLab]
tags: [monticker, quant, rule-engine, dsl, rsi, macd, kotlin]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 12
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
published: false
---

## "코딩 없는 전략 빌더"를 어떻게 구현하는가

Quant Lab의 핵심 가치는 프로그래밍 없이 투자 전략을 만들고 검증할 수 있다는 것이다.

사용자가 UI에서 이런 조건을 설정한다:

```
진입 조건:
  RSI(14) < 30                ← 과매도 구간
  AND MA(5) > MA(20)          ← 단기 이동평균이 장기 위에
  AND VOLUME > VOLUME_MA(20)  ← 거래량 증가

청산 조건:
  RSI(14) > 70                ← 과매수 구간
  OR MA(5) < MA(20)           ← 단기 이평선 데드크로스
```

이 조건을 코드가 평가할 수 있는 형식으로 저장해야 한다.

---

## 조건식 JSON DSL

```json
{
  "name": "RSI 반등 + 골든크로스 전략",
  "universe": ["KOSPI", "KOSDAQ"],
  "entryConditions": [
    {
      "indicator": "RSI",
      "params": { "period": 14 },
      "comparator": "LT",
      "threshold": 30
    },
    {
      "indicator": "MA_CROSS",
      "params": { "fastPeriod": 5, "slowPeriod": 20 },
      "comparator": "GOLDEN_CROSS",
      "threshold": null
    }
  ],
  "exitConditions": [
    {
      "indicator": "RSI",
      "params": { "period": 14 },
      "comparator": "GT",
      "threshold": 70
    }
  ],
  "logic": "AND"
}
```

이 JSON이 `rule_sets.rule_definition` 컬럼에 저장된다. 서버가 이를 파싱해 평가한다.

---

## 지원 지표

```kotlin
enum class Indicator {
    RSI,            // 상대강도지수 (14일 기본)
    MACD,           // MACD 선·신호선·히스토그램
    MACD_CROSS,     // MACD 골든/데드크로스
    MA,             // 단순 이동평균
    EMA,            // 지수 이동평균
    MA_CROSS,       // 이평선 골든/데드크로스
    BOLLINGER,      // 볼린저 밴드 위치
    ATR,            // 평균진폭범위 (변동성)
    VOLUME,         // 거래량
    VOLUME_MA,      // 거래량 이동평균
    CLOSE_VS_MA,    // 종가 대비 이동평균 비율
    PROFIT_RATE,    // 현재 수익률 (청산 조건용)
}
```

---

## IndicatorEngine — 지표 계산

```kotlin
@Service
class IndicatorEngine(private val candleRepository: CandleRepository) {

    fun compute(stockId: Long, indicator: Indicator, params: Map<String, Any>): Double {
        return when (indicator) {
            Indicator.RSI -> computeRsi(stockId, params["period"] as Int)
            Indicator.MA  -> computeMa(stockId, params["period"] as Int)
            Indicator.EMA -> computeEma(stockId, params["period"] as Int)
            Indicator.MACD -> computeMacd(stockId, params).macdLine
            Indicator.BOLLINGER -> computeBollinger(stockId, params).percentB
            else -> throw UnsupportedOperationException("지원하지 않는 지표: $indicator")
        }
    }

    private fun computeRsi(stockId: Long, period: Int): Double {
        val candles = candleRepository.findRecent(stockId, period + 1)
        if (candles.size < period + 1) return 50.0  // 데이터 부족 시 중립값

        val changes = candles.zipWithNext { a, b -> b.close - a.close }
        val gains   = changes.filter { it > 0 }.average().takeIf { it.isFinite() } ?: 0.0
        val losses  = changes.filter { it < 0 }.map { -it }.average().takeIf { it.isFinite() } ?: 0.0

        if (losses == 0.0) return 100.0
        val rs = gains / losses
        return 100.0 - (100.0 / (1 + rs))
    }

    private fun computeMa(stockId: Long, period: Int): Double {
        val candles = candleRepository.findRecent(stockId, period)
        return candles.map { it.close.toDouble() }.average()
    }
}
```

---

## RuleEvaluator — 조건식 평가

```kotlin
@Service
class RuleEvaluator(private val indicatorEngine: IndicatorEngine) {

    fun evaluateEntry(stockId: Long, ruleSet: RuleSet): Boolean {
        val results = ruleSet.entryConditions.map { condition ->
            evaluateCondition(stockId, condition)
        }
        return when (ruleSet.logic) {
            Logic.AND -> results.all { it }
            Logic.OR  -> results.any { it }
        }
    }

    private fun evaluateCondition(stockId: Long, condition: RuleCondition): Boolean {
        val value = indicatorEngine.compute(stockId, condition.indicator, condition.params)

        return when (condition.comparator) {
            Comparator.GT -> value > condition.threshold!!
            Comparator.GTE -> value >= condition.threshold!!
            Comparator.LT -> value < condition.threshold!!
            Comparator.LTE -> value <= condition.threshold!!
            Comparator.GOLDEN_CROSS -> isGoldenCross(stockId, condition.params)
            Comparator.DEAD_CROSS   -> isDeadCross(stockId, condition.params)
        }
    }

    private fun isGoldenCross(stockId: Long, params: Map<String, Any>): Boolean {
        val fastPeriod = params["fastPeriod"] as Int
        val slowPeriod = params["slowPeriod"] as Int
        val fastMa     = indicatorEngine.compute(stockId, Indicator.MA, mapOf("period" to fastPeriod))
        val slowMa     = indicatorEngine.compute(stockId, Indicator.MA, mapOf("period" to slowPeriod))
        return fastMa > slowMa
    }
}
```

---

## 신뢰도 점수 (Reliability Score)

백테스트 결과에 신뢰도 점수를 부여한다. 높은 수익률이라도 데이터가 부족하거나 과최적화된 전략은 신뢰할 수 없다.

```kotlin
fun calculateReliabilityScore(result: BacktestResult, ruleSet: RuleSet): ReliabilityGrade {
    var penalty = 0

    // 거래 횟수가 적으면 통계적으로 의미 없음
    if (result.tradeCount < 30)  penalty += 30
    if (result.tradeCount < 10)  penalty += 20

    // 파라미터 변경 횟수가 많으면 과최적화 의심
    if (ruleSet.versionCount > 10) penalty += 25
    if (ruleSet.versionCount > 5)  penalty += 10

    // 표본외(Out-of-Sample) 성과가 표본내보다 20% 이상 낮으면
    val oosGap = result.inSampleReturn - result.outOfSampleReturn
    if (oosGap > 0.20) penalty += 20
    if (oosGap > 0.10) penalty += 10

    // 백테스트 기간이 너무 짧으면
    if (result.periodDays < 180)  penalty += 15

    return when {
        penalty == 0     -> ReliabilityGrade.A  // 매우 신뢰
        penalty <= 20    -> ReliabilityGrade.B  // 신뢰
        penalty <= 40    -> ReliabilityGrade.C  // 주의
        else             -> ReliabilityGrade.D  // 경고
    }
}
```

---

## 전략 룰셋 보호

전략의 구체적인 조건식은 서버에서만 실행된다. 사용자가 전략을 구독해도 조건식 내용은 볼 수 없다.

```kotlin
// 구독자에게는 신호(방향)만 반환, 조건식 내용은 반환하지 않음
data class StrategySignal(
    val strategyId: Long,
    val stockId: Long,
    val direction: Direction,    // BUY or SELL
    val confidence: Double,
    val triggeredAt: Instant,
    // ruleDefinition 은 절대 포함하지 않음
)
```

---

## 정리

- 조건식을 JSON DSL로 저장하면 코드 변경 없이 새 전략을 만들 수 있다.
- IndicatorEngine이 지표 계산을, RuleEvaluator가 조건 평가를 분리해 담당한다.
- 신뢰도 점수는 거래 횟수, 파라미터 변경 횟수, 표본외 성과를 종합해 과최적화를 탐지한다.

다음 편에서는 과거 캔들 데이터로 전략을 시뮬레이션하는 **백테스트 엔진**을 다룬다.
