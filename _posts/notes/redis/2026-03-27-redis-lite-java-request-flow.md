---
title: RESP, Reactor, Command Registry로 보는 Redis 요청 처리 흐름
date: 2026-03-27
categories: [Notes, Redis]
tags: [Redis, RESP, Reactor, Java NIO]
series: redis-lite-java
series_title: redis-lite-java로 이해하는 Redis 구현
series_order: 2
series_description: redis-lite-java 레포를 바탕으로 Redis의 아키텍처와 동작 원리를 구현 관점에서 해설하는 시리즈.
status: published
---

## Redis 요청은 어떻게 흘러가는가

Redis를 단순히 "메모리 DB"라고만 보면 절반만 본 셈이다. 실제로는 **네트워크 요청을 빠르게 받아서, 프로토콜을 파싱하고, 커맨드를 직렬적으로 실행한 뒤, 다시 응답 프레임으로 내보내는 서버**다.

`redis-lite-java`는 그 흐름을 `Reactor -> ClientConn -> RespReader -> CommandRegistry -> RespWriter`라는 비교적 선명한 파이프라인으로 드러낸다.

## 1. Reactor가 서버의 메인 루프를 담당한다

핵심 루프는 `Reactor.start()` 안에 있다.

```java
while (true) {
    long nowMs = Clocks.monoMillis();
    long delayMs = db.nextExpiryDelayMillis(nowMs);
    if (delayMs < 0) delayMs = 1000;

    selector.select(Math.max(1, Math.min(delayMs, 1000)));

    Iterator<SelectionKey> it = selector.selectedKeys().iterator();
    while (it.hasNext()) {
        SelectionKey key = it.next();
        it.remove();
        if (!key.isValid()) continue;

        if (key.isAcceptable()) {
            handleAccept();
        } else if (key.isReadable()) {
            ((ClientConn) key.attachment()).handleRead();
        } else if (key.isWritable()) {
            ((ClientConn) key.attachment()).handleWrite();
        }
    }

    nowMs = Clocks.monoMillis();
    db.expireDue(nowMs, EXPIRE_BATCH_LIMIT);
}
```

이 코드에서 중요한 점은 세 가지다.

- `Selector` 기반 NIO 이벤트 루프를 사용한다.
- 읽기/쓰기/accept를 하나의 루프에서 처리한다.
- 매 루프 끝에서 TTL 만료도 같이 정리한다.

즉, 네트워크 처리와 keyspace maintenance가 하나의 스레드에서 함께 돌아간다. Redis의 핵심 감각이 이 구조에 있다.

## 2. 연결별 상태는 ClientConn이 가진다

Redis는 연결마다 독립적인 상태를 일부 유지한다. 이 프로젝트에서도 그 점을 `ClientConn`이 맡는다.

```java
private final ByteBuffer readBuf = ByteBuffer.allocate(READ_BUF_SIZE);
private final Deque<ByteBuffer> writeQueue = new ArrayDeque<>();
private final RespReader respReader = new RespReader();

private final Set<String> subscriptions = new HashSet<>();

private boolean inTxn = false;
private boolean txnDirty = false;
private boolean bypassTxn = false;
private final List<List<String>> txnQueue = new ArrayList<>();
```

여기에는 단순 네트워크 버퍼뿐 아니라, Redis적인 상태도 들어 있다.

- 읽기 버퍼
- 쓰기 큐
- pub/sub 구독 채널
- `MULTI/EXEC` 상태

즉, "연결"은 단순 소켓 핸들이 아니라 **프로토콜 세션 상태를 가진 객체**다.

## 3. 읽기 이벤트가 오면 RESP 프레임을 파싱한다

`handleRead()`의 흐름은 깔끔하다.

1. 소켓에서 read buffer로 읽는다.
2. `flip()`해서 읽기 모드로 바꾼다.
3. 가능한 만큼 RESP command frame을 계속 파싱한다.
4. 파싱이 성공한 argv를 `CommandRegistry.dispatch()`에 넘긴다.
5. 응답이 있으면 write queue에 쌓는다.
6. 남은 바이트는 `compact()`로 유지한다.

핵심은 **파이프라이닝을 안전하게 처리한다**는 점이다.

```java
while (true) {
    int markPos = readBuf.position();
    List<String> argv = respReader.tryReadCommand(readBuf);
    if (argv == null) {
        readBuf.position(markPos);
        break;
    }
    ByteBuffer resp = CommandRegistry.dispatch(argv, this);
    if (resp != null) enqueue(resp);
}
```

한 번의 read 안에 여러 명령이 들어올 수 있고, 반대로 프레임 하나가 아직 덜 들어왔을 수도 있다. `tryReadCommand()`가 `null`을 반환하면 "바이트가 아직 부족하다"는 의미로 보고, 다음 read까지 기다린다.

## 4. RESP Reader는 최소한의 Redis 프로토콜 해석기다

`RespReader`는 RESP 전체를 다 지원하기보다, **커맨드 입력에 필요한 형태인 "Array of Bulk Strings"** 만 처리한다.

즉, 이런 프레임을 argv로 바꾼다.

```text
*2\r\n
$4\r\nPING\r\n
$4\r\nPONG\r\n
```

파싱 로직은 의외로 단순하다.

- 첫 글자가 `*`인지 확인
- 요소 개수를 읽음
- 각 요소가 `$len\r\n...\r\n` 형식인지 확인
- 모두 완성되면 `List<String>` 반환

중요한 점은 이 구현이 **incomplete frame**을 정상 상태로 본다는 것이다. 파이프라이닝과 부분 수신은 에러가 아니라 네트워크의 자연스러운 현상이다.

## 5. Command Registry가 프로토콜을 의미 있는 명령으로 바꾼다

RESP 파싱 결과는 단지 문자열 배열일 뿐이다. 이제 이 argv를 실제 명령으로 매핑해야 한다.

```java
String name = argv.get(0).toUpperCase();
Command c = CMDS.get(name);
```

여기서 `CommandRegistry`는 다음 역할을 한다.

- 명령 이름을 구현체에 매핑
- 알 수 없는 명령 처리
- `MULTI/EXEC/DISCARD` 예외 처리
- 트랜잭션 상태일 때 즉시 실행 대신 queue 처리

이 부분이 중요한 이유는 Redis의 인터페이스가 결국 "텍스트 커맨드의 집합"이기 때문이다. 이 프로젝트는 그 사실을 매우 직접적인 방식으로 드러낸다.

## 6. 트랜잭션은 실행을 미루는 방식으로 구현된다

`MULTI` 상태에 들어가면 대부분의 명령은 바로 실행되지 않고 `txnQueue`에 쌓인다.

```java
if (ctx.isInTxn() && !ctx.isBypassTxn()) {
    ctx.queueTxn(argv);
    return RespWriter.simpleString("QUEUED");
}
```

즉, 이 구현은 트랜잭션을 "undo/rollback 가능한 DB 트랜잭션"으로 만들기보다, Redis답게 **명령 큐잉 후 EXEC에서 일괄 실행**하는 모델로 표현한다.

이 점은 관계형 DB 트랜잭션과 Redis 트랜잭션을 구분하는 데도 도움이 된다.

## 7. 응답은 write queue를 통해 비동기적으로 나간다

응답을 즉시 `write()`하지 않고 `Deque<ByteBuffer>`에 넣어 둔 뒤, writable 이벤트에서 flush한다.

```java
while (!writeQueue.isEmpty()) {
    ByteBuffer buf = writeQueue.peekFirst();
    ch.write(buf);
    if (buf.hasRemaining()) break;
    writeQueue.pollFirst();
}
```

이 구조가 필요한 이유는 non-blocking I/O에서는 한 번의 write로 모든 바이트가 다 나간다는 보장이 없기 때문이다. 그래서 **partial write를 정상 흐름으로 처리**해야 한다.

## 8. RESP Writer는 서버 쪽 프로토콜 인코더다

`RespWriter`는 Redis 응답 타입을 직접 만든다.

- `+OK`
- `-ERR ...`
- `$len\r\n...\r\n`
- `:1`
- `*N\r\n...`

즉, 서버는 내부적으로 문자열이나 숫자를 다루지만, 바깥으로는 RESP 프레임으로 말해야 한다. Redis가 "가벼운 바이너리 프로토콜 위의 명령 서버"라는 점이 여기서 잘 드러난다.

## 이 구현이 보여주는 Redis의 중요한 특징

이 요청 처리 흐름을 따라가면 Redis가 빠른 이유를 조금 더 구체적으로 이해할 수 있다.

1. **프로토콜이 단순하다**
2. **이벤트 루프가 직렬적이다**
3. **연결 상태와 커맨드 실행이 명시적이다**
4. **락 대신 실행 모델로 경쟁을 줄인다**

물론 실제 Redis는 더 복잡하다. 하지만 이 프로젝트는 최소 구현만으로도 "Redis는 결국 프로토콜 서버이자 이벤트 루프 기반 명령 실행기"라는 본질을 잘 보여준다.

다음 글에서는 이 요청이 실제로 어떤 자료구조 위에서 처리되는지, 즉 `MemoryDb`, `Record`, `ExpiryHeap`, `OpenHashStringMap`을 중심으로 메모리 keyspace 설계를 본다.
