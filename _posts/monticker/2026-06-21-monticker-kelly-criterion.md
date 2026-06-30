---
title: "Kelly Criterion: 수학적 파산 방지 베팅 비율 — Half Kelly와 백테스트 연동"
date: 2026-06-21
categories: [Monticker, QuantAnalytics]
tags: [monticker, kelly-criterion, position-sizing, math, quant, risk-management]
---

## 왜 베팅 비율이 중요한가

좋은 전략이 있어도 베팅 비율이 잘못되면 파산할 수 있다.

```
예시: 승률 60%, 손익비 1.5:1인 전략
  
  자본 1,000,000원, 매 거래 50% 베팅

  1회: 승 → 750,000 (+50%)
  2회: 패 → 375,000 (-50%)
  3회: 승 → 562,500 (+50%)
  4회: 패 → 281,250 (-50%)

  4번 거래 후: 281,250원 (초기의 28%)
  실제로 이길 확률이 더 높은 전략임에도 불구하고 손실
```

너무 큰 베팅은 연속 손실 시 회복 불가능한 손실을 낸다. **얼마를 베팅해야 하는가**를 수학적으로 계산하는 것이 Kelly Criterion이다.

---

## Kelly 공식

켈리 공식(John L. Kelly Jr., 1956):

```
f* = (bp - q) / b

f* : 자본 대비 최적 베팅 비율
b  : 손익비 (평균 이익 / 평균 손실)
p  : 승률 (이기는 확률)
q  : 패율 (1 - p)
```

예시:
```
승률 p = 0.60
평균 이익 = 150,000원, 평균 손실 = 100,000원
손익비 b = 150,000 / 100,000 = 1.5

f* = (1.5 × 0.60 - 0.40) / 1.5
   = (0.90 - 0.40) / 1.5
   = 0.50 / 1.5
   = 0.333...

→ 자본의 33.3%를 베팅하는 것이 장기적으로 최적
```

---

## Kotlin 구현

```kotlin
@Service
class PositionSizerService {

    fun calculateKelly(
        winRate: Double,
        avgWin: BigDecimal,
        avgLoss: BigDecimal,
    ): KellyResult {
        if (avgLoss == BigDecimal.ZERO || winRate <= 0.0) {
            return KellyResult(
                fullKelly = 0.0,
                halfKelly = 0.0,
                recommendation = "베팅하지 않을 것을 권장합니다"
            )
        }

        val b = avgWin.toDouble() / avgLoss.toDouble()
        val p = winRate
        val q = 1 - p

        val fullKelly = (b * p - q) / b
        val halfKelly = fullKelly * 0.5  // Half Kelly (실전 권장)

        return KellyResult(
            fullKelly       = fullKelly.coerceIn(0.0, 1.0),
            halfKelly       = halfKelly.coerceIn(0.0, 0.5),
            recommendation  = buildRecommendation(fullKelly, halfKelly),
        )
    }

    fun calculateFromBacktest(backtestId: Long): KellyResult {
        val result = backtestRepository.findById(backtestId)

        val winRate  = result.winRate
        val avgWin   = result.avgWinAmount
        val avgLoss  = result.avgLossAmount

        return calculateKelly(winRate, avgWin, avgLoss)
    }

    private fun buildRecommendation(full: Double, half: Double): String {
        return when {
            full <= 0.0  -> "기대값이 음수입니다. 이 전략은 사용하지 않을 것을 권장합니다."
            full > 0.5   -> """
                Full Kelly: ${String.format("%.1f", full * 100)}%
                Half Kelly(권장): ${String.format("%.1f", half * 100)}%
                Full Kelly가 50%를 초과해 단기 변동성이 큽니다.
                Half Kelly 이하를 사용하세요.
            """.trimIndent()
            else -> """
                Full Kelly: ${String.format("%.1f", full * 100)}%
                Half Kelly(권장): ${String.format("%.1f", half * 100)}%
                1회 매수 시 총 자본의 ${String.format("%.1f", half * 100)}%를 권장합니다.
            """.trimIndent()
        }
    }
}
```

---

## 왜 Half Kelly를 권장하는가

Full Kelly는 장기적으로 기대 자본 성장을 수학적으로 최대화하는 비율이다. 그러나 단기적으로 큰 변동이 생긴다.

```
Full Kelly 33.3%로 베팅 시:
  연속 3패 확률: (1-0.6)³ = 6.4%
  연속 3패 시 자산: 1,000,000 × (1-0.333)³ ≈ 296,000원 (70% 손실)

Half Kelly 16.7%로 베팅 시:
  연속 3패 시 자산: 1,000,000 × (1-0.167)³ ≈ 579,000원 (42% 손실)
```

Half Kelly는 기대 성장률의 75%를 유지하면서 변동성을 절반으로 줄인다. 실전 트레이더 대부분이 Full Kelly가 아닌 Half Kelly(또는 Quarter Kelly)를 사용하는 이유다.

또한 백테스트 수익률은 항상 미래 성과를 과대평가하는 경향이 있다. 안전 마진을 두기 위해서도 Half Kelly가 적절하다.

---

## Kelly가 음수인 경우

```
f* = (b × p - q) / b

승률 0.4, 손익비 1.2:
f* = (1.2 × 0.4 - 0.6) / 1.2 = (0.48 - 0.6) / 1.2 = -0.1

→ f* < 0: 기대값이 음수. 이 전략은 베팅하지 않아야 한다.
```

Kelly가 음수면 그 전략은 장기적으로 돈을 잃는다. `coerceIn(0.0, 1.0)`으로 음수를 0으로 처리하고 "베팅하지 않을 것을 권장"하는 메시지를 표시한다.

---

## 백테스트 결과 연동

전략 백테스트 결과 화면에 Kelly 비율이 자동으로 표시된다.

```kotlin
// 백테스트 완료 시 Kelly 자동 계산
val kellyResult = positionSizerService.calculateFromBacktest(backtest.id)

// 응답에 포함
data class BacktestResultResponse(
    val id           : Long,
    val totalReturn  : Double,
    val sharpeRatio  : Double,
    // ...
    val kellyResult  : KellyResult,  // 자동 계산
)
```

UI 표시 예시:

```
[전략 성과]
총 수익률: +24.3%
샤프 비율: 1.42
MDD: -8.2%
승률: 63%
손익비: 1.8

[포지션 사이징]
Full Kelly: 21.7%
Half Kelly: 10.8% (권장)
→ 1회 매수 시 총 자본의 10.8%를 권장합니다.
   현재 설정(10%)과 유사합니다.
```

---

## Kelly의 한계

1. **추정 오차**: 백테스트의 승률·손익비가 미래와 다를 수 있다. 백테스트 통계 신뢰도에 따라 Kelly를 더 줄여야 한다.
2. **독립성 가정**: Kelly는 각 거래가 독립적임을 가정한다. 상관된 포지션이 여러 개면 단순 Kelly 적용은 위험하다.
3. **거래 비용**: 자주 리밸런싱하면 거래 비용이 Kelly 이득을 상쇄할 수 있다.

---

## 정리

- Kelly Criterion은 `f* = (bp-q)/b`로 장기 자본 성장을 최대화하는 베팅 비율을 계산한다.
- 실전에서는 Half Kelly를 사용해 변동성을 줄이고 안전 마진을 확보한다.
- f* < 0이면 기대값이 음수인 전략 — 베팅하지 않는다.

다음 편에서는 ZigZag 알고리즘으로 캔들 차트에서 패턴을 감지하는 **차트 패턴 인식**을 다룬다.
