---
title: "감정 태그 × 수익률 — 투자 습관을 데이터로 기록하기"
date: 2026-06-14
categories: [Monticker, InvestmentWallet]
tags: [monticker, emotion-tag, behavior-score, investment-wallet, behavioral-finance]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 11
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: draft
---

## 투자와 감정

행동재무학(Behavioral Finance)의 핵심 통찰이 있다. 투자자는 합리적 계산이 아니라 감정으로 결정을 내리는 경우가 많다.

- **공포**: 주가가 떨어질 때 손절하지 못하거나, 반대로 패닉 셀링
- **FOMO**: 급등 뉴스에 추격 매수
- **확증 편향**: 자신의 매수 결정을 지지하는 정보만 수집

문제는 이런 패턴을 **본인이 인식하기 어렵다**는 점이다. 기억은 결과에 따라 왜곡된다. 수익이 나면 "나는 분석했다", 손실이 나면 "운이 나빴다"고 기억한다.

monticker의 감정 태그는 **주문 시점에** 감정을 기록하게 한다. 나중에 수익률과 교차 분석하면 "나는 어떤 감정일 때 더 잘 수익을 냈는가"를 객관적으로 볼 수 있다.

---

## 감정 태그 설계

```kotlin
enum class EmotionTag {
    FOMO,           // 놓칠 것 같아서 (Fear of Missing Out)
    FEAR,           // 손실이 두려워서
    GREEDY,         // 더 벌고 싶어서
    CONFIDENT,      // 분석에 확신이 있어서
    UNCERTAIN,      // 잘 모르겠지만 일단
    PLANNED,        // 계획된 전략대로
    PANIC,          // 패닉 상태에서
    HOPEFUL,        // 반등을 기대하며
}
```

주문 완료 직후 사용자에게 "지금 어떤 감정이었나요?"를 묻고 기록한다. 강제가 아니라 선택이지만, 기록이 쌓이면 패턴을 볼 수 있다.

---

## order_emotion_tags 테이블

```sql
CREATE TABLE order_emotion_tags (
    id              BIGSERIAL    PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users(id),
    paper_order_id  BIGINT       NOT NULL REFERENCES paper_orders(id),
    emotion_tag     VARCHAR(20)  NOT NULL,
    note            TEXT,                    -- 선택적 메모
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

---

## EmotionTagService — 감정 태그 저장 및 분석

```kotlin
@Service
class EmotionTagService(private val jdbcTemplate: JdbcTemplate) {

    fun saveTag(userId: Long, orderId: Long, tag: EmotionTag, note: String?) {
        jdbcTemplate.update("""
            INSERT INTO order_emotion_tags (user_id, paper_order_id, emotion_tag, note)
            VALUES (?, ?, ?, ?)
        """, userId, orderId, tag.name, note)
    }

    fun analyzeEmotionReturn(userId: Long): List<EmotionReturnStat> {
        return jdbcTemplate.query("""
            SELECT
                oet.emotion_tag,
                COUNT(*)                        AS order_count,
                AVG(po.realized_pnl_pct)        AS avg_return_pct,
                SUM(CASE WHEN po.realized_pnl > 0 THEN 1 ELSE 0 END)::float
                    / COUNT(*)                  AS win_rate
            FROM order_emotion_tags oet
            JOIN paper_orders po ON po.id = oet.paper_order_id
            WHERE oet.user_id = ?
              AND po.status = 'FILLED'
            GROUP BY oet.emotion_tag
            ORDER BY avg_return_pct DESC
        """, { rs, _ ->
            EmotionReturnStat(
                tag         = EmotionTag.valueOf(rs.getString("emotion_tag")),
                orderCount  = rs.getInt("order_count"),
                avgReturnPct = rs.getDouble("avg_return_pct"),
                winRate     = rs.getDouble("win_rate"),
            )
        }, userId)
    }
}
```

분석 결과 예시:

```
감정 태그별 수익률 분석 (내 투자 기록):

PLANNED    → 평균 수익률 +2.3%,  승률 67%  ← 가장 좋은 결과
CONFIDENT  → 평균 수익률 +1.1%,  승률 58%
UNCERTAIN  → 평균 수익률 -0.2%,  승률 45%
FOMO       → 평균 수익률 -1.8%,  승률 31%  ← 가장 나쁜 결과
PANIC      → 평균 수익률 -2.5%,  승률 22%
```

이 데이터를 보고 사용자는 깨달을 수 있다: "나는 FOMO 상태일 때 일관되게 손실을 낸다."

---

## 투자 행동 점수 (Behavior Score)

감정 태그와 함께 주문 패턴을 분석해 투자 행동 점수를 계산한다.

```kotlin
@Service
class BehaviorScoreService(private val jdbcTemplate: JdbcTemplate) {

    fun calculateBehaviorScore(userId: Long): BehaviorScore {
        var score = 50  // 기본 50점

        // ✅ 좋은 습관 가점
        val splitBuyRatio = getSplitBuyRatio(userId)
        if (splitBuyRatio > 0.5) score += 20  // 분할 매수 50% 이상

        val stoplossKeptRatio = getStoplossKeptRatio(userId)
        if (stoplossKeptRatio > 0.8) score += 15  // 손절가 준수율 80% 이상

        val chaseAfterSpikeRatio = getChaseBuyAfterSpikeRatio(userId)
        if (chaseAfterSpikeRatio < 0.1) score += 15  // 급등 후 추격매수 10% 미만

        // ❌ 나쁜 습관 감점
        if (chaseAfterSpikeRatio > 0.3) score -= 20  // 급등 추격매수 30% 이상
        if (splitBuyRatio < 0.2) score -= 15  // 몰빵 매수

        val sameStockSameDayCount = getSameStockSameDayAvg(userId)
        if (sameStockSameDayCount > 3) score -= 15  // 당일 동일 종목 3회 이상

        return BehaviorScore(
            score       = score.coerceIn(0, 100),
            breakdown   = buildBreakdown(splitBuyRatio, stoplossKeptRatio, chaseAfterSpikeRatio),
            analyzedAt  = Instant.now(),
        )
    }
}
```

---

## 투자 생존 점수 (Survival Score)

생존 점수는 현재 포트폴리오 상태가 얼마나 위험한지를 측정한다.

```kotlin
fun calculateSurvivalScore(userId: Long): SurvivalScore {
    var score = 100

    // 단일 종목 집중도
    val maxConcentration = getMaxConcentration(userId)
    if (maxConcentration > 0.7) score -= 30   // 70% 이상 한 종목
    else if (maxConcentration > 0.5) score -= 15

    // 현금 비중
    val cashRatio = getCashRatio(userId)
    if (cashRatio < 0.05) score -= 20  // 현금 5% 미만

    // 1시간 내 주문 빈도
    val recentOrderCount = getRecentOrderCount(userId, hours = 1)
    if (recentOrderCount > 5) score -= 15

    // 급등주(당일 +10% 이상) 보유 비중
    val hotStockRatio = getHotStockRatio(userId)
    if (hotStockRatio > 0.4) score -= 10

    return SurvivalScore(
        score       = score.coerceIn(0, 100),
        level       = when {
            score >= 80 -> "SAFE"
            score >= 60 -> "CAUTION"
            score >= 40 -> "WARNING"
            else        -> "DANGER"
        },
    )
}
```

---

## 투자 영수증

체결 직후 발행되는 투자 영수증은 재무적 사실 외에 맥락 정보를 포함한다.

```json
{
  "orderId": 12345,
  "symbol": "005930",
  "side": "BUY",
  "quantity": 10,
  "avgFillPrice": 73200.5,
  "totalCost": 732005,
  "commission": 1098,
  "emotionTag": "PLANNED",
  "priceChangeAtOrder": "+1.2%",
  "volumeRatioAtOrder": 2.3,
  "marketRegimeAtOrder": "BULL",
  "filledAt": "2025-07-11T10:07:23Z"
}
```

나중에 이 주문의 결과가 나왔을 때 영수증을 다시 보면 "그때 상황이 어땠는지"를 맥락과 함께 복기할 수 있다.

---

## 정리

- 감정 태그는 주문 **시점**에 기록해야 한다. 결과 확인 후에는 기억이 왜곡된다.
- `emotion_tag × avg_return_pct` 분석으로 어떤 심리 상태에서 더 좋은 결정을 하는지 객관적으로 볼 수 있다.
- 행동 점수(좋은 습관 측정)와 생존 점수(현재 위험도 측정)를 분리해 다른 관점을 제공한다.

다음 시리즈(Series 5)에서는 코딩 없이 투자 전략을 만드는 **Quant Lab의 룰 엔진**을 다룬다.
