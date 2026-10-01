---
title: "실행 계획을 읽는 법 - 연산자, 비용 모델, 카디널리티 추정이 틀어지는 지점"
date: 2026-04-08
categories: [Notes, Database]
tags: [Database, SQL, Execution Plan, PostgreSQL, MySQL, Index, Query Optimization]
---

`EXPLAIN`을 찍고 "Seq Scan이 있네, 인덱스를 추가하자"로 끝내면 절반만 한 것이다. 옵티마이저가 인덱스를 알고도 안 쓰는 경우가 많고, 그때 인덱스를 추가하면 아무것도 바뀌지 않는다. 실행 계획을 읽는다는 것은 **옵티마이저가 무엇을 잘못 알고 있는지**를 찾는 일이다.

## 계획은 트리이고, 읽는 순서는 안쪽부터다

실행 계획은 연산자 트리다. 출력은 위에서 아래로 들여쓰기로 그려지지만, 실행은 가장 안쪽(깊은 들여쓰기)부터 위로 올라온다.

```text
Nested Loop  (cost=0.43..8.48 rows=1 width=64) (actual time=0.05..0.06 rows=1 loops=1)
  ->  Index Scan using orders_pkey on orders   -- 먼저 실행
  ->  Index Scan using users_pkey on users     -- 그 각 행마다 실행
```

비용을 읽을 때는 `loops`를 먼저 본다. 안쪽 노드의 `actual time`은 1회 실행의 평균이므로, 실제 비용은 `actual time × loops`다. PostgreSQL 문서도 같은 계산을 적는다.

> "Multiply by the `loops` value to get the total time actually spent in the node."

`loops` 값을 곱해야 그 노드에서 실제로 쓴 총시간이 나온다는 뜻이다([PostgreSQL: Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)). 그래서 "0.01ms짜리 인덱스 스캔"이 10만 번 돌면 1초다. 느린 쿼리에서 범인은 대개 단일 비용이 큰 노드가 아니라 loops가 큰 노드다.

## 세 가지 조인 방식

| 방식 | 동작 | 유리한 조건 |
| --- | --- | --- |
| Nested Loop | 바깥 행마다 안쪽을 조회 | 바깥이 적고 안쪽에 인덱스가 있음 |
| Hash Join | 한쪽으로 해시 테이블을 만들고 다른 쪽을 흘림 | 양쪽이 크고 동등 조인 |
| Merge Join | 양쪽을 정렬해 나란히 훑음 | 이미 정렬돼 있거나 정렬이 싼 경우 |

옵티마이저는 행 수 추정치로 이 중 하나를 고른다. 그래서 추정이 1행인데 실제가 10만 행이면, Nested Loop를 골라 안쪽을 10만 번 반복한다. 실행 계획 진단의 대부분이 이 지점이다.

## 추정과 실제를 비교한다

`EXPLAIN`만으로는 추정치만 나온다. `EXPLAIN ANALYZE`를 써야 실제 값이 함께 나온다. 이 옵션은 쿼리를 실제로 실행하므로, 쓰기 쿼리에는 트랜잭션으로 감싸고 롤백한다(같은 문서의 예시도 `BEGIN`과 `ROLLBACK`으로 감싼다).

```text
(cost=... rows=1 ...) (actual ... rows=98234 loops=1)
                ^추정 1행              ^실제 98,234행
```

이 괴리가 크면 나머지 계획은 전부 잘못된 전제 위에 있다. 원인은 대개 넷이다.

첫째, 통계가 낡았다. 대량 변경 뒤 `ANALYZE`(PostgreSQL)나 `ANALYZE TABLE`(MySQL)을 안 돌렸다. autovacuum이 돌기 전의 테이블이 그렇다.

둘째, 컬럼 사이 상관관계를 모른다. 옵티마이저는 기본적으로 컬럼들이 독립이라고 가정한다. 그래서 `city = '서울' AND country = '한국'`에서 두 조건의 선택도를 곱하면 실제보다 훨씬 작게 나온다. PostgreSQL 문서도 플래너가 여러 조건을 서로 독립으로 가정하며, 컬럼 값이 상관돼 있으면 이 가정이 성립하지 않는다고 적는다. 처방은 `CREATE STATISTICS`(확장 통계)다([PostgreSQL: Extended Statistics](https://www.postgresql.org/docs/current/planner-stats.html#PLANNER-STATS-EXTENDED)).

셋째, 함수와 형변환이 통계를 무력화한다. `WHERE DATE(created_at) = '2026-04-08'`은 컬럼 통계를 쓸 수 없다. 범위 조건(`>= ... AND < ...`)으로 바꾸거나 표현식 인덱스를 만든다. 암묵적 형변환(문자열 컬럼에 숫자 비교)도 같은 결과를 낳고, 인덱스도 못 탄다.

넷째, 바인드 파라미터를 모른다. 준비된 문장에서 값을 모른 채 계획을 만들면 평균적인 선택도를 쓴다. 그 결과 값에 따라 편차가 큰 컬럼(예: 상태값)에서는 특정 값에만 나쁜 계획이 나온다.

## 인덱스를 알고도 안 쓰는 이유

이것이 정상인 경우가 많다.

- **선택도가 낮다.** 전체의 30%를 읽는다면 인덱스로 랜덤 IO를 수만 번 하느니 순차 스캔이 빠르다.
- **정렬 요구를 인덱스가 못 준다.** 선두 컬럼이 범위 조건이면 뒤 컬럼의 순서가 보장되지 않는다([B+Tree 인덱스](/posts/btree-index-internals/)).
- **테이블이 작다.** 몇 페이지짜리 테이블은 전체를 읽는 것이 항상 빠르다.

그래서 인덱스를 추가하기 전에 "옵티마이저가 안 쓰는 것인가, 못 쓰는 것인가"를 먼저 구분해야 한다. 못 쓰는 것이면(함수, 형변환, 선두 컬럼 부재) 쿼리나 인덱스 설계를 고친다. 안 쓰는 것이면 대개 옵티마이저가 옳다.

## 읽는 순서

1. **추정 행 수와 실제 행 수의 괴리가 가장 큰 노드**를 찾는다.
2. 그 노드의 `loops`를 본다. 단일 비용이 작아도 반복이 많으면 그곳이다.
3. 괴리의 원인을 통계, 상관관계, 함수·형변환, 바인드 중에서 찾는다.
4. PostgreSQL이면 `EXPLAIN (ANALYZE, BUFFERS)`로 읽은 블록 수까지 본다. `shared read`가 많으면 캐시에 없는 데이터를 디스크에서 읽은 것이다.

## 이 설명이 깨지는 곳

- **`EXPLAIN ANALYZE`는 계측 오버헤드가 있다.** 노드가 많고 반복이 많으면 실제보다 느리게 나온다. PostgreSQL 문서도 계측 오버헤드가 클 수 있고, 결과 행을 클라이언트로 보내지 않으므로 네트워크 전송 비용이 빠진다고 적는다. 시간의 절대값보다 행 수의 괴리를 본다.
- **캐시 상태가 결과를 바꾼다.** 두 번째 실행이 빠른 것은 계획이 좋아서가 아니라 버퍼에 올라와서다. 비교할 때는 조건을 맞춰야 한다.
- **MySQL과 PostgreSQL의 출력이 다르다.** MySQL은 `EXPLAIN ANALYZE`가 8.0.18부터 있고([MySQL 8.0: EXPLAIN Statement](https://dev.mysql.com/doc/refman/8.0/en/explain.html)), 전통적인 `EXPLAIN` 출력은 형식이 전혀 다르다.
- **힌트로 계획을 고정하는 것은 마지막 수단이다.** 데이터가 바뀌면 그 힌트가 틀린 계획을 고정한다.

## 무엇을 재면 확인되는가

1. 통계를 일부러 낡게 만들고(대량 삽입 후 `ANALYZE` 생략) 같은 쿼리의 계획이 어떻게 바뀌는지.
2. 상관관계가 있는 두 컬럼에 확장 통계를 만들기 전후의 추정 행 수.
3. 같은 쿼리를 값만 바꿔 가며(선택도가 높은 값과 낮은 값) 계획이 전환되는 지점.

3번은 옵티마이저의 비용 모델이 어디서 뒤집히는지를 보여준다. "인덱스를 안 탄다"는 신고의 대부분이 이 경계에 있다. 이 세 항목은 [인덱스가 선택되지 않는 순간](/posts/when-the-index-is-not-used/)에서 200만 행 테이블로 쟀다.

## 실무와의 접점

[벌크 삽입 성능](/posts/bulk-insert-performacne/)과 [키 생성 병목](/posts/sequence-part1/)에서 다룬 것은 쓰기 경로였다. 읽기 경로도 순서는 같다. 추측으로 인덱스를 추가하기 전에 계획을 읽고, 계획을 믿기 전에 추정과 실제를 비교한다. [ParityPay 2편](/posts/parity-pay-lock-hold-time/)에서 잠금 보유 17ms 중 DB가 실제로 일한 시간은 2.31ms였다. 그렇게 숫자를 나눠 보기 전까지는 어디를 고쳐야 할지 알 수 없다.

## 정리

- `loops`를 곱하지 않으면 안쪽 노드의 비용을 작게 읽는다.
- 조인 방식은 행 수 추정치가 고르므로, 추정이 틀리면 나머지 계획이 전부 틀린다.
- 옵티마이저가 인덱스를 안 쓰는 것은 대개 옳다. 인덱스를 추가하기 전에 "안 쓰는 것"과 "못 쓰는 것"을 먼저 구분한다.

## 참고

- [PostgreSQL: Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
- [PostgreSQL: Extended Statistics](https://www.postgresql.org/docs/current/planner-stats.html#PLANNER-STATS-EXTENDED)
- [MySQL: EXPLAIN Output Format](https://dev.mysql.com/doc/refman/8.4/en/explain-output.html)
- [MySQL 8.0: EXPLAIN Statement](https://dev.mysql.com/doc/refman/8.0/en/explain.html)
- [DB 인덱스 정리](/posts/db-index/)
