---
title: "OpenTelemetry + Jaeger로 분산 추적 — 시세 파이프라인 지연 측정"
date: 2026-06-28
categories: [Monticker, Observability]
tags: [monticker, OpenTelemetry, jaeger, Tracing, Observability, micrometer, Kotlin]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 21
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: published
---

## 분산 시스템에서 "느리다"를 어떻게 찾는가

monticker의 시세 파이프라인은 여러 컴포넌트를 거친다.

```
Go Gateway → Kafka → Worker → Redis → API → WebSocket → Client
```

"응답이 느리다"는 신고를 받았을 때, 어디가 병목인지 찾으려면 각 단계의 시간을 측정해야 한다. 로그를 수동으로 분석하는 방법은 느리고 오류가 많다.

[분산 추적](/posts/metrics-logs-traces/)(Distributed Tracing)은 하나의 요청이 여러 서비스를 거치는 동안 전체 경로와 각 구간의 시간을 자동으로 기록한다.

---

## 의존성 추가

```kotlin
// build.gradle.kts
dependencies {
    // OpenTelemetry SDK
    implementation("io.opentelemetry:opentelemetry-sdk:1.38.0")
    implementation("io.opentelemetry:opentelemetry-exporter-otlp:1.38.0")

    // Spring Boot Micrometer 연동
    implementation("io.micrometer:micrometer-tracing-bridge-otel:1.3.0")
    implementation("io.opentelemetry.instrumentation:opentelemetry-spring-boot-starter:2.5.0")
}
```

```yaml
# application.yml
management:
  tracing:
    enabled: true
    sampling:
      probability: 1.0     # 개발 환경: 모든 요청 추적. 운영: 0.1 (10%)
  otlp:
    tracing:
      endpoint: http://jaeger:4318/v1/traces
```

---

## 자동 계측 (Auto-instrumentation)

Spring Boot의 `opentelemetry-spring-boot-starter`를 추가하면 추가 코드 없이 자동으로 계측된다. 기본으로 켜지는 계측 목록에 JDBC, Spring Web MVC, Kafka가 있다([Out of the box instrumentation](https://opentelemetry.io/docs/zero-code/java/spring-boot-starter/out-of-the-box-instrumentation/)).

- HTTP 요청: 요청마다 서버 span이 생긴다. 문서에 따르면 starter가 서블릿 `Filter`를 등록하고, 이 필터가 요청 실행을 서버 span으로 감싼다. 그래서 단위는 `@RestController` 메서드가 아니라 HTTP 요청 하나다.
- JDBC: 쿼리마다 span이 생긴다 (SQL, 실행 시간).
- Spring Kafka: `@KafkaListener`가 메시지를 소비할 때 span이 생긴다.

---

## 수동 계측: 시세 파이프라인 지연 추적

자동 계측이 안 되는 부분은 수동으로 span을 추가한다. 아래 클래스에는 성격이 다른 두 도구가 섞여 있다. `recordTickGenerated`는 span이 아니라 Micrometer 타이머로, 틱 생성 시각(`generatedAt`)부터 Kafka 소비 시점까지의 지연을 잰다. `tracedBlock`은 블록 하나를 span 하나로 감싼다.

```kotlin
@Service
class LatencyTracker(
    private val tracer: Tracer,
    private val meterRegistry: MeterRegistry,
) {
    fun recordTickGenerated(stockId: Long, generatedAt: Instant) {
        val latencyMs = Duration.between(generatedAt, Instant.now()).toMillis()

        // Micrometer 타이머 기록 (Prometheus/Grafana용)
        meterRegistry.timer("tick.pipeline.latency",
            "stage", "kafka_consume",
            "market", getMarket(stockId)
        ).record(latencyMs, TimeUnit.MILLISECONDS)
    }

    fun <T> tracedBlock(spanName: String, block: () -> T): T {
        val span = tracer.spanBuilder(spanName).startSpan()
        return try {
            span.makeCurrent().use { block() }
        } catch (e: Exception) {
            span.recordException(e)
            span.setStatus(StatusCode.ERROR)
            throw e
        } finally {
            span.end()
        }
    }
}
```

시세 처리 파이프라인에 span을 추가한다. `generatedAt`은 Go Gateway의 시계로, `Instant.now()`는 Worker의 시계로 찍힌다. 그래서 두 서버의 시계 차이가 `tick.pipeline.latency`에 그대로 섞인다.

```kotlin
@KafkaListener(topics = ["market.ticks"])
fun onTick(record: ConsumerRecord<String, String>) {
    val tick = objectMapper.readValue(record.value(), GeneratedTick::class.java)
    latencyTracker.recordTickGenerated(tick.stockId, tick.generatedAt)

    latencyTracker.tracedBlock("redis.write") {
        redisTickWriter.write(tick)
    }

    latencyTracker.tracedBlock("candle.aggregate") {
        candleAggregator.onTick(tick)
    }

    latencyTracker.tracedBlock("event.detect") {
        eventDetector.detect(tick)
    }
}
```

---

## Jaeger UI에서 보는 것

Jaeger에 저장된 trace를 UI에서 확인한다.

```
[요청 추적: POST /api/matching/orders]
  │
  ├── HTTP /api/matching/orders [12ms]
  │     ├── RiskChecker.preCheck [2ms]
  │     │     ├── JDBC: SELECT realized_pnl... [0.8ms]
  │     │     └── JDBC: SELECT COUNT(*)... [0.5ms]
  │     │
  │     ├── OrderBook.submit [1ms]
  │     │
  │     └── LedgerService.recordFill [3ms]
  │           └── JDBC: INSERT INTO ledger_events [2ms]

[시세 파이프라인 추적: market.ticks → Redis]
  │
  ├── Kafka consume [0.5ms]
  ├── redis.write [0.8ms]
  ├── candle.aggregate [1.2ms]
  └── event.detect [2.1ms]
  │
  Total pipeline latency: 4.6ms
```

---

## 지연 API 엔드포인트

시세 파이프라인의 실시간 지연을 [백분위](/posts/percentile-statistics/)(p50·p95·p99)로 조회하는 API를 제공한다.

```kotlin
@RestController
@RequestMapping("/api/latency")
class LatencyController(private val latencyTracker: LatencyTracker) {

    @GetMapping
    fun getLatency(): LatencyStats {
        return LatencyStats(
            kafkaToRedis   = latencyTracker.getPercentile("tick.pipeline.latency", 0.99),
            p50LatencyMs   = latencyTracker.getPercentile("tick.pipeline.latency", 0.50),
            p95LatencyMs   = latencyTracker.getPercentile("tick.pipeline.latency", 0.95),
            p99LatencyMs   = latencyTracker.getPercentile("tick.pipeline.latency", 0.99),
            sampleCount    = latencyTracker.getSampleCount("tick.pipeline.latency"),
            measuredAt     = Instant.now(),
        )
    }
}
```

응답 예시:

```json
{
  "p50LatencyMs": 2.3,
  "p95LatencyMs": 8.1,
  "p99LatencyMs": 15.4,
  "sampleCount": 12420
}
```

---

## Docker Compose Jaeger 설정

```yaml
jaeger:
  image: jaegertracing/all-in-one:1.57
  ports:
    - "16686:16686"    # Jaeger UI
    - "4318:4318"      # OTLP HTTP
  environment:
    COLLECTOR_OTLP_ENABLED: "true"
```

브라우저에서 `http://localhost:16686`에 접속하면 Jaeger UI를 볼 수 있다.

---

## Micrometer와 OpenTelemetry의 관계

Spring Boot에서 두 가지가 공존한다.

- **Micrometer**: 메트릭 수집 (카운터, 타이머, 게이지). Prometheus, Grafana에 쿼리
- **OpenTelemetry**: 분산 추적. Jaeger에서 시각화

[Micrometer](/posts/jmx-mbean-and-micrometer/) Tracing Bridge는 Micrometer의 Observation API를 OpenTelemetry span으로 이어 준다. Micrometer Tracing 문서는 그 범위를 이렇게 적는다. "Whenever an `Observation` is used, a corresponding span is created, started, stopped and reported."([Micrometer Tracing](https://docs.micrometer.io/tracing/reference/)) Observation을 쓰는 곳마다 span이 만들어지고 시작·종료·보고된다는 뜻이다.

```kotlin
// Micrometer Timer API
val timer = meterRegistry.timer("api.request", "endpoint", "/api/orders")
timer.record { processOrder() }  // 자동으로 OTel span도 생성
```

문서 기준으로 span을 만드는 것은 `Observation`이고, `Timer`만으로는 span이 생기지 않는다. 그래서 위 주석은 같은 작업을 `Observation`으로 감쌌을 때에만 맞다. Observation 하나로 타이머와 span을 함께 얻는 것이 Micrometer가 말하는 "instrument code once" 방식이다([Micrometer Observation](https://docs.micrometer.io/micrometer/reference/observation.html)).

---

## 정리

- `opentelemetry-spring-boot-starter`로 HTTP/JDBC/Kafka를 코드 변경 없이 자동 계측한다.
- 직접 작성한 블록에는 `tracer.spanBuilder()`로 수동 span을 추가한다.
- Micrometer Timer로 p50/p95/p99 지연 퍼센타일을 측정해 `/api/latency`로 노출한다.
- `sampling.probability: 1.0`은 개발 환경용. 운영에서는 0.1 이하로 줄여야 한다([트레이스 샘플링](/posts/trace-sampling/)).

다음 편에서는 KIS·Yahoo Finance 같은 외부 API 장애 시 자동으로 폴백하는 [Circuit Breaker](/posts/monticker-circuit-breaker/)를 다룬다.

## 참고

- [OpenTelemetry Spring Boot starter: Out of the box instrumentation](https://opentelemetry.io/docs/zero-code/java/spring-boot-starter/out-of-the-box-instrumentation/) — OpenTelemetry 문서
- [Micrometer Tracing](https://docs.micrometer.io/tracing/reference/) — Micrometer 문서
- [Micrometer Observation](https://docs.micrometer.io/micrometer/reference/observation.html) — Micrometer 문서
