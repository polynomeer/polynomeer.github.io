---
title: "카카오 「MongoDB 8.0 업그레이드 해야하는 12가지 이유」 리뷰 — majority의 기준을 '적용'에서 '기록'으로 옮긴 것 하나가 쓰기 30~47%를 만들었다"
date: 2026-05-26
categories: [TechBlog, Kakao]
tags: [Tech Blog Review, Kakao, MongoDB, Replication, Sharding, Query Optimizer, TCMalloc, Database]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 35
source_url: https://tech.kakao.com/posts/803
---

원문: [MongoDB 8.0 업그레이드 해야하는 12가지 이유](https://tech.kakao.com/posts/803) — kakao tech, 2025-12-17

## 한 줄 요약

카카오는 새 MongoDB GA가 나오면 1년쯤 기다렸다 업그레이드를 검토한다. 8.0은 성능·안정성에 집중한 버전이라는 MongoDB의 주장을 DBA 관점에서 12개 항목으로 검증한 글이다. 가장 큰 것은 **Write Concern majority의 판정 기준을 세컨더리의 `lastApplied`(데이터 파일 반영)에서 `lastWritten`(oplog 기록)으로 바꾼 것**으로, 사내 벤치마크에서 7.0 대비 쓰기 처리량 30~47%가 나왔다. 그 외 `_id` 단건 조회의 플래닝을 통째로 건너뛰는 Express Plan(처리량 +45%), 리샤딩 개선과 `forceRedistribution`, 컬렉션 이동·샤딩 해제, 샤드키 없는 단건 수정, Index Filter를 대체하는 Query Settings, Config Shard, PBWM 락 제거, Per-CPU TCMalloc, 그리고 8.2의 Community Edition 검색이 이어진다. 지원 기간도 5년으로 늘었다.

## 정책: 5년 지원

메이저 버전 지원이 3년쯤이었는데 8.0은 2024-10 출시, 2029-10-31까지 약 5년이다. 공식 LTS 명칭은 아니지만 사실상 장기 운용 기준 버전이다. 8.2부터는 Atlas 전용이던 래피드 릴리스가 온프레미스에도 열린다.

## 성능: 다섯 가지

**1. majority 판정 기준 변경.** 세컨더리 복제는 Fetch(oplog 가져와 버퍼에) → Write(oplog.rs에 기록, `lastWrittenOpTime` 갱신) → Apply(컬렉션에 병렬 적용, `lastAppliedOpTime` 갱신) 세 단계다. 5.0부터 기본값이 된 majority는 과반 노드 반영을 기다리는데, 그 "반영"의 기준이 Apply에서 **Write로** 내려갔다. oplog에 쓰였으면 내구성은 확보된 것이니 데이터 파일 적용까지 기다릴 필요가 없다는 논리다. YCSB·mongo-perf·사내 도구로 7.0 대비 **30~47%** 향상, 배치가 클수록 크다. 트레이드오프는 majority 쓰기 직후 세컨더리에서 읽으면 아직 적용 전일 수 있다는 것인데, 세컨더리 지연은 예전에도 있던 특성이고 인과적 일관성 세션으로 보완한다. Writer와 Applier 사이에 버퍼가 생겨 `metrics.repl.buffer.*`가 `apply.*`/`write.*`로 나뉜다.

**2. Bulk Write.** 여러 컬렉션을 한 요청으로 묶는 새 `bulkWrite` DB 명령이 생겼고, `insertMany`가 도큐먼트마다 만들던 oplog 엔트리를 **하나로 묶는다.** WiredTiger는 원래 배치를 단일 트랜잭션으로 처리하니 oplog만 따로 쪼개는 것이 비효율이었다. 복제 지연 가능성이 준다.

**3. Express Plan.** `_id` 단건 조회는 유니크 인덱스가 보장되니 파싱 → 정규화 → 플랜 생성 → 스테이지 구성 → 실행의 범용 경로가 낭비다. 조건(`_id` point query 또는 유니크 인덱스/`limit:1`이 보장된 등치 조회, hint·sort·skip·범위·정규식 없음, 단순 projection)을 만족하면 플래닝·플랜 캐시·슬롯 할당·Halloween 검증을 전부 건너뛴다. mongo-perf 단일 스레드에서 처리량 +47~50%, 응답 −32~33%.

**4. PBWM 락 제거.** 세컨더리가 oplog 배치를 병렬 적용할 때 일관성을 위해 잡던 글로벌 락으로, 배치와 무관한 읽기까지 대기시켰다. 3.6의 타임스탬프 지원, 4.0의 `lastApplied` 기반 읽기, 5.0의 전환을 거쳐 7.1에서 제거가 결정됐다.

**5. Per-CPU TCMalloc.** 스레드별 캐시는 스레드가 많을수록 캐시가 흩어지고 파편화가 심해진다. 8.0의 TCMalloc은 코어별 슬랩과 rseq(커널 4.18+)로 잠금 없이 처리하고, 백엔드는 2MB 단위 Hugepage-Aware PageHeap이라 **THP 활성화를 권장**한다(예전엔 비활성 권장이었다). `usingPerCPUCaches`가 false면 커널 버전과 glibc rseq를 확인하라는 메트릭 안내가 있다.

## 샤딩: 네 가지

**리샤딩.** Coordinator(configsvr Primary)·Donor·Recipient 세 서비스가 initializing → preparing-to-donate → cloning → applying → blocking-writes → committing 순으로 간다. Donor는 oplog에 `destinedRecipient`를 붙이기 시작하고, 모든 Donor의 `minFetchTimestamp` 중 가장 큰 값이 `cloneTimestamp`가 된다. Recipient는 임시 컬렉션을 만들고 `readConcern: snapshot, atClusterTime`으로 복제하는데, 8.0부터는 인덱스 스캔 대신 **`$natural` 전체 스캔으로 복제하고 인덱스는 나중에** 빌드한다. 4.4의 History Store 덕에 스냅샷을 메모리에 다 들지 않아도 된다. blocking-writes에서 최대 2초 쓰기 중단, commit에서 rename. 디스크가 2배 필요하다. `forceRedistribution`은 같은 샤드키로 리샤딩하는 옵션으로, 샤드 추가 후 느린 밸런싱과 mongos의 Stale Config 지연을 한 번에 피한다.

**moveCollection / unshardCollection.** 예전엔 unsharded 컬렉션은 primary shard에만 있고 `movePrimary`는 DB 전체 요청을 막았으며, 샤딩 해제 명령은 없었다. 이제 `_id: MinKey~MaxKey` 단일 청크로 리샤딩하는 방식으로 둘 다 된다. `unsplittable: true` 플래그로 구분한다. 트래픽에 따라 샤딩을 켰다 껐다 하는 공용 클러스터 운영이 가능해진다.

**샤드키 없는 단건 수정.** `updateOne(upsert)`, `deleteOne`, `findAndModify`에 샤드키가 필수였는데 풀렸다. Two-Phase Protocol로 1단계에서 관련 샤드 전부에 `$match + $limit:1`을 보내 대상 샤드를 찾고, 2단계에서 그 샤드에만 쓴다. 단일 샤드 트랜잭션이라 2PC는 아니지만 왕복이 두 번이니 성능을 생각하면 여전히 샤드키를 넣는 것이 좋다.

**Config Shard.** 컨피그 서버가 사용자 데이터도 담을 수 있다. 단일 샤드 클러스터라도 CSRS 3대가 따로 필요했던 것이 사라진다. `transitionFromDedicatedConfigServer` / `transitionToDedicatedConfigServer`로 전환. 레플리카 셋으로 시작해 나중에 샤드로 바꾸던 고통(7.0 이전엔 중단 필요)을 처음부터 단일 샤드 클러스터로 시작해 피할 수 있다. 다만 메타데이터와 워크로드를 같이 처리하니 소규모에 권장하고, QE 컬렉션과 온프레미스 Queryable Backup은 비호환.

## 운영: Query Shape과 Query Settings

옵티마이저가 잘못된 인덱스를 고를 때 쓰던 `hint()`는 클라이언트 측 일회성이고, Index Filter는 노드별 메모리라 재시작하면 사라졌다. 8.0은 Index Filter를 **제거**하고 Query Settings로 대체한다. 쿼리의 구조를 값 없이 타입만 남겨 SHA-256으로 만든 `queryShapeHash`(64자)에 `indexHints`·`queryFramework`·`reject`·`comment`를 걸며, 클러스터 전체에 영구 적용된다. 위험한 쿼리 유형을 `reject`로 즉시 차단하고 `comment`에 배경을 남기는 것이 DBA에게 유용하다. 기존 플랜 캐시용 `queryHash`(MurmurHash 8자)는 `planCacheShapeHash`로 이름이 바뀐다.

## 8.2: Community Edition 검색

Atlas 전용이던 Lucene 기반 Full-Text·Vector Search가 Community Edition에 Public Preview로 왔다. `mongot`라는 별도 프로세스가 Change Streams로 mongod를 동기화해 인덱스를 만들고, `$search` 시 mongod가 mongot에서 `_id` 목록을 받아 조회한다. mongot는 레플리카 셋을 syncSource로 두어 mongod 일부 장애를 견디고, 자체는 stateless라 DNS/GSLB로 여러 대를 묶어 HA한다. 재기동 시 oplog가 남아 있으면 따라잡고, 넘었으면 Initial Sync로 재구축. Elasticsearch를 따로 두고 동기화하던 부담을 줄이지만 모든 영역을 대체하는 것은 아니라는 단서가 있다.

## 읽고 남는 질문

- majority 기준 변경으로 "과반이 oplog에 썼다"가 내구성의 정의가 됐다. 프라이머리와 과반 세컨더리가 동시에 죽고 그 세컨더리들이 Apply 전 상태에서 복구될 때, journaling과 결합해 정확히 어디까지 보장되는지가 있으면 좋겠다.
- 30~47%라는 수치가 사내 워크로드 기준인데 배치 크기·문서 크기·레플리카 셋 구성이 없다. Express Plan 수치도 단일 스레드라 멀티스레드 환경의 의미가 궁금하다.
- THP 권장으로의 전환은 오래된 운영 관행(THP 끄기)과 정면으로 부딪힌다. 카카오가 실제로 THP를 켜고 지연 분포가 어떻게 변했는지가 12개 항목 중 가장 궁금한 실측이다.

## 한 줄로 가져가기

8.0의 개선은 대부분 "이미 안전한 것을 불필요하게 더 기다리던 지점"을 찾아 없앤 것이다. oplog에 썼으면 majority, `_id`면 플래닝 생략, 배치면 oplog 하나. 업그레이드의 이유는 새 기능이 아니라 그 기다림을 없애는 데 있다.
