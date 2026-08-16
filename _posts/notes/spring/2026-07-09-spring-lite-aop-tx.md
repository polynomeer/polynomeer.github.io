---
title: spring-lite로 이해하는 Spring 구현 3 - ProxyFactory, @Transactional, JdbcTemplate 연결
date: 2026-07-05
categories: [Notes, Spring]
tags: [Spring, AOP, Transaction, JDBC, Proxy]
series: spring-lite
series_title: spring-lite로 이해하는 Spring 구현
series_order: 3
series_description: spring-lite 프로젝트를 바탕으로 IoC 컨테이너, AOP, MVC, 트랜잭션, 부트스트랩을 구현 관점에서 해설하는 시리즈.
---

## `@Transactional`을 다시 보게 만든 건 결국 프록시였다

트랜잭션을 공부할 때는 자꾸 DB 쪽으로 먼저 시선이 간다. 커밋, 롤백, 전파, 격리 수준 같은 단어가 더 눈에 띄기 때문이다. 그런데 `spring-lite`를 읽고 나서 제일 먼저 바뀐 건 시선의 순서였다. DB보다 먼저 프록시를 봐야 했다.

구조를 아주 단순하게 줄이면 이렇다.

- `TransactionalBeanPostProcessor`가 대상 Bean을 찾는다.
- 프록시를 만든다.
- 메서드 호출을 가로채서 `begin -> commit/rollback`을 감싼다.
- 그 안에서 `JdbcTemplate`이 현재 트랜잭션 연결을 재사용한다.

즉 `@Transactional`은 애노테이션 하나가 아니라, **후처리기 + 프록시 + 트랜잭션 매니저 + JDBC 추상화가 같이 맞물린 결과**다.

## 진입점은 `TransactionalBeanPostProcessor`다

이 클래스는 `BeanPostProcessor` 구현체다. 즉 Bean 생성이 어느 정도 끝난 뒤에 개입한다.

하는 일은 꽤 직선적이다.

- 클래스 또는 메서드에 `@Transactional`이 있는지 검사
- 필요하면 원본 Bean 대신 프록시를 반환

이걸 보고 나니 트랜잭션이 컨테이너 바깥에서 붙는 기능이 아니라, **Bean lifecycle 후반에 후처리기로 얹히는 기능**이라는 점이 훨씬 선명해졌다. Spring에서 `@Transactional`이 메서드에 "내장된" 기능처럼 보이지만, 실제로는 외부 호출 경로에 프록시가 끼어드는 방식이다.

## `ProxyFactory`가 생각보다 많은 걸 설명해 준다

`ProxyFactory.createProxy()`는 먼저 대상이 인터페이스를 구현했는지 본다.

- 인터페이스가 있으면 JDK Dynamic Proxy
- 없으면 ByteBuddy + Objenesis 기반 클래스 프록시

이 분기를 보면 프록시가 단순한 추상 개념이 아니라, **타입 구조에 따라 다른 런타임 객체 생성 전략**이라는 게 잘 보인다.

특히 클래스 기반 프록시 쪽을 읽으면 프록시가 뭔지 감이 더 온다.

- 원본 클래스를 subclassing
- `InvocationHandler` 같은 중간 진입점 주입
- `Object` 메서드나 final/static 메서드는 제외

말로만 들을 때보다, 실제 코드로 보면 "메서드 호출을 중간에서 가로채는 별도 객체"라는 설명이 훨씬 덜 추상적이다.

## AOP는 결국 인터셉터 체인이다

`spring-lite-aop`는 일부러 모델을 꽤 작게 잡았다. `Advisor`, `Pointcut`, `@Aspect`를 크게 확장하기보다 아래 두 타입이 중심이다.

- `MethodInterceptor`
- `MethodInvocation`

그리고 `SimpleMethodInvocation.proceed()`가 인터셉터를 순서대로 통과한 뒤 마지막에 실제 대상 메서드를 호출한다.

이 구조를 보고 나니 AOP를 이렇게 이해하는 편이 훨씬 편했다.

1. 현재 호출 컨텍스트를 들고 있는 객체가 있고
2. 그 앞뒤를 감싸는 인터셉터가 있고
3. 마지막에 실제 메서드가 호출된다

Spring AOP가 복잡해 보여도 결국 핵심은 이 체인을 얼마나 풍부하게 일반화했는가에 가깝다.

## `@Transactional` 인터셉터는 의외로 직선적이다

`TransactionalBeanPostProcessor` 안에서 실제 인터셉터가 하는 일은 꽤 단순하다.

1. 이 메서드가 transactional 대상인지 다시 확인
2. `transactionManager.begin()`
3. `invocation.proceed()`
4. 성공하면 `commit()`
5. 예외가 나면 `rollback()`

즉 이건 거의 전형적인 around advice다. 트랜잭션을 DB 기술처럼만 보면 놓치기 쉬운데, 실제로는 **메서드 실행을 감싸는 cross-cutting concern**에 더 가깝다.

여기서 `requiresTransactionProxy()`가 클래스와 메서드를 모두 본다는 점도 좋았다. Spring에서 익숙한 "클래스 전체 트랜잭션"과 "특정 메서드만 트랜잭션"이 결국 같은 구조 안에서 처리된다는 걸 보여주기 때문이다.

## `JdbcTemplate`이 여기서 갑자기 중요해진다

트랜잭션이 프록시에서 시작된다고 해서 JDBC와 따로 노는 건 아니다. 실제 DB 작업과 맞물리려면 호출 체인 아래쪽에서 같은 연결을 써야 한다.

`JdbcTemplate`의 핵심은 `obtainConnectionIfNeeded()`였다.

- `TransactionManager.currentConnection()`이 있으면 그것을 사용
- 없으면 `DataSource.getConnection()`

이 구조를 보고 나서야 선언적 트랜잭션을 다시 이렇게 설명할 수 있었다. 결국 중요한 건 "트랜잭션이 시작됐다"는 사실이 아니라, **그 경계 안에서 같은 connection lifecycle을 공유하고 있는가**다.

## `SingleConnectionProxy`가 은근히 중요한 포인트였다

트랜잭션 연결이 이미 있을 때 `JdbcTemplate`은 `SingleConnectionProxy`로 감싼다.

처음엔 이 부분이 자잘한 유틸리티처럼 보였는데, 읽다 보니 꽤 중요했다. `JdbcTemplate` 쪽에서는 평범하게 `try-with-resources`를 쓰더라도, 트랜잭션이 소유한 연결은 중간에 닫히면 안 된다.

즉 이 프록시는 "닫는 척하지만 실제 소유권은 트랜잭션 매니저가 가진다"는 약속을 구현하고 있다.

이런 디테일을 보면 `@Transactional`이 단순 애노테이션이 아니라, 아래 레이어들의 규약을 전부 같이 맞춰야 성립하는 기능이라는 점이 더 잘 보인다.

## 정리해 보면 결국 질문은 세 개로 줄어든다

`spring-lite` 기준으로 트랜잭션을 다시 요약하면 이렇다.

- 컨테이너가 Bean을 만든다.
- 후처리기가 transactional Bean을 감지한다.
- 프록시가 원본 Bean을 감싼다.
- 메서드 호출 시 트랜잭션 경계를 연다.
- `JdbcTemplate`은 현재 연결을 재사용한다.

이걸 보고 나서 실제 Spring 이슈도 결국 몇 개 질문으로 압축해서 보게 됐다.

- 프록시를 통과했는가
- 같은 연결을 쓰고 있는가
- 예외가 어디까지 전파되어 rollback 경계에 닿는가

## 물론 학습용으로 줄인 만큼 보이지 않는 것도 있다

이 구현은 학습용으로는 충분하지만, 실제 Spring과 비교하면 일부러 단순화한 부분도 많다.

- 전파 옵션이 단순하다.
- 단일 DataSource 가정이 강하다.
- self-invocation 문제는 그대로 남는다.
- advisor/pointcut 분리는 얇다.

그래도 이 제한 덕분에 오히려 본질이 잘 보였다. 실제 Spring의 `@Transactional`도 화려해 보이지만, 핵심은 여전히 **프록시와 호출 경계**에 있다.

## 정리

`spring-lite`의 AOP/트랜잭션 구현을 보고 남은 감각은 꽤 단순했다.

- `BeanPostProcessor`가 프록시 대상을 찾고
- `ProxyFactory`가 런타임 프록시를 만들고
- 인터셉터가 `begin/commit/rollback`을 감싸고
- `JdbcTemplate`이 현재 연결을 재사용한다

Spring의 `@Transactional`을 이해할 때 중요한 건 "트랜잭션이 적용된다"는 현상을 외우는 게 아니라, **왜 이 기능이 프록시 없이는 성립할 수 없는지**를 납득하는 일에 더 가까웠다.

다음 글에서는 이 컨테이너와 프록시 위에 웹 요청 파이프라인이 어떻게 올라가는지, `DispatcherServlet`과 `HandlerMapping` 쪽을 본다.
