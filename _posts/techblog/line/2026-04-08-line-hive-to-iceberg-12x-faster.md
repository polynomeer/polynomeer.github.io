---
title: "LINE 「Hive에서 Iceberg로: 데이터 반영 속도 12배 향상의 비밀」 리뷰 — 60분 배치를 5분 스트리밍으로 바꾼 것보다, 5분마다 커밋해도 무너지지 않게 만든 것이 본체"
date: 2026-04-08
categories: [TechBlog, LINE]
tags: [Tech Blog Review, LINE, Apache Iceberg, Apache Flink, CDC, Kafka, MongoDB, Kubernetes, Data Pipeline, E-Commerce]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
source_url: https://techblog.lycorp.co.jp/ko/from-hive-to-iceberg-12x-faster-data-updates
---

원문: [Hive에서 Iceberg로: 데이터 반영 속도 12배 향상의 비밀](https://techblog.lycorp.co.jp/ko/from-hive-to-iceberg-12x-faster-data-updates) — LY Corporation Tech Blog, 김성도·고상일(LINE Plus 통합 커머스), 2026-04-03

## 한 줄 요약

HBase 스냅숏 + Hive ETL은 변경분을 반영하려면 수억 건 전체를 다시 써야 해서, 개선 끝에 1시간 주기가 한계였다. Iceberg는 스냅숏 단위 메타데이터로 행 단위 upsert가 되므로 변경된 수만 건만 반영하면 되고, 그러면 비용은 총량이 아니라 변경분에 비례한다. 엔진은 데이터 최신성(늦게 온 옛 데이터 무시), 종단 간 exactly-once(Iceberg 커밋과 "여기까지 반영됨" Kafka 메시지가 2PC로 함께 확정), 상태의 장애 허용 세 요구로 Spark 대신 **Flink**를 골랐고, GitOps가 되는 **Flink Kubernetes Operator**로 배포했다. 9억 건 상품 테이블에서 `identifier-field-ids` 누락으로 중복 적재와 동등 삭제 파일 폭증을 겪고, `rewrite_data_files`가 OOM·타임아웃·HDFS I/O 한계에 부딪혀 결국 **ID bucket 파티셔닝**으로 갔다. 12배는 체크포인트 5분 때문이 아니라 "5분마다 커밋해도 정합성과 읽기 성능이 유지되는 환경"을 만들었기 때문이다.

## 배경: 전체 덮어쓰기의 딜레마

MySQL에서 대용량 테이블을 추출할 때 `SELECT *`는 시점이 섞이고 부하가 크며, 스냅숏 기반은 정합성은 되지만 대용량에서 딜레마가 생긴다. HBase + Hive ETL도 같았다. 변경분은 HDFS에 계속 모이는데 조회 가능한 테이블에 반영하려면 병합 후 전체를 다시 써야 했다. 하루 → 1시간까지 줄였지만, 그 사이 상품이 바뀌면 옛 데이터로 처리하는 위험이 남았다. 마침 사내 Hadoop이 Iceberg를 지원하기 시작했다.

## 엔진 선택: 세 요구와 Flink

1. **데이터 최신성.** 유실·오적재나 전체 재처리 때 과거 데이터를 다시 흘리는 보정이 필요한데, 보정 데이터가 최신 CDC보다 늦게 도착하면 옛 값이 새 값을 덮을 수 있다.
2. **종단 간 exactly-once.** 판매자 메타데이터가 바뀌어 그 판매자의 모든 상품을 추출·일괄 갱신하는 상황을 생각하면, 추출 시점과 CDC 반영 시점이 어긋나 누락될 수 있다. 그래서 "상품 테이블에 13:03까지의 CDC가 모두 반영됐다"는 상태를 Kafka 메시지로 보내 추출 가능 여부의 기준으로 삼는다. 이것이 성립하려면 **Iceberg에 다 쓰였을 때만, 정확히 한 번** 메시지가 나가야 한다. Iceberg에는 썼는데 Kafka 전송이 실패하거나 그 반대인 부분 성공이 생기면 치명적 누락으로 이어진다. 2PC(prepare에서 양쪽 준비 확인, commit에서 동시 확정)가 필요하다.
3. **장애 허용·상태 관리.** 위 둘을 하려면 엔진 안에 상태를 들고 있어야 하고 재시작해도 유실되면 안 된다.

Spark Structured Streaming은 마이크로 배치라 이벤트 시간 기준 상태 제어가 어렵다. Flink는 네이티브 스트리밍이고, DataStream API의 상태로 `updatedate`를 들고 있다가 더 오래된 이벤트를 무시하며, 체크포인트가 Kafka Sink의 2PC와 연동돼 체크포인트 완료 전까지 pre-commit 상태로 두었다가 Iceberg 쓰기와 체크포인트가 모두 성공한 시점에 최종 커밋하고, 그 상태도 체크포인트로 백업된다. 운영 복잡도와 러닝 커브가 높다는 점은 인정한다.

배포는 네이티브 Kubernetes(역할·서비스 어카운트·라우팅을 직접) 대신 **Flink Kubernetes Operator**(커스텀 리소스로 추상화, Helm 값만으로 라우팅·UI 자동, 애플리케이션/세션 모드, TaskManager 슬롯 1로 두어 병렬도만큼 파드 1:1 생성). 결정적 이유는 GitOps로 실행 중인 잡 상태와 Git 매니페스트의 일치를 보장할 수 있다는 것.

## 아키텍처: 두 파이프라인

- **Iceberg 반영 파이프라인(full-document-sink)**: MongoDB 실시간 CDC 토픽과 보정 fullDocument 토픽을 구독해 상품 ID로 KeyedStream을 만들고, ID별 `updateDate`를 상태로 저장, 들어온 메시지가 더 오래되면 무시, 같거나 최신이면 통과시키며 상태 갱신. 컨슈머 랙으로 옛 보정 데이터가 늦게 와도 최신을 덮지 못한다.
- **보정 데이터 생성 파이프라인(compensation-sink)**: 보정 대상 ID 토픽을 구독해 MongoDB에서 fullDocument를 조회하고 `opType=READ`로 보정 토픽에 보낸다. 보정 대상은 네 경로에서 나온다. 처음 보는 ID인데 UPDATE로 온 경우(Flink 재기동으로 상태가 초기화됐을 수 있음), 이미 처리한 ID가 CREATE로 다시 온 경우(방어 로직), 하루 한 번 정합성 검증의 불일치, 운영자 수동 전송.

보정 파이프라인의 윈도 최적화가 실무적이다. 순서 보장이 필요 없어 non-keyed 윈도로 시작했더니 **단일 태스크**로 돌아 병목이었다. keyed로 바꿨는데도 안 빨라진 이유는 KeyGroupStreamPartitioner가 MurmurHash3로 키 그룹을 정하는데 키가 고르지 않아 특정 슬롯에 몰렸기 때문이다. 상품 ID를 병렬도로 모듈러 연산한 뒤 임의 수를 곱한 값을 키로 써 분산을 맞췄다. 그러자 이번엔 5초 윈도가 수만 건을 한 번에 MongoDB에 조회해 과부하가 났다. Flink 기본 윈도에는 개수 제어가 없어 **`CountWithTimeoutTrigger`**(5초 경과 또는 1,000건 초과 중 먼저)를 직접 구현했다.

## 트러블슈팅

**Kerberos.** TaskManager마다 kinit하면 KDC에 부하를 주므로 JobManager가 한 번 인증해 위임 토큰을 배포하는 위임 토큰 프레임워크를 썼다. JobManager가 HadoopSecurity 모듈을 못 찾아 `flink-shaded-hadoop-3-uber`를 넣었는데 최신은 CLI 클래스 충돌(`NoSuchMethodError`)이 나서 여러 버전을 시험해 특정 버전을 찾았다. 그러자 Kafka Sink까지 Kerberos를 시도해 `security.delegation.token.provider.kafka.enabled: false`로 껐다.

**중복 적재와 읽기 저하.** 9억 건 테이블에 초당 약 1만 건 CDC를 1시간 돌리자 읽기가 급락하고 같은 ID가 중복됐다. 원인은 `identifier-field-ids`(Iceberg의 PK 격)와 Flink의 `equalityFieldColumn` 누락. 식별자가 없으면 모든 컬럼이 일치해야 같은 행으로 보므로 upsert(delete 후 insert)에서 기존 행을 못 지우고 위에 쌓였다. 그리고 Flink는 쓰기 지연을 위해 MoR만 지원하는데, 식별자가 없어 동등 삭제 파일에 **모든 컬럼값**이 기록되면서 파일이 기하급수적으로 커지고, 읽을 때마다 그 거대한 삭제 파일을 병합해야 했다.

**rewrite_data_files.** 1억 건 카탈로그는 괜찮았지만 9억 건에서는 지연·OOM으로 실패했다. 온힙 메모리를 늘려도 안 됐고, 원인은 ZSTD 압축 해제가 JNI로 C/C++에서 일어나 **오프힙**을 쓴다는 것이었다(오프힙 할당 조정). 다음엔 압축 해제 CPU 폭주로 Heartbeat Timeout(타임아웃 연장). 다음엔 `min-input-files`, `delete-file-threshold`를 공격적으로 잡아 잦은 병합이 HDFS NameNode·DataNode I/O를 압박(기준 완화). 그래도 피크에 HDFS I/O가 한계였다. 9억 건 단일 테이블을 매번 전체 스캔해 병합 대상을 찾는 구조 자체의 한계였다.

**최종: ID bucket 파티셔닝.** 비파티션 테이블에서 동등 삭제는 **글로벌**로 적용되어 모든 데이터 파일에 매칭해야 한다. 상품 ID bucket으로 파티셔닝하자 삭제와 rewrite가 파티션 범위로 한정되어 HDFS 부하 없이 안정됐고 읽기도 지연 없이 유지됐다.

## 12배의 비밀

60분 → 5분은 체크포인트 5분 설정과 체크포인트 완료 시 Iceberg 커밋 덕분이다. 그러나 원문이 강조하듯 진짜 비밀은 주기를 줄인 것이 아니라 **"짧은 주기로 계속 밀어 넣어도 무너지지 않는 환경"**이다. 5분마다 커밋으로 파일이 생기는 상황에서도 정합성과 읽기 성능이 유지됨을 파티션 아키텍처와 트러블슈팅으로 검증했기에 얻은 수치다.

## 읽고 남는 질문

- 반영 파이프라인의 Flink 재기동 시 상태가 초기화되면 "처음 보는 ID + UPDATE"가 대량으로 보정 대상이 될 텐데, 그때 보정 파이프라인과 MongoDB에 걸리는 부하와 회복 시간이 궁금하다. 상태를 savepoint로 보존하는지도.
- bucket 수를 얼마로 잡았는지, 그리고 파티셔닝 후 rewrite 주기와 소요 시간이 얼마인지가 없다. 같은 Iceberg 주제의 카카오 글에서 compaction 시간이 UPDATE 비율에 좌우된다고 했는데, 상품 데이터(갱신 위주)에서의 수치가 있으면 비교가 된다.
- 하루 한 번 정합성 검증은 MongoDB와 Iceberg를 전체 비교하는 것인지 샘플인지, 9억 건에서 그 비용이 얼마인지.

## 한 줄로 가져가기

증분 반영으로 바꾸면 주기는 쉽게 줄어든다. 어려운 것은 그 주기가 만드는 작은 파일과 삭제 파일이 읽기를 죽이지 않게 하는 것이고, 대용량 MoR에서 그 답은 결국 "삭제가 글로벌이 되지 않도록 파티션을 나눠라"였다.
