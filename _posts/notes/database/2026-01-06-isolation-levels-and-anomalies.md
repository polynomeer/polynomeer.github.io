---
title: "격리 수준과 이상 현상 - 표준이 정의한 것과 MySQL·PostgreSQL이 실제로 하는 것"
date: 2026-01-06
categories: [Notes, Database]
tags: [Database, Transaction, Isolation Level, MVCC, PostgreSQL, MySQL, Concurrency]
---

격리 수준을 "READ COMMITTED는 커밋된 것만 읽는다" 정도로 외우고 있으면, 실무에서 만나는 질문에 답할 수 없다. 같은 REPEATABLE READ인데 MySQL에서는 팬텀이 안 보이고 PostgreSQL에서는 갱신이 실패하며, 두 DB 모두 표준을 지키고 있다. 표준이 무엇을 정의했고 무엇을 정의하지 않았는지를 나누면 이 차이가 설명된다.

## 표준이 정의한 세 가지

SQL-92는 격리 수준을 **금지하는 이상 현상**으로 정의한다. 구현 방법이 아니라 금지 목록이다.

| 이상 현상 | 내용 |
| --- | --- |
| Dirty read | 커밋되지 않은 다른 트랜잭션의 변경을 읽는다 |
| Non-repeatable read | 같은 행을 두 번 읽었는데 값이 다르다 |
| Phantom | 같은 조건으로 두 번 조회했는데 행 수가 다르다 |

| 격리 수준 | Dirty | Non-repeatable | Phantom |
| --- | --- | --- | --- |
| READ UNCOMMITTED | 가능 | 가능 | 가능 |
| READ COMMITTED | 금지 | 가능 | 가능 |
| REPEATABLE READ | 금지 | 금지 | 가능 |
| SERIALIZABLE | 금지 | 금지 | 금지 |

이 표가 격리 수준 설명의 거의 전부로 쓰이는데, 여기에 **두 가지가 빠져 있다.**

## 표준에 없는 두 가지: lost update와 write skew

1995년 Berenson 등의 「A Critique of ANSI SQL Isolation Levels」가 지적한 것이 이 빈칸이다. 표준의 세 현상은 잠금 기반 구현을 전제로 쓰였고, 스냅샷 기반 구현에서 생기는 문제를 담지 못한다.

**Lost update.** 두 트랜잭션이 같은 행을 읽고, 계산하고, 쓴다. 나중에 쓴 쪽이 먼저 쓴 쪽의 결과를 덮는다. 세 현상 어디에도 해당하지 않는다. 각자는 커밋된 값을 읽었고, 자기 트랜잭션 안에서는 값이 바뀌지도 않았다.

```sql
-- T1                          -- T2
SELECT balance FROM w WHERE id=1;   -- 10000
                               SELECT balance FROM w WHERE id=1;  -- 10000
UPDATE w SET balance=9000 WHERE id=1;
COMMIT;
                               UPDATE w SET balance=9500 WHERE id=1;
                               COMMIT;   -- 9000이 사라진다
```

**Write skew.** 각자 다른 행을 쓰지만 두 트랜잭션이 함께 제약을 깬다. "당직자는 최소 한 명"이라는 규칙 아래에서 두 사람이 동시에 "나 말고 한 명 더 있네"를 읽고 각자 빠지는 경우다. 각자의 쓰기는 다른 행이라 충돌 감지에도 걸리지 않는다.

## 같은 이름, 다른 동작

**PostgreSQL**은 MVCC 스냅샷으로 구현한다. READ COMMITTED는 **문장 단위** 스냅샷, REPEATABLE READ는 **트랜잭션 단위** 스냅샷이다. 그래서 PostgreSQL의 REPEATABLE READ에서는 팬텀도 보이지 않는다. 표준이 허용하는 것보다 엄격하다. 대신 갱신 충돌이 나면 `could not serialize access due to concurrent update`로 **트랜잭션을 실패시킨다.** 애플리케이션이 재시도를 준비해야 한다.

SERIALIZABLE은 SSI(Serializable Snapshot Isolation)로 읽기 의존성까지 추적해 write skew를 잡는다. 잠금이 아니라 사후 탐지라서 직렬화 실패가 더 자주 난다.

**MySQL InnoDB**의 기본값은 REPEATABLE READ다. 일반 `SELECT`는 트랜잭션 시작 시점의 일관된 읽기라 팬텀이 안 보이고, `SELECT ... FOR UPDATE`나 `UPDATE` 같은 잠금 읽기는 **next-key 락**(행 락 + 갭 락)으로 팬텀을 막는다. 즉 같은 트랜잭션 안에서 잠금 없는 읽기와 잠금 읽기가 서로 다른 시점을 볼 수 있다.

| | PostgreSQL RR | MySQL RR |
| --- | --- | --- |
| 팬텀 | 스냅샷으로 안 보임 | 일반 읽기는 안 보임, 잠금 읽기는 갭 락으로 막음 |
| Lost update | 직렬화 실패로 중단 | 먼저 커밋한 쪽이 이김(조건 없는 UPDATE면 덮어씀) |
| 충돌 시 | 예외, 재시도 필요 | 대기 또는 데드락 |

여기서 실무 결론 하나가 나온다. **격리 수준을 올리는 것이 lost update의 답이 아니다.** PostgreSQL에서는 예외가 늘고 MySQL에서는 여전히 덮어쓴다. 답은 쓰기 자체를 조건부로 만드는 것이다.

```sql
UPDATE wallet SET balance = balance - 1000
WHERE id = 1 AND balance >= 1000;   -- 영향 행 수 0이면 거절
```

읽은 값을 애플리케이션이 계산해 넣지 않고, DB가 쓰는 순간 조건을 검사한다. "언제 읽었는가"를 묻지 않으므로 스냅샷 시점이 결과를 바꾸지 않는다.

## 이 설명이 깨지는 곳

- **격리 수준은 트랜잭션 사이에만 적용된다.** 애플리케이션이 트랜잭션 밖에서 읽고 안에서 쓰면 어떤 격리 수준도 도와주지 않는다. 실무에서 만나는 "격리 수준을 올렸는데 왜 안 되죠"의 절반이 이 경우다.
- **기본값은 드라이버와 프레임워크가 바꾼다.** 스프링의 `@Transactional(isolation = ...)`을 지정하지 않으면 DB 기본값이지만, 커넥션 풀이나 프록시(PgBouncer의 transaction 모드 등)가 중간에 있으면 기대와 달라질 수 있다.
- **읽기 전용 복제본은 격리 수준의 논의 밖이다.** 복제 지연은 어떤 격리 수준으로도 해결되지 않는다.
- **SERIALIZABLE은 "느리다"가 아니라 "실패한다"** 가 더 정확하다. 비용의 형태가 지연이 아니라 재시도라는 뜻이고, 재시도 설계가 없으면 성능이 아니라 정확성 문제가 된다.

## 무엇을 재면 확인되는가

문서로는 여기까지다. 다음 세 가지는 직접 만들어야 보인다.

1. 두 세션에서 읽기-계산-쓰기를 겹치게 만들고 격리 수준별로 잔액이 어떻게 되는지.
2. 같은 조건에서 조건부 `UPDATE`의 영향 행 수가 0이 되는 비율.
3. SERIALIZABLE에서 직렬화 실패율과 재시도를 붙였을 때의 실효 처리량.

[ParityPay 10편](/posts/parity-pay-lock-lease/)에서 이 중 일부를 쟀다. 분산락 아래 조회→계산→저장은 같은 멈춤에서 소유 겹침 1,697~1,714쌍에 초과 승인 340~350건이었고, 조건부 원자 UPDATE는 같은 조건에서 여섯 번 전부 정확히 240건·drift 0이었다. 락이나 격리 수준이 아니라 **쓰는 순간 DB가 조건을 검사하는 것**이 차이를 만들었다.

## 실무와의 접점

[ParityPay 1편](/posts/parity-pay-invariants/)의 INV-003 "지갑 가용 잔액은 음수가 되지 않는다"는 격리 수준으로 지키지 않는다. 조건부 UPDATE와 DB 제약으로 지킨다. 불변조건을 문장으로 쓰고 나면 "어느 격리 수준이 필요한가"가 아니라 "이 문장을 어디서 강제하는가"로 질문이 바뀐다.

[대량 배치 4부](/posts/bulk-insert-with-lock-part4/)의 "락이 있어도 레이스가 난 이유"도 같은 계열이다. 보호 장치의 이름이 아니라 그 장치가 검사하는 시점이 정합성을 정한다.

## 정리

- 표준은 금지 목록이지 구현이 아니다. 같은 이름의 격리 수준이 DB마다 다르게 동작하는 것은 위반이 아니다.
- Lost update와 write skew는 표준의 세 현상에 없다. 격리 수준 표만 보고 설계하면 이 둘을 놓친다.
- PostgreSQL RR은 충돌을 예외로 알리고, MySQL RR은 잠금으로 대기시킨다. 애플리케이션이 준비해야 할 것이 다르다.
- 단일 행 조건으로 환원되는 문제는 격리 수준을 올릴 것이 아니라 조건부 UPDATE로 쓴다.
- SERIALIZABLE의 비용은 지연이 아니라 재시도다.

## 참고

- [PostgreSQL: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [MySQL: InnoDB Transaction Isolation Levels](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html)
- Berenson et al., [A Critique of ANSI SQL Isolation Levels](https://arxiv.org/abs/cs/0701157) (1995)
- [MVCC 정리](/posts/mvcc/), [Gap Lock 정리](/posts/gap-lock/)
