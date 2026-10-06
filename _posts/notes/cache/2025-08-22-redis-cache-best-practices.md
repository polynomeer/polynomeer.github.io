---
title: Redis Cache Best Practices
date: 2025-08-22
categories: [Notes, Cache]
tags: [Redis, Cache, Caching Strategy]
---

## Redis를 붙였다고 캐시 전략이 끝나는 것은 아니다

Redis는 빠르지만, 캐시 설계가 잘못되면 장애를 더 빠르게 전파할 수도 있다. 중요한 것은 Redis 자체보다 무엇을, 얼마나 오래, 어떤 방식으로 캐시할지를 정하는 일이다.

## 기본 흐름: 캐시를 먼저 보고 없으면 원본에서 채운다

가장 흔한 구성은 애플리케이션이 캐시를 먼저 조회하고, 없을 때만 원본(DB나 외부 API)을 읽어 캐시에 넣는 방식이다. 흔히 cache-aside라고 부른다.

```java
public Product findProduct(long id) {
    String key = "product:" + id;
    String cached = redis.get(key);
    if (cached != null) {
        return deserialize(cached);            // hit
    }
    Product product = productRepository.findById(id).orElseThrow(); // miss: 원본 조회
    redis.setex(key, 600, serialize(product)); // TTL 10분과 함께 저장
    return product;
}
```

이 구조에서 데이터를 바꾸는 쪽은 원본을 먼저 갱신하고 캐시 키를 지운다. 다음 조회가 새 값으로 다시 채운다. 아래의 원칙들은 대부분 이 흐름의 각 단계에서 나온다.

## 기본 원칙

### 키를 명확히 설계

키는 사람이 읽기 쉬우면서도 충돌을 피해야 한다.

- `product:123`
- `user-profile:v2:42`
- `feed:home:region:kr`

버전 정보와 도메인 prefix를 포함하면 무효화 전략과 스키마 변경 대응이 쉬워진다. 예를 들어 `user-profile`의 직렬화 형식이 바뀌면 `v3` prefix로 새 키를 쓰기 시작하고, 이전 `v2` 키는 TTL로 자연스럽게 사라지게 둘 수 있다. 배포 중에 이전 버전과 새 버전 서버가 섞여 있어도 서로의 데이터를 잘못 읽지 않는다.

### TTL에 근거를 두기

TTL이 너무 짧으면 미스가 잦아지고, 너무 길면 오래된 데이터가 남는다. 데이터 변경 주기와 허용 가능한 stale window를 기준으로 정하는 편이 낫다.

같은 시점에 대량으로 채운 키에 같은 TTL을 주면 같은 시점에 함께 만료된다. 그 순간 원본으로 요청이 몰린다. TTL에 작은 무작위 값을 더해 만료 시점을 흩어 두면 이 집중을 줄일 수 있다. 인기 키 하나가 만료되는 순간 요청이 몰리는 문제는 [캐시 스탬피드](/posts/cache-stampede/)에서 따로 다뤘다.

### 미스 비용을 같이 보기

캐시는 결국 미스가 났을 때 원본 저장소가 감당할 수 있어야 의미가 있다. DB, 외부 API, 계산 비용을 함께 고려해야 한다.

Redis가 재시작되거나 장애로 비어 있는 상태를 생각해 보면 이 원칙이 왜 필요한지 보인다. 그 순간 모든 요청이 미스가 되어 원본으로 간다. 원본이 평소 트래픽의 몇 배를 견딜 수 없다면, 캐시는 성능 장치가 아니라 원본을 지탱하는 필수 구성 요소가 된 것이다.

## 메모리가 가득 찼을 때: eviction 정책

Redis는 `maxmemory`로 데이터에 쓸 메모리 상한을 정한다. 64비트 시스템에서 기본값은 0이고, 이는 제한이 없다는 뜻이다([Redis: Key eviction](https://redis.io/docs/latest/develop/reference/eviction/)). 캐시로 쓴다면 상한을 정하고, 상한에 도달했을 때의 동작을 `maxmemory-policy`로 고른다.

| 정책 | 동작 |
| --- | --- |
| `noeviction` | 키를 지우지 않고, 새 데이터를 넣는 명령에 오류를 낸다. 읽기 명령은 계속 동작한다 |
| `allkeys-lru` | 전체 키 중 가장 오래 사용되지 않은 키를 지운다 |
| `allkeys-lfu` | 전체 키 중 가장 드물게 사용된 키를 지운다 |
| `volatile-lru`, `volatile-lfu` | TTL이 있는 키 중에서만 LRU, LFU로 지운다 |
| `volatile-ttl` | TTL이 있는 키 중 남은 TTL이 가장 짧은 키를 지운다 |
| `allkeys-random`, `volatile-random` | 무작위로 지운다 |

문서는 일부 키가 나머지보다 훨씬 자주 읽힐 것으로 예상된다면 `allkeys-lru`가 무난한 기본값이라고 권한다. 주의할 점은 `volatile-*` 정책이다. TTL이 있는 키가 하나도 없으면 이 정책들은 `noeviction`처럼 동작한다. TTL 없이 캐시를 채우다가 메모리가 차면 쓰기 오류가 나는 이유가 여기에 있다.

Redis의 LRU는 정확한 LRU가 아니라 근사다. 키 몇 개를 무작위로 샘플링해 그중 가장 오래 사용되지 않은 키를 지우고, 샘플 수는 `maxmemory-samples`로 조절한다. 복제나 AOF 영속화를 함께 쓰면 그 버퍼 메모리는 `maxmemory` 비교에 포함되지 않으므로, 상한을 정할 때 여유를 남겨 두라고 문서는 권한다.

## 자주 하는 실수

- 모든 데이터를 Redis에 넣으려 한다.
- TTL 없이 영구 캐시처럼 사용한다.
- 큰 객체를 무분별하게 직렬화한다.
- 무효화 전략 없이 덮어쓰기만 반복한다.
- hot key를 방치한다.

큰 객체가 문제인 이유는 Redis가 대부분의 요청을 하나의 프로세스가 한 번에 하나씩 처리하는 구조이기 때문이다([Redis: Diagnosing latency issues](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/)). 수 MB짜리 값을 읽고 쓰는 동안 다른 요청은 기다리고, 네트워크로 옮기는 시간도 길어진다. 큰 키를 지울 때도 `DEL`은 메모리 회수까지 그 자리에서 하지만, `UNLINK`는 키를 바로 떼어 내고 메모리 회수는 다른 스레드에서 한다([Redis: UNLINK](https://redis.io/docs/latest/commands/unlink/)).

키를 찾을 때 `KEYS`를 쓰는 것도 같은 맥락의 실수다. 공식 문서는 큰 데이터베이스에서 성능을 망칠 수 있으므로 일반 애플리케이션 코드에서 `KEYS`를 쓰지 말고 `SCAN`이나 Set을 고려하라고 경고한다([Redis: KEYS](https://redis.io/docs/latest/commands/keys/)).

## 큰 키와 hot key 찾기

`redis-cli`에는 키 공간을 분석하는 모드가 있다([Redis CLI](https://redis.io/docs/latest/develop/tools/cli/)).

```bash
redis-cli --bigkeys   # 원소 수가 많은 키
redis-cli --memkeys   # 메모리를 많이 쓰는 키
redis-cli --hotkeys   # 자주 접근되는 키 (LFU 정책일 때만 동작)
```

`--bigkeys`와 `--memkeys`는 `SCAN` 기반이라 바쁜 서버에서도 실행할 수 있고, `-i 0.01`처럼 간격을 주면 부하를 더 줄일 수 있다. `--hotkeys`는 `maxmemory-policy`가 LFU 계열일 때만 동작한다. LFU 정책이 키별 접근 빈도를 추적하기 때문이다.

hot key를 찾았다면 그 키를 애플리케이션 로컬 캐시에 한 번 더 두거나, 키를 여러 개로 복제해 읽기를 나누는 방식을 검토한다.

## 운영 지표

- hit ratio (`INFO stats`의 `keyspace_hits`, `keyspace_misses`)
- eviction 발생량 (`evicted_keys`)
- key/value 크기
- TTL 분포
- hot key 존재 여부
- 네트워크 왕복 지연

앞의 두 지표를 읽는 법은 [Redis Key eviction 문서](https://redis.io/docs/latest/develop/reference/eviction/)에 있다.

hit ratio는 `keyspace_hits / (keyspace_hits + keyspace_misses) * 100`으로 계산한다. 문서가 제시하는 해석 순서는 이렇다. hit ratio가 기대보다 낮으면 `evicted_keys`를 본다. eviction이 많다면 정책이 엉뚱한 키를 자주 지우고 있다는 뜻이다. eviction은 적은데 hit ratio가 낮다면 `expired_keys`를 본다. 만료가 많다면 TTL이 너무 짧거나 만료시킬 키를 잘못 고른 것이다. `EXISTS`로 없는 키를 확인한 것도 miss로 집계된다는 점도 함께 기억해 둔다.

네트워크 지연은 `redis-cli --latency`로 확인할 수 있다. `PING` 왕복 시간을 반복해서 재 최소, 최대, 평균을 밀리초로 보여 준다.

Redis는 메모리 기반이라 빠르지만, 여전히 원격 네트워크 호출이다. [로컬 캐시와 함께 2계층으로](/posts/cache-write-under-high-concurrency/) 설계하는 이유도 여기에 있다. CPU 캐시부터 CDN까지 계층마다 캐시가 어떤 역할을 하는지는 [모든 계층에서의 캐싱](/posts/cache-across-layers/)에 정리했다.

## 정리

Redis 캐시 운영의 핵심은 "무조건 넣는다"가 아니라, 비용이 큰 읽기를 어디까지 흡수하고 stale 데이터를 어디까지 허용할지를 명확히 정하는 데 있다.

## 참고

- [Key eviction](https://redis.io/docs/latest/develop/reference/eviction/) — Redis Docs
- [Redis CLI](https://redis.io/docs/latest/develop/tools/cli/) — Redis Docs
- [KEYS](https://redis.io/docs/latest/commands/keys/) — Redis Docs
- [UNLINK](https://redis.io/docs/latest/commands/unlink/) — Redis Docs
- [Diagnosing latency issues](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/) — Redis Docs
