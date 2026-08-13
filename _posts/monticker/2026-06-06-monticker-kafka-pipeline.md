---
title: "Kafka로 시세 파이프라인 분리하기 — 토픽 설계와 at-least-once"
date: 2026-06-06
categories: [Monticker, Realtime]
tags: [monticker, kafka, spring-kafka, pipeline, at-least-once, partitioning]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 5
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
published: false
---

## 왜 Kafka를 넣었는가

초기 monticker는 단순한 구조였다. Worker가 1초마다 가격을 생성하고, Redis에 쓰고, 이벤트를 탐지하고, 캔들을 집계했다. 하나의 `@Scheduled` 메서드가 모든 걸 순차적으로 처리했다.

```
MockPriceGenerator (1초 주기)
  → RedisTickWriter
  → CandleAggregator
  → EventDetector
  → AlertEvaluator
```

문제는 **확장**이다. 나중에 KIS WebSocket처럼 외부에서 데이터가 밀려들어올 때, JVM Worker가 수집과 처리를 동시에 하면 두 관심사가 뒤섞인다.

Kafka를 넣으면 수집(Go Gateway)과 처리(Kotlin Worker)가 분리된다.

```
Go Gateway → [Kafka] → Kotlin Worker → Redis + TimescaleDB + EventDetector
                    ↘
                      Netty Broadcast Gateway → WebSocket clients
```

둘을 분리하면 얻는 것이 있다. 수집기가 죽어도 이미 Kafka에 쌓인 틱은 사라지지 않는다. Worker가 재시작되면 멈춘 오프셋부터 다시 처리한다.

---

## Kafka 설정 (docker-compose.yml)

monticker는 KRaft 모드(ZooKeeper 없는 Kafka 3.8)를 사용한다.

```yaml
kafka:
  image: apache/kafka:3.8.0
  environment:
    KAFKA_NODE_ID: 1
    KAFKA_PROCESS_ROLES: broker,controller
    # 두 개의 리스너: Docker 내부망용과 호스트 접근용
    KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,EXTERNAL://0.0.0.0:29092,CONTROLLER://0.0.0.0:9093
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092,EXTERNAL://localhost:29092
    KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
    KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
    KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,EXTERNAL:PLAINTEXT
    KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
    KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
    CLUSTER_ID: "monticker-kafka-cluster-001"
```

리스너를 두 개로 나눈 이유가 있다. Docker 컨테이너에서 `PLAINTEXT://kafka:9092`로 Kafka에 접근하면 메타데이터 응답에 `kafka:9092`가 담긴다. 호스트에서 실행 중인 Go Gateway는 `kafka`라는 호스트명을 해석하지 못한다. `EXTERNAL://localhost:29092`를 추가해 호스트에서도 접근 가능하게 만든다.

---

## 토픽 설계

monticker는 두 개의 토픽을 사용한다.

### market.ticks

시세 틱 메시지. Go Gateway가 발행하고 Worker와 Netty Gateway가 소비한다.

```
토픽: market.ticks
파티션: 6
복제 인수: 1 (단일 브로커)
키: stockId (해시 파티셔닝)
```

파티션을 6개로 나눈 이유는 종목 수(202개)보다 훨씬 적지만, 1개일 때보다 병렬성이 향상된다. 나중에 Worker를 여러 인스턴스로 늘리면 파티션당 하나씩 배분된다.

**키 해싱과 순서 보장**

```
stockId=1  → hash(1) % 6 = 파티션 3
stockId=2  → hash(2) % 6 = 파티션 0
stockId=1  → hash(1) % 6 = 파티션 3  (항상 같은 파티션)
```

같은 종목의 틱은 항상 같은 파티션으로 들어간다. 파티션 내에서는 순서가 보장되므로 캔들 집계 시 시간 역전이 없다.

### market.events

Worker가 이벤트 탐지 결과를 발행하는 토픽. Netty Broadcast Gateway가 이를 소비해 WebSocket 클라이언트에 전달한다.

```
토픽: market.events
파티션: 3
키: stockId
```

---

## Worker Kafka 연동 — @ConditionalOnProperty

Kafka 없이 기존 `MockPriceGenerator` 방식으로도 동작해야 한다. 환경변수 `INGESTION_SOURCE`로 경로를 전환한다.

```kotlin
// KafkaConfig.kt
@Configuration
@EnableKafka
@ConditionalOnProperty(name = ["ingestion.source"], havingValue = "kafka")
class KafkaConfig(
    @Value("\${kafka.brokers:localhost:9092}") private val brokers: String
) {
    @Bean
    fun consumerFactory(): ConsumerFactory<String, String> {
        val props = mapOf(
            ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG to brokers,
            ConsumerConfig.GROUP_ID_CONFIG to "monticker-worker",
            ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG to StringDeserializer::class.java,
            ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG to StringDeserializer::class.java,
            ConsumerConfig.AUTO_OFFSET_RESET_CONFIG to "latest",
        )
        return DefaultKafkaConsumerFactory(props)
    }

    @Bean
    fun kafkaListenerContainerFactory() =
        ConcurrentKafkaListenerContainerFactory<String, String>().also {
            it.consumerFactory = consumerFactory()
        }
}
```

`@ConditionalOnProperty`는 `ingestion.source=kafka`일 때만 이 Bean을 등록한다. 그 외 경우 Kafka 관련 Bean은 아예 생성되지 않는다.

```yaml
# application.yml
ingestion:
  source: ${INGESTION_SOURCE:internal}  # 기본값: internal (mock 경로)
kafka:
  brokers: ${KAFKA_BROKERS:localhost:9092}
```

---

## TickKafkaConsumer — @KafkaListener

```kotlin
@Component
@ConditionalOnProperty(name = ["ingestion.source"], havingValue = "kafka")
class TickKafkaConsumer(
    private val redisTickWriter: RedisTickWriter,
    private val candleAggregator: CandleAggregator,
    private val eventDetector: EventDetector,
    private val latencyTracker: LatencyTracker,
) {
    private val objectMapper = ObjectMapper().registerModule(JavaTimeModule())
    private val log = LoggerFactory.getLogger(javaClass)

    @KafkaListener(
        topics = ["market.ticks"],
        groupId = "monticker-worker",
        containerFactory = "kafkaListenerContainerFactory"
    )
    fun onTick(record: ConsumerRecord<String, String>) {
        runCatching {
            val tick = objectMapper.readValue(record.value(), GeneratedTick::class.java)

            // 파이프라인 지연 추적
            latencyTracker.recordTickGenerated(tick.stockId, tick.generatedAt)

            // 처리 파이프라인
            redisTickWriter.write(tick)
            candleAggregator.onTick(tick)
            latencyTracker.recordRedisWrite(tick.stockId)
            eventDetector.detect(tick)
            latencyTracker.recordBroadcast(tick.stockId)

        }.onFailure { e ->
            log.error("틱 처리 실패 [key={}]: {}", record.key(), e.message)
            // at-least-once: 예외를 삼켜서 오프셋이 커밋되게 한다
            // 처리 실패한 틱은 유실하되, 파이프라인은 계속 진행
        }
    }
}
```

---

## at-least-once와 멱등성

Kafka의 기본 소비 시맨틱은 **at-least-once**다. 컨슈머가 메시지를 처리한 후 오프셋을 커밋하기 전에 장애가 나면, 재시작 후 같은 메시지를 다시 받는다.

monticker에서 이 중복이 문제가 되는지 체크한다.

| 처리 단계 | 중복 시 영향 | 처리 방법 |
|----------|------------|----------|
| `redisTickWriter` | 최신 가격이 같은 값으로 다시 쓰임 | `SET` → 덮어쓰기, 무해 |
| `candleAggregator` | 같은 틱이 두 번 집계됨 | 1분봉 시작/종료 판단은 시각 기준 → 타임스탬프로 중복 방지 |
| `eventDetector` | 같은 이벤트가 두 번 탐지될 수 있음 | `INSERT ... ON CONFLICT DO NOTHING`으로 중복 방지 |

이벤트 중복 방지 쿼리:

```sql
INSERT INTO stock_events (stock_id, event_type, triggered_at, ...)
VALUES (?, ?, ?, ...)
ON CONFLICT (stock_id, event_type, date_trunc('minute', triggered_at))
DO NOTHING;
```

같은 종목·이벤트 유형·분(minute) 조합이 이미 있으면 무시한다. 이것이 **멱등 처리(idempotent processing)** 의 구현이다.

---

## Mock 경로와의 공존

Kafka 경로가 활성화되면 기존 Mock 경로는 비활성화된다.

```kotlin
// MarketDataCollector.kt
@Scheduled(fixedDelay = 1000)
fun collect() {
    if (ingestionSource == "kafka") return  // Kafka 경로로 대체됨
    // 기존 MockPriceGenerator 로직
    stocks.forEach { stock ->
        val tick = mockPriceGenerator.generate(stock)
        redisTickWriter.write(tick)
        candleAggregator.onTick(tick)
        eventDetector.detect(tick)
    }
}
```

`ingestion.source` 하나로 두 경로를 전환한다. 기존 코드를 삭제하지 않았으므로, Kafka 없이 로컬 개발 시 그대로 동작한다.

---

## 정리

- Kafka는 수집과 처리를 분리해 각 컴포넌트가 독립적으로 재시작·확장 가능하게 한다.
- 키 해싱으로 같은 종목 틱이 같은 파티션에 순서대로 쌓이고, 캔들 집계 시 시간 역전을 방지한다.
- at-least-once 소비와 멱등 처리(`ON CONFLICT DO NOTHING`)를 조합해 중복 없는 결과를 만든다.

다음 편에서는 Kafka에서 받은 틱을 WebSocket 클라이언트에 브로드캐스트하는 **Netty Broadcast Gateway**를 다룬다.
