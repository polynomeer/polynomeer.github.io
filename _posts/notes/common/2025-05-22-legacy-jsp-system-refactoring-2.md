---
title: "JSP 기반 시스템의 구조적 문제를 해결한 아키텍처 전환기: 시퀀스 테이블 기반 코드 생성의 병목을 해결한 이야기"
date: 2025-05-22
categories: [Notes, Common]
tags: [Key Generation Strategy, Sequence, Legacy, Refactoring]
---

## 시퀀스 테이블 병목을 줄인 계약 코드 생성 최적화 사례

운영 중인 시스템에서 병목 현상을 해결하는 것은 언제나 현실적 제약과의 싸움입니다. 이번 글에서는 **계약 코드 생성 과정에서 발생한 시퀀스 테이블 병목 문제**를 해결하며 경험한 설계적 고민, 실용적인 트랜잭션 전략, 그리고 그 성과를 공유하려고 합니다.

---

## 문제 상황: 시퀀스 기반 키 생성의 병목

계약 생성 시에는 고유한 계약 코드가 필요하고, 우리는 이를 **단일 시퀀스 테이블**을 통해 관리하고 있었습니다. 하지만 다음과 같은 문제가 점점 심화되었습니다:

* **모든 계약 생성 트랜잭션이 동일 시퀀스 테이블에 접근**
* 매 요청마다 `SELECT FOR UPDATE` 발생 → **DB 락 경합**
* 다수의 병렬 트랜잭션이 걸리며 **성능 저하**, 심한 경우 **데드락**

특히 대량의 계약 데이터를 동시 등록하는 배치나 이벤트성 등록 API 호출 시 **응답 시간이 수 분까지 증가**하는 현상이 반복되었습니다.

## 기존 방식: 시퀀스 테이블 + 프로시저 기반

### 시퀀스 테이블 구조

```sql
CREATE TABLE sequence_table (
    name VARCHAR(100) PRIMARY KEY,
    current_value BIGINT NOT NULL
);
```

### 시퀀스 증가용 프로시저 (MySQL 기준)

아래는 예시로 작성한 시퀀스 증가 프로시저 코드입니다.

```sql
DELIMITER $$

CREATE PROCEDURE get_next_sequence(IN seq_name VARCHAR(100), OUT next_val BIGINT)
BEGIN
    DECLARE current BIGINT;

    START TRANSACTION;

    SELECT current_value INTO current
    FROM sequence_table
    WHERE name = seq_name
    FOR UPDATE;

    SET next_val = current + 1;

    UPDATE sequence_table
    SET current_value = next_val
    WHERE name = seq_name;

    COMMIT;
END$$

DELIMITER ;
```

### 문제점

- 매 호출마다 `SELECT ... FOR UPDATE` → 트랜잭션 락 경쟁 심화
- 병렬 트랜잭션 시 경합 또는 데드락 가능성

---

## 대안 검토: 기술을 바꾸기엔 제약이 많았다

아키텍처 차원에서 다음과 같은 대안들을 검토했습니다:

| 대안                     | 장점             | 단점                      |
| ---------------------- | -------------- | ----------------------- |
| UUID / Time-based ID   | 락 없음, 분산 처리 적합 | 기존 코드 체계와 호환 불가         |
| Redis Atomic Increment | 빠르고 락 없음       | 장애 시 유실 가능성, 영속성 보장 어려움 |
| DB 시퀀스 분산화             | 물리적 충돌 제거 가능   | 유지보수 복잡도 증가             |

그러나 현실은 냉정했습니다.
**기존 계약 코드 체계와의 호환성을 반드시 유지해야 했고**, 시퀀스를 외부 저장소(예: Redis)로 이관하거나 형식을 바꾸는 것은 어렵다는 결론이 났습니다.

---

## 해결 전략: 시퀀스 선할당 + 낙관적 락 + 메모리 캐시

핵심 아이디어는 다음과 같습니다:

> **"시퀀스를 매번 DB에서 조회하지 말고, 일정량을 미리 확보해 애플리케이션에서 캐시처럼 사용하자."**

### 핵심 설계 포인트

1. **시퀀스 번호를 N개 단위(예: 1,000개)로 선할당**
2. 애플리케이션 메모리 캐시에 저장하고 `getNext()`로 꺼내 사용
3. 캐시 소진 시에만 DB 갱신 → 접근 횟수 대폭 감소
4. DB 갱신 시 **낙관적 락(Optimistic Lock)** 적용으로 정합성 보장

---

## 개선된 시퀀스 갱신 코드 (Java + JDBC)

```java
public class SequenceCache {
    private final String sequenceName;
    private final int allocationSize;
    private final AtomicLong current = new AtomicLong(0);
    private long max = 0;
    private final DataSource dataSource;

    public SequenceCache(String sequenceName, int allocationSize, DataSource dataSource) {
        this.sequenceName = sequenceName;
        this.allocationSize = allocationSize;
        this.dataSource = dataSource;
    }

    public synchronized long getNext() {
        if (current.get() >= max) {
            allocateFromDb();
        }
        return current.getAndIncrement();
    }

    private void allocateFromDb() {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);

            PreparedStatement select = conn.prepareStatement(
                "SELECT current_value FROM sequence_table WHERE name = ?"
            );
            select.setString(1, sequenceName);
            ResultSet rs = select.executeQuery();

            if (!rs.next()) throw new IllegalStateException("No sequence found");
            long currentValue = rs.getLong(1);
            long nextValue = currentValue + allocationSize;

            PreparedStatement update = conn.prepareStatement(
                "UPDATE sequence_table SET current_value = ? WHERE name = ? AND current_value = ?"
            );
            update.setLong(1, nextValue);
            update.setString(2, sequenceName);
            update.setLong(3, currentValue);

            int updated = update.executeUpdate();
            if (updated == 0) {
                conn.rollback();
                throw new IllegalStateException("Optimistic lock failed");
            }

            conn.commit();
            this.current.set(currentValue + 1);
            this.max = nextValue + 1;

        } catch (SQLException e) {
            throw new RuntimeException("Sequence allocation failed", e);
        }
    }
}
```

### 사용 예시

```java
SequenceCache contractCodeCache = new SequenceCache("CONTRACT_CODE_SEQ", 1000, dataSource);

public String generateContractCode() {
    long next = contractCodeCache.getNext();
    return "C" + String.format("%09d", next); // e.g., C000001234
}
```

---

## 시퀀스 테이블 정의 (MySQL)

```sql
CREATE TABLE sequence_table (
    name VARCHAR(100) PRIMARY KEY,
    current_value BIGINT NOT NULL
);
```

---

## 성과: 성능과 정합성 모두 잡았다

| 항목               | 개선 전                   | 개선 후              |
| ---------------- | ---------------------- | ----------------- |
| 계약 생성 트랜잭션 처리 시간 | 평균 1분 30초              | **500ms 이하**      |
| DB 시퀀스 접근 빈도     | 요청마다 1회                | **1,000회당 1회**    |
| 락 경합 발생률         | 높음                     | **거의 없음**         |
| 데이터 정합성          | `SELECT FOR UPDATE` 기반 | **낙관적 락 기반으로 보장** |

이 방식은 **구조를 바꾸지 않고**, **기존 DB 시퀀스 체계를 유지하면서도 병렬성과 성능을 확보**한 현실적인 해결책이었습니다.

---

## 회고: 성능 문제는 결국 설계의 문제

락 경합이 발생하면 종종 기술을 바꿔야 한다고 생각하기 쉽지만, 실제로는 **작은 설계의 변화로도 큰 성능 개선을 이끌어낼 수 있습니다**.

이번 개선은 그런 대표적인 사례였고, 현실적인 제약을 수용하면서도 효과적으로 병목을 해결할 수 있었던 경험이었습니다.
