---
title: MemoryDb, TTL, Hash 구조로 보는 Redis keyspace 설계
date: 2026-03-27
categories: [Notes, Redis]
tags: [Redis, In-Memory, TTL, Hash]
series: redis-lite-java
series_title: redis-lite-java로 이해하는 Redis 구현
series_order: 3
series_description: redis-lite-java 레포를 바탕으로 Redis의 아키텍처와 동작 원리를 구현 관점에서 해설하는 시리즈.
status: published
---

## Redis는 결국 메모리 자료구조 서버다

Redis를 관계형 DB처럼 보면 이해가 꼬이기 쉽다. Redis의 핵심은 SQL 엔진이 아니라, **메모리 안에 keyspace를 두고 자료구조 단위의 명령을 실행하는 것**이다.

`redis-lite-java`에서도 그 중심은 `MemoryDb`다.

```java
private final Map<String, Record> map = new HashMap<>();
private final ExpiryHeap heap = new ExpiryHeap();
```

즉, 이 구현은 아주 직접적으로 말하면 "문자열 key를 `Record`로 매핑하는 자바 맵"이다. 그리고 그 위에 타입, TTL, hash 연산을 얹는다.

## 1. Record가 값 타입을 감싼다

`Record`는 현재 이 프로젝트가 지원하는 값 타입을 담는 래퍼다.

```java
enum Type {STR, HASH}

Type type;
String strVal;
OpenHashStringMap hashVal;
long expireAtMs = -1L;
```

이 구조가 단순하지만 중요한 이유는, Redis keyspace가 결국 "모든 key가 같은 타입을 가지는 것이 아니라, key마다 자료구조 타입이 다를 수 있다"는 사실을 보여주기 때문이다.

즉:

- 어떤 키는 문자열
- 어떤 키는 해시
- 어떤 키는 TTL 없음
- 어떤 키는 만료 시각 보유

라는 식으로 하나의 keyspace 안에 서로 다른 자료구조가 섞여 있다.

## 2. 타입 체크는 keyspace 계층에서 수행된다

예를 들어 해시 명령을 문자열 키에 적용하면 Redis는 WRONGTYPE 오류를 준다. 이 프로젝트도 같은 방향으로 간다.

```java
if (r.type != Record.Type.HASH) {
    throw new WrongTypeException();
}
```

이 부분이 중요한 이유는 Redis 명령이 "문자열 키를 받아도 실제 의미는 자료구조 타입에 따라 달라진다"는 점을 보여주기 때문이다.

즉, 커맨드는 key만 보는 것이 아니라 **key가 가리키는 값의 타입**까지 같이 본다.

## 3. TTL은 passive + active expiration으로 처리한다

Redis의 만료 처리는 생각보다 중요하다. 단순히 "시간 지나면 지운다" 정도가 아니라, **어떤 시점에 어떤 비용으로 정리할지**가 keyspace 설계에 영향을 준다.

이 프로젝트는 두 가지 전략을 함께 쓴다.

### Passive expiration

키에 접근할 때 만료 여부를 확인하고, 이미 만료됐으면 그 자리에서 제거한다.

```java
if (isExpired(r, System.currentTimeMillis())) {
    map.remove(key);
    return null;
}
```

즉, 읽는 순간 정리하는 방식이다.

### Active expiration

이벤트 루프 말미에서 `ExpiryHeap`을 확인하고, 만료 시각이 지난 키를 batch로 제거한다.

```java
db.expireDue(nowMs, EXPIRE_BATCH_LIMIT);
```

즉, 접근이 없더라도 주기적으로 정리한다.

이 조합은 Redis를 이해할 때 중요하다. 만료 키 처리는 "정확히 그 시각에 무조건 즉시 삭제"가 아니라, **접근 시점 + 백그라운드 정리의 조합**으로 보는 편이 맞다.

## 4. 왜 ExpiryHeap을 따로 두는가

TTL은 각 레코드에 `expireAtMs`로 저장되지만, 그렇다고 매 루프마다 전체 keyspace를 스캔하면 비효율적이다.

그래서 이 프로젝트는 별도 min-heap을 둔다.

```java
final class ExpiryHeap {
    static final class Node {
        final String key;
        final long expireAtMs;
    }
}
```

heap의 top은 "가장 빨리 만료될 키"다. 따라서 다음 만료 시각까지의 delay를 계산해서 `select()` timeout에도 반영할 수 있다.

```java
long delayMs = db.nextExpiryDelayMillis(nowMs);
selector.select(Math.max(1, Math.min(delayMs, 1000)));
```

즉, 네트워크 이벤트 루프와 TTL 스케줄링이 완전히 분리돼 있지 않고, 하나의 메인 루프 안에서 같이 움직인다.

## 5. 왜 heap은 append-only에 가깝게 유지하는가

`ExpiryHeap` 구현 설명에서 흥미로운 점은, TTL 변경 시 heap 안의 예전 엔트리를 직접 수정하지 않는다는 점이다.

대신 새 `(key, expireAtMs)`를 push하고, pop 시점에 현재 DB 상태와 비교해서 유효한지 확인한다.

이 전략의 장점:

- 구현이 단순하다.
- decrease-key 같은 복잡한 연산이 필요 없다.
- 단일 스레드 모델과 잘 맞는다.

대신 trade-off도 있다.

- heap 안에 stale entry가 남을 수 있다.
- pop 시 검증 비용이 추가된다.

하지만 교육용 구현과 단일 스레드 keyspace에서는 충분히 합리적인 선택이다.

## 6. Hash는 별도 자료구조를 사용한다

문자열 값은 그냥 `String`으로 저장하면 되지만, hash는 field-value 집합이 필요하다. 이 프로젝트는 이를 위해 `OpenHashStringMap`을 직접 구현했다.

```java
public final class OpenHashStringMap {
    private String[] keys;
    private String[] vals;
    private byte[] states; // 0=empty, 1=used, 2=deleted
}
```

특징은 다음과 같다.

- open addressing
- linear probing
- tombstone 사용
- load factor가 높아지면 rehash

즉, 자바 기본 `HashMap`을 그대로 쓰는 대신, Redis가 내부적으로 자료구조를 직접 설계하는 감각을 흉내 낸 셈이다.

## 7. 왜 직접 해시맵을 만들었는가

교육용 구현에서 직접 자료구조를 만드는 이유는 단순하다. Redis를 이해하려면 "키 하나가 다시 내부 자료구조를 가진다"는 점을 몸으로 봐야 하기 때문이다.

Redis는 string, hash, list, set, zset를 모두 같은 방식으로 저장하지 않는다. 값 타입에 따라 내부 표현이 달라진다. 이 프로젝트에서 `OpenHashStringMap`을 따로 둔 것은 그 점을 잘 드러낸다.

## 8. keyspace 설계에서 보이는 Redis스러운 감각

이 구현은 아주 작지만 Redis스러운 판단을 여러 개 담고 있다.

- keyspace는 단일 맵으로 단순화
- 값 타입은 `Record`로 캡슐화
- TTL은 키 자체 속성과 별도 스케줄 구조를 조합
- 만료는 lazy + active 혼합
- 해시는 별도 내부 자료구조 사용

즉, Redis는 단순 key-value 저장소가 아니라 **keyspace 위에 자료구조와 수명 정책을 얹은 서버**라는 사실이 드러난다.

다음 글에서는 그 위에 올라가는 고수준 기능, 즉 `MULTI/EXEC`, Pub/Sub, Lua를 중심으로 이 프로젝트가 Redis의 확장성을 어떻게 구현했는지 본다.
