---
title: "락의 종류와 대기 - row, gap, next-key, intention과 데드락 탐지"
date: 2026-05-25
categories: [Notes, Database]
tags: [Database, Lock, Locking, Deadlock, InnoDB, MySQL, PostgreSQL, Concurrency]
---

"행 락이니까 다른 행은 안 막힌다"고 생각했는데 막히는 경우가 있다. 없는 행을 삽입하려는데 데드락이 나기도 한다. 둘 다 InnoDB가 **행뿐 아니라 행 사이의 빈 구간에도 락을 건다**는 사실에서 나온다. 락의 종류를 나눠 두면 이런 현상이 설명된다.

## 공유와 배타

가장 기본은 둘이다.

- **S(shared)**: 읽기 락. 여럿이 동시에 가질 수 있다. `SELECT ... FOR SHARE`.
- **X(exclusive)**: 쓰기 락. 하나만 가질 수 있다. `UPDATE`, `DELETE`, `SELECT ... FOR UPDATE`.

InnoDB에서 **일반 `SELECT`는 락을 걸지 않는다.** MVCC 스냅샷을 읽기 때문이다. 그래서 "읽기가 쓰기를 막지 않고 쓰기가 읽기를 막지 않는다"가 성립한다. 락이 걸리는 것은 잠금 읽기와 갱신뿐이다.

## intention 락: 테이블 수준의 의사 표시

테이블 락과 행 락이 공존하면 문제가 생긴다. 누군가 테이블 전체를 잠그려 할 때, 이미 행 락이 걸려 있는지 확인하려면 모든 행을 훑어야 한다.

**IS/IX(intention shared/exclusive)** 가 이것을 푼다. 행에 S 락을 걸기 전에 테이블에 IS를, X 락을 걸기 전에 IX를 먼저 건다. 테이블 락을 원하는 쪽은 테이블 수준의 intention 락만 보면 된다.

IX끼리는 충돌하지 않는다(서로 다른 행일 수 있으므로). 충돌은 실제 행 락에서 판정한다. 그래서 `SHOW ENGINE INNODB STATUS`에서 IX가 보이는 것은 정상이고, 그 자체가 경합을 뜻하지 않는다.

## gap 락과 next-key 락

여기가 InnoDB 특유의 부분이다.

- **record 락**: 인덱스 레코드 하나에 건다.
- **gap 락**: 인덱스 레코드 **사이의 빈 구간**에 건다. 그 구간에 새 행이 삽입되는 것을 막는다.
- **next-key 락**: record + 그 앞의 gap. REPEATABLE READ에서 잠금 읽기의 기본이다.

gap 락이 있는 이유는 **팬텀 방지**다. `SELECT ... FOR UPDATE WHERE age BETWEEN 20 AND 30`이 잠긴 동안 누군가 25를 삽입하면, 같은 조건을 다시 읽었을 때 행이 늘어난다. gap 락이 그 삽입을 막는다.

실무에서 이것이 만드는 현상.

- **없는 행을 잠가도 락이 걸린다.** `SELECT ... FOR UPDATE WHERE id = 999`에서 999가 없으면 그 자리의 gap에 락이 걸리고, 다른 세션의 999 삽입이 대기한다.
- **인덱스가 없으면 범위가 넓어진다.** 조건 컬럼에 인덱스가 없으면 InnoDB가 전체를 훑으며 지나간 레코드에 락을 건다. 사실상 테이블 전체가 잠긴다. **"행 락인데 왜 다 막히지"의 가장 흔한 원인이 인덱스 부재다.**
- **유니크 인덱스의 동등 조건은 gap 락이 없다.** 그 값이 하나뿐임이 보장되므로 record 락으로 충분하다.
- **READ COMMITTED에서는 gap 락이 대부분 사라진다.** 팬텀을 허용하는 대신 경합이 준다. 격리 수준을 내리는 실용적 이유 중 하나다.

PostgreSQL에는 gap 락이 없다. 팬텀을 스냅샷으로 막고, SERIALIZABLE에서는 술어 락(predicate lock)으로 충돌을 사후 탐지한다([격리 수준과 이상 현상](/posts/isolation-levels-and-anomalies/)).

## 대기와 데드락

락을 못 얻으면 기다린다. 기다림이 순환하면 데드락이다.

```text
T1: A를 잠금 → B를 원함
T2: B를 잠금 → A를 원함
```

InnoDB는 **대기 그래프(wait-for graph)** 를 유지하고 순환이 생기면 즉시 탐지해 한쪽을 롤백한다(보통 되돌릴 양이 적은 쪽). 타임아웃을 기다리지 않는다. `innodb_deadlock_detect`로 끌 수 있는데, 동시성이 매우 높으면 탐지 자체가 비용이라 끄고 `innodb_lock_wait_timeout`에 맡기는 선택지가 있다.

데드락은 **버그가 아니라 정상 동작**이다. 애플리케이션은 재시도를 준비해야 한다. 줄이는 방법은 정해져 있다.

1. **접근 순서를 통일한다.** 항상 ID 오름차순으로 잠그면 순환이 안 생긴다.
2. **트랜잭션을 짧게 한다.** 잠금 보유 시간이 짧으면 겹칠 확률이 준다([ParityPay 2편](/posts/parity-pay-lock-hold-time/)).
3. **인덱스를 만든다.** 잠기는 범위가 좁아진다.
4. **조건부 갱신으로 바꾼다.** 읽고 잠그고 쓰는 대신 `UPDATE ... WHERE`로 한 문장에 끝내면 잠금 구간이 사라진다.

## 진단

| 알고 싶은 것 | MySQL | PostgreSQL |
| --- | --- | --- |
| 지금 누가 무엇을 기다리는가 | `performance_schema.data_lock_waits` | `pg_locks` + `pg_stat_activity` |
| 최근 데드락 | `SHOW ENGINE INNODB STATUS` | 로그(`log_lock_waits`) |
| 어떤 락을 쥐고 있는가 | `performance_schema.data_locks` | `pg_locks` |

데드락 로그를 읽을 때 봐야 할 것은 **각 트랜잭션이 어떤 인덱스의 어떤 락을 기다렸는가**다. 거기에 gap 락이 보이면 원인이 인덱스 설계에 있을 가능성이 높다.

## 이 설명이 깨지는 곳

- **락 대기와 데드락은 다르다.** 대기는 기다리면 풀리고, 데드락은 영원히 안 풀려 한쪽이 죽어야 한다. 느린 쿼리 로그에 보이는 것은 대개 대기다.
- **메타데이터 락(MDL)은 별개다.** DDL이 테이블의 MDL을 기다리는 동안 그 뒤의 모든 쿼리가 줄을 선다. 행 락과 무관한 정지의 흔한 원인이다.
- **낙관적 잠금은 락이 아니다.** 버전 컬럼 비교로 충돌을 감지하는 것이고, DB 락과 실패 모드가 다르다.
- **분산락은 또 다른 이야기다.** 프로세스가 죽어도 남고 TTL이 정리해야 한다([ParityPay 10편](/posts/parity-pay-lock-lease/)).

## 무엇을 재면 확인되는가

1. 인덱스가 있을 때와 없을 때 같은 `UPDATE`가 잠그는 행 수를 `data_locks`로 센다. 차이가 극적이다. (아래 "직접 확인한 것"에서 확인했다.)
2. 격리 수준을 RR과 RC로 바꿔 가며 같은 부하의 데드락 발생률을 비교한다.
3. 접근 순서를 통일하기 전후의 데드락 건수.

1번이 가장 인상적이다. "행 락"이라는 말의 범위가 인덱스에 달려 있다는 것이 숫자로 보인다.

## 직접 확인한 것

위 1번을 MySQL 8.4.11 컨테이너에서 확인했다. 같은 `UPDATE`를 인덱스 유무 두 가지, 격리 수준 RR·RC 두 가지로 돌렸다. 세션 A가 트랜잭션을 연 채로 있는 동안 세션 B에서 `data_locks`를 읽고 세 문장을 시도했다.

### 준비

```bash
docker run -d --rm --name lockpilot -e MYSQL_ROOT_PASSWORD=pilot -e MYSQL_DATABASE=lab mysql:8.4
```

```sql
CREATE TABLE orders (
  id      INT PRIMARY KEY,
  user_id INT NOT NULL,
  amount  INT NOT NULL
);
INSERT INTO orders
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 1000)
SELECT n, n % 100, 0 FROM seq;

-- 인덱스가 있는 조건에서만
CREATE INDEX idx_user ON orders(user_id);
```

1,000행이고 `user_id`마다 10행씩이다. `user_id = 7`은 id 7, 107, …, 997이다.

### 단계

1. 세션 A: 격리 수준을 정하고 갱신한 뒤 커밋하지 않는다. 10행이 갱신된다.

   ```sql
   SET SESSION transaction_isolation = 'REPEATABLE-READ';  -- 또는 'READ-COMMITTED'
   BEGIN;
   UPDATE orders SET amount = amount + 1 WHERE user_id = 7;
   ```

2. 세션 B: A가 쥔 락을 센다.

   ```sql
   SELECT lock_type, index_name, lock_mode, COUNT(*) AS locks
   FROM performance_schema.data_locks
   WHERE object_name = 'orders'
   GROUP BY lock_type, index_name, lock_mode;
   ```

3. 세션 B: `innodb_lock_wait_timeout = 3`으로 다음 셋을 하나씩 시도하고 롤백한다.
   - `UPDATE orders SET amount = amount + 1 WHERE id = 500`: `user_id = 0`인 다른 행
   - `INSERT INTO orders VALUES (2000, 7, 0)`: 같은 `user_id`의 새 행
   - `INSERT INTO orders VALUES (2001, 50, 0)`: 무관한 `user_id`의 새 행
4. 세션 A를 롤백한다.

### RR, 인덱스 없음: 10행을 고치는데 1,003개를 잠근다

```text
+-----------+------------+-----------+-------+
| lock_type | index_name | lock_mode | locks |
+-----------+------------+-----------+-------+
| RECORD    | PRIMARY    | X         |  1003 |
| TABLE     | NULL       | IX        |     1 |
+-----------+------------+-----------+-------+
```

`lock_mode`가 `X` 하나뿐이다. 수식어 없는 `X`는 next-key 락이다. 1,000행 전부에 next-key가 걸렸다. 나머지 3개는 `lock_data`가 `supremum pseudo-record`인 락으로, 클러스터드 인덱스 리프 페이지 셋의 끝에 하나씩 걸린다. supremum의 next-key 락은 마지막 행 뒤의 구간을 잠그므로 테이블 끝에 붙는 삽입까지 막는다.

세션 B의 세 시도는 모두 `ERROR 1205 (HY000): Lock wait timeout exceeded`였다. **갱신 대상이 아닌 id 500의 갱신도, 무관한 `user_id = 50`의 삽입도 막혔다.** 본문의 "사실상 테이블 전체가 잠긴다"는 여기서 비유가 아니다.

### RR, 인덱스 있음: 21개, 막히는 것은 같은 user_id의 삽입뿐

```text
+-----------+------------+---------------+-------+
| lock_type | index_name | lock_mode     | locks |
+-----------+------------+---------------+-------+
| RECORD    | idx_user   | X             |    10 |
| RECORD    | idx_user   | X,GAP         |     1 |
| RECORD    | PRIMARY    | X,REC_NOT_GAP |    10 |
| TABLE     | NULL       | IX            |     1 |
+-----------+------------+---------------+-------+
```

보조 인덱스의 일치 항목 10개에 next-key가, 클러스터드 인덱스의 해당 행 10개에 record 락(`REC_NOT_GAP`)이 걸렸다. 그리고 gap 락이 하나 있다. 그 gap 락의 `lock_data`는 `8, 8`이다. `idx_user`에서 `(user_id 8, id 8)` 바로 앞 구간, 즉 `(7, 997)`과 `(8, 8)` 사이다.

| 세션 B 시도 | 결과 |
| --- | --- |
| id 500 갱신 | 즉시 성공 |
| `(2000, 7)` 삽입 | 1205 대기 초과 |
| `(2001, 50)` 삽입 | 즉시 성공 |

`(7, 2000)`은 정확히 `(7, 997)`과 `(8, 8)` 사이에 들어갈 항목이라 그 gap 락에 걸린다. 같은 조건을 다시 읽었을 때 행이 늘어나는 것, 즉 팬텀을 막는 락이 그 자리에 하나 있다.

### RC: 인덱스가 없어도 일치한 10행만 남는다

```text
-- 인덱스 없음
| RECORD    | PRIMARY    | X,REC_NOT_GAP |    10 |
| TABLE     | NULL       | IX            |     1 |

-- 인덱스 있음
| RECORD    | idx_user   | X,REC_NOT_GAP |    10 |
| RECORD    | PRIMARY    | X,REC_NOT_GAP |    10 |
| TABLE     | NULL       | IX            |     1 |
```

두 경우 모두 gap 락이 없고, 세션 B의 세 시도가 모두 즉시 성공했다.

인덱스가 없는 쪽은 예상과 달랐다. 전체를 훑는 것은 RR과 같은데 남은 락은 10개다. MySQL 문서에 따르면 RC에서는 `WHERE`를 평가한 뒤 일치하지 않는 행의 레코드 락을 놓는다. 그래서 본문의 "인덱스가 없으면 사실상 테이블 전체가 잠긴다"는 **RR에서의 이야기**다. RC에서는 훑는 동안 잡았다가 놓을 뿐이다. 남는 비용은 전체 스캔 자체와, 잡았다 놓는 그 순간의 경합이다.

### 네 조건을 한 표로

| 조건 | 남는 락 | id 500 갱신 | `user_id 7` 삽입 | `user_id 50` 삽입 |
| --- | ---: | --- | --- | --- |
| RR, 인덱스 없음 | 1,003 + IX | 대기 | 대기 | 대기 |
| RR, 인덱스 있음 | 21 + IX | 성공 | 대기 | 성공 |
| RC, 인덱스 없음 | 10 + IX | 성공 | 성공 | 성공 |
| RC, 인덱스 있음 | 20 + IX | 성공 | 성공 | 성공 |

같은 조건으로 두 번 돌렸고, 락 개수와 차단 여부가 모두 같았다.

### 틀렸던 것과 한계

- **첫 실행에서 세션 A가 락을 너무 일찍 놓았다.** A가 12초만 트랜잭션을 쥐고 있어서, B의 마지막 두 시도는 A의 롤백 뒤에 실행됐다. 그 실행에서는 RR·인덱스 없음에서도 두 삽입이 성공으로 찍혔다. A가 120초를 쥐고 측정이 끝나면 `KILL`되도록 바꿔 다시 돌린 결과가 위 표다. **차단 실험에서 "성공"은 상대가 아직 락을 쥐고 있을 때만 의미가 있다.**
- 1,000행 하나의 크기만 봤다. RR·인덱스 없음의 1,003이 "행 수 + 리프 페이지 수"라는 해석은 이 한 점에서 나온 것이다.
- RC에서 일치하지 않는 행을 잡았다 놓는 순간은 `data_locks` 스냅샷에 남지 않는다. 그 순간의 경합은 재지 않았다.
- 2번과 3번(데드락 발생률)은 부하가 필요한 항목이라 이번 범위 밖이다.

## 실무와의 접점

[대량 배치 4부](/posts/bulk-insert-with-lock-part4/)에서 "락이 있어도 레이스가 난 이유"를 다뤘다. 그때 다룬 것은 분산락이었지만, DB 락에서도 같은 구조의 실수가 나온다. **락의 이름이 아니라 그 락이 무엇을 언제 검사하는가가 정합성을 정한다.** [ParityPay 10편](/posts/parity-pay-lock-lease/)의 결론도 같았다. 단일 행 조건으로 환원되는 문제는 락이 아니라 조건부 UPDATE로 푸는 것이 정확하고 빠르다.

## 정리

- 일반 `SELECT`는 락을 걸지 않는다. MVCC 덕에 읽기와 쓰기가 서로 막지 않는다.
- intention 락은 테이블 수준의 의사 표시이고, 그 자체는 경합이 아니다.
- gap 락은 빈 구간의 삽입을 막아 팬텀을 방지한다. 없는 행을 잠가도 락이 걸리는 이유다.
- 인덱스가 없으면 잠기는 범위가 사실상 테이블 전체가 된다.
- READ COMMITTED에서는 gap 락이 대부분 사라진다. 팬텀을 내주고 경합을 줄이는 거래다.
- 데드락은 정상 동작이다. 접근 순서 통일, 짧은 트랜잭션, 인덱스, 조건부 갱신으로 줄인다.

## 참고

- [MySQL: InnoDB Locking](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking.html)
- [MySQL: Deadlocks in InnoDB](https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks.html)
- [MySQL: Transaction Isolation Levels](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html)
- [PostgreSQL: Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Gap Lock 정리](/posts/gap-lock/), [MVCC 정리](/posts/mvcc/)
