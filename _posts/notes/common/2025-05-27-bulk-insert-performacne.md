---
title: "대용량 지분율 데이터 처리 성능 개선과 동시성 제어 전략"
date: 2025-05-27
categories: [Notes, Common]
tags: [Batch, Bulk Insert, Concurrency, Redis, Performance]
---

*이 글은 실제 운영 경험을 바탕으로 일부 표현과 도메인을 일반화해 재구성한 기록입니다.*

## 문제 배경

운영 중인 시스템에서는 파트너사의 **지분율 데이터**를 정기적으로 갱신한다. 특히, *협회 유형* 파트너의 경우 건수가 **80만 건 이상**으로 매우 방대하며, **매월 1회** 정기적으로 등록된다는 특성이 있다. 근본적인 병목은 대량 삭제와 대량 등록이 하나의 작업 흐름 안에서 강하게 결합되어 있다는 점이었다.

![stake-system](../../../assets/img/posts/stake-system-sequence.png)

기존 방식은 단순히 전체 데이터를 삭제한 후, 다시 등록하는 구조였으나 다음과 같은 문제점이 존재했습니다:

* 대량의 데이터 삭제/삽입으로 인해 **DB 부하 증가**
* 삭제 대상 데이터 조회 쿼리의 성능 문제
* 다른 서버 또는 작업과 겹칠 경우 **데이터 정합성 문제 발생**
* 재등록 배치 처리 시간이 **2시간 이상 소요**, 운영 효율 저하

---

## 문제 해결 전략

### 1. 등록 특성 분석: 한 달 단위 주기

* 협회 지분율은 *매월 1회*만 갱신됨
* 이를 기반으로 *동일 월 기준의 데이터는 별도로 분기 처리 가능*

→ **쿼리 범위를 월 단위로 제한하여 불필요한 연산 제거**

---

### 2. 쿼리 튜닝: 🧱 분기 처리 및 배치 분할

#### 🧨 문제 원인

```sql
SELECT *
FROM share_rate
WHERE partner_id = :partnerId
  AND start_date <= :newEndDate
  AND end_date >= :newStartDate;
```

- `partner_id`만으로 파티셔닝 또는 인덱스가 되어 있지 않으면 Full Scan 발생
- 월 단위 요청이라도 전체 테이블을 스캔하여 **불필요한 기간도 포함**
- 불필요한 연산량 증가 → **쿼리 응답 지연**

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

- `:monthStart`과 `:nextMonthStart`는 예를 들어 `2024-05-01` ~ `2024-06-01`처럼 **요청 월 기준으로 계산한 범위**
- `start_date` 기준으로 범위를 제한하면 **인덱스를 더 잘 활용 가능**
- 실제 처리 대상이 되는 행만 대상으로 삼아 **필터링 비용 감소**

#### 📌 예시

요청하려는 대상 지분율의 기간이 2024년 5월이라면:

```sql
-- 개선 전: 전체 기간 대상
WHERE start_date <= '2024-05-31' AND end_date >= '2024-05-01'

-- 개선 후: 5월 데이터만 대상으로 스캔
WHERE start_date >= '2024-05-01' AND start_date < '2024-06-01'
```

#### 결과

- ✅ *삭제 성능 24배 개선 (2시간 → 5분)*
- ✅ *DB 커넥션 및 락 경합 최소화*

---

### 3. 동시성 제어: 🔐 Redis 기반 분산 락 도입

* 지분율 갱신은 기존 데이터를 삭제 후 재삽입하므로 **동시 접근 시 위험**
* 이를 방지하기 위해 **Redis의 SETNX 기반 분산 락**을 적용 -> 기존의 락이 SET 명령어만을 사용하고 있었는데, 이는 락의 **만료시간이 없고**, **이미 존재해도 덮어쓰며**, **원자성이 없다**는 문제가 있어서 변경하였다.

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

- ✅ *삭제와 등록 간의 충돌 제거*
- ✅ *다중 배치 서버에서 정합성 있는 작업 수행 가능*

---

### 4. 병렬 처리: ⚙️ 등록 시 병렬 처리로 시간 단축

* 대량의 등록도 **병렬로 처리**할 수 있도록 N건 단위로 나누어 처리
* 각 Chunk를 **멀티스레드 혹은 병렬 스트림**으로 분배

```java
List<List<ShareRate>> chunks = partition(dataList, 10000);
chunks.parallelStream().forEach(chunk -> shareRateRepository.saveAll(chunk));
```

#### 결과

- ✅ *전체 등록 처리 시간 40분 → 12분 (70% 단축)*
- ✅ *서버 리소스 효율적 사용 및 전체 Throughput 증가*

---

## 정리하며

이번 개선을 통해 지분율 데이터 처리의 **성능 병목을 해소**하고, **정합성과 동시성**을 모두 확보할 수 있었다. 핵심은 단순한 튜닝을 넘어서 데이터 특성을 이해하고, 시스템 아키텍처에 맞는 **분산 처리와 제어 구조**를 도입하는 데 있었다. 대용량 데이터 처리에서 중요한 건 단순 삽입 속도가 아니라, 데이터의 구조와 주기를 기반으로 한 설계 전략이다.

### 개선 요약

| 항목       | 개선 전    | 개선 후           | 효과      |
| -------- | ------- | -------------- | ------- |
| 삭제 처리 시간 | 2시간     | 5분             | 24배 개선  |
| 등록 처리 시간 | 40분     | 12분            | 70% 단축  |
| 정합성 보장   | 없음      | Redis 락 도입     | 충돌 제거   |
| 병렬 처리    | 단일 트랜잭션 | Chunk 기반 병렬 처리 | 리소스 최적화 |
