---
title: Spring 애플리케이션에서 페이지네이션을 설계하는 방법
date: 2024-09-07
categories: [Notes, Spring]
tags: [Spring, Pagination, Query]
---

## 페이지네이션은 단순히 잘라서 보여주는 문제가 아니다

목록 조회를 만들 때 페이지네이션은 거의 필수다. 하지만 단순히 `Pageable`을 받는 것만으로 끝나지 않는다. 성능, 정렬 안정성, 카운트 쿼리 비용까지 함께 봐야 한다.

## 가장 흔한 방식 두 가지

### Offset Pagination

`limit`, `offset` 기반 방식이다.

- 장점: 구현이 단순하다.
- 장점: 특정 페이지로 이동하기 쉽다.
- 단점: 뒤 페이지로 갈수록 느려질 수 있다. 건너뛸 행까지 DB가 결과를 만들어야 하기 때문이다([Spring Data, Scrolling](https://docs.spring.io/spring-data/commons/reference/repositories/scrolling.html), [페이징 성능](/posts/pagination-performance/)).
- 단점: 중간 데이터가 삽입/삭제되면 결과가 흔들릴 수 있다.

### Cursor Pagination

마지막으로 본 값을 기준으로 다음 페이지를 가져오는 방식이다. Spring Data의 keyset 스크롤은 마지막 항목의 정렬 키와 기본 키를 조건절에 넣어 DB가 인덱스로 그 위치부터 읽게 한다.

- 장점: 대량 데이터에서 안정적이고 빠르다.
- 장점: 무한 스크롤과 잘 맞는다.
- 단점: 임의 페이지 이동은 어렵다.
- 단점: 정렬 기준이 명확해야 한다.

## Spring Data JPA에서 자주 쓰는 타입

- `Page`: 전체 카운트 포함
- `Slice`: 다음 페이지 존재 여부만 확인
- `List`: 직접 제어

`Page`는 전체 개수를 알기 위해 카운트 쿼리를 추가로 실행하고, `Slice`는 다음 페이지가 있는지만 안다. 그래서 카운트 쿼리가 비싸다면 `Page`보다 `Slice`가 더 적절할 수 있다([Paging, Iterating Large Results, Sorting & Limiting](https://docs.spring.io/spring-data/commons/reference/repositories/query-methods-details.html)).

## 실무에서 중요한 판단 포인트

- 관리자 화면인가, 사용자 피드인가
- 전체 개수가 정말 필요한가
- 데이터가 자주 추가/삭제되는가
- 정렬 컬럼이 유일한가

예를 들어 최신순 피드는 cursor pagination이 잘 맞고, 관리자 검색 화면은 offset pagination이 더 현실적일 수 있다.

## 주의할 점

- 정렬 기준이 모호하면 페이지가 겹치거나 누락될 수 있다.
- `fetch join + pagination`은 예상 외 동작이나 성능 이슈가 생길 수 있다.
- count 쿼리가 본 조회보다 더 비싸질 수 있다.

정렬 기준에는 보통 `createdAt desc, id desc`처럼 tie-breaker(값이 같을 때 순서를 정하는 보조 키)를 두는 편이 안전하다. 유일한 `id`를 덧붙이면 같은 `createdAt` 안에서도 순서가 하나로 정해진다.

## 정리

Spring에서 `Pageable`을 쉽게 붙일 수 있어도, 어떤 방식이 맞는지는 데이터 특성과 트래픽 패턴을 보고 정한다.

## 참고

- [Spring Data Commons Reference — Paging, Iterating Large Results, Sorting & Limiting](https://docs.spring.io/spring-data/commons/reference/repositories/query-methods-details.html)
- [Spring Data Commons Reference — Scrolling](https://docs.spring.io/spring-data/commons/reference/repositories/scrolling.html)
