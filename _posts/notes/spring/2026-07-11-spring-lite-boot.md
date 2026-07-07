---
title: spring-lite로 이해하는 Spring 구현 5 - MiniSpringApplication과 자동 설정 조립 방식
date: 2026-07-07
categories: [Notes, Spring]
tags: [Spring Boot, Auto Configuration, Java, Framework, MVC]
series: spring-lite
series_title: spring-lite로 이해하는 Spring 구현
series_order: 5
series_description: spring-lite 프로젝트를 바탕으로 IoC 컨테이너, AOP, MVC, 트랜잭션, 부트스트랩을 구현 관점에서 해설하는 시리즈.
---

## Boot는 새 기능이 아니라 조립 계층이다

Spring Boot를 쓰다 보면 애플리케이션이 아주 쉽게 시작된다.

```java
public static void main(String[] args) {
    SpringApplication.run(App.class, args);
}
```

이 편리함 때문에 Boot를 별도 거대한 기술처럼 느끼기 쉽다. 하지만 `spring-lite`를 보면 Boot의 본질은 비교적 단순하다. **컨테이너, 웹, 트랜잭션, JDBC 같은 인프라를 적절한 순서로 등록하고 실행하는 조립 계층**이다.

`MiniSpringApplication.run()`은 이 사실을 아주 직접적으로 보여준다.

## MiniSpringApplication.run()은 surprisingly small 하다

실행 코드는 짧다.

1. `AnnotationConfigApplicationContext` 생성
2. 애플리케이션 클래스 등록
3. `BootInfrastructureRegistrar.registerDefaults(context)`
4. `context.refresh()`
5. `WebServer` Bean 조회 후 `start()`

이 흐름에서 중요한 점은 두 가지다.

- Boot가 별도 컨테이너를 만들지 않는다.
- 결국 모든 것은 컨테이너 위에 Bean으로 등록된다.

즉, Boot는 Spring의 대체물이 아니라 **컨테이너를 언제 무엇으로 채울지 결정하는 초기화 레이어**다.

## BootInfrastructureRegistrar가 기본 인프라를 넣는다

`BootInfrastructureRegistrar.registerDefaults()`는 다음 자동 설정 클래스를 등록한다.

- `JsonAutoConfiguration`
- `TransactionAutoConfiguration`
- `JdbcAutoConfiguration`
- `WebAutoConfiguration`

이 구조가 중요한 이유는, Boot의 핵심이 사실상 "자동 설정 클래스 목록을 컨테이너에 등록하는 일"에 있다는 점을 잘 보여주기 때문이다.

실제 Spring Boot가 복잡해지는 이유도 여기서 출발한다. 수많은 스타터와 자동 설정이 늘어나면서 어떤 조건에서 어떤 Bean을 만들지의 조합이 폭발적으로 늘어나기 때문이다.

## 자동 설정은 컨테이너 규칙 위에 올라간다

이 시리즈 앞에서 본 것처럼 `spring-lite-context`는 이미 조건부 등록 애노테이션을 갖고 있다.

- `ConditionalOnBean`
- `ConditionalOnClass`
- `ConditionalOnMissingBean`
- `ConditionalOnProperty`

즉, Boot의 자동 설정은 완전히 별도 기술이 아니라 **컨테이너가 후보 BeanDefinition을 등록할 때 평가하는 조건 규칙을 더 많이 활용하는 방식**으로 이해할 수 있다.

이 감각이 중요하다. Boot를 이해할 때도 "어떤 마법이 추가되는가"보다 "어떤 Bean들이 어떤 조건으로 조립되는가"를 보는 편이 훨씬 정확하다.

## WebServer도 결국 Bean이다

`spring-lite-boot`는 `WebServer`, `WebServerFactory`, `JdkWebServer` 같은 타입을 둔다. 이 점이 꽤 중요하다.

웹 서버조차 별도 전역 자원이 아니라, **컨테이너가 관리하고 애플리케이션 시작 시점에 꺼내서 실행하는 Bean**으로 보는 것이다.

이 구조가 좋은 이유는 분명하다.

- 서버 구현체를 교체하기 쉽다.
- 테스트 시 다른 server factory를 넣기 쉽다.
- 시작과 종료 책임을 컨테이너와 더 자연스럽게 연결할 수 있다.

즉, Boot는 서버를 "밖에서 띄우는 것"이 아니라 "애플리케이션 내부 조립 요소로 가져오는 것"에 가깝다.

## example-app이 Boot 계층을 검증한다

이 프로젝트에서 `example-app`은 단순 데모가 아니라, Boot 설계의 실제 검증 시나리오다.

예를 들어 `ExampleApplication`은 `@MiniSpringBootApplication`으로 시작하고, 내부에 주문 관련 컨트롤러, 서비스, 저장소가 있다. 그 결과 하나의 `run()` 호출만으로 아래가 이어진다.

- 컨테이너 초기화
- 컴포넌트 스캔
- 컨트롤러 매핑
- 웹 서버 기동
- HTTP 요청 처리
- 서비스 계층 트랜잭션 적용

즉, Boot 계층이 잘 설계됐는지는 자동 설정 클래스만 보면 안 되고, **실제 사용자 애플리케이션이 얼마나 적은 코드로 모든 인프라를 끌어올 수 있는지**로 봐야 한다.

## spring-lite가 보여주는 Boot의 가치

이 프로젝트를 기준으로 보면 Boot의 가치는 세 가지로 압축된다.

### 1. 조립 순서를 숨긴다

사용자는 컨테이너를 만들고, 웹을 등록하고, JSON 매퍼를 넣고, 트랜잭션 인프라를 등록하고, 서버를 시작하는 코드를 직접 쓰지 않는다.

### 2. 기본값을 제공한다

`BootInfrastructureRegistrar`가 공통 인프라를 기본 등록해 주기 때문에, 예제 앱은 비즈니스 코드에 더 집중할 수 있다.

### 3. 그래도 결국 Bean 조립이다

Boot가 편한 이유는 컨테이너 원리를 없애서가 아니라, 그 원리를 더 자동화해서다. 그래서 Boot를 깊게 이해하려면 오히려 컨테이너와 조건부 등록을 더 잘 봐야 한다.

## 이 구현이 드러내는 한계도 있다

`spring-lite-boot`는 학습용으로는 충분하지만, 실제 Spring Boot와 비교하면 축소된 부분이 분명하다.

- 자동 설정 탐색이 훨씬 단순하다.
- 환경별 프로파일, 외부 설정 확장성이 제한적이다.
- 내장 서버 선택 폭이 좁다.
- starter 생태계처럼 모듈 조합이 풍부하지 않다.

하지만 이 단순함이 오히려 장점이다. Boot의 본질을 흐리는 요소 없이, **"자동 설정이 결국 컨테이너 조립을 얼마나 대신해 주는가"** 만 또렷하게 볼 수 있기 때문이다.

## 정리

`MiniSpringApplication`, `BootInfrastructureRegistrar`, `WebServer` 흐름을 보면 Spring Boot를 이렇게 다시 설명할 수 있다.

- 컨테이너는 여전히 중심이다.
- Boot는 그 컨테이너에 기본 인프라를 채워 넣는 조립 계층이다.
- 자동 설정은 조건부 Bean 등록 규칙의 응용이다.
- 내장 서버 시작도 결국 컨테이너가 만든 Bean을 실행하는 문제다.

즉, Boot의 편리함은 새로운 마법에서 오지 않는다. 이미 있는 컨테이너, 웹, 트랜잭션, JDBC 인프라를 **사용자 대신 조립해 주는 정교한 기본값 체계**에서 온다.

## 시리즈를 마치며

`spring-lite`는 작은 프로젝트지만 Spring을 이해할 때 필요한 핵심 층위를 꽤 잘 보여준다.

- 컨테이너는 객체 그래프를 조립하고
- 후처리기는 프록시 같은 부가기능을 붙이고
- 웹 계층은 요청을 메서드 호출로 번역하고
- Boot는 전체를 실행 가능한 애플리케이션으로 묶는다

그래서 이 프로젝트를 읽는 가장 좋은 방법은 "Spring 비슷한 걸 구현했다"로 보는 것이 아니라, **Spring이 왜 지금 같은 모듈 구조와 실행 모델을 갖게 되었는지 추적하는 작은 해부도구**로 보는 것이다.
