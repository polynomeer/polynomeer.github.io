---
title: Preventing Cache Write Amplification under High Concurrency
date: 2025-08-13
categories: [Notes, Cache]
tags: [Cache, Redis, Distributed Lock, Redisson]
---

```java
@Service
public class PriceQueryServiceImpl implements PriceQueryService {
    private final CachePriceRepository redisRepository;
    private final TimeSeriesPriceRepository timeSeriesRepository;

    @Override
    public Price getCurrentPrice(String tickerCode) {
        return redisRepository.find(tickerCode)
                .map(cached -> cached)
                .or(() -> timeSeriesRepository.findLatest(tickerCode)
                        .map(latest -> {
                            redisRepository.save(tickerCode, latest);
                            return latest;
                        }))
                .orElseThrow(() -> new PriceNotFoundException(PriceErrorCode.PRICE_NOT_FOUND));
    }
}
```

위 코드에서 수 많은 요청 n개가 동시에 or 블록에 진입하게 되면, 불필요한 중복 쓰기가 redis에 다수 발생할 것이다. 이 문제를 해결할 방법은 어떤게 있을까? 상황/트래픽 패턴에 따라 아래 전략들을 조합하면 **다른 축**으로 증폭을 줄일 수 있다.

## 전제: 지금 문제의 본질

이 문제의 핵심 원인을 파악해보자. 우선, 문제의 흐름은 다음과 같다.
동시 `n`요청이 **같은 키**로 **같은 순간(동시)** 미스 → 모두 DB 조회/캐시 쓰기 시도 ⇒ 쓰기/쿼리 증폭

예를 들면,

1. `GET /price/AAPL` 요청이 1,000개 동시에 들어오는 경우에
2. 캐시 TTL이 만료된 시점이어서 모두 `cache.find("AAPL") → miss` 이고 miss 로직을 실행한다.
3. 결과적으로 아래의 세 가지 경우가 발생할 수 있고, 동시에 모두 발생할 수도 있다.
   - 1,000번 DB를 조회
   - 1,000번 Redis를 SET
   - 1,000번 외부 API 호출 -> 이 부분은 직접호출을 막고 별도 모듈로 구성한다면 방지할 수 있다.

심지어 DB나 API는 **같은 값을 반환하는데도** 매번 처리해야하므로 매우 비효율적이다. 최악의 경우 DB나 Redis가 병목지점이 되고, 심하면 서버가 다운될 수 있다.

### 문제가 되는 부분

- 쓰기 증폭(write amplification): TTL이 짧을수록 많은 요청이 동시에 미스되고 -> 같은 값을 수천번 쓰기가 발생할 수 있다.
- 쿼리 폭발: DB or API 호출이 캐시보다 느리기 때문에 동시에 접근하면 병목 가능성이 있다.
- 리소스 낭비: 매번 동일한 결과를 얻는데도 불필요한 작업이 발생한다.
- 스케일 저하: 원래 1만 QPA를 처리하던 시스템이라고 할 때, 미스 스톰으로 수백 QPS까지 떨어질 수 있다.
- TTL 집단 만료(thundering herd): 특정 시간대(예: 자정, 장 시작 직전)에 TTL이 한꺼번에 만료되면 캐시 접근이 집중되어 폭주할 수 있다.

---

## 문제 해결 전략

- 해결 축: **(A) 미스 자체를 줄이기** / **(B) 동시 요청을 합치기** / **(C) 쓰기를 중앙집중화/지연** / **(D) 덮어쓰기 방지(CAS)**

### A. 미스 자체를 줄이는 방법

1) 2‑계층 캐시 (Caffeine + Redis)

- **아이디어**: 로컬 Caffeine(짧은 TTL, `refreshAfterWrite`) + Redis(조금 더 긴 TTL).
- **효과**: 대부분의 급폭 트래픽이 **노드 내**에서 흡수 → 같은 노드에서는 미스 동시성 거의 소멸.
- **장점**: 코드 단순, 락 불필요.
- **주의**: cross‑node 일관성 약함(허용되는 읽기 제품군에 적합).

> Spring Cache 예: `@Cacheable(cacheNames="priceL1", sync=true)` + 커스텀 CacheManager로 L2(Redis) 연계.

2. TTL 랜덤화 + 조기 리프레시(저지연 프리웜)

- **아이디어**: `TTL = base ± jitter`로 **집단 만료(thundering herd)** 분산. 만료 임박(예: 남은TTL < 10%) 시 **백그라운드로 재적재**.
- **효과**: 특정 시점 동시 미스 확률 급감.
- **장점**: 구현 쉬움.
- **주의**: 백그라운드 리프레시 스레드/큐 필요.

### B. 동시 요청을 “합치기”(coalescing)

3) 게이트웨이/서버단 **요청 결합(Request Collapsing)**

- **아이디어**: 같은 키 + 짧은 윈도(예: 20~50ms) 내 요청을 묶어 **한 번만** 다운스트림 호출, 결과 브로드캐스트.
- **장점**: 락 없이 자연스러운 합치기, 고QPS에서 특히 효율적.
- **주의**: 응답 지연이 창 크기만큼 늘어남(수십 ms 내에서 타협).

> 구현 힌트: per‑key `Subject/Emitter` 맵 + 타임윈도(close on first emit or after X ms).

4. **Actor/Shard** 패턴 (키‑컨시스턴트 라우팅)

- **아이디어**: 키 해시로 **단일 처리자**에게 보냄(예: `Kafka/Redis Stream → 소비자 수=N개, 파티션=많게`). 소비자만 DB→캐시 쓰기 수행, 나머지는 캐시 읽기만.
- **장점**: **클러스터 전체에서 쓰기 단일화**, 배치/버퍼링도 쉬움.
- **주의**: 파이프라인 지연(수십 ms~) 가능, 인프라 구성 필요.

### C. 쓰기를 중앙집중/지연

5) **Write‑behind 큐(비동기 캐시 채움)**

- **아이디어**: 미스 시 **즉시 DB 읽고 응답은 반환**하되, 캐시 쓰기는 **큐에 넣어** 소비자가 처리(중복 제거 가능).
- **장점**: 핫키 폭주 시에도 쓰기 횟수를 큐가 **디중복(de‑dup)**.
- **주의**: 응답 직후 잠깐의 캐시 공백 허용 필요.

6) **배치(merge)** 저장

- **아이디어**: 짧은 창(예: 100ms) 모아 한 번에 Redis 파이프라인/멀티 명령.
- **장점**: 네트워크 O/H 감소, 병합으로 중복 제거.
- **주의**: 최신성 요구가 높으면 창 크기를 매우 작게.

### D. 덮어쓰기 방지/경합 안전

7) **WATCH/MULTI (CAS) 또는 버전 키(E‑Tag)**

- **아이디어**: Redis `WATCH key` 후 DB→`MULTI/EXEC`으로 **버전 일치 시에만** `SET`; 혹은 값에 `version` 들고 `SET if version==X`.
- **효과**: 누가 먼저 썼으면 **뒤늦은 쓰기는 실패/스킵** → 중복 쓰기 차단.
- **장점**: 분산락 없이 **낙관적 동시성 제어**.
- **주의**: 실패 시 재시도 로직 필요(보통은 스킵).

8) **Lua 스크립트로 원자적 “존재하면 스킵” + “짧은 보호 TTL”**

- **아이디어**: 단일 Lua에서 `EXISTS`→없으면 `SET value; SETNX guard 50ms` 식의 **짧은 가드 키**로 극단적 경합 회피.
- **장점**: RTT 1회, 단순.
- **주의**: 가드 TTL/재시도 백오프 튜닝 필요.

### E. 데이터 특성 활용

9) **음수 캐싱(Negative Cache)**

- **아이디어**: “없는 종목/현재가 없음”을 **짧은 TTL로 캐싱**.
- **효과**: 미존재 키에 대한 DB/쓰기 폭주 방지.
- **주의**: 데이터가 생겼을 때 무효화 경로 필요.

10) **근사 허용: Stale‑While‑Revalidate**

- **아이디어**: 만료 후 **짧은 유예기간** 동안엔 **구 캐시를 읽기**로 내보내고, **백그라운드**에서 최신화.
- **효과**: 사용자 레이턴시 최소화, 동시 미스 거의 사라짐.
- **주의**: 강한 일관성이 요구되면 부적합.

### F. 운영적 장치

11) **핫키 보호(Hot Key Shield)**

- **아이디어**: 특정 키 QPS가 임계 넘으면 **쿨다운(서킷/토큰버킷)** 적용, 쓰기/DB 진입을 페이스다운.
- **장점**: 스파이크 완충.
- **주의**: 극단 상황에서 일부 요청은 구값/오류 허용.

12) **프리웨밍(Pre‑warm) & 스케줄드 리프레시**

- **아이디어**: 인기 티커 상위 K개를 **주기적으로 갱신**해서 사용자 피크를 선제 흡수.
- **장점**: 단순하면서 체감 효과 큼.
- **주의**: 랭킹 추적/조정 필요.

### 선택 가이드

- **코드 간단 + 효과 즉시**: (1) 2‑계층 캐시 + (2) TTL‑jitter + (10) SWR
- **락 없이 안전한 쓰기 억제**: (7) WATCH/MULTI(CAS) 또는 (8) Lua 원자화
- **고QPS/다노드**: (3) 요청 결합 + (4) Actor/Stream + (5) 비동기 쓰기
- **미존재 폭주**: (9) 음수 캐싱

---

## 해결 전략 선택 및 구현

스프링 기반에서 가장 간단한 구현은 아래와 같다. 로컬 캐시에서 캐시 미스를 완화하거나 중복요청을 애플리케이션 레벨에서 자체적으로 막아버리는 방식이다.

### 예시 A) Caffeine L1 + SWR (락 없음)

```java
@Cacheable(cacheNames = "priceL1", sync = true) // 노드 내 single-flight
public Price getCurrentPrice(String code) {
    // 1) Redis 먼저 조회
    return redis.find(code).orElseGet(() -> {
        // 2) 만료/미스면 DB 조회
        Price p = db.findLatest(code).orElseThrow(NotFound::new);
        // 3) Redis에 짧은 TTL+jitter로 저장
        redis.set(code, p, ttlWithJitter(3, 1, TimeUnit.SECONDS));
        return p;
    });
}
// 백그라운드 리프레시: 스케줄러로 인기키만 미리 갱신 or caffeine refreshAfterWrite 사용
```

### 예시 B) 낙관적 CAS (WATCH/MULTI)

```java
Price p = db.findLatest(code).orElseThrow(NotFound::new);
redis.watch(key);
Optional<Price> existing = redis.get(key);
redis.multi();
if (existing.isEmpty()) {
  redis.setNx(key, p, ttl);
}
// else: 최신이 이미 들어갔으면 아무 것도 안 함
boolean ok = redis.exec(); // 실패면 다른 요청이 앞서 쓴 것 → 그냥 스킵
return p;
```

### 실제 해결 전략

실제로 선택하여 구현한 방식은 다음과 같다. 우선, 앞서 제시한 해결 전략은 크게 4가지이다. A. cache miss 자체를 줄이기, B. 동시 요청을 합치기, C. 쓰기를 중앙집중화, 지연, D. 덮어쓰기 방지 -> 이 해결전략을 구현하기 위해서 아래의 방식을 적용했다.

```java
@Service
public class PriceQueryServiceImpl implements PriceQueryService {
    private final CachePriceRepository redisRepository;
    private final TimeSeriesPriceRepository timeSeriesRepository;
    private final ConcurrentHashMap<String, CompletableFuture<Price>> flights = new ConcurrentHashMap<>();
    private static final Duration BACKOFF = Duration.ofMillis(30);
    private static final int RETRIES = 2;

    @Override
    public Price getCurrentPrice(String tickerCode) {
        return flights
                .computeIfAbsent(tickerCode, k -> CompletableFuture.supplyAsync(() -> loadOnce(k)))
                .whenComplete((r, t) -> flights.remove(tickerCode))
                .join();
    }

    private Price loadOnce(String tickerCode) {
        var cached = redisRepository.find(tickerCode);
        if (cached.isPresent()) {
            return cached.get();
        }

        for (int i = 0; i < RETRIES; i++) {
            sleepQuietly(BACKOFF);
            var again = redisRepository.find(tickerCode);
            if (again.isPresent()) {
                return again.get();
            }
        }

        var latest = timeSeriesRepository.findLatest(tickerCode)
                .orElseThrow(() -> {
                    return new PriceNotFoundException(PriceErrorCode.PRICE_NOT_FOUND);
                });

        var existing = redisRepository.find(tickerCode);
        if (existing.isPresent() && existing.get().equals(latest)) {
            return latest;
        }

        boolean wrote = redisRepository.saveIfAbsent(tickerCode, latest);
        return latest;
    }

    private void sleepQuietly(Duration d) {
        try {
            Thread.sleep(d.toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

1. 로컬 single flight: 같은 키에 대한 동시 호출을 인스턴스 내에서 1번만 로드 -> B에 대한 구현전략
2. 분산락(SETNX + EX): 다중 인스턴스 환경에서 “로더”를 1명만 선출 -> C에 대한 전략
3. 조건부 저장(NX): 캐시에 없는 경우에만 저장(다른 요청이 이미 써뒀으면 skip) -> D에 대한 전략
4. 락을 획득하지 못한 스레드는 잠깐 대기 후 재조회: 승자가 캐시를 채울 시간을 준 뒤 캐시에서 바로 반환
   (그래도 없으면 DB 읽기하되 쓰기 생략) -> B, C, D 종합 전략

해결전략을 적용했을 때의 실제 시나리오는 다음과 같다. n개의 동시 요청 → 인스턴스당 1번 DB 조회, 클러스터 전체 1번 Redis 쓰기가 되도록 수렴. 나머지는 짧은 backoff 후 캐시 히트로 응답 (혹은 DB만 읽고 쓰기 생략)
