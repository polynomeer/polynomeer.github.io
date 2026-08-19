---
title: "백테스트 엔진: look-ahead 없는 시뮬레이션 — Sharpe·MDD·PF 계산"
date: 2026-06-17
categories: [Monticker, QuantLab]
tags: [monticker, backtest, sharpe-ratio, mdd, kotlin, quant]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 13
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: draft
---

## 백테스트의 핵심 원칙: look-ahead bias 금지

백테스트에서 가장 흔한 실수는 **미래 데이터를 현재 결정에 사용하는 것**이다.

```
잘못된 예:
  2023-01-10 에 이동평균을 계산할 때
  2023-01-11의 가격 데이터가 포함되면 → look-ahead bias

올바른 예:
  2023-01-10 의 MA(20) = 2022-12-16 ~ 2023-01-10 데이터로만 계산
```

이 실수가 있으면 "이미 결과를 알고 트레이딩하는" 전략이 만들어진다. 백테스트 수익률은 환상적이지만 실전에서는 참패한다.

---

## 시뮬레이션 구조

```kotlin
@Service
class QuantBacktestEngine(
    private val candleRepository: CandleRepository,
    private val indicatorEngine: IndicatorEngine,
    private val ruleEvaluator: RuleEvaluator,
) {
    fun run(request: BacktestRequest): BacktestResult {
        // 1. 기간 내 캔들 데이터 로드 (시작~종료)
        val candles = candleRepository.findRange(
            stockId   = request.stockId,
            from      = request.startDate,
            to        = request.endDate,
        )

        val trades = mutableListOf<SimulatedTrade>()
        var currentPosition: Position? = null

        // 2. 캔들을 시간순으로 순회 (look-ahead 없음: i번째는 0~i-1 데이터만 사용)
        candles.forEachIndexed { index, candle ->
            if (index < WARMUP_PERIODS) return@forEachIndexed  // EMA 워밍업 기간 스킵

            val pastCandles = candles.subList(0, index + 1)  // 현재까지의 데이터만

            if (currentPosition == null) {
                // 진입 조건 평가
                if (ruleEvaluator.evaluateEntryFromCandles(request.ruleSet, pastCandles)) {
                    currentPosition = Position(
                        entryPrice = candle.close,
                        entryDate  = candle.bucket,
                        quantity   = calculateQuantity(request.capital, candle.close),
                    )
                }
            } else {
                // 청산 조건 평가
                if (ruleEvaluator.evaluateExitFromCandles(request.ruleSet, pastCandles)) {
                    val trade = closePosition(currentPosition!!, candle)
                    trades.add(trade)
                    currentPosition = null
                }
            }
        }

        // 마지막 미청산 포지션 강제 청산
        currentPosition?.let { pos ->
            trades.add(closePosition(pos, candles.last()))
        }

        return calculateMetrics(trades, request)
    }
}
```

`candles.subList(0, index + 1)`이 핵심이다. 현재 캔들 이전의 데이터만 지표 계산에 사용해 look-ahead bias를 구조적으로 방지한다.

---

## 실제 비용 반영

실전 거래에는 비용이 있다. 이 비용을 반영하지 않으면 백테스트 수익률이 과대평가된다.

```kotlin
data class TradeCost(
    val commission: Double = 0.00015,  // 0.015% (한국 증권사 평균)
    val tax:        Double = 0.002,    // 0.2%  (주식 거래세, 매도 시)
    val slippage:   Double = 0.001,    // 0.1%  (실제 체결가 차이 추정)
)

fun closePosition(position: Position, candle: Candle): SimulatedTrade {
    val grossPnl = (candle.close - position.entryPrice) * position.quantity

    val sellAmount  = candle.close * position.quantity
    val commission  = sellAmount * TradeCost().commission * 2  // 매수·매도 각 1회
    val tax         = sellAmount * TradeCost().tax
    val slippageCost = sellAmount * TradeCost().slippage * 2

    val netPnl = grossPnl - commission - tax - slippageCost

    return SimulatedTrade(
        entryDate  = position.entryDate,
        exitDate   = candle.bucket,
        entryPrice = position.entryPrice,
        exitPrice  = candle.close * (1 - TradeCost().slippage),  // 슬리피지 적용
        quantity   = position.quantity,
        grossPnl   = grossPnl,
        netPnl     = netPnl,
        holdingDays = ChronoUnit.DAYS.between(position.entryDate, candle.bucket).toInt(),
    )
}
```

---

## 성과 지표 계산

### 총 수익률과 연환산 수익률

```kotlin
val totalReturn = trades.sumOf { it.netPnl } / request.capital
val years = ChronoUnit.DAYS.between(request.startDate, request.endDate) / 365.0
val annualReturn = (1 + totalReturn).pow(1.0 / years) - 1
```

### 최대낙폭 (MDD, Maximum Drawdown)

```kotlin
fun calculateMdd(trades: List<SimulatedTrade>, capital: Double): Double {
    var peak = capital
    var mdd = 0.0
    var equity = capital

    trades.forEach { trade ->
        equity += trade.netPnl
        if (equity > peak) peak = equity
        val drawdown = (peak - equity) / peak
        if (drawdown > mdd) mdd = drawdown
    }
    return mdd
}
```

MDD는 가장 높은 고점에서 가장 낮은 저점까지의 하락률이다. 전략의 최악 구간을 나타낸다.

### 샤프 비율 (Sharpe Ratio)

```kotlin
fun calculateSharpe(returns: List<Double>, riskFreeRate: Double = 0.035): Double {
    if (returns.size < 2) return 0.0
    val avgReturn = returns.average()
    val std = returns.standardDeviation()
    if (std == 0.0) return 0.0

    val dailyRiskFree = (1 + riskFreeRate).pow(1.0 / 252) - 1
    val annualized = Math.sqrt(252.0)

    return (avgReturn - dailyRiskFree) / std * annualized
}

fun List<Double>.standardDeviation(): Double {
    val mean = average()
    return Math.sqrt(map { (it - mean).pow(2) }.average())
}
```

샤프 비율이 1.0 이상이면 위험 대비 수익이 양호, 2.0 이상이면 우수한 전략으로 본다.

### 수익 인수 (Profit Factor)

```kotlin
val grossWin  = trades.filter { it.netPnl > 0 }.sumOf { it.netPnl }
val grossLoss = trades.filter { it.netPnl < 0 }.sumOf { -it.netPnl }
val profitFactor = if (grossLoss == 0.0) Double.MAX_VALUE else grossWin / grossLoss
```

PF > 1.5 이면 손익 비율이 양호하다.

---

## 백테스트 결과 구조

```kotlin
data class BacktestResult(
    val ruleSetId       : Long,
    val stockId         : Long,
    val startDate       : LocalDate,
    val endDate         : LocalDate,
    val tradeCount      : Int,
    val winRate         : Double,          // 승률
    val totalReturn     : Double,          // 총 수익률
    val annualReturn    : Double,          // 연환산 수익률
    val mdd             : Double,          // 최대낙폭
    val sharpeRatio     : Double,
    val profitFactor    : Double,
    val avgHoldingDays  : Double,          // 평균 보유 기간
    val benchmarkReturn : Double,          // 같은 기간 KOSPI 수익률
    val reliabilityGrade: ReliabilityGrade, // A/B/C/D
    val phasePerformance: Map<MarketRegime, PhaseStats>, // 국면별 성과
)
```

---

## 국면별 성과 분해

같은 전략이라도 상승장·하락장·횡보장에서 성과가 다르다. 이를 분리해 보여준다.

```
이 전략의 국면별 성과:

  BULL  구간 (2023.01~2023.07):  수익률 +18.2%,  MDD -4.1%
  BEAR  구간 (2022.01~2022.10):  수익률  -8.4%,  MDD -22.3%
  SIDEWAYS 구간 (2024.03~):      수익률  +1.1%,  MDD  -6.7%

⚠️ 경고: 이 전략은 하락장에서 MDD가 5배 이상 확대됩니다.
```

---

## 정리

- `candles.subList(0, index + 1)`로 현재 시점 이전 데이터만 사용해 look-ahead bias를 방지한다.
- 커미션(0.015%) + 세금(0.2%) + 슬리피지(0.1%)를 반영해야 실전 수준의 수익률이 나온다.
- MDD·샤프 비율·수익 인수는 수익률만큼 중요한 지표다. 수익률 좋은 전략이 MDD도 크면 실전에서 못 버틴다.

다음 편에서는 전략의 룰셋을 SHA-256으로 보호하고, 구독자에게 신호만 제공하는 **전략 보호 시스템**을 다룬다.
