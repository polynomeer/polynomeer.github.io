---
title: "EMA 기반 이상 탐지 — 가격 급등과 거래량 서지 실시간 감지"
date: 2026-06-09
categories: [Monticker, Realtime]
tags: [monticker, ema, event-detection, anomaly, kotlin, statistics]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 7
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: writing
---

## "급등"을 어떻게 정의하는가

가격이 올랐다. 그게 급등인가, 정상 변동인가?

고정 임계값을 쓰면 문제가 생긴다. "3% 이상 오르면 급등"이라고 정의하면, 평소 변동폭이 0.5%인 삼성전자에서는 3%가 확실한 이상이지만, 변동폭이 5%인 중소형주에서는 3%가 노이즈다.

이상 탐지에는 **상대적 기준**이 필요하다. 최근 추이 대비 얼마나 벗어났는지를 봐야 한다.

---

## 지수이동평균(EMA) — 적응형 기준선

지수이동평균(Exponential Moving Average)은 최근 데이터에 더 높은 가중치를 주는 이동평균이다.

```
EMA(t) = α × value(t) + (1 - α) × EMA(t-1)
```

α(alpha)는 0과 1 사이의 평활 계수다. α가 클수록 최신 값의 영향이 크고(빠른 추적), α가 작을수록 과거 누적값의 영향이 크다(안정적).

monticker에서는 `α = 0.1`을 사용한다. 최신 틱이 10%, 누적 EMA가 90% 반영된다. 갑작스러운 스파이크 하나에 EMA가 크게 흔들리지 않도록 안정적으로 설정했다.

```kotlin
class EmaEstimator(private val alpha: Double = 0.1) {
    private var ema: Double? = null

    fun update(value: Double): Double {
        ema = if (ema == null) {
            value  // 첫 번째 값으로 초기화
        } else {
            alpha * value + (1 - alpha) * ema!!
        }
        return ema!!
    }

    fun current(): Double? = ema
}
```

---

## PriceSpikeDetector

가격 EMA를 기준선으로, 현재 가격의 이탈율을 계산한다.

```kotlin
@Component
class PriceSpikeDetector(
    private val stockEventRepository: StockEventRepository,
) {
    // 종목별 독립적인 EMA 상태
    private val emaMap = ConcurrentHashMap<Long, EmaEstimator>()

    // spikeThreshold: EMA 대비 이탈 비율 기준 (기본 3%)
    private val spikeThreshold = 0.03

    fun detect(stockId: Long, price: Double): StockEvent? {
        val estimator = emaMap.getOrPut(stockId) { EmaEstimator(alpha = 0.1) }
        val previousEma = estimator.current()
        val currentEma = estimator.update(price)

        if (previousEma == null) return null  // EMA 워밍업 중

        val changeRate = Math.abs(price - currentEma) / currentEma

        return if (changeRate >= spikeThreshold) {
            StockEvent(
                stockId = stockId,
                eventType = EventType.PRICE_SPIKE,
                value = changeRate,
                direction = if (price > currentEma) "UP" else "DOWN",
                triggeredAt = Instant.now(),
            )
        } else null
    }
}
```

**워밍업 기간**이 중요하다. EMA 초기값이 첫 번째 가격이면 두 번째 가격부터 이탈율을 계산할 수 있다. 하지만 EMA가 충분히 안정되지 않은 초기에는 노이즈가 많다. 실제로는 10~20개의 틱을 워밍업으로 처리하고 그 이후부터 이벤트를 발생시키는 것이 좋다.

---

## VolumeSurgeDetector

거래량 급증은 가격 변동보다 먼저 발생하는 경우가 많아 조기 신호로 유용하다.

```kotlin
@Component
class VolumeSurgeDetector {
    private val emaMap = ConcurrentHashMap<Long, EmaEstimator>()

    // 평균 거래량의 3배 이상이면 서지
    private val surgeRatio = 3.0

    fun detect(stockId: Long, volume: Long): StockEvent? {
        val estimator = emaMap.getOrPut(stockId) { EmaEstimator(alpha = 0.1) }
        val emaVolume = estimator.current()
        estimator.update(volume.toDouble())

        if (emaVolume == null || emaVolume < 1.0) return null

        val ratio = volume / emaVolume

        return if (ratio >= surgeRatio) {
            StockEvent(
                stockId = stockId,
                eventType = EventType.VOLUME_SURGE,
                value = ratio,
                triggeredAt = Instant.now(),
            )
        } else null
    }
}
```

---

## 중복 이벤트 방지

EMA가 임계치를 넘으면 매 틱마다 이벤트가 발생할 수 있다. 1초마다 같은 이벤트가 수십 개 생기는 것은 의미가 없다.

분 단위 중복 방지를 DB 레벨에서 처리한다.

```kotlin
@Repository
class StockEventRepository(private val jdbcTemplate: JdbcTemplate) {

    fun insertIfNotExists(event: StockEvent): Boolean {
        val sql = """
            INSERT INTO stock_events
                (stock_id, event_type, value, direction, triggered_at, importance_score)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (stock_id, event_type, date_trunc('minute', triggered_at))
            DO NOTHING
        """.trimIndent()

        val updated = jdbcTemplate.update(sql,
            event.stockId, event.eventType.name, event.value,
            event.direction, event.triggeredAt, event.importanceScore)

        return updated > 0
    }
}
```

같은 종목에서 같은 유형의 이벤트가 1분 안에 두 번 발생하면 두 번째는 무시된다. `ON CONFLICT DO NOTHING`이 DB 레벨에서 보장한다.

---

## 중요도 점수 계산

모든 급등이 동일하게 중요하지 않다. 뉴스와 동시 발생한 가격 급등이 뉴스 없는 급등보다 중요하다.

```kotlin
fun calculateImportanceScore(
    spikeRate: Double,
    volumeRatio: Double,
    hasNews: Boolean,
    hasDisclosure: Boolean
): Int {
    var score = 0

    // 가격 변동 폭
    score += when {
        spikeRate >= 0.10 -> 40   // 10% 이상
        spikeRate >= 0.05 -> 25   // 5% 이상
        spikeRate >= 0.03 -> 10   // 3% 이상
        else -> 0
    }

    // 거래량 비율
    score += when {
        volumeRatio >= 10.0 -> 30   // 10배 이상
        volumeRatio >= 5.0  -> 20   // 5배 이상
        volumeRatio >= 3.0  -> 10   // 3배 이상
        else -> 0
    }

    // 외부 요인
    if (hasNews)        score += 20
    if (hasDisclosure)  score += 30

    return score.coerceIn(0, 100)
}
```

이 점수는 타임라인 차트에서 이벤트의 크기와 우선순위를 결정하는 데 사용된다.

---

## EMA의 장점: 메모리 효율

EMA는 과거 데이터를 저장하지 않는다. 마지막 EMA 값 하나만 유지하면 된다.

단순 이동평균(SMA)이라면 `N`개의 과거 값을 저장해야 한다. 종목 수가 늘어날수록 메모리가 선형으로 증가한다.

```
SMA(20): 종목 202개 × 20개 값 = 4,040개 double
EMA: 종목 202개 × 1개 값 = 202개 double
```

실시간 스트림 처리에서 EMA가 선호되는 이유가 여기에 있다.

---

## 정리

- EMA는 과거 값 하나만 유지하면서 최근 추이를 반영하는 적응형 기준선이다.
- `α = 0.1`로 급격한 스파이크에 흔들리지 않는 안정적인 EMA를 만든다.
- `ON CONFLICT DO NOTHING`으로 분 단위 중복 이벤트를 DB 레벨에서 차단한다.
- 중요도 점수는 가격 변동폭 + 거래량 비율 + 외부 요인(뉴스/공시)을 합산한다.

다음 시리즈(Series 3)에서는 모의투자의 핵심인 **CLOB 체결 엔진**을 다룬다. TreeMap으로 호가창을 만들고 가격/시간 우선 매칭을 구현하는 방법을 살펴본다.
