---
title: 캐시 스탬피드(Cache Stampede)
date: 2025-04-22
categories: [Notes, Cache]
tags: [Cache, Redis]
---

## 캐시 스탬피드(Cache Stampede)란?

캐시 스탬피드는 많은 요청이 동시에 같은 캐시 키를 조회하는 순간, 그 키가 비어 있거나 만료되어 원본 저장소로 요청이 한꺼번에 몰리는 현상이다. 평소에는 캐시가 흡수하던 부하가 한순간에 DB나 외부 API로 전환되기 때문에, 응답 시간 급증과 장애로 이어지기 쉽다.

같은 미스를 보는 요청 수는 요청률뿐 아니라 재계산 시간에도 달려 있다. [Vattani 등(2015)](https://www.vldb.org/pvldb/vol8/p886-vattani.pdf)의 예로, 초당 10번 조회되는 항목의 재계산에 3초가 걸리면 30개 요청이 같은 항목을 다시 계산한다. 재계산이 몰리면 원본이 느려지고, 느려진 만큼 재계산 시간이 늘어 스탬피드에 합류하는 요청도 늘어난다. 논문은 이 때문에 캐시 스탬피드를 연쇄 장애(cascading failure)로 분류한다.

아래의 간단한 예시를 통해 발생원인을 쉽게 이해할 수 있다.

```
			사용자1       	사용자2       	사용자3       	사용자N 	...
			   │             │             │             │
			   └─────┬───────┴─────┬───────┴─────┬─────▶▶▶▶▶▶▶▶
			         │             │             │
			요청1					 요청2					요청3
			         ↓             ↓             ↓
                ┌───────────────────────┐
                │   캐시 서버 (Redis 등)   │
                └────────────┬──────────┘
                             ↓
                   [Cache Miss 발생]
                             ↓
              ┌────────────┬────────────┬────────────┐
              ↓            ↓            ↓            ↓
           사용자1       사용자2       사용자3      사용자N
              │            │            │            │
              │    동시에 백엔드 서버(DB)에 요청           │
              │            │            │            │
              ↓            ↓            ↓            ↓
              ┌────────────────────────────────────┐
              │        🔥 DB 서버 과부하 발생          │
              └────────────────────────────────────┘
```


### 예시

1. 어떤 상품 정보가 `cache:product:123`에 저장되어 있고, 유효시간은 10분이다.
2. 10분 후 캐시가 만료됨.
3. 수천 명의 사용자가 동시에 `/product/123`을 조회함.
4. 모두 캐시 미스 → DB로 동시에 쿼리 → 부하 폭주 → DB 병목 → 서비스 지연/장애.

문제상황을 시간의 흐름순으로 보면 다음과 같다.

```
Client A           Client B           Redis Cache            Database
   │                  │                    ⍗                      │
   │                  │              (Key expires)                │
   │                  │                    │                      │
   │──── GET key ─────│───────────────────▶x                      │
   │                  │──── GET key ──────▶x                      │
   │                  │                    │                      │
   │                  │                    │                      │
   │──────────────────│────────────────────│───── Query ─────────▶│
   │                  │────────────────────│───── Query ─────────▶│
   │                  │                    │                      │
   │◀︎─────────────────│────────────────────│───── Result ─────────│
   │                  │◀︎───────────────────│───── Result ─────────│
   │                  │                    │                      │
   │──────────────────│── SET key (dup) ──▶⍗                      │
   │                  │── SET key (dup) ──▶⍗                      │

```

### 구성 요소

- `Client A`, `Client B` : 사용자 요청자
- `Redis Cache` : 캐시 서버 (예: Redis)
- `Database` : 원본 데이터 소스

### 문제 포인트

- `Key expires`: Redis 캐시 만료
- `Duplicate read`: 여러 클라이언트가 동시에 캐시 미스 → DB에 중복 조회 발생
- `Duplicate write`: 동일한 키를 여러 클라이언트가 중복으로 SET

---

## 해결 전략

### 1. Mutex Lock (분산 락 기반 단일 DB 접근)

```
Client A       Client B       Cache         RedisLock      Database
   │              │              │               │              │
   │───GET(key)───│─────────────▶│               │              │
   │              │───GET(key)──▶│               │              │
   │              │              │─────miss─────▶│              │
   │              │              │               │───tryLock───▶│
   │              │              │               │◀───success───│
   │              │              │               │              │───query───▶
   │              │              │               │              │◀──result───
   │              │              │◀──set cache───│              │
   │◀──return ───────────────────│               │              │
   │              │◀──return─────│               │              │
```

- 첫 요청(Client A)이 락 획득 → DB 접근
- 이후 요청(Client B)은 대기 → 캐시 갱신 후 반환

#### 설명

- 캐시 미스 발생 시, 첫 번째 요청만 DB에 접근하도록 락을 걸고,
- 나머지 요청은 락이 풀릴 때까지 잠시 대기하거나 재시도하여 DB 폭주를 막음.

Vattani 등은 이 방식의 비용을 함께 적는다. 락을 얻지 못한 요청은 돌려줄 값이 없으므로, 클라이언트가 값 없음을 처리하게 하거나, 재생성을 기다리게 하거나, 이전 값(stale)을 남겨 두고 내주는 방법 중 하나를 정해야 한다. 락을 거는 쓰기가 한 번 더 생기고, 락을 쥔 요청이 재계산 중에 실패하면 락이 만료될 때까지 값이 없거나 이전 값이 나간다.

#### 장점

- 중복 DB 접근 제거 → DB 부하 최소화
- 한 번만 DB 조회 후 캐시 채움 → 효율적

#### 단점 / 고려사항

- 락 구현이 필요: `Redis SETNX`, `Redisson RLock`, `ZooKeeper` 등
- 락 획득 실패 시 fallback 로직 설계 필요
- 데드락 방지를 위해 TTL 설정 필수. Redis에서는 `SET key value NX EX seconds` 한 명령으로 락 획득과 만료를 함께 건다. 다만 [Redis SET 문서](https://redis.io/docs/latest/commands/set)는 이 단일 인스턴스 락 패턴보다 Redlock을 권한다. Redlock에 대한 반론은 [Kleppmann 「How to do distributed locking」 리뷰](/posts/kleppmann-distributed-locking/)에서 다뤘다.
- 분산 환경에서 락 키 충돌 방지 필요

---

### 2. TTL + Jitter (만료시간 분산)

```
Client A        Client B        Cache
   │               │              │
   │───── set(key, TTL+12s) ─────▶│
   │───── set(key, TTL+25s) ─────▶│
   │───── set(key, TTL+40s) ─────▶│
   │               │              │
   │────── GET(key) @10s ────────▶│
   │◀─── HIT ──────────────────── │
   │──── GET(key) @20s ──────────▶│
   │◀─── HIT ──────────────────── │
   │──── GET(key) @40s ──────────▶│
   │◀─ MISS ───────────────────── │
```

#### 설명

- 캐시 TTL에 약간의 랜덤값을 더해서 만료시간을 분산시킨다. 같은 시각에 함께 만료되는 키가 줄어, 동시 만료로 인한 스탬피드를 막는다.
- 예: `TTL = 600 + random(0~60)  `

#### 장점

- 매우 간단하게 구현 가능
- TTL 지정은 대부분의 캐시 시스템이 지원한다 (`ehcache`, `Redis` 등). 랜덤값은 애플리케이션이 계산해서 넘긴다. Redis `SET`의 `EX`는 양의 정수 초 하나를 받는다([Redis SET](https://redis.io/docs/latest/commands/set)).

#### 단점 / 고려사항

- 확률적 완화에 불과 → 높은 요청 밀도에서는 미흡
- TTL 분산 범위 조정 필요 (과도하면 데이터 일관성 저하 가능)

---

### 3. Refresh Ahead (만료 전 미리 갱신)

```
Scheduler    Cache       Database
   │            │             │
   │ ── (주기적 스케줄) ────────▶│
   │            │── get TTL ─▶│
   │            │◀ TTL 남음 ◀  │
   │            │             │
   │ ── (만료 임박) ───────────▶│
   │            │             │── query ──▶
   │            │             │◀─ result ─ │
   │            │◀─ set cache ──────────── │
```

#### 설명

- 인기 키에 대해 TTL 만료 전에 백그라운드에서 미리 갱신하여 캐시 미스를 방지
- 스케줄러, 히트 카운트 기반 pre-warm 적용

Vattani 등의 분류로는 external re-computation에 해당한다. 논문은 이 방식이 스탬피드를 막지만 별도 프로세스의 가용성과 모니터링을 챙겨야 하고, 어떤 키를 언제 갱신할지 추적해야 해서 자주 배제된다고 쓴다. 한 번도 요청되지 않은 키까지 갱신할 수 있다는 점도 지적한다.

#### 장점

- 캐시 미스를 원천적으로 줄여 스탬피드를 예방
- 자주 조회되는 키에는 매우 효과적

#### 단점 / 고려사항

- 인기 키 선별이 필요함 → 통계 수집 필요
- 갱신 작업이 실패하면 여전히 스탬피드 발생 가능
- TTL과 갱신 주기 조정이 까다로움

---

### 4. Request Coalescing (중복 요청 병합)

```
Client A    Client B     InFlightMap     DB
   │           │             │             │
   │ ─ GET(key) ────────────▶│             │
   │           │ ─ GET(key) ─▶             │
   │           │             │insert Future│
   │           │             │─ query ────▶│
   │           │             │◀ result ◀───│
   │◀──── join(Future) ◀─────│             │
   │           │◀───── join(Future) ◀──────│
```

#### 설명

- 동시에 동일한 키를 요청한 사용자가 있을 경우,
- 하나의 요청만 실제로 처리하고, 나머지는 그 결과를 공유

이 방식은 [Single Flight](/posts/single-flight/)에서 따로 정리했다. 동시 요청으로 효과를 잰 결과는 [캐시 스탬피드와 single flight 실험](/posts/cache-stampede-experiment/)에 있다.

#### 장점

- 실시간 요청 병합으로 효율적인 자원 사용 가능
- 락보다 부드러운 동시성 제어

#### 단점 / 고려사항

- `Future`, `Promise`, `Queue` 기반 병합 로직 필요
- 병합 처리 큐가 병목 지점이 될 수 있음
- 로직 복잡도 증가

---

### 5. PER (Probabilistic Early Recompute)

```
시간 →
Client A     Cache        DB
   │           │           │
   │ ─ GET ──▶ │           │
   │           │── TTL near expire
   │           │── PER 확률 계산
   │           │── r < p → 재계산 결정
   │           │── query ───────────▶
   │           │◀── result ──────────
   │           │── update cache
   │◀─ stale or new return ─

```

#### 설명

- 캐시 만료 시점이 가까울수록, 일부 요청자에게 확률적으로 재계산을 유도
- PER 수식: `p = e^(α * (now - expiry))`
- Twitter, Cloudflare 등 실사용 사례 있음

원 논문은 Vattani, Chierichetti, Lowenstein의 [Optimal Probabilistic Cache Stampede Prevention](https://www.vldb.org/pvldb/vol8/p886-vattani.pdf)(VLDB 2015)이다. 논문은 "The probability of performing an early expiration increases as the request time gets closer to the expiration of the item."이라고 쓴다(만료 시점에 가까운 요청일수록 조기 갱신 확률이 커진다). 논문이 제안한 XFetch는 이 앞당김 폭을 지수분포 `Exp(λ)`에서 뽑으며, `λ`가 요청률에 맞춰 조정될 필요가 없다는 점을 장점으로 든다. [Wikipedia](https://en.wikipedia.org/wiki/Cache_stampede)에 정리된 구현 조건은 `time() - delta * beta * log(rand(0,1)) >= expiry`다. `delta`는 직전 재계산에 걸린 시간이고 `beta`의 기본값은 1이다. 그래서 값과 함께 `delta`를 캐시에 저장해야 한다.

#### 장점

- 락 없이도 **점진적 재계산 가능**
- 분산 환경에서도 효과적
- 트래픽이 높은 서비스에 적합

#### 단점 / 고려사항

- 확률(`α`)을 잘못 설정하면 효과 없음
- 중복 DB 조회 가능성 존재
- 읽기 요청량이 적으면 작동하지 않음

---

## 마무리

시간 흐름 기준 축을 다음과 같이 정의하고, 시점에 따라 각 해결전략을 도식화해보았다.

```
T - X  ← TTL보다 X초 전
T      ← TTL 만료 시점 (캐시 미스 발생 가능성 시작)
T + X  ← TTL 만료 이후, DB 접근이 집중되는 시점
```

### 전략별 시간축 다이어그램

```
시간 흐름 ●────────────────●──────────●──────────●──────────●─────►
       T - 60s        T - 10s       T       T + 5s      T + 30s

🔁 Refresh Ahead
       ─────────────●────────────────────
         [TTL보다 60초~10초 전 미리 갱신 시도]

⏱ TTL + Jitter
       ────────●────────●────────●───────
         [캐시 설정 시 TTL을 분산시켜 만료 시점 자체를 분산]

🧠 PER (확률적 재계산)
                              ●────●────●────●────
            [T - 10초 ~ T 사이]에 PER 수식 기반으로 일부 요청만 DB 접근 시도

📦 Request Coalescing
                                     ●────●────●
                           [T ~ T + 5초] 사이 동시 요청 병합, 결과 공유

🔒 Mutex Lock
                                     ●───────────────●
                           [T ~ T + 30초] 사이 DB 접근 제어 (락 획득 → 캐시 채움)
```

### 전략별 작동 상세 시점 및 지속 시간

| 전략            | 발동 시점                       | 작동 기간                       | 발동 조건                    |
| --------------- | ------------------------------- | ------------------------------- | ---------------------------- |
| 🔁 Refresh Ahead | TTL 만료 **수초~수분 전**       | 짧게 작동 (예: 스케줄 1분 간격) | 인기 키, 스케줄러 기준       |
| ⏱ TTL + Jitter  | 캐시 생성 시점                  | TTL 지속 기간 전체              | 모든 캐시 키에 랜덤 TTL 부여 |
| 🧠 PER           | TTL 임박 시 (예: TTL - 5초부터) | 수초 내 확률적 갱신 시도        | PER 수식 계산 조건 만족 시   |
| 📦 Coalescing    | TTL 만료 이후 수초 이내         | 중복 요청 몰릴 때만 짧게 작동   | 동일 요청이 동시에 다수 발생 |
| 🔒 Mutex Lock    | TTL 직후부터 수십 초 이내       | 캐시 재생성까지 대기/락 지속    | 캐시 미스 + 락 획득 여부     |

### 해결전략 요약

| 전략                                        | 설명                                                         | 장점                                             | 단점 / 고려 사항                                             |
| ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------ |
| 🔒 **Mutex Lock**(분산 락 기반 단일 DB 접근) | 캐시 미스 시 하나의 요청만 DB 접근, 나머지는 대기하거나 재시도 | - 중복 DB 조회 방지- DB 부하 완화                | - 락 구현 필요 (`SETNX`, `Redisson` 등)- 락 대기 시간, 실패 처리 필요- 데드락 방지 위한 TTL 필수 |
| ⏱ **TTL + Jitter**(랜덤 만료 시점 분산)     | 캐시 TTL에 랜덤 오차를 추가하여 **동시 만료를 방지**         | - 구현 매우 간단- 대부분 시스템에서 적용 가능    | - 완화에 불과- 대규모 요청 동시 발생 시 근본 해결 아님       |
| 🔁 **Refresh Ahead**(만료 전에 미리 갱신)    | 캐시 TTL 전에 미리 백그라운드 작업으로 갱신                  | - 캐시 미스 자체를 줄임- 스탬피드 예방 가능      | - 인기 키 추적/관리 필요- 갱신 실패 시 스탬피드 발생 가능- TTL, 갱신 타이밍 조절 필요 |
| 📦 **Request Coalescing**(동시 요청 병합)    | 동일한 요청이 몰릴 때 하나만 DB 조회, 나머지는 결과 공유     | - 병합 처리로 중복 제거- 락보다 유연한 방식      | - 구현 복잡도 있음 (`Future`, 큐 등)- 동시 요청 큐 병목 가능 |
| 🧠 **PER**(확률적 조기 재계산)               | TTL이 임박한 시점에 일부 요청자가 **확률적으로 DB 재조회**   | - 락 없이도 분산 갱신 가능- 고트래픽 환경에 적합 | - 확률 조절 (`α`) 필요- 중복 재계산 가능성 있음- 저빈도 요청에는 효과 낮음 |

### 상황별 전략 조합

상황에 따라 해결전략이 달라질 수 있으며, 상황에 맞게 적절한 해결전략을 조합해야한다.

| 상황                        | 추천 조합                         |
| --------------------------- | --------------------------------- |
| **확실하게 중복 방지**      | `Mutex Lock + TTL + Jitter`       |
| **트래픽 집중, 핫 키 다수** | `Refresh Ahead + PER`             |
| **비용 절감 + 효율**        | `Request Coalescing + TTL Jitter` |
| **락 없는 분산 시스템**     | `PER + Coalescing`                |

---

## 참고자료

1. *[Cache stampede](https://en.wikipedia.org/wiki/Cache_stampede)*, Wikipedia
2. 김신 (2024), *[캐시 문제 해결 가이드 - DB 과부하 방지 실전 팁](https://toss.tech/article/cache-traffic-tip)*, Toss Tech
3. 김가림 (2020), *[캐시 성능 향상기 (Improving Cache Speed at Scale)](https://meetup.nhncloud.com/posts/251)*, NHN Cloud
4. taehee kim (2023), *[Hot key Cache Stampede와 Probabilistic Early Recomputation 적용](https://velog.io/@xogml951/Hot-key에서-Cache-Stampede와-Probabilistic-Early-Recomputation-적용)*, Velog
5. [Vaibhav Singh](https://medium.com/@vaibhav0109) (2018), *[What is Cache Stampede?](https://medium.com/@vaibhav0109/cache-stampede-problem-5eba782a1a4f)*, Medium
6. GeeksforGeeks (2023), [Cache Stampede or Dogpile Problem in System Design](https://www.geeksforgeeks.org/cache-stempede-or-dogpile-problem-in-system-design/), GeeksforGeeks
7. Zohaib Sibte Hassan, DoorDash, TLM (2020), *[Improve Cache Speed at Scale - RedisConf 2020](https://youtu.be/mPg20ykAFU4?si=QRvN2BZbE8kN9om6)*, RedisConf 2020
8. 이현재 (2024), *[캐시 스탬피드를 대응하는 성능 향상 전략, PER 알고리즘 구현](https://blog.hwahae.co.kr/all/tech/14003)*, 화해
9. [Sid](https://medium.com/@_sidharth_m_) (2024), *[How to Avoid Cache Stampede or “Dogpile” Problem Upon Cache Expiry?](https://medium.com/@_sidharth_m_/how-to-avoid-cache-stampede-or-dogpile-problem-upon-cache-expiry-370ecc06b76c)*, Medium
10. A. Vattani, F. Chierichetti, K. Lowenstein (2015), *[Optimal Probabilistic Cache Stampede Prevention](https://www.vldb.org/pvldb/vol8/p886-vattani.pdf)*, Proceedings of the VLDB Endowment 8(8)
11. *[SET](https://redis.io/docs/latest/commands/set)*, Redis Docs
