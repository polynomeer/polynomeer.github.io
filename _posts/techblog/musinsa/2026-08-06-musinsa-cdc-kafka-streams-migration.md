---
title: "무신사 「Kafka와 Strimzi를 이용하여 6개의 도메인을 하나의 도메인으로 합쳐보았습니다」 리뷰 — 배치 없이 CDC와 Kafka Streams로 옮긴 결정, 그리고 통합 모델이 원본과 같다는 것을 누가 확인하는가"
date: 2026-08-06
categories: [TechBlog, Musinsa]
tags: [Tech Blog Review, Musinsa, CDC, Kafka Streams, Debezium, Strimzi, Strangler Fig, Data Migration]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 56
source_url: https://techblog.musinsa.com/kafka%EC%99%80-strimzi%EB%A5%BC-%EC%9D%B4%EC%9A%A9%ED%95%98%EC%97%AC-6%EA%B0%9C%EC%9D%98-%EB%8F%84%EB%A9%94%EC%9D%B8%EC%9D%84-%ED%95%98%EB%82%98%EC%9D%98-%EB%8F%84%EB%A9%94%EC%9D%B8%EC%9C%BC%EB%A1%9C-%ED%95%A9%EC%B3%90%EB%B3%B4%EC%95%98%EC%8A%B5%EB%8B%88%EB%8B%A4-e0264cfee0de

problem_decision_result:
  problem: "무신사 커뮤니티팀은 6개 콘텐츠 도메인을 하나의 통합 모델로 옮겨야 했다. 옮기는 동안 기존 화면이 전부 동작해야 하고(Strangler Fig), Polyglot MSA라 도메인 이벤트 발행 코드를 모든 서비스에 심는 것은 불가능에 가까웠다."
  decision: "원문의 결정(Lambda 대신 Kappa에 가까운 구조: Debezium CDC → Kafka Streams KTable 조인·역정규화 → Sink)과 Strimzi로 Kafka Connect를 Kubernetes YAML로 관리한 이유, 그리고 데이터 재생(replay) 세 방법을 옮기고, MCP의 Shadow Release와 네이버페이 전환 글의 이중 발행 검증기에 대조했다."
  result: "옮기는 방법은 상세한데 옮긴 결과가 맞는지 확인하는 방법이 없다는 것이 이 글의 빈칸이다. 네이버 글은 기존·신규 메시지를 두 벌로 발행해 대조하는 검증기를 뒀고, MCP에서는 신구 조회를 나란히 비교했다. 무신사 글에는 통합 모델이 6개 원본과 일치하는지를 세는 장치가 적혀 있지 않다. 반대로 원문이 잘 적은 것은 재생의 대가다. 실시간 트래픽을 받으면서 전체를 다시 옮기려면 Consumer Lag이 안 생기는 속도로 조절해야 했다는 문장이 그것이다."
---

원문: [Kafka와 Strimzi를 이용하여 6개의 도메인을 하나의 도메인으로 합쳐보았습니다](https://techblog.musinsa.com/kafka%EC%99%80-strimzi%EB%A5%BC-%EC%9D%B4%EC%9A%A9%ED%95%98%EC%97%AC-6%EA%B0%9C%EC%9D%98-%EB%8F%84%EB%A9%94%EC%9D%B8%EC%9D%84-%ED%95%98%EB%82%98%EC%9D%98-%EB%8F%84%EB%A9%94%EC%9D%B8%EC%9C%BC%EB%A1%9C-%ED%95%A9%EC%B3%90%EB%B3%B4%EC%95%98%EC%8A%B5%EB%8B%88%EB%8B%A4-e0264cfee0de) — MUSINSA techblog, 조유신(커뮤니티개발팀), 2024-06-27

앞서 리뷰한 [네이버페이 전환 글](/posts/naver-pay-kafka-migration/)과 나란히 읽으면 좋은 글이다. 둘 다 오래된 시스템을 멈추지 않고 새 구조로 옮기는 이야기이고, 둘 다 [CDC](/posts/cdc-principles-and-limits/)(DB의 변경 로그를 읽어 변경 이벤트로 내보내는 방식)를 쓴다. 다른 것은 네이버 글이 "옮긴 것이 맞는지 어떻게 확인했는가"에 절반을 쓴 반면 무신사 글은 "어떻게 옮겼는가"에 전부를 쓴다는 점이다. 그 차이가 이 리뷰의 축이다.

## 원문이 말하는 것

스냅·좋아요·인플루언서 마케팅 등을 맡는 커뮤니티개발팀의 6개 콘텐츠 도메인이 각기 다른 형태로 저장돼 있어 필터·추천 같은 기능을 통합 모델 없이 만들기 어려웠다. API에서 추상화하는 것도 가능하지만 데이터가 흩어진 채로는 한계가 있어 데이터 통합을 택했다.

한 번에(cut-over) 옮길지 점진적으로 옮길지에서 Strangler Fig를 골랐다. 마틴 파울러의 설명으로는 레거시 위에 분리된 새 코드를 조금씩 더하고, 레거시의 동작을 새 코드베이스로 조금씩 옮기는 점진적 현대화다([Strangler Fig Application](https://martinfowler.com/bliki/StranglerFigApplication.html)). 옮기는 중에도 이전 도메인 화면이 전부 동작해야 하므로, DML이나 배치가 아니라 준실시간 마이그레이션 파이프라인을 만들어 통합 모델을 등장시키고 제공 영역을 넓혀 간다.

파이프라인 구조는 Batch, Lambda(배치 + 스트림), Kappa(스트림만) 중에서 골랐다. 처음엔 경험이 많은 Lambda를 하려 했지만, 6개 도메인의 루트·파생 테이블이 매우 많고 Polyglot MSA(서비스마다 언어가 다른 마이크로서비스)라 모든 변경에 도메인 이벤트 발행 코드를 심는 것이 불가능에 가까워 CDC로 갔다. Kafka Connect 클러스터를 세우고 루트·파생 테이블을 전부 토픽에 넣고 나니 배치 레이어가 RDBMS를 다시 읽는 것이 낭비로 느껴져, Kafka Streams로 CDC 토픽을 역정규화하는 쪽으로 갔고 결과적으로 Kappa에 가까워졌다.

Kafka Connect는 AWS DMS(토픽 설정·SMT 제약), MSK Connect(Terraform 관리, 설정 변경 시 태스크 수동 제거)를 제치고 Strimzi Operator로 갔다. Kubernetes YAML이 개발자에게 러닝커브가 낮고, 설정을 바꿔도 재배포로 커넥터를 재생성할 수 있어서다. Debezium MySQL 커넥터 설정에서 눈에 띄는 것은 `tasksMax: 1`(WAL 처리), `snapshot.locking.mode: none`, `ExtractNewRecordState` SMT, 그리고 CDC 토픽을 SSOT(단일 진실 공급원)로 쓰기 위해 `cleanup.policy: compact`로 만든 것이다([로그 컴팩션](/posts/kafka-log-compaction/)은 파티션 안에서 키마다 적어도 마지막 값을 보존한다고 [Kafka 설계 문서](https://kafka.apache.org/41/design/design/#log-compaction)가 설명한다).

Streams 쪽은 소스 토픽들을 KTable로 만들고, 변경 로그를 Deduplication Processor로 같은 키의 중복을 제거한 뒤 KTable들과 조인해 통합 모델을 만들어 Sink한다. 코파티셔닝을 위해 CDC 토픽을 한 번 더 다른 토픽으로 Sink해 파티션 수를 유동적으로 가져갔다.

데이터 재생이 마지막 절이다. 요구사항이 바뀌면 처음부터 다시 옮겨야 하는데, 방법 셋(Debezium Signal의 incremental snapshot, Streams 앱 오프셋 초기화 또는 application ID 변경, dedup 이후 토픽에 루트 스트림 재발행)을 전부 구현했다. 실시간 트래픽을 받는 서비스라 Streams 앱과 Sink의 Consumer Lag(소비자가 최신 메시지에서 뒤처진 정도)이 안 생기는 속도로 조절해 전체를 다시 옮겼다. 파이프라인을 두 버전으로 유지하는 방법은 Sink RDBMS의 한계와 코드 이원화 때문에 보류했다.

## 같은 곳: 이벤트 발행 코드를 심을 수 없을 때 CDC

parity-pay는 CDC 대신 Outbox를 골랐는데([5편](/posts/parity-pay-outbox/)), 그 선택이 가능했던 조건이 원문에서 드러난다. Outbox는 업무 트랜잭션을 우리가 쓰고 있을 때 가능하다. 같은 트랜잭션에 이벤트를 적어야 하기 때문이다. 원문의 조건은 6개 도메인이 여러 언어·서비스로 흩어져 있고 그 코드에 발행을 심을 수 없다는 것이다. 그 조건에서 Outbox는 선택지가 아니고 CDC가 유일하다. [카카오 CDC 글](/posts/kakao-postgres-es-cdc/)도 10년 된 레거시라 같은 조건이었다. 세 글을 읽고 나는 Outbox와 CDC의 선택이 지연이나 운영 비용보다 먼저 원본 트랜잭션을 우리가 통제하는가로 갈린다고 본다.

## 원문이 답하지 않는 것: 통합 모델이 맞는가

옮기는 방법은 커넥터 YAML까지 상세하다. 그런데 옮긴 결과가 6개 원본과 같은지를 누가 어떻게 확인하는지가 없다.

이것이 [네이버페이 글](/posts/naver-pay-kafka-migration/)과의 차이다. 네이버는 기존·신규 메시지를 두 벌로 발행해 스펙 검증기(내용 비교)와 발행 검증기(집합 비교)로 실시간 대조했고, 검증기가 잡은 불일치 유형까지 적었다. [MCP의 Shadow Release](/posts/shadow-release-query-migration/)도 신구 조회를 나란히 비교했다. 무신사의 통합 모델은 6개 원본의 KTable 조인이므로 어긋날 곳이 많다. 조인 키가 없는 행, 파생 테이블이 먼저 바뀌고 루트가 나중에 바뀌는 순서, Deduplication이 같은 키의 서로 다른 변경을 하나로 합치는 경우. 이것들이 실제로 몇 건이었고 어떻게 잡았는지가 있어야 "옮겼다"가 "맞게 옮겼다"가 된다.

원문의 데이터 재생 절이 그 답의 일부일 수 있다. 어긋남이 발견되면 재생으로 다시 만든다. [parity-pay 6편](/posts/parity-pay-reconciliation/)에서 잔액 스냅샷이 원장과 어긋나면 원장에서 재구축하되 어긋남을 먼저 세고, 원인을 조사한 뒤에 재구축한다고 적었다. 재생은 고치는 장치이고 세는 장치는 따로 있어야 한다. 원문에는 고치는 장치만 있다.

## 원문이 잘 적은 것: 재생의 대가

원문은 서비스가 사용자 트래픽을 실시간으로 받으므로, 스트림즈 애플리케이션과 최종 Sink의 Consumer Lag이 발생하지 않는 속도로 조절해 전체 데이터를 재마이그레이션했다고 적는다. 내가 보기에 이 글에서 가장 실질적인 운영 지식이다. 재생은 곧 부하이고, 그 부하가 실시간 처리를 밀어내면 재생하는 동안 서비스가 틀린다. [parity-pay 5편](/posts/parity-pay-outbox/)에서 적체가 한 곳에 몰리면 처리량이 110배 떨어지는 것을 쟀는데, 재생은 적체를 일부러 만드는 일이다. 속도 조절이 필요하다는 것을 원문이 명시했고, 어떤 속도였는지(초당 몇 건, 전체 재생에 몇 시간)는 없다.

"Source Datasource의 실제 데이터 크기보다 파이프라인에서 사용되는 데이터의 크기가 더욱 큽니다"라는 부수 관찰도 좋다. 원문은 이유를 따로 적지 않았다. 나는 KTable의 changelog, 코파티셔닝을 위한 재발행 토픽, compact 토픽이 각각 원본의 복사본이기 때문이라고 읽는다. Kappa는 배치 레이어를 없애는 대신 Kafka 안에 원본의 복사본을 여럿 둔다.

## 가져갈 것

- Outbox와 CDC의 선택은 원본 트랜잭션을 우리가 통제하는가로 먼저 갈린다. 통제하지 못하면 CDC가 유일하다.
- 옮기는 방법과 맞는지 확인하는 방법은 다른 일이다. 확인하는 장치가 없으면 "옮겼다"까지다.
- 재생은 고치는 장치다. 세는 장치가 따로 있어야 하고, 재생 자체가 부하라 속도 조절이 설계에 들어간다.
- Kappa는 배치를 없애는 대신 원본의 복사본을 여럿 만든다. 그 크기가 원본보다 크다.

## 참고

- [Kafka와 Strimzi를 이용하여 6개의 도메인을 하나의 도메인으로 합쳐보았습니다](https://techblog.musinsa.com/kafka%EC%99%80-strimzi%EB%A5%BC-%EC%9D%B4%EC%9A%A9%ED%95%98%EC%97%AC-6%EA%B0%9C%EC%9D%98-%EB%8F%84%EB%A9%94%EC%9D%B8%EC%9D%84-%ED%95%98%EB%82%98%EC%9D%98-%EB%8F%84%EB%A9%94%EC%9D%B8%EC%9C%BC%EB%A1%9C-%ED%95%A9%EC%B3%90%EB%B3%B4%EC%95%98%EC%8A%B5%EB%8B%88%EB%8B%A4-e0264cfee0de) — MUSINSA techblog, 2024-06-27
- [Strangler Fig Application](https://martinfowler.com/bliki/StranglerFigApplication.html) — Martin Fowler
- [Kafka Design: Log Compaction](https://kafka.apache.org/41/design/design/#log-compaction) — Apache Kafka 4.1 공식 문서
