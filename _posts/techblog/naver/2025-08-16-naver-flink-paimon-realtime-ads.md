---
title: "네이버 D2 「실시간 유효 광고 선정을 위한 Flink에서 Apache Paimon 도입기」 리뷰 — 스트리밍 처리에 '테이블'을 끼워 넣으면 무엇이 쉬워지나"
date: 2025-08-16
status: draft
categories: [TechBlog, Naver]
tags: [Tech Blog Review, Naver, Apache Flink, Apache Paimon, Apache Iceberg, Lakehouse, Streaming, CDC, LSM Tree]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 10
source_url: https://d2.naver.com/helloworld/2766731
---

원문: [실시간 유효 광고 선정을 위한 Flink에서 Apache Paimon 도입기](https://d2.naver.com/helloworld/2766731) — NAVER D2, 권태헌·정경륜, 2025-08-01

## 한 줄 요약

광고 정보가 바뀔 때마다 "지금 내보낼 수 있는 광고"를 실시간으로 다시 골라 서빙 저장소에 넣어야 한다. Kafka + Flink만으로는 조인·집계·과거 조회가 어렵고 중간 결과를 들여다보기도 힘들다. 그래서 Flink 사이사이에 **Paimon 테이블**을 끼워 넣었다. Paimon은 Flink 팀에서 시작된 레이크하우스 포맷으로, 스트리밍으로 쓰면서도 테이블처럼 조인·부분 업데이트·타임 트래블·정확히 한 번 소비가 된다. Iceberg와 성능은 비슷하지만 **쓰는 시점에 실시간 변경 로그를 만들어 주는 것**이 결정적 차이였다.

## 배경: 왜 Kafka만으로는 부족한가

ADVoost Shopping의 AI 서빙은 상품 목록을 받아 (최대 200개) → 상품에 매핑된 광고 애셋 그룹을 찾고 (최대 500개씩, 합쳐 최대 1만 개) → 그중 지금 유효한 것만 남기고 → 집계 피처로 모델을 돌려 → 상품마다 가장 좋은 애셋 그룹 하나를 고른다. 이 "유효한 것"이 실시간으로 바뀐다. 캠페인 예산 소진, 광고 상태 변경 등이 원인이다.

원래 팀은 Spark 마이크로 배치로 처리했다. 더 빠르고 싸게 하려면 Flink 스트리밍이 맞는데, 문제는 Flink 사이를 Kafka로 이으면 **데이터끼리 조인하기 어렵고, 집계·분석이 안 되고, 중간 결과를 확인하기 힘들다**는 것이다. 광고 정보는 여러 테이블(광고, 캠페인, 애셋 그룹, 소진량)의 조합이라 조인이 핵심인데 말이다.

## 핵심 아이디어: 중간 Kafka 대신 Paimon 테이블

파이프라인은 이렇다.

1. 광고 정보 CDC(DB 변경 이벤트)를 Kafka에서 받아 Flink로 Paimon 테이블에 적재한다. 어떤 테이블은 **부분 업데이트**(바뀐 컬럼만 갱신) 기능을 쓴다.
2. 여러 광고 테이블을 조인해 애셋 그룹 기준으로 펼친(반정규화) 테이블을 만든다.
3. 거기서 유효 광고를 골라 유효 애셋 그룹 테이블을 만든다. Paimon의 rowkind 재정의로 SQL만으로 실시간 추가/수정/삭제가 된다.
4. 그 결과를 AI 서빙이 읽는 Feature Store에 올린다. 삭제도 그대로 전파된다.

한 가지 재미있는 우회가 있다. 유효 광고 판단에는 "오늘 캠페인이 얼마나 소진됐나"가 필요하고, 이것은 매일 0으로 초기화돼야 한다. 그런데 Flink는 한 번 처리한 데이터를 다시 처리하려면 재발행해야 한다. 팀은 일별 초기화 결과 테이블을 따로 두고 소진량 테이블과 **스트리밍 조인**해서, 초기화가 반영된 소진량을 실시간으로 얻었다.

Paimon을 택한 이유는 Flink와의 궁합이다. Paimon은 원래 Flink Table Store였다. 실시간 집계·스키마 진화·변경 로그, 부분 업데이트, 조인 키와 PK가 같으면 조인 대신 INSERT로 끝나는 것, 타임 트래블, Merge on Write, 자동 compaction·태깅·파티션 만료(관리 배치가 필요 없음), 그리고 Flink 신기능이 가장 빨리 지원되는 것(Flink 2.0 materialized table은 Paimon만 지원). 중간 Kafka를 Paimon으로 바꾸면 디버깅이 쉬워지고, 같은 데이터를 분석이나 ML 개발에도 쓸 수 있다. 실제로 유효 광고 데이터를 자주 확인해야 했고 타임 트래블이 디버깅에 유용했다고 한다.

## 자세히 보기: Paimon은 어떻게 생겼나

Paimon은 **LSM 트리** 기반 테이블 포맷이다. LSM 트리는 RocksDB 같은 키-값 저장소가 쓰는 구조로, 새 데이터를 level-0에 쌓고 쌓이면 상위 레벨로 병합(compaction)한다. 쓰기는 빠르고, 대신 파일이 많아지면 읽기가 느려지므로 compaction이 필수다. Paimon의 compaction은 RocksDB의 Universal Compaction과 닮았다. 비슷한 크기의 파일이 모이면 합친다.

파일 구조는 데이터베이스 → 테이블 → 버킷·인덱스·매니페스트·스키마·스냅샷 순이다. 스냅샷은 그 시점의 스키마와 매니페스트 목록을 가리키고, 매니페스트는 데이터 파일·변경 로그·인덱스 파일의 메타 정보(LSM 레벨 포함)를 담는다. 삭제 벡터는 데이터 파일 안에서 지워진 행의 위치를 비트맵으로 기록한 것이다.

테이블은 둘로 나뉜다.

- **PK 테이블**: UPSERT가 되고 버킷 안이 정렬돼 있다. 데이터 양에 따라 버킷 수를 조절하는 동적 버킷팅이 되지만, 버킷 할당자가 하나여야 해서 동시에 여러 쓰기 작업은 못 한다.
- **append-only 테이블**: PK가 없어 LSM 없이 파일을 그냥 붙인다. 로그 적재에 맞다.

PK 테이블의 세 가지 모드는 "언제 병합하느냐"의 차이다.

| 모드 | 동작 | 쓰기 | 읽기 |
| --- | --- | --- | --- |
| Copy on Write | 커밋마다 full compaction | 느림 | 빠름 |
| Merge on Read | 그냥 쓰고 읽을 때 PK로 병합 | 빠름 | 느림, PK 외 컬럼 필터 푸시다운 불가 |
| Merge on Write | 쓸 때 삭제 벡터 생성, 읽을 때 비트맵 필터만 | 중간 | 빠름, 필터 푸시다운 가능 |

변경 로그 프로듀서는 "다른 애플리케이션이 이 테이블의 실시간 변경을 구독하게 해 주는 기능"이다. 네 가지다. none(안 만듦, 이때 Flink normalize 연산자가 state를 들고 계산하므로 힌트로 꺼야 함), input(입력이 이미 완전한 변경 로그일 때, 가장 싸다), lookup(입력이 불완전할 때 LSM 상위 레벨을 찾아 UPDATE_BEFORE를 채움, level-0를 매번 compaction하므로 비싸다), full-compaction(주기적 full compaction 결과 비교, 지연 허용 시만).

## 숫자: Paimon vs Iceberg

Flink 1.20, Paimon 1.0.1, Iceberg 1.8.1, 병렬도 16, TaskManager 4GB, 5억 행 UPSERT, 키 범위 1억.

- **쓰기(둘 다 Merge on Read)**: 체크포인트 30초에서는 Iceberg가 조금 빨랐지만 차이는 크지 않았다. 60초로 늘리자 Paimon은 유지, Iceberg는 약간 느려졌다. Paimon은 compaction 켜고 끄고 차이가 거의 없었다.
- **Paimon 모드별 쓰기**: Merge on Read 약 400초 미만, Merge on Write 약 800초. 삭제 벡터 생성 비용이다. 변경 로그(lookup)를 켜면 둘 다 가장 느렸다.
- **읽기(Spark)**: Iceberg는 compaction 없이 시간 초과가 계속 나서 제외.

| 연산 | MoR, compaction 없음 | MoR, compaction | MoW, compaction |
| --- | ---: | ---: | ---: |
| ROW COUNT | 33.39s | 3.34s | 0.18s |
| SELECT | 26.13s | 3.03s | 0.08s |
| SUM | 30.58s | 4.35s | 3.46s |
| FILTER | 29.39s | 3.50s | 2.06s |
| GROUP BY | 44.15s | 9.77s | 4.27s |
| ORDER BY | 111.96s | 36.44s | 13.57s |

compaction만으로 읽기가 약 80% 빨라지고, Merge on Write는 거기서 50% 이상 더 빠르다. 결론은 성능이 아니라 기능이었다. Iceberg 1.8.1은 읽는 시점에 스냅샷을 비교해서만 변경 로그를 주고, DELETE가 있는 스냅샷은 변경 로그를 못 만든다. 실시간 변경 로그가 필수인 이 팀은 Paimon을 골랐다. 대신 Iceberg는 compaction 시점을 손으로 조절할 수 있고 생태계가 크다는 것을 인정한다.

## 알아두면 쓸모 있는 옵션들

원문 후반은 운영 팁 모음이다. 요약하면 이렇다.

- **버킷**: 조인하는 두 테이블의 버킷 키와 버킷 수가 같아야 shuffle이 안 난다. append 테이블은 LSM이 아니라서 sort는 날 수 있다. 실제 테스트에서 shuffle 0회, sort 2회.
- **파일 프루닝**: 파티션 컬럼 필터 → 파티션 프루닝. 버킷 키 **전부**가 필터에 있어야 버킷 프루닝. 일부만 있어도 매니페스트의 min/max 통계로 추가 프루닝이 된다. 예시에서 파티션만 걸면 6,502개 파일, 파티션+버킷 키 전부면 2개.
- **파티션 만료**: values-time(파티션 값 기준)과 update-time(마지막 쓰기 기준). backfill로 옛 파티션에 쓰기가 생기면 update-time은 안 지워질 수 있어 values-time을 쓴다. 만료는 커밋의 일부로 실행되고 순서는 컨슈머 → 스냅샷(여기서 물리 삭제) → 파티션(논리 삭제, OVERWRITE 커밋) → 태그. 즉 파티션이 만료돼도 디스크는 스냅샷이 만료돼야 비워진다.
- **자동 태깅**: Hive의 daily dump를 대체한다. 태그는 스냅샷을 가리키는 파일이라 상위 레벨 파일을 공유해 중복 저장이 없다. 1.0.1에서는 hourly/2시간/daily만 된다.
- **consumer-id**: 스냅샷 기반 오프셋으로 exactly-once. 반드시 `consumer.expiration-time`을 테이블 속성에 넣어야 한다(안 넣으면 컨슈머가 보는 스냅샷이 안 지워져 스토리지가 불어나므로 예외를 던진다). 재실행 테스트에서 마지막 스냅샷 다음부터 읽어 중복 조인이 없었다.
- **aggregation merge-engine**: PK 테이블에서 필드별로 sum·collect 같은 집계 함수를 지정하면 INSERT/DELETE를 순서대로 반영한 결과가 유지된다. 키 1에 1, 2 INSERT 후 1 DELETE → 2.

## 운영 이슈

Paimon 1.0 이전 Spark 배치 접근 시 ArrayIndexOutOfBoundsException(1.1에서 해결). 스트리밍 스키마 진화는 Table API가 아니라 DataStream API로 해야 하는데 Map 타입 버그가 있어 직접 기여해 1.1에서 고쳤다. 지금은 스키마 레지스트리와 연동해 자동 진화한다. 팀은 Iceberg와 Paimon을 병행 중이고, Paimon 카탈로그의 Hive 연동과 대규모 배치에서의 Iceberg 비교를 검토하고 있다.

## 읽고 남는 질문

- 동적 버킷팅은 쓰기 작업이 하나여야 한다. 광고 CDC처럼 여러 소스에서 같은 테이블에 쓰는 경우 어떻게 풀었는지, 아니면 테이블을 소스별로 나눴는지가 없다.
- Merge on Write는 쓰기가 2배 느리다. 광고 파이프라인에서는 어느 테이블에 어느 모드를 썼는지, 서빙 저장소 반영 지연이 실제로 몇 초인지 알고 싶다.
- Iceberg 비교는 1.8.1 기준이다. Iceberg도 변경 로그 쪽이 계속 바뀌고 있어, 결정적이었던 "쓰기 시점 변경 로그" 차이가 얼마나 오래 유효할지는 다시 봐야 한다.

## 한 줄로 가져가기

스트리밍 파이프라인의 중간 지점을 큐가 아니라 테이블로 두면 조인·집계·과거 조회·디버깅이 따라오고, 그 테이블이 "쓰는 시점에 변경 로그를 내줄 수 있느냐"가 실시간 파이프라인에서 포맷을 가르는 기준이 된다.
