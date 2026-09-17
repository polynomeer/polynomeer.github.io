---
title: "카카오 「MongoDB WiredTiger의 파일 구조」·「WiredTiger의 B+Tree」 리뷰 — wt와 bsondump로 파일을 열고 gdb로 메모리를 들여다본, InnoDB와 정반대인 설계"
date: 2025-01-24
categories: [TechBlog, Kakao]
tags: [Tech Blog Review, Kakao, MongoDB, WiredTiger, B+Tree, Storage Engine, MVCC, Database Internals]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 1
source_url: https://tech.kakao.com/posts/670
---

원문(2편, kakao tech, 앤디·분산데이터베이스):
[MongoDB WiredTiger의 파일 구조](https://tech.kakao.com/posts/670)(2024-12-06) · [MongoDB WiredTiger의 B+Tree](https://tech.kakao.com/posts/688)(2025-02-20)

## 한 줄 요약

MongoDB 데이터 디렉터리의 파일들을 `wt` 유틸리티와 `bsondump`로 하나씩 열어 무엇이 들었는지 확인하고(1편), `gdb`로 mongod에 브레이크포인트를 걸어 메모리 위의 B+Tree가 어떻게 생겼는지 본다(2편). 발견은 InnoDB에 익숙한 사람에게 낯선 것들이다. 사용자 컬렉션·인덱스 파일은 **저널링이 꺼져 있고** oplog만 저널링된다. `_id` 인덱스는 기본적으로 **논클러스터드**라 리프에 문서가 아니라 RecordId가 있다(5.3부터 클러스터드 컬렉션 선택 가능). B+Tree의 **같은 레벨 페이지끼리 연결이 없어** 범위 스캔이 부모를 거친다. 리프 페이지의 행은 배열(WT_ROW)이지만 삽입은 **스킵 리스트(WT_INSERT)**, 갱신은 **업데이트 체인(WT_UPDATE)**으로 따로 관리한다. 동시성은 락 대신 CAS 기반의 낙관적 제어다.

## 1편: 파일을 열어 보다

도구는 둘이다. `bsondump`(BSON 디코딩, MongoDB 패키지 포함)와 `wt`(WiredTiger 소스에서 `make wt`로 빌드, mongod가 꺼진 상태에서만 사용).

| 파일 | 내용 |
| --- | --- |
| `WiredTiger` | 엔진 버전(10.0.2). WT 3.0.0의 타임스탬프 → MongoDB 3.6, WT 10.0.0의 History Store → MongoDB 4.4처럼 메이저 변화가 연동된다 |
| `WiredTiger.lock` | 다른 인스턴스의 동시 접근 방지, 시작 시 복구 여부 결정 |
| `WiredTiger.wt` | 모든 파일의 구성과 최신 체크포인트 메타데이터. `file:` 항목마다 `id`, `log=(enabled=…)`, `checkpoint=(…)` |
| `WiredTiger.turtle` | `WiredTiger.wt` 자신의 체크포인트 메타데이터. 메타데이터의 메타데이터 |
| `sizeStorer.wt` | 컬렉션별 문서 수와 데이터 크기(`numRecords`, `dataSize`) |
| `_mdb_catalog.wt` | 사용자에게 보이는 네임스페이스(`kakao.wt_version`)와 컬렉션 옵션·UUID·인덱스를 내부 식별자(`kakao/collection-0-…`, `kakao/index-2-…`)에 매핑 |
| `WiredTigerHS.wt` | History Store. 과거 버전 변경 이력 |
| `journal/` | WAL. 재사용 없이 새 파일을 계속 만들고 체크포인트 이전 것은 삭제 |
| `collection-*`, `index-*` | 실제 데이터와 인덱스 |

**왜 사용자 파일은 log가 꺼져 있나.** `WiredTiger.wt`를 보면 사용자 컬렉션·인덱스는 `log=(enabled=false)`, `local/collection-2-…`(oplog)는 `enabled=true`다. 모든 파일을 저널링하면 모든 변경을 디스크 전에 저널에 써야 하니, **oplog만 저널링**하는 것이 성능상 합리적이다. 대신 사용자 데이터 파일의 쓰기는 메모리에 있다가 eviction이나 체크포인트로만 디스크에 가고 **체크포인트 내구성**만 보장된다. 저널로그를 뜯어 보면 `optype: row_put`, `fileid: 18`이고, 18은 `WiredTiger.wt`에서 `local/collection-2-…` 즉 `local.oplog.rs`다. 저널에는 oplog의 변경이 기록되고 있다는 것이 확인된다.

**sizeStorer의 한계.** 매번 `_changeNumRecordsAndDataSize`로 갱신하고 실패 시 롤백은 고려되지만, 체크포인트 사이의 비정상 종료는 고려하지 않는다. 샤드 클러스터에서는 각 샤드의 값이라 고아 도큐먼트를 거르지 못하므로 정확한 수는 `countDocuments()`(SHARDING_FILTER 스테이지)로 봐야 한다.

**History Store.** WiredTiger는 MVCC로 여러 버전을 메모리에 두는데, eviction이나 체크포인트로 디스크에 쓸 때는 한 버전만 쓴다(reconciliation). 나머지 과거 버전을 그냥 버리면 그 버전을 읽어야 하는 트랜잭션이 실패하므로 `WiredTigerHS.wt`에 저장한다. 같은 문서를 AAA=1,3,5,7,9로 다섯 번 갱신하고 eviction시키면 9만 디스크 이미지가 되고 1·3·5·7이 HS에 들어가는 것을 파일에서 확인한다. 예전의 `WiredTigerLAS.wt`(Look Aside)는 eviction 조건(최근 변경 커밋됨, 과거 버전 읽는 트랜잭션 없음)을 만족하는 페이지만으로 메모리를 못 비울 때 쓰던 파일이었고, WT 10.0.0의 HS가 완전히 대체했다. 보관 주기는 `minSnapshotHistoryWindowInSeconds`(6.0 기본 300초)이고 비정상 종료 시 Rollback To Stable에도 쓰인다.

**컬렉션과 인덱스 파일.** WiredTiger는 전부 키-값 저장소다. 컬렉션 파일의 키는 RecordId(+0x80), 값은 BSON 원문. 인덱스 파일은 이진 비교가 가능한 **KeyString** 직렬화를 쓴다. `{normal_1:1, normal_2:1}` 인덱스에 `{100, 100}`을 넣으면 `2bc82bc8040010`인데, `2b`=kNumeric(30)+13(1바이트 양의 정수), `c8`=200(정수는 왼쪽 시프트), 마지막이 RecordId다. 문자열 `"100"`은 `3c`(kStringLike)로 시작한다. RecordId는 2~9바이트 가변 인코딩으로, 처음과 끝 3비트가 길이(N)를 나타내 1은 `0008`, 1024부터는 3바이트 `202001`이 된다.

**_id는 논클러스터드.** `_id` 인덱스의 리프에는 (`_id`, RecordId) 쌍이 있고 문서는 컬렉션 파일에 따로 있다. MySQL의 PK 클러스터드 인덱스와 달리 조회가 두 번이다. 5.3부터 **클러스터드 컬렉션**을 만들면 컬렉션 파일에 `_id` 순서로 문서가 저장되지만, 보조 인덱스가 RecordId 대신 `_id`를 참조해야 하므로 `_id`가 크면 보조 인덱스가 커진다. 보조 인덱스는 중복 값 때문에 키 고유성을 위해 RecordId가 키에 append된다.

## 2편: 메모리 위의 B+Tree

`--gdbserver`로 빌드한 mongod에 브레이크포인트를 걸어 본다.

**같은 레벨 페이지 연결이 없다.** InnoDB의 리프 페이지는 이중 연결 리스트지만 WiredTiger는 아니다. 루트·인터널 페이지는 자식 WT_REF 배열(`__index`)만 갖고 형제 포인터가 없다. 이유는 페이지 분할 시 부모의 `__index`만 CAS로 원자적으로 갱신하면 되기 때문이다. 변경된 페이지를 항상 파일의 새 위치에 쓰는(no-overwrite) 특성상 단일 변수 갱신이 자연스럽다. 형제 포인터가 있으면 분할 때 인접 포인터까지 고쳐야 한다. 그러면 범위 쿼리는? `num >= 1981`을 실행하며 `__wt_btcur_next_prefix`와 `__tree_walk_internal`에 멈추면, 한 리프가 끝날 때 **부모의 WT_REF 배열에서 현재 슬롯을 찾아 다음 슬롯으로** 이동하는 것이 보인다(10,000건이라 루트-리프 2계층, 다음 리프에 651개 항목). 부모를 거치는 추가 작업이 있지만 연결 관리가 단순하고 원자 연산이 쉽다.

**리프 페이지: 배열 + 스킵 리스트 + 업데이트 체인.** 디스크에서 읽은 행은 WT_ROW **배열**이라 이진 탐색이 빠르다. 그러나 배열은 중간 삽입·삭제가 비싸다. 그래서 변경은 두 구조체로 따로 관리한다.

- **WT_UPDATE**: 기존 키의 값 변경. WT_ROW를 직접 고치지 않고 업데이트 체인(연결 리스트, 헤드가 최신 txnid)을 만든다. 이것이 MVCC다. `__wt_update_serial`에서 체인을 확인한다.
- **WT_INSERT**: 새 키의 삽입. 키 1과 10000 사이에 무수한 키가 들어올 수 있으니 삽입과 조회 모두 효율적인 **스킵 리스트**(최대 깊이 10)를 쓴다. WT_INSERT는 WT_UPDATE를 포함한다(삽입 후 갱신될 수 있으므로). `__wt_insert_serial`에서 skipdepth와 정렬 상태를 본다.

MongoDB의 insert 하나는 WiredTiger에서 컬렉션 데이터, `_id` 인덱스, 보조 인덱스, oplog 여러 삽입이 한 트랜잭션으로 돈다. 컬렉션 파일 트리는 RecordId가 순차 증가 키라 메모리에서 값 변경을 허용하는 등 기능의 일부만 쓰는데, WiredTiger가 2014년 인수된 범용 엔진이기 때문이다.

**정렬 방향 성능.** 인덱스를 오름차순으로 만들어도 내림차순 조회가 된다. WT_ROW 배열은 인덱스를 증감하면 되어 방향 차이가 없지만, 스킵 리스트는 단방향이라 역순 조회용 매크로(`__cursor_skip_prev`)로 최적화한다. 실험: 소량 삽입 직후(모두 스킵 리스트에 있음)에는 내림차순이 약 **7% 느렸고**, 재시작 후(모두 WT_ROW 배열)에는 차이가 거의 없었다. 브레이크포인트 로그에서 첫 시나리오의 내림차순에서만 `__cursor_skip_prev`가 건수만큼 추가 호출된 것이 확인된다.

**InnoDB와의 비교.** InnoDB는 리프 페이지 안의 레코드를 연결 리스트로 두고, 마지막 레코드 접근이 느린 것을 페이지 디렉터리(배열)로 보완한다. WiredTiger는 반대로 배열을 기본으로 두고 스킵 리스트로 보완한다. 동시성은 InnoDB가 락을 먼저 잡는 비관적 제어, WiredTiger가 CAS로 시도하고 충돌 시 재시도하는 낙관적 제어다. 충돌이 드물면 낙관적이 유리하지만 현실이 늘 그렇지는 않다는 단서가 붙는다.

## 읽고 남는 질문

- 사용자 데이터 파일이 체크포인트 내구성만 보장한다면, 복구는 "마지막 체크포인트 + oplog 재적용"이 될 텐데 그 과정에서 HS와 Rollback To Stable이 어떻게 맞물리는지가 다음 편감이다.
- 형제 포인터 없는 설계에서 리프가 수백만 개인 큰 트리의 범위 스캔은 부모 인터널 페이지 접근이 얼마나 추가되는지, 그것이 캐시에 있어 실질 비용이 미미한지 수치가 있으면 좋겠다.
- 스킵 리스트가 커진 채로 오래 있으면(체크포인트 전 대량 삽입) 조회가 배열 대비 얼마나 느려지는지, 그리고 reconciliation이 언제 배열로 다시 만드는지가 운영 튜닝에 중요하다.

## 한 줄로 가져가기

WiredTiger는 "디스크에서 읽은 것은 배열로, 그 뒤의 변경은 스킵 리스트와 체인으로, 페이지 관계는 부모만, 동시성은 락 대신 CAS"라는 일관된 선택이고, 그 선택은 InnoDB와 거의 모든 지점에서 반대다. 같은 B+Tree라는 이름을 믿고 InnoDB의 직관을 가져오면 틀린다.
