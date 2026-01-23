---
title: "격리 수준의 이상 현상을 직접 만들기 - 같은 REPEATABLE READ에서 PostgreSQL은 중단시키고 MySQL은 조용히 덮어썼다"
date: 2026-01-23
categories: [Notes, Database]
tags: [Database, Isolation Level, Transaction, PostgreSQL, MySQL, Concurrency, Experiment]

problem_decision_result:
  problem: "격리 수준 표는 어느 이상 현상이 '가능한가'만 말한다. 실제로 쓰는 DB가 그 수준에서 무엇을 막고 무엇을 통과시키는지, 막을 때 어떻게 막는지는 표에 없다. 특히 lost update와 write skew는 표준의 세 현상에 없어서 표를 보고는 판단할 수 없다."
  decision: "네 가지 이상 현상과 조치 후보(조건부 UPDATE)를 두 세션의 고정된 interleaving으로 재현하는 하니스를 만들고, PostgreSQL 17과 MySQL 8.4에서 세 격리 수준 × 20회 반복으로 쟀다. 판정 기준은 예외 발생 여부가 아니라 끝난 뒤 데이터가 어떻게 되어 있는가로 두고, 엔진이 막았을 때는 어떤 방식으로 막았는지를 따로 분류했다."
  result: "READ COMMITTED에서는 네 현상이 양쪽 엔진 모두 20/20으로 났다. REPEATABLE READ에서 lost update가 갈렸다. PostgreSQL은 20/20 직렬화 실패로 중단시켰고 MySQL은 20/20 조용히 덮어썼다. write skew는 양쪽 RR에서 20/20 살아남았다. SERIALIZABLE의 비용 모양도 갈렸다. PostgreSQL은 22~36ms에 커밋 시점 거절이고, MySQL은 일반 SELECT가 잠금 읽기가 되어 쓰는 쪽이 잠금 타임아웃까지 3,051ms 막혔다. 조건부 UPDATE는 모든 칸에서 8,500을 만들었지만, PostgreSQL RR·SERIALIZABLE에서는 직렬화 실패 20/20을 동반해 재시도가 필요했다."
---

[격리 수준과 이상 현상](/posts/isolation-levels-and-anomalies/)에서 표준이 정의한 세 현상과 표준에 없는 둘(lost update, write skew)을 정리했다. 그 글은 문서를 근거로 썼고, 마지막에 "다음 세 가지는 직접 만들어야 보인다"를 적어 뒀다. 이 글이 그것을 만든 기록이다.

저장소는 [data-ops-lab](https://github.com/polynomeer/data-ops-lab)이고 재실행은 한 줄이다.

```bash
./.venv/bin/python experiments/isolation/run.py --repeat 20
```

## 무엇을 어떻게 쟀는가

두 세션의 실행 순서를 이벤트로 고정해 각 이상 현상이 나는 interleaving을 강제한다. 그래서 이 수치는 **확률이 아니라 존재 증명**이다. "이 조건에서 이 현상이 난다"까지만 말한다.

| 시나리오 | 만드는 상황 |
| --- | --- |
| lost update | 둘 다 10,000을 읽고, 각자 다른 금액을 빼고, 조건 없이 쓴다 |
| non-repeatable read | 같은 행을 두 번 읽는 사이에 다른 세션이 커밋한다 |
| phantom | 같은 조건으로 두 번 세는 사이에 다른 세션이 행을 넣는다 |
| write skew | "최소 한 명은 당직"인데 둘 다 "상대가 있네"를 읽고 각자 빠진다 |
| 조건부 UPDATE | 읽지 않고 `UPDATE ... WHERE balance >= :amount` 한 문장으로 |

판정은 예외가 났는지가 아니라 **끝난 뒤 데이터가 어떻게 되어 있는가**다. lost update라면 8,500이어야 맞고 9,000이나 9,500이면 하나를 잃은 것이다.

환경은 컨테이너 리소스를 고정했다. PostgreSQL 17과 MySQL 8.4 각각 `cpus: 2, mem_limit: 2g`. 세션마다 잠금 타임아웃을 3초로 명시했다.

## 결과: 이상 현상 발생 (20회 중)

| 시나리오 | PG RC | PG RR | PG SER | MySQL RC | MySQL RR | MySQL SER |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| lost update | **20** | 0 | 0 | **20** | **20** | 0 |
| non-repeatable read | **20** | 0 | 0 | **20** | 0 | 0 |
| phantom | **20** | 0 | 0 | **20** | 0 | 0 |
| write skew | **20** | **20** | 0 | **20** | **20** | 0 |
| 조건부 UPDATE | 0 | 0 | 0 | 0 | 0 | 0 |

모든 칸이 20/20 아니면 0/20이다. 간헐적인 것은 하나도 없었다.

## 갈리는 곳 1: 같은 REPEATABLE READ에서 lost update

표에서 가장 중요한 줄이 이것이다.

- **PostgreSQL RR**: 20/20 `could not serialize access due to concurrent update`. 애플리케이션에 **오류를 준다.**
- **MySQL RR**: 20/20 조용히 덮어쓴다. 최종 잔액 9,000. 애플리케이션에 **틀린 데이터를 준다.**

같은 이름의 격리 수준이고 둘 다 표준을 어기지 않는다. 표준이 lost update를 정의하지 않기 때문이다. 그런데 애플리케이션이 준비해야 할 것이 정반대다. 한쪽은 재시도 로직이 필요하고, 다른 쪽은 **애초에 이 코드를 쓰면 안 된다.**

"격리 수준을 올리면 lost update가 막힌다"는 문장이 MySQL에서는 성립하지 않는다는 것이 20/20으로 나왔다.

## 갈리는 곳 2: RR이 팬텀을 막는다

표준은 REPEATABLE READ에서 팬텀을 허용한다. **양쪽 엔진 모두 막았다**(0/20). PostgreSQL은 트랜잭션 단위 스냅샷으로, MySQL은 일반 `SELECT`가 일관된 읽기라서 그렇다.

표준의 표를 "이 수준에서는 이 현상이 난다"로 읽으면 양방향으로 틀린다. 표에 있는데 안 나는 것(팬텀)이 있고, 표에 없는데 나는 것(write skew)이 있다.

## 갈리는 곳 3: SERIALIZABLE의 비용 모양

write skew는 양쪽 RR에서 20/20 살아남았고 SERIALIZABLE에서만 막혔다. 그런데 막는 방식이 다르다.

| | PostgreSQL SER | MySQL SER |
| --- | --- | --- |
| 방식 | 커밋 시점 충돌 탐지(SSI) | 일반 `SELECT`가 잠금 읽기 |
| 거절 형태 | `serialization_failure` 20/20 | `deadlock` 20/20 |
| 읽는 쪽이 쓰는 쪽을 막는가 | **아니오** | **예** |

비용이 숫자로 갈렸다. non-repeatable read와 phantom 시나리오의 중앙값이다.

| | PG RR | PG SER | MySQL RR | MySQL SER |
| --- | ---: | ---: | ---: | ---: |
| non-repeatable read | 19.4 ms | 26.0 ms | 30.9 ms | **3,051.1 ms** |
| phantom | 20.1 ms | 22.2 ms | 29.8 ms | **3,047.8 ms** |

MySQL의 3초는 **작업 시간이 아니라 잠금 타임아웃**이다. 읽는 세션이 공유 잠금을 쥐고 있어 쓰는 세션이 3초를 기다리다 포기했다. 타임아웃을 기본값 50초로 두면 50초가 된다. 즉 여기서 가져갈 값은 "3초"가 아니라 **"타임아웃까지 막힌다"** 다.

PostgreSQL SERIALIZABLE은 같은 시나리오에서 22~26ms다. 읽는 쪽이 쓰는 쪽을 막지 않고, 충돌은 커밋할 때 판정한다. **낙관적과 비관적의 차이가 100배의 벽시계 시간으로 보인다.**

## 조치: 조건부 UPDATE는 모든 칸에서 맞았다, 다만

읽고 계산해서 쓰는 대신 한 문장으로 쓴다.

```sql
UPDATE account SET balance = balance - :amount
WHERE id = 1 AND balance >= :amount;
```

여섯 칸 전부 최종 8,500이었다. 그런데 **거절 여부가 갈렸다.**

| | 적용된 행 | 거절 |
| --- | ---: | --- |
| PG RC | 2 | - |
| PG RR | 1 | serialization_failure 20/20 |
| PG SER | 1 | serialization_failure 20/20 |
| MySQL RC | 2 | - |
| MySQL RR | 2 | - |
| MySQL SER | 2 | - |

READ COMMITTED(PostgreSQL 기본값)와 MySQL의 세 수준 전부에서 **거절 없이 두 갱신이 다 적용**됐다. PostgreSQL의 RR과 SERIALIZABLE에서는 스냅샷 충돌로 한쪽이 직렬화 실패를 받았고, 그래서 한 갱신만 남았다.

여기서 [개념 글의 주장을 한 번 좁혀야 한다](/posts/isolation-levels-and-anomalies/). "단일 행 조건으로 환원되는 문제는 조건부 UPDATE로 쓴다"는 여전히 맞지만, **그것이 재시도를 없애 주는 것은 READ COMMITTED에서다.** 스냅샷 격리 위에서는 조건부 UPDATE도 직렬화 실패를 받는다. 조건부 UPDATE가 없애는 것은 "언제 읽었는가"라는 질문이지 "충돌이 있었는가"라는 질문이 아니다.

## 실무로 옮기면

- **기본값을 확인한다.** PostgreSQL 기본은 READ COMMITTED, MySQL 기본은 REPEATABLE READ다. 두 DB를 함께 쓰는 조직에서 "우리는 기본값을 쓴다"는 말이 서로 다른 것을 뜻한다.
- **MySQL RR에서 읽고-계산하고-쓰는 코드는 데이터를 잃는다.** 조용히. 20/20으로 그렇다. 이 패턴이 있으면 조건부 UPDATE나 명시적 잠금 읽기(`FOR UPDATE`)로 바꾼다.
- **PostgreSQL에서 RR 이상을 쓰면 재시도가 기능의 일부다.** 직렬화 실패는 버그가 아니라 계약이다.
- **MySQL SERIALIZABLE은 읽기가 쓰기를 막는다.** 조회가 많은 서비스에서 이 수준을 켜면 지연이 아니라 정지에 가깝게 나타난다.

[ParityPay 1편](/posts/parity-pay-invariants/)의 INV-003("지갑 가용 잔액은 음수가 되지 않는다")을 격리 수준이 아니라 조건부 UPDATE와 DB 제약으로 지킨 이유가 이 표에 있다. 그리고 [10편](/posts/parity-pay-lock-lease/)에서 분산락 대신 조건부 원자 UPDATE를 고른 근거도 같은 자리다. 다만 그 프로젝트는 PostgreSQL을 READ COMMITTED로 쓰므로 위 표의 첫 열에 해당하고, 격리 수준을 올렸다면 재시도 설계가 따라왔어야 한다.

## 측정에서 틀렸던 것

첫 구현은 두 세션의 순서를 `threading.Barrier`로 맞췄다. 한쪽이 잠금에 막히면 배리어에 도달하지 못하고 상대가 `BrokenBarrierError`로 죽는다. 결과 표에는 `other:`라는 빈 이름의 항목이 남았고, **실제로 무슨 일이 있었는지가 표에서 사라졌다.**

사라진 것이 하필 가장 중요한 정보였다. MySQL SERIALIZABLE에서 쓰는 쪽이 막힌다는 사실 자체가 그 격리 수준의 비용이다. 이벤트 기반으로 바꾸고 잠금 타임아웃을 3초로 명시하자 그것이 `lock_timeout 20/20`이라는 측정값으로 돌아왔다([ADR-001](https://github.com/polynomeer/data-ops-lab/blob/main/docs/adr/001-record-blocking-as-a-result.md)).

**"이상 현상이 안 났다"와 "엔진이 막았다"는 전혀 다른 사실인데, 도구가 그것을 구분하지 못하면 표에서 같아 보인다.**

## 한계

- **두 세션, 한 행이다.** 경합이 최대이고 인위적이다. 어떤 현상이 가능한지를 말하지 실제 트래픽에서 얼마나 자주 나는지는 말하지 않는다.
- **interleaving을 강제했다.** 확률이 아니라 존재 증명이다.
- **MySQL의 3초는 설정값이다.** 기본값 50초면 50초다. 가져갈 것은 "타임아웃까지 막힌다"이지 3초가 아니다.
- **재시도 루프가 없다.** PostgreSQL의 직렬화 실패는 실제 애플리케이션이라면 재시도가 흡수한다. 재시도 아래의 실효 처리량이 더 흥미로운 질문인데 여기서는 재지 않았다.
- **단일 노드다.** 복제 지연은 어떤 격리 수준으로도 해결되지 않는 별개의 낡은 읽기 원천이고, 이 실험의 범위 밖이다.
- **잠금 읽기(`FOR UPDATE`) 경로를 재지 않았다.** MySQL RR의 lost update를 막는 또 다른 방법이고, 그 비용은 별도 측정이 필요하다.

## 정리

- READ COMMITTED에서는 네 현상이 양쪽 엔진 모두 20/20으로 난다.
- 같은 REPEATABLE READ에서 PostgreSQL은 lost update를 중단시키고 MySQL은 조용히 덮어쓴다. 표준이 이 현상을 정의하지 않기 때문에 둘 다 위반이 아니다.
- 표준의 표를 동작 보장으로 읽으면 양방향으로 틀린다. 표에 있는데 안 나는 것(팬텀)과 표에 없는데 나는 것(write skew)이 있다.
- SERIALIZABLE의 비용 모양이 다르다. PostgreSQL은 커밋 시점에 거절하고 22~36ms, MySQL은 읽기가 쓰기를 막아 타임아웃까지 3,051ms다.
- 조건부 UPDATE는 여섯 칸 전부에서 정확했지만, PostgreSQL의 스냅샷 격리 위에서는 직렬화 실패를 동반한다. "언제 읽었는가"를 없앨 뿐 충돌을 없애지는 않는다.
- 측정 도구가 "안 났다"와 "막혔다"를 구분하지 못하면 가장 중요한 결과가 표에서 사라진다.

## 참고

- [data-ops-lab](https://github.com/polynomeer/data-ops-lab) — 실험 저장소. 원본은 `reports/data/t1-isolation.json`, 표는 `reports/01-experiment-report.md`
- [격리 수준과 이상 현상](/posts/isolation-levels-and-anomalies/) — 이 실험의 개념 짝
- [PostgreSQL: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [MySQL: InnoDB Transaction Isolation Levels](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html)
