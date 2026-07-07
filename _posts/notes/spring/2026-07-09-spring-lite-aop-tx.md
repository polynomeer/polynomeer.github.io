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

## `@Transactional`은 결국 프록시 문제다

Spring의 선언적 트랜잭션은 종종 DB 기능처럼 느껴진다. 하지만 실제 핵심은 DB보다 먼저 프록시다. `spring-lite`도 이 점을 매우 직접적으로 드러낸다.

구조를 단순화하면 이렇다.

- `TransactionalBeanPostProcessor`가 대상 Bean을 찾는다.
- 프록시를 만든다.
- 메서드 호출을 가로채서 `begin -> commit/rollback`을 감싼다.
- 그 안에서 `JdbcTemplate`이 현재 트랜잭션 연결을 재사용한다.

즉, `@Transactional`은 애노테이션 하나가 아니라 **후처리기 + 프록시 + 트랜잭션 매니저 + JDBC 추상화의 합성 결과**다.

## TransactionalBeanPostProcessor가 진입점이다

이 클래스는 `BeanPostProcessor` 구현체다. 즉, Bean 생성이 끝난 뒤 개입한다.

핵심 로직은 단순하다.

- 클래스 레벨 또는 메서드 레벨에 `@Transactional`이 있는지 검사
- 필요하면 원본 Bean 대신 프록시를 반환

이 설계가 중요한 이유는, 트랜잭션이 컨테이너 바깥에서 붙는 것이 아니라 **Bean lifecycle 후반의 후처리 단계에서 덧씌워진다**는 점을 보여주기 때문이다.

그래서 Spring에서도 `@Transactional`은 직접 메서드에 주입되는 기능이 아니라, 프록시를 통해 외부 호출 경로에 끼어드는 기능이 된다.

## ProxyFactory는 인터페이스와 클래스 기반 프록시를 나눈다

`ProxyFactory.createProxy()`는 먼저 대상 객체가 인터페이스를 구현했는지 본다.

- 인터페이스가 있으면 JDK Dynamic Proxy
- 없으면 ByteBuddy + Objenesis 기반 클래스 프록시

이 분기가 의미하는 바는 분명하다. 프록시는 기술적으로 하나가 아니라, **타입 구조에 따라 다른 전략을 선택하는 런타임 객체 생성 문제**다.

특히 클래스 기반 프록시 구현에서 보이는 의도가 좋다.

- 원본 클래스를 subclassing
- `InvocationHandler` 필드 주입
- `Object` 메서드, final, static 등은 제외

즉, "프록시란 결국 메서드 호출을 중간에서 가로채는 별도 객체"라는 감각이 추상 개념이 아니라 실제 생성 코드로 드러난다.

## MethodInterceptor 체인이 AOP의 최소 모델이다

`spring-lite-aop`는 `Advisor`, `Pointcut`, `@Aspect` 같은 풍부한 모델 대신 아래 두 개를 핵심으로 둔다.

- `MethodInterceptor`
- `MethodInvocation`

그리고 `SimpleMethodInvocation.proceed()`가 인터셉터 체인을 순서대로 통과한 뒤 마지막에 실제 대상 메서드를 호출한다.

이 구조가 중요한 이유는 AOP를 이해할 때 꼭 필요한 최소 모델이기 때문이다.

1. 호출 컨텍스트를 들고 있는 `MethodInvocation`
2. 그 앞뒤로 개입하는 `MethodInterceptor`
3. 마지막 실제 메서드 실행

Spring의 AOP가 복잡해 보여도, 본질은 이 체인 모델을 얼마나 풍부하게 일반화했는가에 가깝다.

## `@Transactional` 인터셉터는 생각보다 직선적이다

`TransactionalBeanPostProcessor` 내부 인터셉터는 다음 순서를 따른다.

1. 현재 메서드가 transactional 대상인지 다시 확인
2. `transactionManager.begin()`
3. `invocation.proceed()`
4. 성공 시 `commit()`
5. 예외 시 `rollback()`

이 구조는 고전적인 around advice와 거의 같다. 즉, 트랜잭션은 별도 DB 문법이 아니라 **메서드 실행을 감싸는 cross-cutting concern**으로 다뤄진다.

여기서 중요한 점은 `requiresTransactionProxy()`가 클래스와 메서드를 모두 본다는 것이다. 즉, Spring에서 익숙한 "클래스 전체 트랜잭션"과 "특정 메서드만 트랜잭션" 둘 다 같은 프레임 안에서 처리된다.

## JdbcTemplate이 프록시와 연결되는 지점

트랜잭션이 프록시에서 시작된다고 해서 JDBC와 분리된 기능은 아니다. 실제 DB 작업과 맞물리려면 호출 체인 아래쪽에서 같은 연결을 써야 한다.

`JdbcTemplate`의 핵심은 `obtainConnectionIfNeeded()`다.

- `TransactionManager.currentConnection()`이 있으면 그것을 사용
- 없으면 `DataSource.getConnection()`

그리고 트랜잭션 연결이 이미 존재할 때는 `SingleConnectionProxy`로 감싼다. 이 구조는 왜 필요한가? `JdbcTemplate` 호출 쪽에서는 평범하게 `try-with-resources`로 connection을 닫더라도, 실제 트랜잭션 바깥에서 연결이 조기에 닫히면 안 되기 때문이다.

즉, `SingleConnectionProxy`는 "닫는 척하지만 실제 소유권은 트랜잭션 매니저가 가진다"는 의도를 담고 있다.

이 지점이 매우 중요하다. 선언적 트랜잭션이 성립하려면 프록시만 있는 것으로는 부족하고, **하위 JDBC 추상화가 동일한 connection lifecycle을 공유해야 한다**.

## 이 구현이 보여주는 Spring 트랜잭션의 핵심

`spring-lite` 기준으로 트랜잭션을 다시 요약하면 이렇다.

- 컨테이너가 Bean을 만든다.
- 후처리기가 transactional Bean을 감지한다.
- 프록시가 원본 Bean을 감싼다.
- 메서드 호출 시 트랜잭션 경계를 연다.
- `JdbcTemplate`은 현재 연결을 재사용한다.

즉, 트랜잭션은 DB 기능 자체가 아니라 **메서드 호출 경계와 JDBC 연결 재사용 전략이 결합된 애플리케이션 인프라**다.

## 이 구조에서 자연스럽게 떠오르는 한계

이 구현은 학습용으로는 충분하지만, 동시에 실제 Spring이 왜 더 복잡해졌는지도 보여준다.

- 전파 옵션이 단순하다.
- 단일 DataSource 가정이 강하다.
- self-invocation 문제는 그대로 남는다.
- pointcut/advisor 분리가 없어 확장성은 낮다.

하지만 바로 그 제한 덕분에 본질이 더 잘 보인다. 실제로 대부분의 Spring 트랜잭션 이슈도 결국 다음 질문으로 압축된다.

- 프록시를 통과했는가
- 같은 연결을 쓰고 있는가
- 예외 시 rollback 경계가 어디인가

## 정리

`spring-lite`의 AOP/트랜잭션 구현은 작지만 핵심이 분명하다.

- `BeanPostProcessor`가 프록시 대상을 찾고
- `ProxyFactory`가 런타임 프록시를 만들고
- 인터셉터가 `begin/commit/rollback`을 감싸고
- `JdbcTemplate`이 현재 연결을 재사용한다

Spring의 `@Transactional`을 이해할 때 가장 중요한 것은 "트랜잭션이 적용된다"는 현상을 외우는 것이 아니라, **왜 이 기능이 프록시 없이는 성립할 수 없는지**를 이해하는 것이다.

다음 글에서는 이 컨테이너와 프록시 위에 웹 요청 파이프라인이 어떻게 올라가는지, `DispatcherServlet`과 `HandlerMapping`, argument resolver를 중심으로 본다.
