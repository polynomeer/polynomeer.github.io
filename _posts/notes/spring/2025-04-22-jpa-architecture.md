---
title: Spring에서 이해해야 할 JPA 아키텍처
date: 2025-04-22
categories: [Notes, Spring]
tags: [Spring, JPA, Hibernate]
---

## JPA를 왜 아키텍처 관점에서 봐야 하는가

Spring에서 JPA를 쓴다고 할 때, 실제로는 JPA 명세와 구현체(Hibernate), 그리고 Spring Data JPA가 함께 동작한다. 이 층위를 섞어서 이해하면 "JPA가 해주는 일"과 "Spring이 편의로 제공하는 일"이 뒤엉키기 쉽다.

## 큰 구조

- 애플리케이션 코드
- Spring Data JPA Repository
- JPA(EntityManager)
- JPA 구현체(Hibernate)
- JDBC
- Database

그래서 `repository.save()`를 호출해도 바로 DB로 가지 않고, 위에서 아래로 여러 추상화 층을 거친다.

## 각 층의 역할

### JPA

자바 진영의 ORM 표준 명세(현재 이름은 Jakarta Persistence)다. 인터페이스와 규약을 정의한다.

### Hibernate

JPA의 대표 구현체다([Hibernate 6.6 Introduction](https://docs.hibernate.org/orm/6.6/introduction/html_single/Hibernate_Introduction.html)). 실제 SQL 생성, 영속성 컨텍스트 관리, dirty checking(변경 감지) 같은 동작을 수행한다.

### Spring Data JPA

Repository 인터페이스, 쿼리 메서드, 감사 기능 등 개발 편의성을 제공하는 상위 레이어다.

## 영속성 컨텍스트가 핵심이다

JPA 아키텍처를 이해할 때 가장 중요한 개념은 영속성 컨텍스트다. Hibernate 문서는 이를 id와 엔티티 인스턴스의 일대일 대응으로 설명한다.

- 엔티티를 관리한다.
- 1차 캐시 역할을 한다.
- 변경 감지를 수행한다.
- 쓰기 지연을 활용한다.

그래서 같은 트랜잭션 안에서 조회한 엔티티를 다시 조회하면 DB를 다시 치지 않을 수 있다. 쓰기는 flush 시점까지 미뤄지고, flush는 커밋 때 자동으로 일어난다.

## EntityManager는 어디에 있는가

스프링에서는 보통 직접 `EntityManager`를 많이 다루지 않지만, 내부적으로는 이 객체가 JPA 작업의 중심이다. Repository도 결국 EntityManager를 기반으로 동작한다. `save()`도 새 엔티티면 `persist`, 아니면 `merge`를 호출한다([Spring Data JPA: Persisting Entities](https://docs.spring.io/spring-data/jpa/reference/jpa/entity-persistence.html)).

## 실무에서 자주 혼동하는 점

- `save()`가 항상 즉시 insert/update를 날린다고 생각함 (SQL은 보통 flush 때 나간다)
- JPA와 Hibernate와 Spring Data JPA를 같은 것으로 봄
- 영속성 컨텍스트의 범위와 트랜잭션 범위를 분리해서 생각하지 않음

## 정리

Spring Data JPA의 편의 뒤에서 SQL을 만들고 미루는 쪽은 Hibernate의 영속성 컨텍스트다. 이 구조를 알아야 flush, 지연 로딩, 변경 감지, [성능 문제](/posts/batch-heap-dump-to-chunk/)를 제대로 해석할 수 있다.

## 참고

- [Hibernate ORM 6.6: An Introduction to Hibernate 6](https://docs.hibernate.org/orm/6.6/introduction/html_single/Hibernate_Introduction.html)
- [Spring Data JPA: Persisting Entities](https://docs.spring.io/spring-data/jpa/reference/jpa/entity-persistence.html)
