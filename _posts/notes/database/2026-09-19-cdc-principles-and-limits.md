---
title: "CDC의 원리와 한계 - 로그 기반 변경 포착, 초기 스냅샷, 스키마 변경"
date: 2026-09-19
categories: [Notes, Database]
tags: [CDC, Debezium, Database, Kafka, Replication, WAL, Event Driven]
---

DB의 변경을 다른 시스템에 전달하는 방법으로 CDC가 널리 쓰인다. "애플리케이션 코드를 건드리지 않고 변경을 가져온다"는 점이 매력인데, 그 대가가 어디에 있는지는 덜 이야기된다. 원리를 보면 무엇이 공짜이고 무엇이 아닌지가 갈린다.

## 세 가지 방식

폴링은 `updated_at > ?`로 주기적으로 조회한다. 구현이 단순하고 DB 기능에 의존하지 않는다. 대신 삭제를 감지할 수 없고, 같은 주기 안의 여러 변경이 하나로 합쳐지며, 폴링 간격만큼 지연이 붙고, 조회가 DB에 부하를 준다.

트리거 방식은 변경 시 트리거가 별도 테이블에 기록한다. 삭제도 잡히고 중간 상태도 남는다. 대신 모든 쓰기에 트리거 실행 비용이 붙고, 그 실행이 원본 트랜잭션 안에서 돈다.

로그 기반은 DB가 복제를 위해 이미 쓰고 있는 로그를 읽는다. PostgreSQL의 WAL, MySQL의 [binlog](https://dev.mysql.com/doc/refman/8.4/en/binary-log.html)다. Debezium이 이 방식이고, 지금 CDC라고 하면 대개 이것을 뜻한다.

로그 기반이 좋은 이유는 **이미 쓰이고 있는 것을 읽기만 하기 때문**이다. 쓰기 경로에 비용이 거의 붙지 않고, 모든 변경이 순서대로 기록되어 있으며, 삭제도 당연히 들어 있다.

## 커넥터가 스스로를 복제본으로 만든다

Debezium은 DB에게 자기가 복제본인 것처럼 행동한다. MySQL에서는 `database.server.id`로 클러스터에 서버 하나로 참여해 binlog를 읽고([Debezium MySQL 문서](https://debezium.io/documentation/reference/stable/connectors/mysql.html)), PostgreSQL에서는 논리 복제 슬롯을 만들어 WAL을 논리적 변경으로 디코딩해 받는다.

이때 **복제 슬롯은 커넥터가 읽을 때까지 WAL을 보관한다.** 슬롯은 소비자의 상태를 모른다.

> "They will prevent removal of required resources even when there is no connection using them." ([PostgreSQL 문서](https://www.postgresql.org/docs/current/logicaldecoding-explanation.html))

연결이 없어도 필요한 자원의 삭제를 막는다는 뜻이다. 그래서 커넥터가 멈추면 슬롯의 위치가 진행되지 않고, DB는 그 지점부터의 WAL을 지우지 못해 디스크가 찬다. CDC 운영에서 가장 흔한 장애가 이것이고, 커넥터 중단이 DB 장애로 번지는 경로다. 슬롯의 지연(`pg_replication_slots`의 `restart_lsn`, `confirmed_flush_lsn`과 현재 LSN의 차이)을 반드시 감시해야 한다.

DB 쪽 상한은 [`max_slot_wal_keep_size`](https://www.postgresql.org/docs/current/runtime-config-replication.html)다. 기본값 `-1`은 무제한이고, 상한을 넘기면 필요한 WAL이 지워져 그 슬롯으로 복제를 이어 가지 못할 수 있다. 디스크를 지키는 대신 다음 절의 재스냅샷을 감수하는 설정이다.

애플리케이션 코드를 건드리지 않는 대신 DB 운영에 새 결합이 생긴 것이다.

## 초기 스냅샷

커넥터를 처음 붙이면 그 시점 이후의 변경만 로그에 있다. 기존 데이터를 옮기려면 스냅샷이 필요하다.

전통적인 방식은 테이블을 잠그고 전체를 읽은 뒤 그 지점부터 로그를 따라가는 것이다. 정확하지만 큰 테이블에서는 오래 걸리고 그 동안 잠금이 걸린다. 중간에 실패하면 처음부터 다시 하고, 그 동안 스트리밍도 막힌다([Debezium 블로그](https://debezium.io/blog/2021/10/07/incremental-snapshots/)).

증분 스냅샷(Debezium의 signal 기반)은 Netflix [DBLog](https://arxiv.org/abs/2010.12597)의 워터마크 방식을 가져온 것이다. 테이블을 청크로 나눠 읽으면서 동시에 로그도 처리한다. 잠금이 필요 없고 중간에 재시작할 수 있다. 스냅샷 중에 같은 행이 변경되면 버퍼에 담아 둔 스냅샷 쪽 READ 이벤트를 버리고 로그 쪽 이벤트를 남긴다([Debezium PostgreSQL 문서](https://debezium.io/documentation/reference/stable/connectors/postgresql.html)).

운영에서 **스냅샷은 일회성 작업이 아니다.** 새 테이블을 추가할 때, 커넥터가 너무 오래 멈춰 WAL이 사라졌을 때, 대상 시스템을 재구축할 때 다시 필요하다. 그 절차가 준비돼 있지 않으면 그때 사고가 난다.

## 스키마 변경

로그에는 그 시점의 스키마로 해석해야 하는 바이너리 데이터가 들어 있다. 컬럼이 추가되기 전의 레코드와 후의 레코드가 같은 스트림에 섞여 있다.

Debezium MySQL 커넥터는 DDL과 그 binlog 위치를 스키마 이력 토픽에 보관해 각 레코드를 올바른 스키마로 해석한다. 이 토픽이 유실되면 `snapshot.mode=recovery`로 현재 테이블 구조에서 이력을 다시 만들어야 한다. PostgreSQL은 논리 디코딩이 DDL을 지원하지 않아, 커넥터가 DDL 이벤트를 내지 못하고 메모리의 테이블 스키마를 갱신하며 따라간다.

하류 소비자도 준비가 필요하다. 컬럼 추가는 대개 안전하지만, 컬럼 제거나 타입 변경은 소비자를 깨뜨린다([API 버저닝과 호환성](/posts/api-versioning-compatibility/)). **DDL 배포와 CDC 소비자 배포의 순서를 정해 둬야 한다.**

## 트랜잭션 경계

로그 기반 CDC는 행 단위 변경을 내보낸다. 한 트랜잭션에서 세 테이블을 바꿨다면 이벤트 세 개가 나가고, 소비자는 그것이 한 트랜잭션이었는지 기본적으로 알 수 없다.

Debezium은 트랜잭션마다 BEGIN과 END 이벤트를 별도 토픽에 내고, END에 테이블별 이벤트 수를 담는다. 이것으로 경계를 복원할 수 있지만 소비자 쪽 구현이 복잡해진다. 그래서 **"주문과 결제가 함께 바뀐 것"을 원자적으로 처리해야 한다면 CDC보다 Outbox가 맞다.**

## CDC와 Outbox

둘은 자주 대비된다. 아래 표의 CDC는 업무 테이블을 직접 내보내는 경우다.

| | CDC | Outbox |
| --- | --- | --- |
| 내보내는 것 | 테이블의 행 변경 | 애플리케이션이 정의한 **도메인 이벤트** |
| 코드 변경 | 없음 | 이벤트를 쓰는 코드 필요 |
| 결합 | 소비자가 **테이블 스키마**에 결합 | 소비자가 이벤트 계약에 결합 |
| 의미 | "이 행이 이렇게 바뀜" | "주문이 승인됨" |
| 트랜잭션 경계 | 복원이 어렵다 | 이벤트 하나로 표현 가능 |

가장 큰 차이는 **결합의 대상**이다. CDC를 쓰면 하류 시스템이 우리 테이블 구조에 묶이고, 컬럼 이름을 바꾸는 리팩터링이 다른 팀을 깨뜨린다. Outbox는 계약을 명시적으로 정의하므로 내부 구조를 바꿀 자유가 남는다. Debezium의 Outbox 글도 이 점을 든다.

> "This also helps to make sure that event consumers won't break when for instance altering the internal domain model or the `PurchaseOrder` table." ([Gunnar Morling](https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/))

내부 모델이나 테이블을 바꿔도 소비자가 깨지지 않는다는 뜻이다.

[ParityPay 5편](/posts/parity-pay-outbox/)이 Outbox를 택한 이유가 이것이었고, 그 글의 한계에 "폴링 지연 500ms"를 적었다. 업무 테이블을 CDC로 내보내면 그 지연은 줄지만 결합의 성격이 바뀐다. 다만 이 교환은 릴레이가 폴링일 때의 이야기다. 릴레이는 로그 테일링으로도 만들 수 있고([microservices.io](https://microservices.io/patterns/data/transactional-outbox.html)), 위 글은 Debezium으로 Outbox 테이블을 읽어 계약은 유지한 채 폴링 지연을 없앤다.

실용적인 기준은 이렇다. 데이터 복제(검색 인덱스, 데이터 웨어하우스, 캐시 갱신)에는 CDC, 도메인 이벤트 발행에는 Outbox.

## 이 설명이 깨지는 곳

- CDC는 at-least-once다. 커넥터 재시작이나 DB 크래시 뒤에 중복이 나오고, PostgreSQL 문서도 중복 처리의 책임을 클라이언트에 둔다. 소비자가 멱등해야 한다([전달 보장](/posts/kafka-delivery-guarantees/)).
- 로그에 없는 변경은 못 잡는다. 복제를 우회하는 작업이나 PostgreSQL의 DDL은 이벤트가 나오지 않는다. `TRUNCATE`는 PostgreSQL 커넥터가 이벤트로 낼 수 있지만 `skipped.operations` 기본값이 `t`라 기본 설정에서는 건너뛴다.
- 순서는 파티션 안에서만 보장된다. 테이블을 여러 파티션에 뿌리면 행 간 순서가 깨진다. 보통 기본키를 파티션 키로 써서 같은 행의 순서를 보장한다.
- 삭제는 삭제 이벤트 뒤의 툼스톤(같은 키, null 값)으로 표현된다. 컴팩션 토픽과 함께 쓸 때 이 의미를 맞춰야 한다([로그 컴팩션과 보존](/posts/kafka-log-compaction/)).
- 민감 정보가 그대로 흘러간다. 테이블의 모든 컬럼이 나가므로 마스킹이나 `column.exclude.list`로 컬럼 제외를 명시해야 한다.

## 무엇을 재면 확인되는가

1. 커넥터를 멈추고 복제 슬롯 지연과 WAL 디스크 사용량이 어떻게 자라는지 본다. 감시 임계값의 근거가 된다.
2. 변경 발생부터 소비자 도착까지의 지연을 분포로 잰다. 폴링 방식과 비교하면 CDC의 이득이 숫자로 나온다.
3. 증분 스냅샷을 큰 테이블에 걸고 소요 시간과 그 동안의 DB 부하를 본다.
4. DDL을 실행하고 소비자가 깨지는지 확인한다. 컬럼 추가, 제거, 타입 변경 각각.

[ParityPay 5편](/posts/parity-pay-outbox/)의 후속으로 계획에 둔 실험이 2번이다. 폴링 Outbox와 Debezium을 같은 조건에서 재고, 지연·부하·운영 실패 모드 세 축으로 비교하는 것이 남아 있다.

## 정리

- 커넥터가 멈추면 복제 슬롯이 WAL을 붙잡아 디스크가 찬다. `max_slot_wal_keep_size`로 상한을 두면 디스크 대신 재스냅샷을 떠안는다.
- 스냅샷은 테이블 추가, 장기 중단, 대상 재구축 때 다시 필요하다.
- 스키마 이력은 MySQL 커넥터에서는 별도 토픽에 있고, PostgreSQL 커넥터에서는 DDL 이벤트 자체가 없다.
- 업무 테이블을 내보내는 CDC는 하류를 테이블 스키마에 결합시킨다. 지연이 문제라면 Outbox를 버리기보다 릴레이를 CDC로 바꾸는 길이 있다.

## 참고

- [Debezium: Connector for PostgreSQL](https://debezium.io/documentation/reference/stable/connectors/postgresql.html)
- [Debezium: Incremental snapshots](https://debezium.io/documentation/reference/stable/connectors/postgresql.html#postgresql-incremental-snapshots)
- [Debezium: Connector for MySQL](https://debezium.io/documentation/reference/stable/connectors/mysql.html)
- [PostgreSQL: Logical Decoding Concepts](https://www.postgresql.org/docs/current/logicaldecoding-explanation.html)
- [PostgreSQL: Replication 설정](https://www.postgresql.org/docs/current/runtime-config-replication.html)
- [MySQL 8.4: The Binary Log](https://dev.mysql.com/doc/refman/8.4/en/binary-log.html)
- [DBLog: A Watermark Based Change-Data-Capture Framework (Netflix, 2020)](https://arxiv.org/abs/2010.12597)
- [Incremental Snapshots in Debezium (2021)](https://debezium.io/blog/2021/10/07/incremental-snapshots/)
- [Reliable Microservices Data Exchange With the Outbox Pattern (Debezium, 2019)](https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/)
- [microservices.io: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- [WAL과 체크포인트](/posts/wal-and-checkpoint/), [ParityPay 5편 - Transactional Outbox](/posts/parity-pay-outbox/)
