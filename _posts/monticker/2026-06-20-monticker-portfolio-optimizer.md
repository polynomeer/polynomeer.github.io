---
title: "Markowitz 최적화를 솔버 없이 구현하기 — 프로젝션 경사하강법"
date: 2026-06-20
categories: [Monticker, QuantAnalytics]
tags: [monticker, markowitz, portfolio-optimization, gradient-descent, kotlin, math]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 15
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
published: false
---

## Markowitz 포트폴리오 이론

해리 마코위츠가 1952년 발표한 평균-분산 최적화(Mean-Variance Optimization)는 현대 포트폴리오 이론의 기초다.

핵심 아이디어: **같은 기대 수익률이라면 변동성이 낮은 포트폴리오가 더 좋다.**

수학적으로 표현하면:

```
minimize   wᵀΣw          (포트폴리오 분산 최소화)
subject to wᵀμ = r*      (목표 수익률 r* 달성)
           Σwᵢ = 1       (비중 합 = 1)
           wᵢ ≥ 0        (공매도 불가)
```

- `w`: 각 종목의 비중 벡터
- `Σ`: 공분산 행렬
- `μ`: 각 종목의 기대 수익률 벡터

---

## 수익률 데이터 준비

```kotlin
@Service
class PortfolioOptimizer(
    private val candleRepository: CandleRepository,
) {
    fun optimize(stockIds: List<Long>, targetReturn: Double): OptimizationResult {
        // 최근 252일(1년) 일별 수익률 계산
        val returnMatrix = buildReturnMatrix(stockIds, days = 252)

        val mu  = returnMatrix.columnMeans()        // 종목별 평균 일별 수익률
        val cov = returnMatrix.covarianceMatrix()    // 공분산 행렬

        val weights = minimizeVariance(cov, mu, targetReturn)
        return buildResult(weights, mu, cov, stockIds)
    }

    private fun buildReturnMatrix(stockIds: List<Long>, days: Int): Matrix {
        val returns = stockIds.map { stockId ->
            val candles = candleRepository.findRecentDays(stockId, days + 1)
            candles.zipWithNext { a, b ->
                (b.close.toDouble() - a.close.toDouble()) / a.close.toDouble()
            }
        }
        return Matrix(returns)
    }
}
```

---

## 프로젝션 경사하강법 (Projected Gradient Descent)

일반적으로 이차계획법(Quadratic Programming) 솔버가 필요하지만, 외부 라이브러리 없이 프로젝션 경사하강법으로 근사할 수 있다.

```kotlin
fun minimizeVariance(
    cov: Matrix,
    mu: DoubleArray,
    targetReturn: Double,
    maxIterations: Int = 1000,
    learningRate: Double = 0.01,
): DoubleArray {
    val n = mu.size
    // 초기 비중: 균등 배분
    var w = DoubleArray(n) { 1.0 / n }

    repeat(maxIterations) {
        // 분산에 대한 기울기: ∂(wᵀΣw)/∂w = 2Σw
        val gradient = cov.times(w).map { it * 2.0 }.toDoubleArray()

        // 기울기 방향으로 한 스텝
        w = w.zip(gradient) { wi, gi -> wi - learningRate * gi }.toDoubleArray()

        // 제약 조건 투영: Σw=1, w≥0 (simplex 투영)
        w = projectToSimplex(w)

        // 목표 수익률 제약 보정
        w = adjustForTargetReturn(w, mu, targetReturn)
    }

    return w
}
```

### Simplex 투영 알고리즘

`Σwᵢ=1, wᵢ≥0` 제약 조건의 실현가능 영역은 단순체(simplex)다. 이 공간으로의 투영 알고리즘을 구현한다.

```kotlin
fun projectToSimplex(v: DoubleArray): DoubleArray {
    val n = v.size
    val sorted = v.sortedDescending()

    var rho = 0
    var sum = 0.0
    for (i in sorted.indices) {
        sum += sorted[i]
        if (sorted[i] - (sum - 1.0) / (i + 1) > 0) rho = i
    }
    val theta = (sorted.take(rho + 1).sum() - 1.0) / (rho + 1)

    return v.map { maxOf(it - theta, 0.0) }.toDoubleArray()
}
```

이 알고리즘은 Duchi et al. (2008)의 O(n log n) 투영 알고리즘이다. 내부 루프 없이 정렬 한 번으로 simplex 투영을 계산한다.

---

## 효율적 프론티어

목표 수익률을 여러 값으로 스윕하면 위험-수익 곡선(효율적 프론티어)을 얻는다.

```kotlin
fun computeFrontier(stockIds: List<Long>, points: Int = 20): List<FrontierPoint> {
    val returnMatrix = buildReturnMatrix(stockIds, days = 252)
    val mu  = returnMatrix.columnMeans()
    val cov = returnMatrix.covarianceMatrix()

    val minReturn = mu.min()!!
    val maxReturn = mu.max()!!

    return (0 until points).map { i ->
        val targetReturn = minReturn + (maxReturn - minReturn) * i / (points - 1)
        val weights = minimizeVariance(cov, mu, targetReturn)
        val portfolioReturn = weights.zip(mu) { w, r -> w * r }.sum()
        val portfolioVariance = weights.dot(cov.times(weights))

        FrontierPoint(
            targetReturn     = targetReturn * 252,         // 연환산
            portfolioReturn  = portfolioReturn * 252,
            risk             = Math.sqrt(portfolioVariance * 252),  // 연환산 표준편차
            weights          = weights.zip(stockIds).associate { (w, id) -> id to w },
        )
    }
}
```

---

## 현재 포트폴리오 위치 표시

사용자가 보유한 포트폴리오가 효율적 프론티어 위에 있는지 아래에 있는지를 보여준다.

```kotlin
data class OptimizationResult(
    val frontier: List<FrontierPoint>,
    val currentPortfolio: PortfolioStats,
    val suggestion: String,
)

fun buildResult(...): OptimizationResult {
    val currentStats = calculateCurrentStats(currentWeights, mu, cov)
    val nearestFrontierPoint = frontier.minByOrNull {
        abs(it.portfolioReturn - currentStats.expectedReturn)
    }!!

    val potentialImprovement = nearestFrontierPoint.portfolioReturn - currentStats.expectedReturn

    val suggestion = if (potentialImprovement > 0.005) {
        "현재 포트폴리오는 효율적 프론티어 아래에 있습니다. " +
        "비중 조정 시 동일 위험에서 연 ${String.format("%.1f", potentialImprovement * 100)}%p 추가 수익 가능합니다."
    } else {
        "현재 포트폴리오가 이미 효율적 프론티어에 근접합니다."
    }

    return OptimizationResult(frontier, currentStats, suggestion)
}
```

---

## 응답 예시

```json
{
  "frontier": [
    {
      "portfolioReturn": 0.06,
      "risk": 0.12,
      "weights": { "1": 0.45, "2": 0.30, "3": 0.25 }
    },
    {
      "portfolioReturn": 0.10,
      "risk": 0.18,
      "weights": { "1": 0.20, "2": 0.15, "3": 0.65 }
    }
  ],
  "currentPortfolio": {
    "expectedReturn": 0.07,
    "risk": 0.16
  },
  "suggestion": "현재 포트폴리오는 효율적 프론티어 아래에 있습니다. 비중 조정 시 동일 위험에서 연 1.2%p 추가 수익 가능합니다."
}
```

---

## 한계와 주의사항

Markowitz 최적화에는 알려진 한계가 있다.

1. **과거 데이터 의존**: 공분산 행렬을 과거 수익률로 추정한다. 미래 상관관계가 바뀌면 최적 비중이 달라진다.
2. **추정 오차 증폭**: 기대 수익률 추정이 조금만 틀려도 최적 비중이 크게 달라진다 (error maximization 문제).
3. **거래 비용 무시**: 최적 비중으로 리밸런싱하는 거래 비용이 개선 효과를 상회할 수 있다.

monticker에서는 이 내용을 UI에 명시적으로 고지하고, "교육 목적 시뮬레이션"임을 강조한다.

---

## 정리

- 외부 QP 솔버 없이 프로젝션 경사하강법 + simplex 투영으로 Markowitz 최적화를 구현한다.
- 효율적 프론티어는 목표 수익률을 스윕해 (위험, 수익) 곡선을 계산한다.
- 과거 데이터 의존과 추정 오차 증폭 문제를 UI에서 명시적으로 고지한다.

다음 편에서는 백테스트 결과의 승률·손익비로 **수학적 파산 방지 베팅 비율(Kelly Criterion)** 을 계산하는 방법을 다룬다.
