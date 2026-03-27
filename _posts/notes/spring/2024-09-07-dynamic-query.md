---
title: Spring Data JPA에서 동적 쿼리를 다루는 방법
date: 2024-09-07
categories: [Notes, Spring]
tags: [Spring, JPA, Dynamic Query, Querydsl]
---

## 동적 쿼리가 필요한 이유

검색 조건이 고정되어 있으면 메서드 이름 기반 쿼리나 정적 JPQL로도 충분하다. 하지만 실무에서는 보통 다음처럼 조건이 유동적이다.

- 키워드는 있을 수도 없을 수도 있다.
- 상태 값은 여러 개를 동시에 받을 수 있다.
- 날짜 범위는 시작만 올 수도 있고 끝만 올 수도 있다.
- 정렬 기준이 상황마다 달라진다.

이때 if문으로 문자열을 이어 붙이기 시작하면 유지보수가 급격히 어려워진다.

## 대표적인 선택지

- 메서드 이름 쿼리
- JPQL + 조건 분기
- `Specification`
- Querydsl

간단한 조회는 앞의 방법으로도 충분하지만, 조건 조합이 많아질수록 Querydsl 쪽이 읽기와 리팩터링에 유리하다.

## 가장 흔한 안티패턴

- null 조건을 고려하지 않은 메서드 폭증
- Repository에 검색 메서드가 너무 많이 생김
- 서비스에서 JPQL 문자열을 직접 조립

예를 들어 아래처럼 메서드가 계속 늘어난다.

- `findByStatus`
- `findByStatusAndKeyword`
- `findByStatusAndKeywordAndCreatedAtBetween`

이 구조는 결국 조건이 조금만 늘어나도 감당이 안 된다.

## Querydsl이 좋은 이유

- 타입 안전성
- IDE 자동완성
- 조건 조립이 명확함
- 리팩터링 시 컴파일 타임에 오류 발견 가능

예를 들어 조건이 null일 때는 `null`을 반환하고, `where(...)`에서 자동으로 무시되게 구성할 수 있다.

```java
private BooleanExpression eqStatus(Status status) {
    return status == null ? null : order.status.eq(status);
}
```

## 실무에서 추천하는 구조

- Controller: 검색 조건 DTO 수집
- Service: 검색 유즈케이스 조합
- Query Repository: Querydsl로 실제 조회 구현

즉, "검색 조건 해석"과 "쿼리 작성"을 분리하는 편이 낫다.

## 고민해야 할 포인트

- 카운트 쿼리가 비싼가
- 조인이 많아서 중복 row가 발생하는가
- offset 기반 페이지네이션이 성능 병목인가
- 조건이 늘어날수록 인덱스 전략이 맞는가

동적 쿼리는 문법보다도 결국 성능과 유지보수의 균형 문제다.

## 정리

동적 쿼리는 "조건이 유동적인 조회를 어떻게 일관되게 표현할 것인가"의 문제다. 단순한 검색은 간단하게 가고, 조건 조합이 늘어나는 시점부터는 Querydsl 같은 구조화된 도구를 도입하는 편이 장기적으로 안전하다.
