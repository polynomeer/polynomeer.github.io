---
title: MULTI, Pub/Sub, Lua로 보는 Redis 확장 기능과 구현 과정
date: 2026-03-27
categories: [Notes, Redis]
tags: [Redis, Transaction, PubSub, Lua]
series: redis-lite-java
series_title: redis-lite-java로 이해하는 Redis 구현
series_order: 4
series_description: redis-lite-java 레포를 바탕으로 Redis의 아키텍처와 동작 원리를 구현 관점에서 해설하는 시리즈.
status: published
---

## Redis를 단순 key-value 이상으로 만드는 것들

문자열 조회와 저장만 구현하면 "메모리 key-value 서버"는 만들 수 있다. 하지만 Redis가 실제로 유용한 이유는 그 위에 **트랜잭션, pub/sub, 스크립팅** 같은 기능이 얹혀 있기 때문이다.

`redis-lite-java`도 이 지점에서 Redis다운 확장을 보여준다.

- `MULTI / EXEC / DISCARD`
- `SUBSCRIBE / UNSUBSCRIBE / PUBLISH`
- `EVAL / EVALSHA / SCRIPT`

이 글에서는 기능 자체보다, 왜 이런 방식으로 구현했는지를 본다.

## 1. Redis 트랜잭션은 RDBMS 트랜잭션과 다르다

관계형 DB를 먼저 배운 입장에서는 `MULTI/EXEC`를 보고 rollback, undo log, isolation을 떠올리기 쉽다. 하지만 Redis 트랜잭션은 본질적으로 **명령 큐잉 후 일괄 실행**에 더 가깝다.

이 구현도 그 점을 정직하게 드러낸다.

```java
private boolean inTxn = false;
private boolean txnDirty = false;
private boolean bypassTxn = false;
private final List<List<String>> txnQueue = new ArrayList<>();
```

`MULTI`가 들어오면 실행 상태가 아니라 **queueing mode**로 들어간다.

```java
if (ctx.isInTxn() && !ctx.isBypassTxn()) {
    ctx.queueTxn(argv);
    return RespWriter.simpleString("QUEUED");
}
```

즉, 일반 명령은 곧바로 실행되지 않고 `QUEUED`만 반환한다.

그리고 `EXEC` 시점에 큐를 순서대로 실행한다.

```java
for (List<String> a : queued) {
    ByteBuffer r = dispatchImmediate(a, ctx);
    replies.add(r);
}
```

이 구현이 보여주는 핵심은 다음이다.

- Redis 트랜잭션은 DB-style rollback 중심이 아니다.
- 핵심은 **중간에 다른 클라이언트 명령이 끼어들지 않게 순서대로 실행하는 것**이다.
- single-threaded event loop와 잘 맞는다.

## 2. txnDirty가 의미하는 것

트랜잭션 도중 알 수 없는 커맨드가 들어오면 `txnDirty`를 표시한다.

```java
if (c == null) {
    if (ctx.isInTxn()) {
        ctx.markTxnDirty();
        return RespWriter.error("ERR unknown command ...");
    }
}
```

그리고 `EXEC` 시점에 dirty 상태면 abort한다.

```java
if (ctx.isTxnDirty()) {
    ctx.endTxn();
    return RespWriter.error("EXECABORT Transaction discarded because of previous errors.");
}
```

이 부분은 Redis가 "실행 중 복잡한 rollback"보다, **큐잉 단계에서 오류를 조기에 표면화하고 EXEC 시점에 중단**하는 쪽을 택한다는 점과 잘 맞는다.

## 3. Pub/Sub는 broker 하나로 풀 수 있다

Pub/Sub는 이 프로젝트에서 가장 직관적인 구조를 가진다.

```java
private final Map<String, Set<ClientConn>> channels = new HashMap<>();
```

즉, 핵심 아이디어는 단순하다.

- 채널 이름
- 그 채널을 구독한 연결 집합

`SUBSCRIBE`는 set에 connection을 넣고, `PUBLISH`는 그 set을 순회하며 메시지를 push한다.

```java
for (ClientConn c : targets) {
    c.push(RespWriter.arrayMessage(channel, payload));
    n++;
}
```

이 구현이 중요한 이유는 Redis pub/sub의 본질을 잘 보여주기 때문이다. pub/sub는 persistence가 아니라 **지금 연결된 소비자에게 푸시하는 메모리 기반 fan-out**에 가깝다.

## 4. 왜 push queue가 필요한가

Pub/Sub 메시지는 요청-응답과 다르게, 클라이언트가 어떤 명령을 보내지 않아도 서버가 먼저 내려보내야 한다.

그래서 `ClientConn.push()`가 따로 존재한다.

```java
public void push(ByteBuffer response) {
    enqueue(response);
    key.interestOps(key.interestOps() | SelectionKey.OP_WRITE);
}
```

즉, Redis 연결은 단순 요청-응답 소켓이 아니라, **서버가 비동기적으로 메시지를 밀어 넣을 수 있는 스트림**이다.

이 점은 일반 HTTP API 서버와 Redis의 차이를 체감하게 해 준다.

## 5. Lua는 "서버 안에서 명령을 조합하는 방식"이다

Lua 지원은 이 프로젝트에서 가장 흥미로운 부분 중 하나다. 구현은 `luaj` 라이브러리를 붙였지만, 핵심은 그냥 스크립트를 실행하는 것이 아니라 **`redis.call()`을 통해 서버 내부 명령을 스크립트에서 조합할 수 있게 한 것**이다.

```java
LuaTable redis = new LuaTable();
redis.set("call", new RedisCall(limits));
redis.set("pcall", new RedisPCall(limits));
g.set("redis", redis);
```

즉, Lua는 별도의 외부 스크립트 엔진이 아니라 **Redis 명령 실행기 위에 얹힌 서버 내 제어 계층**으로 이해하는 편이 맞다.

## 6. 왜 sandbox와 limit이 필요한가

Lua는 강력하지만, single-threaded 서버에서 위험하기도 하다. 스크립트가 너무 오래 돌거나 너무 많은 명령을 실행하면 메인 루프 전체를 막아버릴 수 있다.

그래서 이 구현은 명시적으로 리소스 제한을 둔다.

```java
this.lua = new LuaEngine(db, broker, 5_000L, 10_000, 1_000);
```

그리고 각 `redis.call` 경계에서 다음을 체크한다.

- 실행 시간
- 누적 바이트 수
- 호출 횟수

이 부분은 실제 Redis를 이해할 때도 중요하다. Lua는 편리하지만, Redis가 단일 스레드 실행 모델인 이상 **서버 안에서 돌리는 코드가 전체 응답성을 갉아먹을 수 있다**는 사실을 항상 동반한다.

## 7. 왜 지원 명령을 제한했는가

`RedisCall.invoke()`를 보면 지원 명령을 switch로 제한한다.

```java
switch (cmd) {
    case "GET":
    case "SET":
    case "DEL":
    case "EXISTS":
    case "HGET":
    case "HSET":
    case "PEXPIRE":
    case "PTTL":
    case "PUBLISH":
```

이건 단순한 기능 부족이라기보다, 교육용 구현에서 중요한 선택이다. 스크립팅은 "무엇이든 할 수 있게" 만드는 것보다, **서버 내부 명령 모델과 어떻게 연결되는지**를 보여주는 것이 먼저이기 때문이다.

## 8. 구현 과정에서 드러나는 설계 철학

이 프로젝트의 고급 기능 구현을 보면 공통된 철학이 있다.

### 트랜잭션

rollback을 정교하게 만들기보다, Redis답게 queue + exec 모델을 택함

### Pub/Sub

메시지 브로커를 복잡하게 만들기보다, channel -> subscribers 맵으로 핵심 fan-out만 구현함

### Lua

진짜 임베디드 스크립팅 엔진의 힘을 보여주되, 안전장치와 지원 범위를 명시적으로 둠

즉, 기능을 넓히기보다 **Redis가 왜 이런 실행 모델을 택했는지**를 드러내는 선택이 많다.

## 시리즈 정리

`redis-lite-java`를 읽고 나면 Redis를 다음처럼 다시 보게 된다.

- Redis는 단순 캐시가 아니다.
- Redis는 단일 스레드 이벤트 루프 위에서 커맨드를 직렬 실행하는 서버다.
- Redis의 핵심은 프로토콜, keyspace, 명령 모델, 그리고 그 위에 올라가는 조합 가능성이다.

실제 Redis는 여기서 persistence, replication, cluster, eviction, richer data structure까지 훨씬 넓어진다. 하지만 그 전에 먼저 이해해야 할 뼈대는 바로 이 레포가 보여주는 수준에서 거의 다 시작된다.
