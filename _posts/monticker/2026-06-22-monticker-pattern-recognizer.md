---
title: "ZigZag + 패턴 템플릿 매칭으로 차트 패턴 감지 — 헤드앤숄더·이중바닥"
date: 2026-06-22
categories: [Monticker, QuantAnalytics]
tags: [monticker, pattern-recognition, zigzag, chart-pattern, kotlin, technical-analysis]
---

## 차트 패턴이란

기술적 분석(Technical Analysis)에서 차트 패턴은 과거 가격 움직임의 반복 구조다. 패턴이 완성되면 다음 방향을 예측하는 데 사용한다.

monticker가 감지하는 5가지 패턴:

| 패턴 | 의미 | 신호 방향 |
|------|------|----------|
| HEAD_AND_SHOULDERS | 머리·어깨 모양, 상승 끝 | 하락 반전 |
| DOUBLE_BOTTOM | 이중 바닥 W자 | 상승 반전 |
| DOUBLE_TOP | 이중 천장 M자 | 하락 반전 |
| ASCENDING_TRIANGLE | 고점 수평·저점 상승 | 상승 지속 |
| DESCENDING_TRIANGLE | 고점 하락·저점 수평 | 하락 지속 |

---

## 왜 원시 가격이 아닌 ZigZag인가

원시 캔들 데이터로 패턴을 찾으면 노이즈가 많다. 매 틱의 작은 등락이 패턴 감지를 방해한다.

ZigZag 알고리즘은 **의미 있는 전환점(swing point)** 만 추출해 노이즈를 제거한다.

```
원시 가격:  73200 → 73100 → 73300 → 73250 → 73400 → 73100 → ...
                                          (노이즈 많음)

ZigZag:     73200 ──────────────────── 73400
                                             ↘ 73100
                         (의미 있는 고점/저점만)
```

---

## ZigZag 알고리즘

```kotlin
data class SwingPoint(
    val index : Int,
    val price : BigDecimal,
    val type  : SwingType,  // HIGH or LOW
    val date  : LocalDate,
)

enum class SwingType { HIGH, LOW }

fun zigZag(candles: List<DailyCandle>, thresholdPct: Double = 0.05): List<SwingPoint> {
    if (candles.size < 3) return emptyList()

    val swings = mutableListOf<SwingPoint>()
    var lastSwingIndex = 0
    var lastSwingPrice = candles[0].close
    var direction: SwingType? = null

    candles.forEachIndexed { i, candle ->
        if (i == 0) return@forEachIndexed

        val changeFromLast = (candle.close - lastSwingPrice).toDouble() / lastSwingPrice.toDouble()

        when {
            direction == null -> {
                // 방향 미정 → 첫 번째 의미 있는 변동으로 방향 결정
                if (Math.abs(changeFromLast) >= thresholdPct) {
                    direction = if (changeFromLast > 0) SwingType.HIGH else SwingType.LOW
                    swings.add(SwingPoint(0, candles[0].close, direction!!.flip(), candles[0].date))
                }
            }
            direction == SwingType.HIGH && changeFromLast <= -thresholdPct -> {
                // 상승 → 하락 전환: 고점 기록
                swings.add(SwingPoint(lastSwingIndex, lastSwingPrice, SwingType.HIGH, candles[lastSwingIndex].date))
                direction = SwingType.LOW
                lastSwingIndex = i
                lastSwingPrice = candle.close
            }
            direction == SwingType.LOW && changeFromLast >= thresholdPct -> {
                // 하락 → 상승 전환: 저점 기록
                swings.add(SwingPoint(lastSwingIndex, lastSwingPrice, SwingType.LOW, candles[lastSwingIndex].date))
                direction = SwingType.HIGH
                lastSwingIndex = i
                lastSwingPrice = candle.close
            }
            direction == SwingType.HIGH && candle.close > lastSwingPrice -> {
                // 상승 지속: 고점 갱신
                lastSwingIndex = i
                lastSwingPrice = candle.close
            }
            direction == SwingType.LOW && candle.close < lastSwingPrice -> {
                // 하락 지속: 저점 갱신
                lastSwingIndex = i
                lastSwingPrice = candle.close
            }
        }
    }
    return swings
}
```

`thresholdPct = 0.05`는 5% 이상의 가격 변동만 swing point로 인정한다. 값이 작을수록 민감하고, 클수록 큰 추세만 감지한다.

---

## 이중 바닥 패턴 감지

```kotlin
fun detectDoubleBottom(swings: List<SwingPoint>): PatternMatch? {
    // 최근 5개 swing에서 [LOW, HIGH, LOW] 시퀀스 탐색
    if (swings.size < 5) return null

    val recent = swings.takeLast(5)
    val lows  = recent.filter { it.type == SwingType.LOW }
    val highs = recent.filter { it.type == SwingType.HIGH }

    if (lows.size < 2 || highs.isEmpty()) return null

    val bottom1 = lows[lows.size - 2]
    val neckline = highs.last()
    val bottom2 = lows.last()

    // 순서 확인: bottom1 → neckline → bottom2
    if (bottom1.index >= neckline.index || neckline.index >= bottom2.index) return null

    val bottom1Price = bottom1.price.toDouble()
    val bottom2Price = bottom2.price.toDouble()
    val necklinePrice = neckline.price.toDouble()

    // 두 저점이 비슷해야 함 (±3%)
    val bottomDiff = Math.abs(bottom1Price - bottom2Price) / bottom1Price
    if (bottomDiff > 0.03) return null

    // 넥라인이 저점보다 5% 이상 높아야 함
    val necklineAbove = (necklinePrice - bottom1Price) / bottom1Price
    if (necklineAbove < 0.05) return null

    // 완성도 점수 계산
    val symmetryScore = (1 - bottomDiff / 0.03) * 40  // 두 저점 유사도
    val depthScore    = minOf(necklineAbove / 0.10, 1.0) * 30  // 패턴 깊이
    val recencyScore  = 30.0  // 최근 데이터에서 발견

    val confidence = (symmetryScore + depthScore + recencyScore).toInt().coerceIn(0, 100)

    return PatternMatch(
        type       = PatternType.DOUBLE_BOTTOM,
        confidence = confidence,
        bottom1    = bottom1,
        neckline   = neckline,
        bottom2    = bottom2,
        signal     = TechnicalSignal.BULLISH,
    )
}
```

---

## 헤드앤숄더 패턴 감지

```kotlin
fun detectHeadAndShoulders(swings: List<SwingPoint>): PatternMatch? {
    if (swings.size < 7) return null

    val recent = swings.takeLast(7)
    val highs = recent.filter { it.type == SwingType.HIGH }
    val lows  = recent.filter { it.type == SwingType.LOW }

    if (highs.size < 3 || lows.size < 2) return null

    val leftShoulder  = highs[highs.size - 3]
    val head          = highs[highs.size - 2]
    val rightShoulder = highs.last()
    val leftNeckline  = lows[lows.size - 2]
    val rightNeckline = lows.last()

    // 머리가 두 어깨보다 높아야 함
    if (head.price <= leftShoulder.price || head.price <= rightShoulder.price) return null

    // 두 어깨가 비슷한 높이여야 함 (±5%)
    val shoulderDiff = Math.abs(
        leftShoulder.price.toDouble() - rightShoulder.price.toDouble()
    ) / leftShoulder.price.toDouble()
    if (shoulderDiff > 0.05) return null

    // 두 넥라인이 비슷한 높이여야 함
    val necklineDiff = Math.abs(
        leftNeckline.price.toDouble() - rightNeckline.price.toDouble()
    ) / leftNeckline.price.toDouble()
    if (necklineDiff > 0.05) return null

    val headHeight = (head.price.toDouble() - leftShoulder.price.toDouble()) / leftShoulder.price.toDouble()
    val symmetryScore = (1 - shoulderDiff / 0.05) * 50
    val heightScore   = minOf(headHeight / 0.10, 1.0) * 50

    val confidence = (symmetryScore + heightScore).toInt().coerceIn(0, 100)

    return PatternMatch(
        type       = PatternType.HEAD_AND_SHOULDERS,
        confidence = confidence,
        signal     = TechnicalSignal.BEARISH,
    )
}
```

---

## 이벤트로 기록

패턴이 완성도 점수 70 이상이면 `stock_events`에 이벤트를 기록한다.

```kotlin
fun detectAndRecord(stockId: Long) {
    val candles = candleRepository.findRecentDays(stockId, 120)
    val swings  = zigZag(candles)

    listOf(
        detectDoubleBottom(swings),
        detectDoubleTop(swings),
        detectHeadAndShoulders(swings),
        detectAscendingTriangle(swings),
        detectDescendingTriangle(swings),
    ).filterNotNull()
        .filter { it.confidence >= 70 }
        .forEach { match ->
            stockEventRepository.insertIfNotExists(StockEvent(
                stockId   = stockId,
                eventType = EventType.PATTERN_DETECTED,
                metadata  = objectMapper.writeValueAsString(match),
                importance = match.confidence,
            ))
        }
}
```

---

## 정리

- ZigZag는 5% 이상 전환만 추출해 노이즈를 제거한다. 임계값이 패턴 민감도를 결정한다.
- 패턴 완성도 점수(0~100)는 두 저점/고점의 대칭성, 패턴 깊이, 최근성으로 계산한다.
- 점수 70 이상인 패턴만 `stock_events`에 기록해 타임라인에 표시한다.

다음 편에서는 ADX 지표로 현재 시장이 상승장·하락장·횡보장·고변동성 중 어느 국면인지 분류하는 **시장 국면 감지(Regime Detection)** 를 다룬다.
