---
title: "MockK로 JdbcTemplate 목킹하기 — 311개 테스트 작성 경험"
date: 2026-06-26
categories: [Monticker, Testing]
tags: [monticker, mockk, junit5, kotlin, testing, jdbctemplate, backend]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 20
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: draft
---

## 왜 테스트가 어려운가

monticker의 백엔드 서비스는 대부분 `JdbcTemplate`을 직접 사용한다. Spring Data JPA 리포지토리 대신 복잡한 SQL을 직접 작성해야 하는 금융 도메인 특성 때문이다.

`JdbcTemplate`을 테스트하기 어려운 이유:

1. **SQL 문자열 비교 취약성** — `query()`, `queryForObject()`, `update()` 인자가 긴 SQL 문자열
2. **람다 인자** — `RowMapper`, `ResultSetExtractor`가 람다로 전달됨
3. **가변 인자(vararg)** — SQL 파라미터가 `vararg Any?`로 전달됨

---

## 기본 패턴: SQL 부분 문자열 매칭

정확한 SQL 문자열 전체를 매처로 쓰면 테스트가 깨지기 쉽다. 공백 하나, 줄바꿈 하나에 실패한다.

대신 SQL의 핵심 키워드로 부분 매칭한다.

```kotlin
// BAD: 정확한 SQL 전체 매칭 → 공백/줄바꿈 하나에 실패
every { jdbc.queryForObject(
    "SELECT COALESCE(SUM(realized_pnl), 0)\n    FROM fills f\n    ...",
    BigDecimal::class.java, userId
) } returns BigDecimal.ZERO

// GOOD: SQL 핵심 키워드로 부분 매칭
every {
    jdbc.queryForObject(
        match<String> { it.contains("FROM fills") },
        BigDecimal::class.java,
        any()
    )
} returns BigDecimal.ZERO
```

`match<String> { it.contains("FROM fills") }` — SQL이 `FROM fills`를 포함하면 매칭된다. 서비스 코드의 SQL 형식이 바뀌어도 핵심 테이블명이 있으면 테스트가 통과한다.

---

## JdbcTemplate.query() + RowMapper 목킹

```kotlin
// 서비스 코드
fun getHoldings(userId: Long): List<Holding> {
    return jdbcTemplate.query("""
        SELECT h.stock_id, h.quantity, h.avg_cost, s.symbol
        FROM holdings h
        JOIN stocks s ON s.id = h.stock_id
        WHERE h.user_id = ?
        ORDER BY h.stock_id
    """, { rs, _ ->
        Holding(
            stockId  = rs.getLong("stock_id"),
            quantity = rs.getInt("quantity"),
            avgCost  = rs.getBigDecimal("avg_cost"),
            symbol   = rs.getString("symbol"),
        )
    }, userId)
}
```

```kotlin
// 테스트
@Test
fun `보유 종목이 있을 때 Holdings를 반환한다`() {
    val expectedHoldings = listOf(
        Holding(stockId = 1L, quantity = 10, avgCost = BigDecimal("73000"), symbol = "005930"),
        Holding(stockId = 2L, quantity = 5,  avgCost = BigDecimal("120.0"), symbol = "AAPL"),
    )

    every {
        jdbc.query(
            match<String> { it.contains("FROM holdings") },
            any<RowMapper<Holding>>(),
            userId
        )
    } returns expectedHoldings

    val result = walletService.getHoldings(userId)

    assertThat(result).hasSize(2)
    assertThat(result[0].symbol).isEqualTo("005930")
}
```

`any<RowMapper<Holding>>()`으로 람다를 무시한다. 람다 내부 로직은 별도의 단위 테스트로 검증한다.

---

## queryForObject() 반환 타입별 목킹

```kotlin
// Int 반환
every {
    jdbc.queryForObject(
        match<String> { it.contains("COUNT(*)") },
        Int::class.java,
        any()
    )
} returns 3

// BigDecimal 반환
every {
    jdbc.queryForObject(
        match<String> { it.contains("SUM(realized_pnl)") },
        BigDecimal::class.java,
        userId
    )
} returns BigDecimal("1200000")

// String 반환
every {
    jdbc.queryForObject(
        match<String> { it.contains("emotion_tag") },
        String::class.java,
        orderId
    )
} returns "PLANNED"
```

---

## update() 반환값 목킹

```kotlin
// INSERT/UPDATE: 영향받은 행 수 반환
every {
    jdbc.update(
        match<String> { it.contains("INSERT INTO ledger_events") },
        *anyVararg<Any?>()  // vararg 파라미터
    )
} returns 1

// 0 반환 = 중복으로 무시됨 (ON CONFLICT DO NOTHING)
every {
    jdbc.update(
        match<String> { it.contains("INSERT INTO stock_events") },
        *anyVararg<Any?>()
    )
} returns 0
```

`*anyVararg<Any?>()` — vararg 파라미터를 임의 값으로 매칭한다. MockK에서 vararg는 `*anyVararg()`로 spread operator와 함께 사용해야 한다.

---

## @AuthenticationPrincipal 처리

컨트롤러 테스트에서 `@AuthenticationPrincipal Long userId` 파라미터를 처리하려면 커스텀 ArgumentResolver가 필요하다.

```kotlin
private val authPrincipalResolver = object : HandlerMethodArgumentResolver {
    override fun supportsParameter(parameter: MethodParameter): Boolean =
        parameter.parameterType == Long::class.java &&
        parameter.hasParameterAnnotation(AuthenticationPrincipal::class.java)

    override fun resolveArgument(
        parameter: MethodParameter,
        mavContainer: ModelAndViewContainer?,
        webRequest: NativeWebRequest,
        binderFactory: WebDataBinderFactory?,
    ): Any = 1L  // 고정 userId

}

// MockMvc 설정
val mockMvc = MockMvcBuilders
    .standaloneSetup(controller)
    .setCustomArgumentResolvers(authPrincipalResolver)
    .build()
```

---

## 항상 참/거짓인 진입 조건 만들기

백테스트 엔진 테스트에서 "무조건 진입" 시나리오가 필요하다.

```kotlin
// GOOD: MA(period=1) = 현재 종가. 종가 >= 자기 자신은 항상 true
private fun alwaysTrueEntryCondition() = RuleCondition(
    indicator  = "CLOSE_VS_MA",
    comparator = "GTE",
    params     = mapOf("period" to 1),
)

// BAD: PROFIT_RATE는 진입 조건 평가 시 처리되지 않는 지표 → 항상 false
private fun alwaysFalseEntryCondition() = RuleCondition(
    indicator  = "PROFIT_RATE",
    comparator = "GTE",
    params     = mapOf("threshold" to -999.0),
)
```

---

## ObjectMapper + JavaTimeModule

날짜 타입(`LocalDate`, `Instant`)을 포함하는 DTO를 직렬화할 때 `JavaTimeModule`이 없으면 직렬화 오류가 난다.

```kotlin
// BAD: JavaTimeModule 없음 → LocalDate 직렬화 실패
val mapper = ObjectMapper()
val json = mapper.writeValueAsString(patternMatch)  // 예외 발생

// GOOD
val mapper = ObjectMapper().registerModule(JavaTimeModule())
val json = mapper.writeValueAsString(patternMatch)  // 정상
```

테스트에서 `ObjectMapper()`를 직접 생성할 때 놓치기 쉬운 설정이다.

---

## 311개 테스트 중 핵심 카테고리

| 모듈 | 테스트 수 | 핵심 테스트 |
|------|----------|------------|
| Matching Engine | 45 | 부분체결, 슬리피지, 가격우선 매칭 |
| Risk Limit | 38 | 5가지 규칙 각각 BLOCKED/PASSED |
| Quant Backtest | 52 | look-ahead 없음, 비용 반영, 국면별 성과 |
| Investment Wallet | 40 | 잔고 재구성, 감정 태그 분석 |
| Quant Analytics | 55 | Kelly 음수 케이스, 패턴 미탐지, ADX 임계값 |
| Market Data | 35 | EMA 워밍업, 이벤트 중복 방지 |

---

## 정리

- `match<String> { it.contains("FROM table_name") }`으로 SQL을 유연하게 목킹한다.
- `*anyVararg<Any?>()`로 vararg SQL 파라미터를 처리한다.
- 컨트롤러 테스트의 `@AuthenticationPrincipal`은 커스텀 `HandlerMethodArgumentResolver`로 처리한다.
- 백테스트 "항상 진입" 조건은 `CLOSE_VS_MA, period=1` — MA(1) = 현재 종가이므로 종가 ≥ MA는 항상 참.

다음 편에서는 **OpenTelemetry + Jaeger로 시세 파이프라인 전체 지연을 추적**하는 방법을 다룬다.
