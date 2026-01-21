---
title: "카카오 「Apache Iceberg와 Flink CDC 심층 탐구」 리뷰 — 메타데이터 파일을 하나하나 뜯어보고, compaction 없이 일주일 두면 조회가 2.8분에서 60분이 되는 것을 확인한 기록"
date: 2026-01-21
categories: [TechBlog, Kakao]
tags: [Tech Blog Review, Kakao, Apache Iceberg, Apache Flink, Flink CDC, MySQL, Data Lakehouse, Compaction, Hive Metastore]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
source_url: https://tech.kakao.com/posts/656
---

원문: [Apache Iceberg와 Flink CDC 심층 탐구](https://tech.kakao.com/posts/656) — kakao tech, 루이스(데이터분석플랫폼), 2024-10-24 (Flink 1.17.1, Iceberg 1.5.0, Hive 2.3.2, Flink CDC 2.4.1)

## 한 줄 요약

카카오 데이터분석플랫폼은 MySQL을 Flink CDC로 받아 매일 전체를 배치로 하둡에 적재하던 구조를, **Flink에서 Iceberg 테이블로 직접 UPSERT**하는 구조로 바꿨다. Kafka를 빼자 메시지가 Debezium Change event에서 RowData로 가벼워져 병렬도 1당 처리율이 5k → 15k msg/s로 올랐고 사내 Kafka 가이드라인의 상한도 사라졌다. 글의 절반은 Iceberg의 카탈로그·메타데이터 파일·매니페스트 리스트·매니페스트·데이터/삭제 파일을 실제 JSON을 열어 보며 설명하고, 나머지는 운영에서 배운 것이다. compaction을 안 하면 30억 건 테이블의 전체 조회가 7일 만에 2.8분 → 60분이 되고, compaction 시간은 레코드 수보다 **UPDATE 비율**에 좌우되며, 샤딩 테이블 32개를 한 Iceberg 테이블로 합치면 소싱은 32×20초 → 270초로 빨라지지만 여러 Flink 잡이 한 테이블에 커밋하며 충돌해 운영에는 넣지 못했다.

## 배경: 왜 Iceberg인가

기존에는 CDC로 연동된 MySQL 복제 테이블 전체를 매일 하둡에 배치 적재했다. 비효율적인 작업이 매일 반복되고, MySQL 부하 때문에 Spark 성능을 제한해야 했다. Iceberg를 두면 변경분만 증분으로 반영하고 MySQL을 매일 읽을 필요가 없어진다. Iceberg는 Netflix가 만든 오픈 테이블 포맷으로 증분 업데이트, 타임 트래블, 히든 파티셔닝이 특징이다.

## Iceberg의 층 구조

- **카탈로그**: 현재 메타데이터 파일의 위치를 가리키고 트랜잭션 상태를 본다. 서비스 카탈로그(Hive Metastore, AWS 등)와 파일 시스템 카탈로그(Hadoop)가 있다. 팀은 HDFS + Hive Metastore.
- **메타데이터 파일**(JSON): 테이블 UUID, 위치, 스키마, 파티션, 설정, 추적 중인 스냅샷 목록. 커밋마다 새로 생기고 `current-snapshot-id`가 바뀐다.
- **매니페스트 리스트**(Avro): 스냅샷 하나가 가리키는 매니페스트 파일들의 목록. 시퀀스 넘버, 파티션 정보, 추가·삭제된 파일·레코드 수 통계.
- **매니페스트 파일**(Avro): 데이터 파일과 삭제 파일의 목록. 각 파일의 컬럼 통계(min/max)와 어느 버킷 파티션에 속하는지.
- **데이터 계층**: 데이터 파일(Parquet), 동등 삭제 파일(equality delete, "id=3인 행은 삭제"), 포지션 삭제 파일(position delete, "이 파일의 n번째 행은 삭제").

원문은 테이블 생성 → 첫 스냅샷 → 두 번째 스냅샷 시점의 메타데이터 파일, 매니페스트 리스트(`content: 0`은 데이터, `1`은 삭제), 매니페스트(`content: 2`는 동등 삭제, `1`은 포지션 삭제, 예약 키 2147483546/2147483545가 file_path/pos)를 실제 값으로 보여 준다. 스냅샷 요약에는 어떤 엔진(`flink.job-id` 또는 `spark.app.id`)이 커밋했는지도 남는다.

## Flink → Iceberg 준비

**Flink 설정.** Kerberos 키탭과 접근 가능한 HDFS. 체크포인트 주기는 짧을수록 안전하지만 **Iceberg 커밋이 체크포인트마다 일어나 파일이 생기므로** 짧으면 작은 파일이 많아져 조회가 느려지고, 길면 복구가 늦고 커밋 전까지 조회가 안 돼 실시간성이 떨어진다. 그 사이에서 정했다(테스트에서는 10분).

**Hive 설정.** `hive.metastore.disallow.incompatible.col.type.changes`가 기본 true라 컬럼 타입 변경 DDL이 막힌다. 판단 기준은 Iceberg 메타데이터 파일의 스키마 관점이다.

**테이블 설정.** Parquet + zstd, `write.metadata.delete-after-commit.enabled=true`(HDFS 블록보다 작은 메타데이터 파일이 쌓이는 것을 막음), `COMMIT_NUM_RETRIES` 4 → 60, `COMMIT_TOTAL_RETRY_TIME_MS` 30분 → 5분. 쓰기 모드는 COW/MOR을 설정할 수 있지만 **Flink의 Iceberg 적재 로직은 항상 MOR로 동작**하고 팀은 Flink만 쓰고 Spark만 읽어 의미가 없어 명시하지 않았다. 파티션은 bucket/identity/truncate/hour~year 중 PK bucket. 특히 MOR에서 조회 시 변경분을 합치는 작업이 파티션 단위라 파티션이 성능에 결정적이고, 같은 컬럼에 여러 파티션은 안 된다.

## 적재 과정: RowData, 동적 테이블, 세 연산자

Debezium Change event는 스키마·전후 데이터·소스 정보를 담은 무거운 JSON이고, 스키마 레지스트리로 줄이려면 서버를 또 운영해야 한다. Flink → Iceberg 직접 적재는 **RowData** 포맷을 쓴다. 필요한 테이블 정보가 Flink 잡에 이미 있기 때문이다. 결과로 Kafka 경유 시 병렬도 1당 평균 5k msg/s(사내 Kafka 가이드라인 상한 있음)가 직접 적재에서는 **15k msg/s**가 됐고, 고려할 것은 DB 부하뿐이 됐다.

Flink 잡은 Flink 다이내믹 테이블과 Iceberg 테이블 둘을 동적으로 만든다. MySQL·Flink·Iceberg의 타입이 각기 다르므로, 잡에서 먼저 `DESCRIBE TABLE`을 실행해 그 결과로 두 스키마를 생성하고, 팀의 타입 매핑 룰(지표 추출이 목적이라 완전 동일할 필요는 없음)을 적용한다.

연산자는 셋이다. **Source**가 MySQL 데이터와 binlog를 읽어 `RowDataDebeziumDeserializeSchema`로 RowData를 만들고, **Writer**가 이벤트 타입에 따라 데이터 파일과 삭제 파일에 쓰며, **Committer**가 체크포인트마다 커밋해 스냅샷을 만든다. Writer의 삭제 처리가 흥미롭다. 삭제 메시지의 동등 컬럼 값이 Writer 메모리에 있는 메시지와 같으면(같은 체크포인트 안에서 쓴 행이면) 그 파일·위치를 아니까 **포지션 삭제**로, 아니면 **동등 삭제**로 간다. 변경이 없으면 empty commit이며 `flink.max-continuous-empty-commits`(기본 10)만큼 연속되면 그래도 스냅샷을 만든다.

## 조회와 최적화

**스캔 플래닝.** 조회 시 매니페스트 정보로 필요한 데이터·삭제 파일을 고르고 합친다. 파티션이 같아야 하고, 시퀀스 넘버로 동등 삭제는 자기보다 **작은** 데이터 파일에만, 포지션 삭제는 **같거나 작은** 파일에 적용되며, 동등 삭제는 동등 컬럼의 min/max 통계로 한 번 더 거른다.

**Compaction.** 30억 건, 하루 400만 변경, 체크포인트 10분, Spark 익스큐터 1,000개 × 48GB로 전체 조회 시간을 재니 연동 직후 **2.8분**, 7일 뒤 **60분**. 7일째 compaction(39분 소요) 후 **1.7분**. 사실상 필수다. 주의점 하나: `target-file-size-bytes` 250MB면 187.5~450MB(0.75~1.8배)로 이미 압축된 파일은 후속 compaction에서 제외되고, 그 파일을 참조하는 이후 삭제 파일이 계속 남는다. 그리고 compaction 시간은 크기보다 변경 유형이 좌우한다.

| 테이블 | 하루 변경 | UPDATE 비율 | 하루치 compaction |
| --- | --- | ---: | ---: |
| 30억 건 | 약 400만 | 약 53% | 평균 5분 |
| 9천만 건 | 약 400만 | 약 96% | 평균 9.7분 |

레코드가 30배 적은 테이블이 두 배 오래 걸렸다. 해석은 이렇다. INSERT는 새 동등 컬럼 값을 갖지만 UPDATE는 기존 값을 갱신하므로 포지션 삭제 파일에 더 많이 들어가고, 포지션 삭제는 동등 컬럼 통계 최적화를 못 쓰니 더 많은 데이터 파일과 비교된다.

**스냅샷 만료·고아 파일 제거.** 만료는 참조만 지우고, 파일은 고아 파일 제거가 지운다. 타임 트래블 가능 시점에 영향을 주는데 팀은 타임 트래블을 안 쓰고, 민감 데이터의 주기적 삭제 요청과 HDFS 블록보다 작은 파일의 I/O 부담 때문에 짧은 주기로 돌린다. `rewrite_position_delete_files`, `rewrite_manifests`도 있다.

## 샤딩 테이블 통합 실험과 한계

32개 샤드(총 27억 건)를 `shard_column` identity 파티션 + `id` bucket 파티션으로 한 Iceberg 테이블에 넣었다. 파티션이 곧 스캔 플래닝 단위라 샤드별 데이터와 변경분이 물리적으로 분리된다. 소싱은 32 × 20초 대비 **270초**로 유의미했다. 그러나 32개 Flink 잡이 한 테이블에 커밋하면서 `CommitFailedException: Base metadata location ... is not same as the current`가 났다. 커밋은 base 메타데이터 파일 기준이고 먼저 성공한 잡이 포인터를 바꾸면 나머지는 실패한다. 재시도 60으로 일주일 두니 중단은 없었지만, 100개 넘게 샤딩된 테이블도 있어 재시도만으로는 안정성을 담보할 수 없다고 판단해 **적용하지 않았다**. 샤드가 적은 테이블만 하자는 안도 "모든 샤딩 테이블에 같은 정책"으로 수렴하며 접었다.

회고에서 Flink DataStream API + HDFS로 Iceberg CDC를 하는 사례가 국내외에 드물어(대개 Flink SQL, S3) 코드와 생성 파일을 하나하나 뜯어봐야 했다고 적었다.

## 읽고 남는 질문

- 체크포인트 주기의 최종 운영값이 없다. 후속 글(로그 유형별 전략)에서 DB 로그 10분으로 나오는데, 이 글 시점에 어떻게 정했는지가 있으면 좋겠다.
- 샤딩 통합의 커밋 충돌은 Flink 잡을 하나로 합쳐 여러 소스를 한 잡에서 읽으면(단일 Committer) 구조적으로 사라진다. 그 방향을 검토했는지, 잡 하나가 32개 MySQL을 읽는 것의 부담이 무엇이었는지 궁금하다.
- UPDATE 비율이 compaction을 느리게 한다면, 포지션 삭제 파일을 먼저 `rewrite_position_delete_files`로 정리한 뒤 compaction하는 것이 효과가 있는지 실험이 있으면 좋겠다.

## 한 줄로 가져가기

Flink에서 Iceberg로 직접 쓰면 Kafka와 무거운 메시지가 사라져 세 배 빨라지지만, 그 순간부터 체크포인트마다 생기는 작은 파일과 삭제 파일을 끊임없이 합치는 것이 운영의 본체가 된다. 그리고 그 비용은 데이터 크기가 아니라 UPDATE 비율이 정한다.
