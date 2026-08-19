---
title: "Netty로 수만 연결에 시세 브로드캐스트하기 — NioEventLoopGroup 리액터 패턴"
date: 2026-06-08
categories: [Monticker, Realtime]
tags: [monticker, netty, websocket, reactor, broadcast, concurrency]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 6
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: writing
---

## Spring STOMP의 한계

처음에는 Spring의 STOMP over WebSocket으로 시세를 브로드캐스트했다.

```kotlin
// Spring STOMP 방식
messagingTemplate.convertAndSend("/topic/stocks/$stockId", priceUpdate)
```

이 방식의 문제는 스레드 모델에 있다. Spring MVC는 요청당 스레드(thread-per-request) 모델을 기본으로 하고, WebSocket 연결도 일정 수의 스레드가 처리한다. 동시 연결 수가 수천을 넘어가면 스레드 컨텍스트 스위칭 비용이 올라간다.

시세 브로드캐스트는 특수한 워크로드다.

- **쓰기 집중**: 같은 데이터를 수천 연결에 반복 전달
- **메시지 크기 작음**: 수십 바이트 JSON
- **높은 빈도**: 종목당 1초마다 한 번

이 패턴에 최적화된 것이 **Netty의 NIO 리액터 패턴**이다.

---

## 리액터 패턴이란

```
기존 (Thread-per-connection):
  연결 1 → 스레드 1 (대기 중)
  연결 2 → 스레드 2 (대기 중)
  연결 3 → 스레드 3 (대기 중)
  ...
  연결 10000 → 스레드 10000 (대기 중)
  → 대부분의 스레드가 I/O 대기 상태. 메모리 낭비.

Netty NIO (Reactor):
  이벤트 루프 스레드 8개
  → 셀렉터(Selector)가 모든 연결의 I/O 이벤트를 감시
  → I/O 준비된 연결만 스레드에 할당
  → 수천 연결을 8개 스레드로 처리
```

Netty의 `NioEventLoopGroup`은 내부적으로 Java NIO `Selector`를 사용해 수만 개의 소켓을 소수의 스레드로 처리한다.

---

## BroadcastServer 구현

```kotlin
class BroadcastServer(private val port: Int) {
    private val log = LoggerFactory.getLogger(javaClass)

    // stockId → 구독 중인 채널 집합
    // "ALL" 키는 모든 틱을 받는 전체 구독자용
    private val subscriptions = ConcurrentHashMap<String, MutableSet<Channel>>()

    fun start() {
        val bossGroup  = NioEventLoopGroup(1)       // accept 전담 스레드 1개
        val workerGroup = NioEventLoopGroup()        // I/O 처리 (기본: CPU코어 × 2)

        val bootstrap = ServerBootstrap()
            .group(bossGroup, workerGroup)
            .channel(NioServerSocketChannel::class.java)
            .childHandler(object : ChannelInitializer<SocketChannel>() {
                override fun initChannel(ch: SocketChannel) {
                    ch.pipeline()
                        .addLast(HttpServerCodec())           // HTTP 요청 파싱
                        .addLast(HttpObjectAggregator(65536)) // 프레임 집약
                        .addLast(WebSocketServerProtocolHandler("/ws")) // WS 핸드셰이크
                        .addLast(SubscriptionHandler(subscriptions))    // 구독 로직
                }
            })

        val channel = bootstrap.bind(port).sync().channel()
        log.info("Broadcast gateway listening on ws://0.0.0.0:{}/ws", port)
        channel.closeFuture().sync()
    }
}
```

파이프라인이 핵심이다. 연결이 들어오면 HTTP 업그레이드 요청이 먼저 처리되고(`HttpServerCodec`, `HttpObjectAggregator`), `WebSocketServerProtocolHandler`가 `101 Switching Protocols`를 응답해 WebSocket으로 전환한다. 이후 텍스트 프레임이 `SubscriptionHandler`에 도달한다.

---

## SubscriptionHandler — 구독 관리

```kotlin
class SubscriptionHandler(
    private val subscriptions: ConcurrentHashMap<String, MutableSet<Channel>>,
) : SimpleChannelInboundHandler<TextWebSocketFrame>() {

    private val mapper = ObjectMapper()

    override fun channelRead0(ctx: ChannelHandlerContext, msg: TextWebSocketFrame) {
        runCatching {
            val node   = mapper.readTree(msg.text())
            val action = node["action"]?.asText() ?: return
            val key    = node["stockId"]?.asText() ?: "ALL"

            when (action) {
                "subscribe" ->
                    subscriptions.getOrPut(key) { ConcurrentHashMap.newKeySet() }
                              .add(ctx.channel())
                "unsubscribe" ->
                    subscriptions[key]?.remove(ctx.channel())
                else ->
                    log.debug("알 수 없는 action: {}", action)
            }
        }.onFailure { log.warn("구독 처리 실패: {}", it.message) }
    }

    override fun channelInactive(ctx: ChannelHandlerContext) {
        // 연결 끊김 시 모든 목록에서 제거 → 메모리 누수 방지
        subscriptions.values.forEach { it.remove(ctx.channel()) }
        super.channelInactive(ctx)
    }
}
```

`ConcurrentHashMap.newKeySet()`이 보이는 이유가 있다. Java에는 `ConcurrentHashSet`이 없다. `ConcurrentHashMap`의 키 집합을 뽑으면 스레드 안전한 Set이 된다.

`channelInactive`에서 연결이 끊기면 모든 구독 목록에서 채널을 제거한다. 이를 하지 않으면 끊긴 채널에 계속 writeAndFlush를 시도해 에러 로그가 쌓인다.

---

## broadcast() — 핵심 메서드

```kotlin
fun broadcast(stockId: String, json: String) {
    val makeFrame = { TextWebSocketFrame(json) }
    subscriptions[stockId]?.forEach { it.writeAndFlush(makeFrame()) }
    subscriptions["ALL"]?.forEach  { it.writeAndFlush(makeFrame()) }
}
```

`TextWebSocketFrame(json)`을 채널마다 새로 생성하는 이유가 있다. Netty는 버퍼를 reference-counted로 관리한다. 같은 프레임 인스턴스를 두 채널에 보내면 첫 번째 채널이 버퍼를 소유권을 가져가고, 두 번째 채널이 접근할 때는 이미 해제된 메모리를 건드리게 된다. 람다 `{ TextWebSocketFrame(json) }`로 채널마다 독립 인스턴스를 만든다.

---

## KafkaBridge — Kafka 소비 스레드

BroadcastServer는 I/O 이벤트를 기다리는 블로킹 루프다. Kafka 소비도 블로킹이므로 별도 스레드에서 실행한다.

```kotlin
class KafkaBridge(
    private val brokers: String,
    private val server: BroadcastServer
) {
    private val running = AtomicBoolean(true)

    fun run() {
        val consumer = KafkaConsumer<String, String>(Properties().apply {
            put(BOOTSTRAP_SERVERS_CONFIG, brokers)
            put(GROUP_ID_CONFIG, "broadcast-gateway")
            put(KEY_DESERIALIZER_CLASS_CONFIG,   StringDeserializer::class.java.name)
            put(VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer::class.java.name)
            put(AUTO_OFFSET_RESET_CONFIG, "latest") // 재시작 후 과거 틱 스킵
        })
        consumer.subscribe(listOf("market.ticks", "market.events"))

        while (running.get()) {
            val records = consumer.poll(Duration.ofMillis(200))
            for (record in records) {
                // record.key() = stockId (Go Gateway가 설정한 값)
                server.broadcast(record.key() ?: "ALL", record.value())
            }
        }
        consumer.close()
    }

    fun stop() = running.set(false)
}
```

`AUTO_OFFSET_RESET_CONFIG = "latest"`로 설정하는 이유가 있다. 브로드캐스트 게이트웨이는 실시간 중계가 목적이다. 재시작 후 밀린 과거 틱 수만 개를 한꺼번에 클라이언트에 쏘는 것은 의미가 없고 오히려 해롭다. 최신 메시지부터 소비하면 된다.

---

## 진입점 (Main.kt)

```kotlin
fun main() {
    val port    = System.getenv("BROADCAST_PORT")?.toInt() ?: 9090
    val brokers = System.getenv("KAFKA_BROKERS") ?: "localhost:9092"

    val server = BroadcastServer(port)
    val bridge = KafkaBridge(brokers, server)

    // KafkaBridge는 블로킹 루프 → 별도 스레드
    thread(name = "kafka-bridge") { bridge.run() }

    // BroadcastServer.start() → closeFuture().sync()로 블로킹
    server.start()
}
```

---

## 클라이언트 프로토콜

```js
// 연결
const ws = new WebSocket('ws://localhost:9090/ws');

// 특정 종목 구독
ws.send(JSON.stringify({ action: 'subscribe', stockId: '1' }));

// 전체 종목 구독
ws.send(JSON.stringify({ action: 'subscribe', stockId: 'ALL' }));

// 수신 메시지
ws.onmessage = (event) => {
    const tick = JSON.parse(event.data);
    // { stockId: 1, symbol: "005930", price: 73200.5, ... }
    updateChart(tick);
};
```

---

## Spring STOMP 대비 스레드 수

| | Spring STOMP | Netty Broadcast |
|--|--|--|
| 연결 처리 스레드 | Tomcat NIO 스레드 풀 (기본 200) | boss 1 + worker 16 |
| 1만 연결 시 추가 스레드 | 수백 | 0 (이벤트 루프 재사용) |
| WebSocket 프레임 처리 | Spring 직렬화 + STOMP 헤더 | Raw TextWebSocketFrame |

단순한 숫자 비교지만, Netty는 "연결이 늘어도 스레드는 늘지 않는다"는 점이 핵심이다.

---

## 정리

- Netty의 NioEventLoopGroup은 소수의 스레드로 수만 연결을 처리한다.
- `ConcurrentHashMap`으로 stockId별 구독 채널을 관리하고, 연결 끊김 시 즉시 제거한다.
- `TextWebSocketFrame`은 채널마다 새 인스턴스를 생성해야 한다 (reference-counted 버퍼).
- KafkaBridge의 `AUTO_OFFSET_RESET=latest`로 재시작 후 과거 틱 재처리를 방지한다.

다음 편에서는 시세 파이프라인의 마지막 단계인 **EMA 기반 이상 탐지** — 가격 급등과 거래량 서지를 어떻게 실시간으로 감지하는지 다룬다.
