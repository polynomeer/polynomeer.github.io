---
title: redis-lite-java로 이해하는 Redis 아키텍처 개요
date: 2026-03-27
categories: [Notes, Redis]
tags: [Redis, Architecture, Java, Reactor]
series: redis-lite-java
series_title: redis-lite-java로 이해하는 Redis 구현
series_order: 1
series_description: redis-lite-java 레포를 바탕으로 Redis의 아키텍처와 동작 원리를 구현 관점에서 해설하는 시리즈.
status: published
---

## 들어가며

[redis-lite-java](https://github.com/polynomeer/redis-lite-java)는 Redis를 완전히 재현하려는 프로젝트라기보다, **Redis가 왜 빠르고 단순하며 예측 가능한 구조를 가지는지**를 자바로 다시 구현해 보는 교육용 프로젝트에 가깝다.

코드 양은 크지 않지만, Redis를 이해할 때 중요한 축은 꽤 선명하게 담겨 있다.

- 단일 프로세스, 단일 스레드 이벤트 루프
- RESP 기반 프로토콜 파싱
- 커맨드 디스패치
- 메모리 keyspace와 TTL 관리
- `MULTI/EXEC`, Pub/Sub, Lua 실행

즉 "Redis는 결국 어떤 구조로 요청을 받고, 메모리에 값을 두고, 커맨드를 실행하는가"를 따라가기에 좋은 크기다.

이 글에서는 레포 전체 구조를 기준으로 Redis의 큰 그림부터 잡는다.

## 이 프로젝트의 전체 구조

엔트리포인트는 매우 단순하다.

```java
public class ServerMain {
    public static void main(String[] args) throws Exception {
        int port = 6379;
        if (args.length > 0) {
            port = Integer.parseInt(args[0]);
        }
        Reactor reactor = new Reactor(port);
        reactor.start();
    }
}
```

구조적으로 보면 핵심은 `Reactor` 하나에 거의 다 모인다.

1. 포트를 열고 클라이언트 연결을 받는다.
2. 각 연결을 `ClientConn`으로 관리한다.
3. 읽기 이벤트가 오면 RESP 프레임을 파싱한다.
4. 커맨드를 `CommandRegistry`로 넘긴다.
5. 결과를 RESP 응답으로 다시 write queue에 넣는다.
6. 이벤트 루프 마지막에서 만료 키를 정리한다.

이 프로젝트는 Redis의 핵심 감각인 **"네트워크 이벤트 처리와 커맨드 실행이 같은 메인 루프 안에서 직렬적으로 돈다"** 는 점을 잘 보여준다.

## 왜 단일 스레드 이벤트 루프인가

Redis를 처음 접하면 "왜 멀티스레드로 더 많이 처리하지 않지?"라는 질문을 하게 된다. 하지만 Redis의 강점은 단순히 CPU를 많이 쓰는 구조가 아니라, **경합을 줄이고 예측 가능한 순서로 커맨드를 실행하는 구조**에 있다.

이 레포도 같은 선택을 한다.

```java
this.db = new MemoryDb(); // single DB (DB 0)
this.broker = new PubSubBroker();
this.lua = new LuaEngine(db, broker, 5_000L, 10_000, 1_000);
CommandRegistry.initDefaults(db, broker, lua);
```

여기서 `MemoryDb`, `PubSubBroker`, `LuaEngine` 모두 하나의 리액터 스레드에서만 접근하도록 설계돼 있다. 그래서 락이나 동기화를 거의 고려하지 않는다.

이 선택의 장점은 명확하다.

- 구현이 단순해진다.
- 커맨드 실행 순서를 예측하기 쉽다.
- 공유 메모리 경쟁이 줄어든다.
- 자료구조를 더 공격적으로 단순화할 수 있다.

반대로 단점도 분명하다.

- CPU를 많이 쓰는 작업은 메인 루프를 막는다.
- 긴 Lua 스크립트나 무거운 명령이 전체 응답성을 해칠 수 있다.
- 수평 확장이나 persistence, replication까지 가면 구조가 크게 복잡해진다.

즉, 이 프로젝트는 Redis의 "빠른 이유"를 멀티스레드가 아니라 **단순한 실행 모델**에서 찾고 있다.

## Redis를 구성하는 네 개의 축

이 레포를 보면 Redis를 다음 네 축으로 나눠 이해할 수 있다.

### 1. 네트워크와 프로토콜

- `Reactor`
- `ClientConn`
- `RespReader`
- `RespWriter`

클라이언트 요청을 읽고 RESP 배열을 파싱해서 argv로 바꾼 뒤, 다시 RESP 응답을 만들어 내보내는 계층이다.

### 2. 커맨드 실행 계층

- `CommandRegistry`
- `StringCommands`
- `HashCommands`
- `ExpireCommands`
- `TxCommands`
- `PubSubCommands`
- `LuaCommands`

Redis의 "명령형 인터페이스"가 코드로 드러나는 부분이다. 결국 Redis는 커맨드 이름과 인자를 받아 상태를 바꾸는 시스템이므로, 이 레이어가 서버의 표면 API가 된다.

### 3. 메모리 keyspace

- `Db`
- `MemoryDb`
- `Record`
- `ExpiryHeap`
- `OpenHashStringMap`

실제 데이터를 어디에 어떻게 저장할지 결정하는 부분이다. 이 레포는 문자열과 해시를 중심으로 최소 구현을 제공한다.

### 4. 확장 기능

- `PubSubBroker`
- `LuaEngine`
- `TxCommands`

단순 key-value를 넘어 Redis가 왜 "데이터 구조 서버"로 보이는지를 설명해 주는 부분이다. 트랜잭션, pub/sub, Lua는 Redis를 단순 캐시 이상으로 만들어 주는 기능들이다.

## 이 구현이 보여주는 Redis의 본질

이 레포에는 실제 Redis의 모든 기능이 들어 있지 않다.

- RDB/AOF persistence 없음
- replication 없음
- cluster 없음
- sorted set, list, stream 등 고급 자료구조 없음
- eviction 정책 없음

그런데도 Redis를 이해하는 데는 충분한 이유가 있다. Redis의 본질은 먼저 다음 두 가지이기 때문이다.

1. **명령을 직렬적으로 실행하는 이벤트 기반 서버**
2. **메모리 자료구조를 직접 다루는 데이터 구조 엔진**

이 프로젝트는 이 두 가지를 지나치게 많은 부가기능 없이 드러낸다.

## 구현 과정에서 눈에 띄는 판단

이 레포의 설계는 "최대한 작은 코드로 핵심을 보여준다"는 방향이 분명하다.

- DB 인터페이스를 최소 메서드 집합으로 유지
- RESP는 command frame 파싱에 필요한 범위만 구현
- TTL은 `ExpiryHeap`으로 단순하게 처리
- Pub/Sub는 `channel -> Set<ClientConn>` 맵으로 구현
- Lua는 `luaj`를 붙이되, 지원 명령과 리소스 제한을 명시적으로 둠

즉, 기능을 늘리는 것보다 **핵심 개념을 코드로 보이게 하는 것**을 우선한 프로젝트다.

## 이 시리즈에서 볼 것

이후 글에서는 다음 순서로 들어간다.

1. RESP와 Reactor로 보는 요청 처리 흐름
2. `MemoryDb`, `ExpiryHeap`, `OpenHashStringMap`으로 보는 저장 구조
3. `MULTI/EXEC`, Pub/Sub, Lua로 보는 Redis의 확장 방식

요약하면, 이 레포는 "Redis를 그대로 복제한 프로젝트"라기보다 **Redis가 왜 그런 구조를 택했는지 해부하기 좋은 작은 실험실**에 가깝다. 그래서 구현을 읽는 과정 자체가 곧 Redis 아키텍처를 공부하는 과정이 된다.
