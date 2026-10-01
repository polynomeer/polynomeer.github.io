---
title: "대용량 지분율 데이터 처리 성능 개선과 동시성 제어 전략"
date: 2025-05-27
categories: [Notes, Common]
tags: [Batch, Bulk Insert, Concurrency, Redis, Performance]
---

*이 글은 실제 운영 경험을 바탕으로 일부 표현과 도메인을 일반화해 재구성한 기록입니다.*

## 문제 배경

운영 중인 시스템에서는 파트너사의 지분율 데이터를 정기적으로 갱신한다. 그중 *협회 유형* 파트너는 건수가 80만 건 이상이고, 매월 1회 정기적으로 등록된다. 근본적인 병목은 대량 삭제와 대량 등록이 하나의 작업 흐름 안에서 강하게 결합되어 있다는 점이었다.

![stake-system](../../../assets/img/posts/stake-system-sequence.png)

기존 방식은 전체 데이터를 삭제한 뒤 다시 등록하는 구조였고([전체 삭제 후 전체 등록 구조의 위험성](/posts/bulk-insert-with-lock-part2/)), 다음 문제가 있었다.

* 대량의 데이터 삭제/삽입으로 인해 DB 부하 증가
* 삭제 대상 데이터 조회 쿼리의 성능 문제
* 다른 서버 또는 작업과 겹칠 경우 데이터 정합성 문제 발생
* 재등록 배치 처리 시간이 2시간 이상 소요, 운영 효율 저하

아래 개선은 이 네 문제에 차례로 대응한다. 월 단위 주기라는 데이터 특성으로 조회 범위를 줄이고, 겹치는 실행은 락으로 막고, 등록은 병렬로 나눈다.

---

## 문제 해결 전략

### 1. 등록 특성 분석: 한 달 단위 주기

* 협회 지분율은 *매월 1회*만 갱신됨
* 이를 기반으로 *동일 월 기준의 데이터는 별도로 분기 처리 가능*

그래서 쿼리 범위를 월 단위로 제한해 불필요한 연산을 줄일 수 있다.

---

### 2. 쿼리 튜닝: 분기 처리 및 배치 분할

#### 문제 원인

```sql
SELECT *
FROM share_rate
WHERE partner_id = :partnerId
  AND start_date <= :newEndDate
  AND end_date >= :newStartDate;
```

- `partner_id`만으로 파티셔닝 또는 [인덱스](/posts/btree-index-internals/)가 되어 있지 않으면 Full Scan(테이블 전체를 처음부터 끝까지 읽는 것) 발생
- 월 단위 요청이라도 전체 테이블을 스캔하여 불필요한 기간도 포함
- 불필요한 연산량이 늘어 쿼리 응답이 지연됨

#### 개선 방안

```sql
SELECT *
FROM share_rate
WHERE partner_id = :partnerId
  AND start_date <= :newEndDate
  AND end_date >= :newStartDate
  AND start_date >= :monthStart
  AND start_date < :nextMonthStart;
```

- `:monthStart`과 `:nextMonthStart`는 예를 들어 `2024-05-01` ~ `2024-06-01`처럼 요청 월 기준으로 계산한 범위
- `start_date` 기준으로 범위를 제한하면 인덱스를 더 잘 활용 가능
- 실제 처리 대상이 되는 행만 대상으로 삼아 필터링 비용 감소

#### 예시

요청하려는 대상 지분율의 기간이 2024년 5월이라면:

```sql
-- 개선 전: 전체 기간 대상
WHERE start_date <= '2024-05-31' AND end_date >= '2024-05-01'

-- 개선 후: 5월 데이터만 대상으로 스캔
WHERE start_date >= '2024-05-01' AND start_date < '2024-06-01'
```

#### 결과

- 삭제 성능 24배 개선 (2시간 → 5분)
- DB 커넥션 및 락 경합 최소화

---

### 3. 동시성 제어: Redis 기반 분산 락 도입

* 지분율 갱신은 기존 데이터를 삭제 후 재삽입하므로, 두 작업이 동시에 돌면 한쪽이 지운 데이터를 다른 쪽이 다시 쓰는 식으로 섞일 수 있다.
* 기존의 락은 옵션 없는 `SET`만 사용하고 있었다. `SET`은 키가 이미 있어도 값을 덮어쓰고 기존 TTL도 버린다([Redis 문서: SET](https://redis.io/docs/latest/commands/set/)). 그래서 이미 다른 작업이 락을 잡고 있는지 확인하는 것과 락을 잡는 것이 한 명령으로 묶이지 않았고, 만료 시간도 없었다.
* 이를 `NX`(키가 없을 때만 설정)와 만료 시간을 함께 주는 `SET` 기반 [분산 락](/posts/bulk-insert-with-lock-part4/)으로 바꿨다. 아래 코드의 `setIfAbsent(key, value, TTL)`이 이 형태다. Redis 문서는 `SETNX`도 `SET`의 옵션으로 대체할 수 있다고 적고 있다.

```java
String lockKey = "shareRate:association:lock";
boolean locked = redis.setIfAbsent(lockKey, "LOCK", 5분 TTL);
if (!locked) {
    // 다른 프로세스가 작업 중 → 종료
    return;
}
try {
    deleteOldData();
    insertNewData();
} finally {
    redis.delete(lockKey); // 락 해제
}
```

#### 효과

- 삭제와 등록 간의 충돌 제거
- 다중 배치 서버에서 정합성 있는 작업 수행 가능

---

### 4. 병렬 처리: 등록 시 병렬 처리로 시간 단축

* 락으로 작업 단위의 동시 실행을 막은 뒤, 작업 안의 등록은 N건 단위로 나누어 병렬로 처리
* 각 Chunk를 멀티스레드 혹은 병렬 스트림으로 분배

```java
List<List<ShareRate>> chunks = partition(dataList, 10000);
chunks.parallelStream().forEach(chunk -> shareRateRepository.saveAll(chunk));
```

#### 결과

- 전체 등록 처리 시간 40분 → 12분 (70% 단축)
- 서버 리소스 효율적 사용 및 전체 Throughput(단위 시간당 처리량) 증가

---

## 정리하며

삭제 시간을 줄인 것은 쿼리 자체의 튜닝보다 "협회 지분율은 매월 1회만 갱신된다"는 데이터 특성이었다. 이 특성 덕분에 조회 범위를 한 달로 좁힐 수 있었다. 정합성은 Redis 락으로, 등록 시간은 Chunk 단위 병렬 처리로 따로 다뤘다. 80만 건 이상을 전체 삭제 후 재등록하는 배치를 단계별로 다룬 기록은 [대량 배치 안정성을 높이기 위한 구조 개선](/posts/bulk-insert-with-lock-part1/) 시리즈에도 있다.

### 개선 요약

| 항목       | 개선 전    | 개선 후           | 효과      |
| -------- | ------- | -------------- | ------- |
| 삭제 처리 시간 | 2시간     | 5분             | 24배 개선  |
| 등록 처리 시간 | 40분     | 12분            | 70% 단축  |
| 정합성 보장   | 없음      | Redis 락 도입     | 충돌 제거   |
| 병렬 처리    | 단일 트랜잭션 | Chunk 기반 병렬 처리 | 리소스 최적화 |

## 참고

- [SET](https://redis.io/docs/latest/commands/set/) — Redis 문서
