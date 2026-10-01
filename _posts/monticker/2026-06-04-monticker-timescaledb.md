---
title: "TimescaleDB를 시계열 DB로 고른 이유 — Hypertable과 연속 집계"
date: 2026-06-04
categories: [Monticker, Architecture]
tags: [monticker, timescaledb, PostgreSQL, Time Series, Database, hypertable]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 3
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: published
---

## 주식 데이터는 왜 특별한가

주식 시세 데이터에는 일반 OLTP(주문·회원처럼 행 단위로 읽고 고치는 트랜잭션 처리) 데이터와 다른 특성이 있다.

1. 쓰기 패턴이 단조롭다. 항상 현재 시각 기준으로만 INSERT하고, UPDATE·DELETE는 거의 없다.
2. 범위 쿼리가 지배적이다. "최근 1시간 데이터", "어제 오전 9시~10시 사이 데이터" 같은 조회가 대부분이다.
3. 오래된 데이터는 정밀도가 낮아도 된다. 1년 전 데이터는 1분봉이 아닌 일봉으로 충분하다.
4. 데이터 양이 선형으로 증가한다. 202개 종목 × 1초 1틱 = 하루 약 550만 행이다.

이 특성을 일반 PostgreSQL 테이블에 저장하면 어떤 문제가 생기는지부터 살펴보자.

---

## 일반 PostgreSQL의 문제점

### B-Tree 인덱스의 한계

```sql
-- candles_1m 테이블에 6개월치 데이터가 쌓인 상황
-- 약 202종목 × 390분봉/일 × 120일 ≈ 9,440만 행

SELECT * FROM candles_1m
WHERE stock_id = 1
  AND bucket BETWEEN '2025-01-01' AND '2025-01-31'
ORDER BY bucket;
```

[B-Tree 인덱스](/posts/btree-index-internals/)의 범위 검색은 인덱스 전체를 훑지 않는다. 시작 키까지 트리 높이만큼 내려간 뒤, 잎 노드를 범위 끝까지 따라간다. 그래서 위 쿼리 하나의 비용은 테이블 전체 크기보다 읽는 행 수에 더 크게 좌우된다.

한계는 테이블과 인덱스가 하나의 덩어리로 계속 커진다는 데 있다. 1년 지난 1분봉을 지우려면 수천만 행을 `DELETE`해야 하고, TimescaleDB 문서도 행 단위 `DELETE`는 느릴 수 있다고 적는다([Data retention](https://www.tigerdata.com/docs/use-timescale/latest/data-retention/about-data-retention)). 오래된 데이터를 덩어리째 떼어 낼 단위가 필요하다.

### 파티셔닝의 복잡성

PostgreSQL 네이티브 테이블 [파티셔닝](/posts/partitioning-and-sharding/)으로 이 문제를 해결할 수 있지만, 파티션 생성·관리·제거를 직접 해야 한다.

```sql
-- 매월 새 파티션을 수동 생성해야 한다
CREATE TABLE candles_1m_2025_01
    PARTITION OF candles_1m
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

월별 파티션 생성 스크립트, 오래된 파티션 아카이빙 스크립트… 인프라 코드가 늘어난다.

---

## TimescaleDB가 해결하는 방법

TimescaleDB는 PostgreSQL 확장(Extension)이다. PostgreSQL을 교체하는 게 아니라 위에 올린다.

```sql
-- TimescaleDB 확장 활성화
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 일반 테이블을 Hypertable로 변환
CREATE TABLE candles_1m (
    stock_id  BIGINT        NOT NULL,
    bucket    TIMESTAMPTZ   NOT NULL,
    open      NUMERIC(18,4) NOT NULL,
    high      NUMERIC(18,4) NOT NULL,
    low       NUMERIC(18,4) NOT NULL,
    close     NUMERIC(18,4) NOT NULL,
    volume    BIGINT        NOT NULL
);

SELECT create_hypertable('candles_1m', 'bucket');
```

`create_hypertable()` 호출 하나로 자동 파티셔닝이 활성화된다. TimescaleDB가 내부적으로 청크(chunk) 단위로 데이터를 관리한다.

---

## Hypertable의 핵심: Chunk

Hypertable은 시간 축으로 데이터를 자동 분할한다.

```
candles_1m (Hypertable)
  ├── chunk_1  2025-01-01 ~ 2025-01-07  (1주일치)
  ├── chunk_2  2025-01-07 ~ 2025-01-14
  ├── chunk_3  2025-01-14 ~ 2025-01-21
  └── ...
```

범위 쿼리를 실행하면 TimescaleDB가 해당 시간 범위의 청크만 탐색한다. 문서의 표현으로는 쿼리가 테이블 전체가 아니라 해당 청크에서 실행된다([Hypertables](https://www.tigerdata.com/docs/use-timescale/latest/hypertables)). 그래서 조회 범위가 같으면 테이블에 몇 년치가 쌓였든 읽는 청크 수는 같다. 아래 [실행 계획](/posts/reading-execution-plans/)에서 `ChunkAppend` 아래에 청크 하나만 남은 것이 그 결과다.

```sql
-- 이 쿼리는 전체 테이블이 아니라 해당 주의 chunk만 탐색
EXPLAIN SELECT * FROM candles_1m
WHERE stock_id = 1
  AND bucket BETWEEN '2025-01-15' AND '2025-01-22';

-- Custom Scan (ChunkAppend) on candles_1m
--   → Seq Scan on _timescaledb_internal._hyper_1_3_chunk
```

---

## 연속 집계(Continuous Aggregates)

monticker에서 가장 활용도 높은 기능이다.

캔들 데이터는 1분봉(`candles_1m`)으로 저장되지만, 일봉(`candles_1d`)은 매일 1440개의 1분봉을 집계해서 만들어야 한다. 실시간으로 매번 집계하면 쿼리 비용이 높다.

연속 집계(Continuous Aggregate)는 이 집계 결과를 물리적으로 저장하고, 새 데이터가 추가될 때 증분(incremental)으로만 갱신한다. 문서는 데이터셋의 변경을 추적해 연속 집계 뒤의 hypertable을 백그라운드에서 갱신한다고 설명한다([About continuous aggregates](https://www.tigerdata.com/docs/use-timescale/latest/continuous-aggregates/about-continuous-aggregates)). 갱신 시점은 아래의 정책(`add_continuous_aggregate_policy`)이 정한다.

```sql
-- 일봉 연속 집계 정의
CREATE MATERIALIZED VIEW candles_1d_cagg
WITH (timescaledb.continuous) AS
SELECT
    stock_id,
    time_bucket('1 day', bucket)  AS bucket,
    first(open,  bucket)          AS open,
    max(high)                     AS high,
    min(low)                      AS low,
    last(close,  bucket)          AS close,
    sum(volume)                   AS volume
FROM candles_1m
GROUP BY stock_id, time_bucket('1 day', bucket);

-- 자동 갱신 정책 (매시간 최근 2일치 갱신)
SELECT add_continuous_aggregate_policy('candles_1d_cagg',
    start_offset => INTERVAL '2 days',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);
```

이 뷰를 조회하면 미리 계산된 일봉 데이터가 반환된다.

```sql
-- 빠르고 싸다
SELECT * FROM candles_1d_cagg
WHERE stock_id = 1
  AND bucket >= '2025-01-01'
ORDER BY bucket;
```

---

## 실제 마이그레이션 (Flyway V4, V10)

monticker는 Flyway로 DB 스키마를 관리한다. TimescaleDB 관련 마이그레이션은 두 단계로 나뉜다.

**V4: 기본 테이블 생성 + Hypertable 전환**

```sql
-- V4__create_market_data.sql
CREATE TABLE candles_1m (
    stock_id  BIGINT        NOT NULL REFERENCES stocks(id),
    bucket    TIMESTAMPTZ   NOT NULL,
    open      NUMERIC(18,4) NOT NULL,
    high      NUMERIC(18,4) NOT NULL,
    low       NUMERIC(18,4) NOT NULL,
    close     NUMERIC(18,4) NOT NULL,
    volume    BIGINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (stock_id, bucket)
);

SELECT create_hypertable('candles_1m', 'bucket',
    chunk_time_interval => INTERVAL '7 days');

CREATE INDEX idx_candles_1m_stock_bucket
    ON candles_1m (stock_id, bucket DESC);
```

**V10: 연속 집계 생성**

```sql
-- V10__create_continuous_aggregates.sql
CREATE MATERIALIZED VIEW candles_1d_cagg
WITH (timescaledb.continuous) AS
SELECT ...
```

---

## InfluxDB·ClickHouse와의 비교

TimescaleDB 대신 다른 시계열 데이터베이스를 선택하지 않은 이유를 정리했다.

| 항목 | TimescaleDB | InfluxDB | ClickHouse |
|------|-------------|----------|------------|
| PostgreSQL 호환 | 완전 호환 | 없음 | 없음 |
| SQL 문법 | 표준 SQL | Flux/InfluxQL | SQL 방언 |
| JOIN 지원 | 완전 | 제한적 | 완전 |
| 기존 ORM 재사용 | JPA/JDBC 그대로 | 불가 | 제한적 |
| 운영 복잡도 | 낮음 (PostgreSQL과 동일) | 높음 | 높음 |

monticker는 PostgreSQL에 이미 `users`, `stocks`, `stock_events` 등 일반 비즈니스 테이블이 있다. TimescaleDB를 쓰면 하나의 PostgreSQL 인스턴스에서 비즈니스 데이터와 시계열 데이터를 동시에 다룰 수 있다. `candles_1m`이 `stocks(id)`를 외래 키로 참조하는 것(V4)도 같은 인스턴스이기 때문에 가능하다.

그래서 별도 데이터베이스를 하나 더 운영하지 않아도 되고, JPA와 Spring Data JPA를 그대로 사용할 수 있다는 점이 결정적이었다.

---

## 데이터 보존 정책

시계열 데이터는 시간이 지나면 정밀도를 낮춰도 된다. TimescaleDB의 데이터 보존 정책(Data Retention Policy)으로 오래된 1분봉을 자동으로 삭제할 수 있다. 삭제 단위가 행이 아니라 청크라서, 앞에서 본 대량 `DELETE` 문제가 생기지 않는다. 문서는 청크 단위 삭제가 디스크에서 파일 하나를 통째로 지우므로 더 빠르다고 설명한다.

```sql
-- 1년 이상 된 1분봉 청크는 자동 삭제
SELECT add_retention_policy('candles_1m', INTERVAL '1 year');
```

일봉(`candles_1d_cagg`)은 영구 보존하므로, 장기 차트는 일봉으로 제공하고 단기 상세 차트만 1분봉으로 제공하는 전략이 가능하다.

---

## 정리

- 일반 테이블에서 문제가 되는 것은 범위 조회 자체보다 오래된 데이터를 지우는 비용이다. 청크 단위 분할이 조회 범위와 삭제 단위를 함께 해결한다.
- 연속 집계는 일봉 집계 비용을 조회 시점에서 갱신 정책 실행 시점으로 옮긴다. 조회는 싸지지만, 일봉은 갱신 정책(`end_offset`, `schedule_interval`)만큼 원본보다 늦게 반영될 수 있다.
- 비즈니스 테이블과 같은 PostgreSQL 인스턴스에 둘 수 있다는 점이 InfluxDB·ClickHouse 대신 TimescaleDB를 고른 이유다.

다음 글에서는 이 저장소 위에서 거래량 급증을 어떻게 판단하는지, [EMA 기반 이상 탐지](/posts/monticker-ema-event-detection/)를 다룬다.

## 참고

- [Hypertables](https://www.tigerdata.com/docs/use-timescale/latest/hypertables) — Tiger Data(구 Timescale) 문서
- [About continuous aggregates](https://www.tigerdata.com/docs/use-timescale/latest/continuous-aggregates/about-continuous-aggregates) — Tiger Data 문서
- [Data retention](https://www.tigerdata.com/docs/use-timescale/latest/data-retention/about-data-retention) — Tiger Data 문서
