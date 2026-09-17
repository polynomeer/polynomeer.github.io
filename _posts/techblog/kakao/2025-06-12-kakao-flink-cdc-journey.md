---
title: "카카오 「Journey with Apache Flink & Flink CDC」 리뷰 — 스냅샷과 binlog를 한 시스템에서, 그리고 라이브러리를 고쳐 쓰기까지"
date: 2025-06-12
categories: [TechBlog, Kakao]
tags: [Tech Blog Review, Kakao, Apache Flink, Flink CDC, CDC, MySQL, Debezium, Kafka, Binlog]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 8
source_url: https://tech.kakao.com/posts/632
---

원문: [Journey with Apache Flink & Flink CDC](https://tech.kakao.com/posts/632) — kakao tech, 이승민(데이터 분석 플랫폼팀), 2024-09-04 ([영문판](https://tech.kakao.com/posts/681))

## 한 줄 요약

서비스 DB에서 지표를 뽑으려면 운영 DB에 부하를 주지 않고 데이터를 복사해 와야 한다. 전통적인 Debezium + Kafka Connect는 큰 테이블의 첫 복사(스냅샷)가 반나절에서 며칠 걸려 binlog 보관 기간(기본 3일)을 넘기기 일쑤라, 스냅샷은 mysqldump/Spark로 따로 하고 그다음부터 Kafka Connect로 잇는 두 시스템 운영이 관행이었다. Flink CDC는 테이블을 chunk로 나눠 여러 프로세스가 동시에 읽는 증분 스냅샷과 체크포인트 덕에 **스냅샷과 binlog 스트림을 한 시스템에서** 끝낸다. 카카오 팀은 이 라이브러리(flink-connector-mysql-cdc)의 동작을 소스 수준까지 뜯어 본 뒤, 운영에 필요한 기능 넷을 직접 고쳐 넣고 하나는 업스트림에 기여했다.

## 배경: Flink와 CDC 용어부터

Flink는 스트리밍 분산 처리 프레임워크다. JobManager가 job을 받아 실행 그래프로 바꿔 TaskManager들에 task를 배분하고, TaskManager는 task slot(권장: CPU 코어 수)에서 task를 돌린다. 데이터 소스는 세 부품이다. **Split**(어디서 무엇을 읽을지 담은 객체), **SplitEnumerator**(JobManager에서 split을 배분), **SourceReader**(TaskManager에서 split을 받아 실제로 읽음). **체크포인트**는 job 상태(예: Kafka 토픽·파티션·오프셋)를 주기적으로 저장하는 기능으로, 실패 시 마지막 체크포인트에서 복구한다.

CDC는 두 단계다. **스냅샷**은 테이블 전체를 처음 한 번 복사하는 것, **binlog 스트림**은 DB의 바이너리 로그를 실시간으로 읽어 변경을 반영하는 것. MySQL에서 위치는 GTID(`UUID:transaction_range`)로 표현한다.

## 핵심 아이디어: 왜 Flink CDC인가

Debezium은 CDC의 기반 프레임워크이고 증분 스냅샷(테이블을 chunk로 나눠 읽기)을 지원하지만, 실무에서는 문제가 있다. 수천만~수억 행 테이블은 초당 1만 건을 넘기기도 어려워 스냅샷이 며칠 걸리고, 그 사이 binlog가 만료된다. 그래서 스냅샷은 외부 도구로 하고 GTID를 받아 Kafka Connect로 이어 붙이는데, 단계마다 다른 시스템이 필요하다.

Flink CDC는 Debezium 위에 만든 분산 처리라 chunk를 병렬로 가져와 병렬도만큼 빨라지고, 소스 DB 부하도 조절되며, 실패해도 Spark처럼 처음부터가 아니라 체크포인트부터 재개한다. sink 커넥터는 없어 적재는 여전히 Kafka Connect가 하지만, 읽기를 한곳에 모으면 관리가 단순해진다. 예를 들어 개인정보 컬럼을 해시·마스킹하는 로직을 단계별 시스템마다 넣을 필요 없이 Flink job 하나에만 넣으면 된다.

## 자세히 보기: flink-connector-mysql-cdc의 동작

팀의 CDC 대상은 거의 MySQL이라 이 라이브러리를 썼다.

**준비.** 계정 권한은 SELECT(스냅샷), SHOW DATABASES(테이블 탐색), REPLICATION SLAVE·CLIENT(binlog 접근). MySQL 옵션은 `binlog_format=ROW`, `binlog_row_image=FULL`, `binlog_row_value_options`는 비움(JSON 컬럼의 변경분만 저장하지 않도록).

**스냅샷.** JobManager가 chunk key 컬럼의 min/max와 chunk size로 스냅샷 split(DB·테이블·키·범위)을 계산하고, TaskManager가 비동기로 가져온다. 계산과 읽기가 동시에 진행된다. 다만 키 분포 계수가 0.05 미만이거나 1,000 초과면 "불균등"으로 보고, chunk size를 LIMIT으로 한 쿼리를 실행해 그 결과로 다음 범위를 정하는 **순차** 방식으로 바뀐다. 이전 쿼리 결과에 의존하므로 병렬성이 죽는다. 공식 문서도 "고르게 분포된 chunk key를 골라라"고 한다. 모든 split이 끝나면 스냅샷 종료인데, 병렬도가 2 이상이면 subtask 상태 동기화를 위한 체크포인트를 한 번 더 기다린다.

**binlog 스트림.** 스냅샷이 끝나면 binlog split이 로그에 찍히고, 거기 든 GTID부터 binlog를 읽는다. 여기서 원문이 좋은 질문을 던진다. 스냅샷이 아무리 빨라도 그동안 binlog는 생기는데 유실되지 않나? 답은 라이브러리가 **가장 먼저 가져온 chunk의 GTID를 메모리에 두고**, 완료된 split들 중 가장 낮은 GTID부터 binlog를 시작한다는 것이다. 스냅샷이 1시간 걸렸으면 1시간 전 binlog부터 읽는다.

한 가지 구조적 제약. binlog 이벤트는 순서가 생명이라(A→B 변경이 뒤바뀌면 소스와 타깃이 갈라짐) **0번 subtask만 binlog를 읽도록** 설계돼 있다. 그리고 실행 중인 job의 병렬도는 바꿀 수 없다.

## 직접 고친 네 가지

1. **단계 전환 알림.** 팀은 스냅샷과 binlog를 서로 다른 Kafka 토픽에 보낸다. 스냅샷은 테이블 크기에 비례해 파티션을 많이, binlog는 순서 보장을 위해 파티션 1개. 그런데 실행 중인 job의 토픽을 바꿀 수 없고 단계 전환은 로그로만 알 수 있다. 그래서 스냅샷 완료 시점과 binlog 시작 시점(GTID 포함)을 사내 알림 시스템 Watchtower로 보내게 했다. 알림을 받으면 job을 멈추고 binlog용 토픽과 GTID로 다시 띄운다.
2. **DDL 이벤트 건너뛰기.** DDL이 오면 어떻게 할까. 예외를 던져 job을 멈추면 exactly-once 설정에서는 체크포인트 때 Kafka에 커밋되므로 **DDL 직전 메시지의 전송이 보장되지 않는다.** 대신 DDL과 그 이후 이벤트에 아무 동작도 하지 않게 바꿨다. 그러면 직전 메시지는 정상 커밋되고, DDL의 내용과 GTID는 알림으로 보내 사람이 타깃에 DDL을 적용한 뒤 그 GTID부터 재개한다.
3. **DB 스위칭 감지.** 세컨더리 도메인으로 붙는데, 페일오버가 나면 그 도메인이 프라이머리를 가리키게 된다. 복제 프로토콜은 쿼리를 안 돌려 부하는 없지만 운영 프라이머리에 붙는 것은 권장되지 않는다. 별도 모니터링 job은 DB가 늘면 관리가 힘드니 라이브러리 안에 넣었다. 2대 프라이머리-레플리카 구성은 도메인의 DNS를 주기적으로 조회해 IP가 바뀌면 예외를 던져 재시작 정책으로 재접속(DNS 캐시는 꺼야 함). InnoDB Cluster는 IP가 매번 달라질 수 있어 `read_only` 값(프라이머리 false, 세컨더리 true)을 주기적으로 조회한다. 감지는 SourceReader 생애주기를 따르되 0번 subtask에서만 돈다.
4. **chunk key 제약 완화(업스트림 기여).** PK가 있는 테이블은 PK 컬럼만 chunk key로 쓸 수 있었다. PK 여부 검사를 없애고 PK 객체와 chunk key 객체를 분리하도록 제안해 [FLINK-35740]으로 반영됐다.

## 버전 팁

글의 환경은 Flink 1.17.1, Flink CDC 2.4.1. 3.x(2023-12~)부터는 스냅샷만 수행하기, MySQL 설정 검사 개선, 소스 커넥터뿐 아니라 읽기부터 적재까지의 파이프라인(MySQL → Kafka 공식 지원)이 추가됐다. 3.1 이상을 권하되, 2024-08 기준 3.x는 Flink 1.18과만 호환된다.

## 읽고 남는 질문

- 단계 전환 시 job을 멈추고 토픽을 바꿔 다시 띄우는 것은 사람의 개입이다. 3.x의 파이프라인 기능으로 이 수동 단계가 사라졌는지 궁금하다.
- DDL 건너뛰기 뒤 "GTID부터 재개"까지 타깃은 stale 상태다. 지표용이라 허용되는 것으로 보이지만, 그 창이 보통 얼마나 되는지가 있으면 좋겠다.
- 0번 subtask만 binlog를 읽는 구조에서 쓰기량이 큰 테이블의 처리 상한이 어디인지, 테이블별로 job을 나누는지가 없다.

## 한 줄로 가져가기

CDC의 어려움은 binlog 읽기가 아니라 "스냅샷과 binlog를 어떻게 잇느냐"에 있고, Flink CDC는 그것을 증분 스냅샷 + 가장 낮은 GTID + 체크포인트로 한 시스템에서 푼다. 다만 운영에 맞추려면 라이브러리를 열어 볼 각오가 필요하다.
