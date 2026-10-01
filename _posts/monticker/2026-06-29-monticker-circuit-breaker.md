---
title: "Circuit Breaker로 외부 API 장애 격리 — Resilience4j + KIS·Yahoo 폴백 체인"
date: 2026-06-29
categories: [Monticker, Observability]
tags: [monticker, Circuit Breaker, resilience4j, fallback, Kotlin, Reliability]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 22
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: published
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

KIS API가 느려지면 요청을 처리하던 스레드가 응답을 기다리며 30초씩 묶인다. 묶인 스레드가 쌓이면 새 요청이 들어와도 처리할 스레드가 없고, KIS와 무관한 API까지 응답하지 못한다([스레드 고갈](/posts/tomcat-thread-exhaustion/)). 외부 서비스 하나의 장애가 서버 전체로 번지는 것이다.

Circuit Breaker는 실패가 이어지는 대상으로 호출을 보내지 않고 즉시 실패시켜, 이 연쇄 장애(Cascading Failure)를 막는다.

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

Resilience4j 문서 기준으로 정리하면 이렇다([CircuitBreaker](https://resilience4j.readme.io/docs/circuitbreaker)). OPEN에서는 호출을 보내지 않고 `CallNotPermittedException`으로 거부한다. 대기 시간이 지나면 HALF_OPEN이 되어 정해진 수의 호출만 통과시킨다. 그 호출들의 실패율이나 느린 호출 비율이 임계값 이상이면 다시 OPEN, 둘 다 임계값 미만이면 CLOSED로 돌아간다. 위 그림의 "성공이 많으면"은 이 비율 비교를 뜻한다.

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

느린 호출은 실패와 따로 센다. `slow-call-duration-threshold`(3초)를 넘긴 호출이 느린 호출 비율을 올리고, 이 비율이 `slow-call-rate-threshold` 이상이면 실패율과 별개로 OPEN이 된다. `yahoo-finance`에는 `slow-call-rate-threshold`가 없으므로 문서상 기본값 100%가 적용된다. 즉 Yahoo 쪽은 느린 호출만으로는 모든 호출이 느려지기 전까지 열리지 않는다. 재시도 설정이 장애를 키우지 않게 하는 조건은 [타임아웃, 재시도, 백오프](/posts/timeout-retry-backoff/)에서 다뤘다.

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

코드 주석과 달리 fallback은 OPEN일 때만 불리지 않는다. Resilience4j 문서는 fallback을 catch 블록처럼 모든 예외에 대해 동작한다고 설명한다([Getting Started (Spring Boot)](https://resilience4j.readme.io/docs/getting-started-3)). 그래서 CLOSED 상태에서 Redis 캐시가 비어 `OrderBookNotFoundException`이 나도 같은 fallback을 거친다. 어느 경로든 다음 Provider로 넘어간다는 결과는 같다.

같은 문서는 애노테이션의 기본 적용 순서를 `Retry ( CircuitBreaker ( ... ) )`로 적는다. 이 순서대로라면 Retry가 보는 예외는 원래의 `IOException`이 아니라 fallback이 던진 `OrderBookUnavailableException`이고, 이 예외는 `retry-exceptions` 목록에 없다. 이 조합에서 재시도가 실제로 일어나는지는 확인하지 않았다.

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
- Resilience4j는 `slow-call-duration-threshold`를 넘긴 호출을 실패와 별도의 비율로 세고, 그 비율만으로도 OPEN이 된다.
- 응답에 `source` 필드를 포함해 사용자가 데이터 신선도를 인지할 수 있게 한다.

---

## 구현 편을 마치며

monticker 시리즈의 구현 기록은 이 22편까지다. 이후 편에서는 [WebSocket push와 REST polling 비교](/posts/monticker-ws-vs-polling/)처럼 구현한 것을 직접 재는 기록이 이어진다.

22편까지 다룬 기술은 다음과 같다.

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

## 참고

- [CircuitBreaker](https://resilience4j.readme.io/docs/circuitbreaker) — Resilience4j 문서
- [Getting Started (Spring Boot)](https://resilience4j.readme.io/docs/getting-started-3) — Resilience4j 문서, 애노테이션 적용 순서와 fallback
