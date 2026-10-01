---
title: "B+Tree 인덱스의 내부 - 노드 분할, 클러스터드와 논클러스터드, 커버링이 아끼는 것"
date: 2026-02-20
categories: [Notes, Database]
tags: [Database, Index, B+Tree, InnoDB, MySQL, PostgreSQL, Database Internals]
---

인덱스를 "검색을 빠르게 하는 자료구조"로 알고 쓰면, 인덱스를 추가했는데 쓰기가 느려지는 이유나 `ORDER BY`가 인덱스를 타는 조건을 설명할 수 없다. B+Tree의 형태를 보면 그 질문들이 같은 곳에서 답을 얻는다.

## 왜 이진 트리가 아니라 B+Tree인가

디스크와 SSD는 바이트가 아니라 블록 단위로 읽는다. DB는 보통 8KB(PostgreSQL)나 16KB(InnoDB의 기본 `innodb_page_size`) 페이지를 한 번에 읽는다. 이진 트리는 노드마다 자식이 둘이라 100만 건이면 깊이가 20이고, 노드 하나에 페이지 하나를 읽으면 20번의 IO다.

B+Tree는 노드 하나에 수백 개의 키를 담는다. 8KB 페이지에 키가 수백 개면 분기 수가 수백이고, 깊이는 3~4에서 끝난다. **깊이가 곧 IO 횟수**이므로 두 구조의 차이는 여기서 갈린다.

구조의 특징은 둘이다.

- 모든 값은 리프에만 있다. 내부 노드는 "어디로 갈지"만 담는 이정표다. 그래서 내부 노드에 더 많은 키가 들어가고 분기 수가 커진다.
- 리프가 서로 연결돼 있다. 이웃 리프로 바로 갈 수 있으므로 범위 스캔(`BETWEEN`, `>`)이 트리를 다시 타지 않고 옆으로 이동한다.

## 노드 분할: 쓰기가 느려지는 자리

새 키가 들어갈 리프가 가득 차면 분할한다. 절반을 새 페이지로 옮기고, 부모에 새 이정표를 넣는다. 부모도 가득 차 있으면 부모가 분할되고, 루트까지 올라가면 트리의 깊이가 1 는다.

이 동작에서 실무 현상 두 개가 나온다.

첫째, 무작위 키 삽입이 비싸다. UUIDv4를 기본키로 쓰면 삽입 위치가 트리 전체에 흩어진다. 그래서 매번 다른 페이지를 읽어야 하고(캐시 미스), 분할이 여기저기서 일어나며, 페이지 점유율이 떨어져 같은 데이터가 더 많은 페이지를 차지한다. 반면 시간 순으로 증가하는 키(auto increment, ULID, UUIDv7)는 항상 오른쪽 끝에 붙는다. 그 페이지만 뜨겁고 분할도 한쪽에서만 난다.

둘째, 인덱스마다 쓰기 비용이 붙는다. 행 하나를 `INSERT`하면 테이블 한 번이 아니라 인덱스 수만큼 트리가 갱신된다. "읽기가 느려서 인덱스를 추가했더니 쓰기가 느려졌다"는 이 산술에서 나온다.

## 클러스터드와 논클러스터드

InnoDB는 기본키가 클러스터드 인덱스다. 즉 **행 데이터 자체가 기본키 B+Tree의 리프에 들어 있다.** 보조 인덱스의 리프에는 행 위치가 아니라 기본키 값이 들어 있다. 따라서 보조 인덱스로 찾은 뒤 기본키 트리를 한 번 더 타야 한다. 이것을 클러스터드 인덱스 룩업이라 부른다([MySQL: Clustered and Secondary Indexes](https://dev.mysql.com/doc/refman/8.4/en/innodb-index-types.html)).

여기서 따라오는 것들이 있다.

- 기본키가 길면(예: UUID 문자열) 모든 보조 인덱스가 그만큼 커진다. 같은 문서의 표현은 "If the primary key is long, the secondary indexes use more space, so it is advantageous to have a short primary key."(기본키가 길면 보조 인덱스가 공간을 더 쓰므로 짧은 기본키가 유리하다)이다.
- 기본키 순서가 곧 물리적 저장 순서다. 기본키 범위 스캔은 순차 읽기가 된다.
- 기본키 값을 바꾸면 행이 물리적으로 이동한다.

PostgreSQL은 다르다. 힙(heap)에 행을 두고 모든 인덱스가 `ctid`(물리 위치)를 가리킨다. 문서도 PostgreSQL의 모든 인덱스가 테이블 본체와 따로 저장되는 보조 인덱스라고 적는다([PostgreSQL: Index-Only Scans and Covering Indexes](https://www.postgresql.org/docs/current/indexes-index-only-scans.html)). 클러스터드 인덱스가 없으므로 기본키 길이의 영향이 InnoDB보다 작다. 대신 행을 갱신하면 새 버전이 힙 어딘가에 생기고([MVCC](/posts/mvcc/)), 인덱스는 그 위치를 따라가야 한다. HOT 업데이트가 이 비용을 줄이는 최적화다.

## 커버링 인덱스가 아끼는 것

쿼리에 필요한 컬럼이 전부 인덱스 안에 있으면 테이블(또는 클러스터드 트리)을 보지 않고 끝낸다. 이것이 커버링 인덱스이고, 실행 계획에 `Using index`(MySQL) 또는 `Index Only Scan`(PostgreSQL)으로 나온다.

```sql
-- 인덱스: (user_id, created_at, status)
SELECT status FROM orders WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20;
-- 필요한 컬럼이 인덱스에 다 있으면 테이블을 안 읽는다
```

아끼는 것은 **랜덤 IO**다. 인덱스에서 20건을 찾은 뒤 각각 테이블로 가는 것이 가장 비싸고, 그것이 사라진다. 다만 인덱스에 컬럼을 넣을수록 인덱스가 커지고 쓰기 비용이 오른다. PostgreSQL의 `INCLUDE` 절은 키가 아닌 컬럼을 페이로드로 얹어 이 교환을 조절한다.

PostgreSQL에는 조건이 하나 더 있다. 가시성 정보는 인덱스가 아니라 힙에만 있다. 그래서 Index Only Scan은 visibility map에서 해당 힙 페이지의 "모두 보임" 비트를 확인하고, 비트가 꺼져 있으면 결국 힙을 방문한다. 최근에 많이 바뀐 테이블에서는 커버링 인덱스를 만들어도 힙 접근이 그대로 남을 수 있다는 뜻이다(같은 문서).

## 복합 인덱스의 순서와 정렬

복합 인덱스 `(a, b, c)`는 `a`로 정렬하고 같은 `a` 안에서 `b`, 그 안에서 `c`로 정렬한 하나의 트리다. 그래서 다음이 성립한다.

- `WHERE a = ? AND b = ?`는 탄다. `WHERE b = ?`만으로는 읽을 범위를 좁히기 어렵다(선두 컬럼이 없다). PostgreSQL 문서는 복합 B-tree 인덱스가 어떤 컬럼 조합의 조건에도 쓰일 수 있지만 선두 컬럼에 조건이 있을 때 가장 효율적이라고 설명하고, 이 경우를 위한 skip scan 최적화도 함께 적는다([PostgreSQL: Multicolumn Indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)).
- `WHERE a = ? ORDER BY b`는 정렬 없이 끝난다. 인덱스가 이미 그 순서다.
- `WHERE a > ? ORDER BY b`는 정렬이 필요하다. `a`가 범위면 그 안의 `b` 순서가 전체 순서와 다르다.

"인덱스를 만들었는데 정렬이 파일 정렬로 간다"의 대부분이 마지막 경우다.

## 이 설명이 깨지는 곳

- **선택도가 낮으면 인덱스를 안 쓰는 것이 맞다.** 전체의 30%를 읽을 거라면 랜덤 IO를 30만 번 하느니 순차 스캔이 빠르다. 옵티마이저가 인덱스를 무시하는 것이 대개 옳다([실행 계획 읽기](/posts/reading-execution-plans/)).
- **B+Tree만 인덱스가 아니다.** 해시, GIN, GiST, BRIN은 각자 다른 질의에 맞다. 전문 검색과 JSON 조회에 B+Tree를 기대하면 안 된다.
- **삭제는 공간을 바로 돌려주지 않는다.** 리프에서 키를 지워도 페이지는 남고, 단편화가 쌓이면 재구축(`REINDEX`, `OPTIMIZE TABLE`)이 필요하다.
- **인덱스는 통계가 아니다.** 인덱스가 있어도 통계가 낡으면 옵티마이저가 안 쓴다.

## 무엇을 재면 확인되는가

1. 순차 키와 UUIDv4 키로 같은 건수를 삽입하고 소요 시간, 인덱스 크기, 페이지 분할 수를 비교한다.
2. 인덱스를 0개, 1개, 3개 둔 테이블에 같은 부하로 `INSERT`를 걸고 처리량을 본다.
3. 커버링 인덱스 전후로 실행 계획과 버퍼 히트 수를 비교한다. PostgreSQL은 `EXPLAIN (ANALYZE, BUFFERS)`로 읽은 블록 수까지 나온다.

## 실무와의 접점

[대량 배치의 벌크 삽입](/posts/bulk-insert-performacne/)에서 삽입 성능을 다뤘다. 그때 인덱스 수와 키 형태가 삽입 비용에 어떻게 들어가는지를 이 글의 언어로 다시 보면, 줄일 수 있었던 것이 배치 크기만은 아니었다. [키 생성 병목 시리즈](/posts/sequence-part1/)에서 채번을 다룬 것도 같은 자리다. 기본키의 형태는 채번 병목뿐 아니라 모든 보조 인덱스의 크기를 정한다.

## 정리

- 노드 하나에 키를 수백 개 담아 깊이를 3~4로 줄이는 것이 B+Tree가 이진 트리보다 IO를 아끼는 방식이다.
- 무작위 키는 분할과 캐시 미스를 흩뿌린다. 시간 순 증가 키는 한쪽 끝만 뜨겁다.
- 커버링 인덱스의 대가는 인덱스 크기와 쓰기 비용이고, PostgreSQL에서는 visibility map 상태에 따라 이득이 줄어든다.

## 참고

- [MySQL: Clustered and Secondary Indexes](https://dev.mysql.com/doc/refman/8.4/en/innodb-index-types.html)
- [MySQL: innodb_page_size](https://dev.mysql.com/doc/refman/8.4/en/innodb-parameters.html#sysvar_innodb_page_size)
- [PostgreSQL: Index-Only Scans and Covering Indexes](https://www.postgresql.org/docs/current/indexes-index-only-scans.html)
- [PostgreSQL: Multicolumn Indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)
- [DB 인덱스 정리](/posts/db-index/)
