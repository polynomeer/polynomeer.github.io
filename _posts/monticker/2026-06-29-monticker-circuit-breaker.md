---
title: "Circuit Breaker로 외부 API 장애 격리 — Resilience4j + KIS·Yahoo 폴백 체인"
date: 2026-06-29
categories: [Monticker, Observability]
tags: [monticker, circuit-breaker, resilience4j, fallback, kotlin, reliability]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 22
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: writing
---

## 외부 API 장애가 전체 시스템을 멈추는 이유

monticker는 KIS WebSocket, Yahoo Finance API, 네이버 뉴스 API, DART API 같은 외부 서비스에 의존한다. 이 중 하나가 느려지거나 장애가 나면 무슨 일이 생길까?

**장애 없는 경우**:
```
요청 → API 서버 → KIS API → 응답 (10ms)
```

**KIS API 타임아웃**:
```
요청 → API 서버 → KIS API → ... 30초 대기 ... → TimeoutException
```

모든 스레드가 KIS API 응답을 기다리며 30초를 소비한다. 새 요청이 들어와도 처리할 스레드가 없다. 전체 서버가 마비된다.

Circuit Breaker는 이 **연쇄 장애(Cascading Failure)** 를 방지한다.

---

## Circuit Breaker 상태 머신

Circuit Breaker는 세 가지 상태를 가진다.

```
    실패율 < 임계값          실패율 ≥ 임계값
CLOSED ──────────────────► OPEN
  ↑                            │
  │ 일부 성공                   │ 대기 시간 초과
  │                            ▼
HALF_OPEN ◄─────────────────────

CLOSED (정상):
  모든 요청 통과. 실패율 측정 중.

OPEN (차단):
  모든 요청 즉시 차단. fallback 반환.
  다음 요청 없이 응답 → 빠른 실패(Fast Fail).

HALF_OPEN (탐색):
  N개의 요청만 통과시켜 서비스 복구 여부 확인.
  성공이 많으면 CLOSED로 전환.
  실패가 많으면 다시 OPEN으로.
```

---

## Resilience4j 설정

```yaml
# application.yml
resilience4j:
  circuitbreaker:
    instances:
      kis-orderbook:
        failure-rate-threshold: 50          # 50% 이상 실패 시 OPEN
        slow-call-rate-threshold: 80        # 80% 이상이 느리면 OPEN
        slow-call-duration-threshold: 3s    # 3초 이상 = 느린 호출
        minimum-number-of-calls: 10         # 최소 10개 호출 후 계산 시작
        wait-duration-in-open-state: 30s    # OPEN 후 30초 대기
        permitted-number-of-calls-in-half-open-state: 3  # HALF_OPEN에서 3개 테스트
        sliding-window-type: COUNT_BASED
        sliding-window-size: 20             # 최근 20개 호출로 실패율 계산

      yahoo-finance:
        failure-rate-threshold: 60
        slow-call-duration-threshold: 5s
        minimum-number-of-calls: 5
        wait-duration-in-open-state: 60s

  retry:
    instances:
      kis-orderbook:
        max-attempts: 3
        wait-duration: 500ms
        retry-exceptions:
          - java.io.IOException
          - java.net.SocketTimeoutException
```

---

## 호가창 Provider 폴백 체인

호가창은 3개의 Provider가 폴백 체인을 이룬다.

```
KIS WebSocket (실시간) → Yahoo Finance (15분 지연) → Mock (시뮬레이션)
```

```kotlin
@Service
class OrderBookService(
    private val kisProvider: KisOrderBookProvider,
    private val yahooProvider: YahooFinanceOrderBookProvider,
    private val mockProvider: MockOrderBookProvider,
) {
    fun getOrderBook(stockId: Long): OrderBookResponse {
        return tryKis(stockId)
            ?: tryYahoo(stockId)
            ?: mockProvider.getOrderBook(stockId)
    }

    private fun tryKis(stockId: Long): OrderBookResponse? {
        return try {
            kisProvider.getOrderBook(stockId)
        } catch (e: Exception) {
            log.warn("KIS 호가창 조회 실패 [stockId={}]: {}", stockId, e.message)
            null
        }
    }

    private fun tryYahoo(stockId: Long): OrderBookResponse? {
        return try {
            yahooProvider.getOrderBook(stockId)
        } catch (e: Exception) {
            log.warn("Yahoo Finance 호가창 조회 실패 [stockId={}]: {}", stockId, e.message)
            null
        }
    }
}
```

---

## @CircuitBreaker 어노테이션 적용

```kotlin
@Service
class KisOrderBookProvider(
    private val redisTemplate: StringRedisTemplate,
    private val stockRepository: StockRepository,
) {
    @CircuitBreaker(name = "kis-orderbook", fallbackMethod = "fallback")
    @Retry(name = "kis-orderbook")
    fun getOrderBook(stockId: Long): OrderBookResponse {
        val stock   = stockRepository.findById(stockId)
        val redisKey = "orderbook:${stock.symbol}"

        val cached = redisTemplate.opsForValue().get(redisKey)
            ?: throw OrderBookNotFoundException("KIS 호가창 캐시 없음: ${stock.symbol}")

        val data = objectMapper.readValue(cached, KisOrderBookData::class.java)
        return data.toOrderBookResponse(source = OrderBookSource.KIS_REALTIME)
    }

    // Circuit Breaker가 OPEN일 때 호출되는 fallback
    fun fallback(stockId: Long, ex: Exception): OrderBookResponse {
        log.warn("KIS Circuit Breaker OPEN, fallback 반환 [stockId={}]", stockId)
        throw OrderBookUnavailableException("KIS 실시간 호가 일시 불가")
    }
}
```

`fallbackMethod`가 예외를 throw하면 `OrderBookService`에서 null을 반환해 다음 Provider로 넘어간다.

---

## Yahoo Finance Provider

```kotlin
@Service
class YahooFinanceOrderBookProvider(
    private val restTemplate: RestTemplate,
    private val stockRepository: StockRepository,
) {
    @CircuitBreaker(name = "yahoo-finance", fallbackMethod = "fallback")
    fun getOrderBook(stockId: Long): OrderBookResponse {
        val stock = stockRepository.findById(stockId)

        // Yahoo Finance v8 API (비공식, 15분 지연)
        val url = "https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}?interval=1m&range=1d"

        val response = restTemplate.getForObject(url, Map::class.java)
            ?: throw YahooFinanceException("응답 없음")

        return parseYahooResponse(response)
            .toOrderBookResponse(source = OrderBookSource.YAHOO_FINANCE)
    }

    fun fallback(stockId: Long, ex: Exception): OrderBookResponse {
        throw YahooFinanceUnavailableException("Yahoo Finance 일시 불가")
    }
}
```

---

## Circuit Breaker 상태 모니터링

```kotlin
@RestController
@RequestMapping("/api/admin/circuit-breakers")
class CircuitBreakerController(
    private val circuitBreakerRegistry: CircuitBreakerRegistry,
) {
    @GetMapping
    fun getStatus(): List<CircuitBreakerStatus> {
        return circuitBreakerRegistry.allCircuitBreakers.map { cb ->
            val metrics = cb.metrics
            CircuitBreakerStatus(
                name          = cb.name,
                state         = cb.state.name,
                failureRate   = metrics.failureRate,
                slowCallRate  = metrics.slowCallRate,
                callCount     = metrics.numberOfBufferedCalls,
                successCount  = metrics.numberOfSuccessfulCalls,
                failureCount  = metrics.numberOfFailedCalls,
            )
        }
    }
}
```

---

## 호가창 소스 표시

응답에 어떤 소스를 사용했는지 표시한다.

```json
{
  "stockId": 1,
  "symbol": "005930",
  "source": "YAHOO_FINANCE",
  "sourceNote": "KIS 실시간 호가 일시 불가. 15분 지연 데이터를 표시합니다.",
  "bids": [...],
  "asks": [...]
}
```

사용자가 지연 데이터를 실시간으로 착각하지 않도록 명시한다.

---

## 정리

- Circuit Breaker는 CLOSED → OPEN → HALF_OPEN 상태를 오가며 외부 API 장애를 격리한다.
- 폴백 체인(KIS → Yahoo → Mock)으로 최상의 데이터를 우선 서빙하고 단계적으로 저하된다.
- Resilience4j의 `slow-call-duration-threshold`로 느린 호출도 실패로 간주한다.
- 응답에 `source` 필드를 포함해 사용자가 데이터 신선도를 인지할 수 있게 한다.

---

## 시리즈를 마치며

monticker 기술 블로그 시리즈 22편이 마무리됩니다.

이 프로젝트에서 다룬 기술들을 요약하면:

| 영역 | 기술 |
|------|------|
| 수집 | Go goroutine, kafka-go, pgx |
| 메시지 버스 | Apache Kafka (KRaft), 파티셔닝, at-least-once |
| 브로드캐스트 | Netty NioEventLoopGroup, WebSocket |
| 이상 탐지 | EMA, 적응형 임계값 |
| 체결 엔진 | CLOB, TreeMap, 가격/시간 우선 |
| 리스크 | VaR, 집중도, 동기 게이트 |
| 원장 | 이벤트 소싱, 스냅샷 가속 |
| Quant | 룰 DSL, 백테스트, SHA-256 보호 |
| Analytics | Markowitz, Kelly, ZigZag, ADX |
| 테스트 | MockK, SQL 부분 매칭, 311 tests |
| 관측가능성 | OpenTelemetry, Jaeger, Micrometer |
| 신뢰성 | Resilience4j Circuit Breaker |

monticker 소스코드: [github.com/polynomeer/monticker](https://github.com/polynomeer/monticker)
