---
title: 데이터베이스 페이징 성능을 어떻게 봐야 하는가
date: 2025-04-22
categories: [Notes, Database]
tags: [Database, SQL, Pagination]
---

## 페이징은 왜 느려지는가

목록 조회에서 페이지네이션은 당연한 기능처럼 보이지만, 데이터가 커질수록 단순 `limit offset` 방식이 병목이 되기 쉽다.

DB가 `offset = 100000`을 받았다고 해서 100000개를 공짜로 건너뛰지는 않는다. 앞 데이터를 실제로 읽은 뒤 버리기 때문에 뒤 페이지로 갈수록 느려질 수 있다. [PostgreSQL 문서](https://www.postgresql.org/docs/current/queries-limit.html)도 OFFSET으로 건너뛴 행은 서버 안에서 계산되므로 큰 OFFSET은 비효율적일 수 있다고 적는다.

## Offset 기반 페이징

장점:

- 구현이 단순하다.
- 특정 페이지로 바로 이동하기 쉽다.

단점:

- 뒤 페이지일수록 비용이 커진다.
- 중간에 데이터가 삽입/삭제되면 결과가 흔들릴 수 있다.

## Cursor 기반 페이징

이전 페이지의 마지막 키를 기준으로 다음 페이지를 가져오는 방식이다.

장점:

- 대량 데이터에서 안정적이다.
- 무한 스크롤과 잘 맞는다.

단점:

- 임의 페이지 이동은 어렵다.
- 정렬 기준이 명확해야 한다.

## 성능을 볼 때 체크할 것

- 정렬 기준 컬럼에 [인덱스](/posts/db-index/)가 있는가
- count 쿼리가 비싸지 않은가
- 조회 쿼리와 count 쿼리를 분리해야 하는가
- tie-breaker(정렬 값이 같을 때 순서를 정하는 보조 키)가 있는가

예를 들어 `created_at desc`만 쓰면 같은 시간대 레코드에서 순서가 흔들릴 수 있어서 `created_at desc, id desc`처럼 보조 정렬 키를 두는 편이 안전하다. 같은 문서는 유일한 순서를 강제하는 `ORDER BY` 없이 `LIMIT`을 쓰면 예측할 수 없는 부분 집합을 받는다고 설명한다.

## 흔한 실수

- 무조건 `Page`를 반환해서 무거운 count 쿼리를 매번 수행함 ([Spring 쪽 설계](/posts/pagination/))
- fetch join과 페이징을 함께 써서 예상과 다른 결과가 나옴
- offset 방식이 느린데도 쿼리 대신 애플리케이션 레이어만 만짐

## 정리

페이징 성능은 "API 모양"보다 "DB가 어떤 순서로 몇 건을 읽는가"의 문제다. 그래서 데이터가 커지면 offset과 cursor 중 하나를 고르는 일과 정렬 키와 인덱스를 맞추는 일을 함께 결정해야 한다.

## 참고

- [PostgreSQL Documentation: LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html)
