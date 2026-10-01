---
title: spring-lite로 이해하는 Spring 구현 5 - MiniSpringApplication과 자동 설정 조립 방식
date: 2026-07-07
status: published
categories: [Notes, Spring]
tags: [Spring Boot, Auto Configuration, Java, Framework, MVC]
series: spring-lite
series_title: spring-lite로 이해하는 Spring 구현
series_order: 5
series_description: spring-lite 프로젝트를 바탕으로 IoC 컨테이너, AOP, MVC, 트랜잭션, 부트스트랩을 구현 관점에서 해설하는 시리즈.
---

[GitHub 저장소](https://github.com/polynomeer/spring-lite)

## 마지막에 다시 보니 Boot는 "조립 담당"에 가까웠다

Spring Boot를 오래 쓰다 보면 `SpringApplication.run()` 한 줄이 너무 익숙해진다.

```java
public static void main(String[] args) {
    SpringApplication.run(App.class, args);
}
```

그래서 어느 순간부터는 Boot를 별도 거대한 기술처럼 느끼게 된다. 그런데 `spring-lite`의 마지막 모듈을 구현하고 흐름을 따라가 보니 오히려 반대로 보였다. Boot는 컨테이너, 웹, 트랜잭션, JDBC 같은 인프라를 적절한 순서로 등록하고 실행하는 조립 계층에 더 가까웠다.

## `MiniSpringApplication.run()`이 정말 짧다

실행 시작점은 다섯 단계뿐이다.

1. `AnnotationConfigApplicationContext` 생성
2. 애플리케이션 클래스 등록
3. `BootInfrastructureRegistrar.registerDefaults(context)`
4. `context.refresh()`
5. `WebServer` Bean 조회 후 `start()`

이 흐름을 보면 Boot를 다시 이렇게 설명하게 된다.

- Boot가 별도 컨테이너를 만드는 건 아니다.
- 결국 모든 것은 컨테이너 위에 Bean으로 등록된다.

그래서 Boot는 Spring의 대체물이 아니라, **컨테이너를 언제 무엇으로 채울지 결정하는 초기화 레이어**다. 실제 Spring Boot에서 `@SpringBootApplication`이 무엇을 켜는지는 [별도 글](/posts/spring-boot-application-annotation/)에서 다뤘다.

## `BootInfrastructureRegistrar`가 의외로 많은 걸 말해 준다

`BootInfrastructureRegistrar.registerDefaults()`는 다음 자동 설정 클래스들을 등록한다.

- `JsonAutoConfiguration`
- `TransactionAutoConfiguration`
- `JdbcAutoConfiguration`
- `WebAutoConfiguration`

이 구조에서는 Boot의 핵심이 "자동 설정 클래스 목록을 컨테이너에 넣는다"는 것이 직접 드러난다. 실제 Spring Boot는 이 목록을 코드에 고정하지 않고 jar 안의 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` 파일에서 찾는다([Spring Boot: Creating Your Own Auto-configuration](https://docs.spring.io/spring-boot/reference/features/developing-auto-configuration.html)).

실제 Spring Boot가 복잡해지는 것도 결국 여기서 시작한다. 스타터와 자동 설정이 늘어날수록 "어떤 조건에서 어떤 Bean을 만들지" 조합이 커진다.

## 자동 설정도 결국 컨테이너 규칙의 확장이다

[2편](/posts/spring-lite-context/)에서 본 것처럼 `spring-lite-context`에는 이미 조건부 등록 애노테이션이 있다.

- `ConditionalOnBean`
- `ConditionalOnClass`
- `ConditionalOnMissingBean`
- `ConditionalOnProperty`

그래서 Boot 자동 설정은 "새로운 마법"이라기보다, **컨테이너가 후보 [BeanDefinition](/posts/spring-internals-lab-bean-definition/)을 등록할 때 평가하는 규칙을 더 적극적으로 활용하는 방식**으로 보는 편이 맞다고 느꼈다. 실제 Spring Boot 문서도 자동 설정 클래스를 표준 `@Configuration` 클래스로 두고, 언제 적용할지는 추가 `@Conditional` 애노테이션으로 제한한다고 설명한다([Spring Boot: Creating Your Own Auto-configuration](https://docs.spring.io/spring-boot/reference/features/developing-auto-configuration.html)).

실제 Boot를 공부할 때도 기능 목록보다 "어떤 Bean들이 어떤 조건으로 조립되는가"를 보는 편이 덜 헷갈린다.

## 웹 서버도 결국 Bean이라는 점이 좋았다

`spring-lite-boot`는 `WebServer`, `WebServerFactory`, `JdkWebServer` 같은 타입을 둔다.

서버조차 별도 전역 자원처럼 다루지 않고 컨테이너가 관리하는 Bean으로 본다는 뜻이다. 그 결과로 다음이 쉬워진다.

- 서버 구현체를 바꾸기 쉽고
- 테스트에서 다른 factory를 넣기 쉽고
- 시작과 종료 책임을 컨테이너 lifecycle과 연결하기 쉽다

Boot는 서버를 "밖에서 띄운다"보다 "애플리케이션 내부 조립 요소로 끌고 들어온다"에 더 가깝다.

## `example-app`이 있어서 마지막까지 감이 끊기지 않았다

여기서도 `example-app`이 꽤 중요했다. `ExampleApplication`은 `@MiniSpringBootApplication`으로 시작하고, 그 안에 주문 관련 컨트롤러와 서비스, 저장소가 있다.

그 결과 하나의 `run()` 호출만으로 아래 흐름이 이어진다.

- 컨테이너 초기화
- 컴포넌트 스캔
- 컨트롤러 매핑
- 웹 서버 기동
- HTTP 요청 처리
- 서비스 계층 트랜잭션 적용

그래서 Boot 계층이 잘 설계됐는지는 자동 설정 클래스만으로는 판단할 수 없다. 실제 사용자 애플리케이션이 얼마나 적은 코드로 인프라를 끌어올 수 있는지로 봐야 한다.

## 결국 Boot의 가치는 세 가지였다

이 프로젝트를 따라가며 정리한 Boot의 가치는 대략 세 가지였다.

### 1. 조립 순서를 감춘다

사용자는 컨테이너를 만들고, 웹을 등록하고, JSON 매퍼를 넣고, 트랜잭션 인프라를 등록하고, 서버를 시작하는 코드를 직접 쓰지 않는다.

### 2. 기본값을 제공한다

`BootInfrastructureRegistrar`가 공통 인프라를 기본 등록해 주기 때문에, 예제 앱은 비즈니스 코드에 더 집중할 수 있다.

### 3. 그래도 결국 Bean 조립이다

Boot가 편한 이유는 컨테이너 원리를 없애서가 아니라, 그 원리를 더 자동화해서다. 그래서 Boot를 깊게 이해하려면 오히려 컨테이너와 조건부 등록을 더 잘 봐야 한다.

## 물론 이 구현이 일부러 줄여 둔 것도 많다

`spring-lite-boot`는 학습용으로는 충분하지만, 실제 Spring Boot와 비교하면 축소된 부분이 분명하다.

- 자동 설정 탐색이 훨씬 단순하다.
- 환경별 프로파일, 외부 설정 확장성이 제한적이다.
- 내장 서버 선택 폭이 좁다.
- starter 생태계처럼 모듈 조합이 풍부하지 않다.

그런데 이 단순함 덕분에 "자동 설정이 컨테이너 조립을 얼마나 대신해 주는가"라는 질문만 또렷하게 남았다. 실제 Spring Boot가 같은 일을 어떻게 하는지는 [spring-internals-lab 9편](/posts/spring-internals-lab-spring-boot/)에서 비교할 수 있다.

## 시리즈를 마치며

`spring-lite`를 처음 만들기 시작할 때는 "Spring 비슷한 걸 작게 만든 프로젝트" 정도로 생각했는데, 끝까지 구현 흐름을 따라가고 나니 인상이 조금 달라졌다.

- 컨테이너는 객체 그래프를 조립하고
- 후처리기는 [프록시](/posts/proxy-limits/) 같은 부가기능을 붙이고
- 웹 계층은 요청을 메서드 호출로 번역하고
- Boot는 이 전체를 실행 가능한 애플리케이션으로 묶는다

그래서 이 프로젝트는 "Spring을 흉내 냈다"보다, Spring이 왜 지금 같은 모듈 구조와 실행 모델을 갖게 되었는지 비교 학습하는 작은 실험실로 보는 쪽이 더 맞다고 느꼈다.

이 시리즈도 그런 감각을 남기는 데 초점을 맞췄다. 강의 노트처럼 깔끔하게 정리하는 것도 중요하지만, 직접 구현을 따라가며 "어디서 감이 잡혔는가"를 기록하는 편이 개인적으로는 훨씬 오래 남았다.

## 참고

- [Spring Boot Reference: Creating Your Own Auto-configuration](https://docs.spring.io/spring-boot/reference/features/developing-auto-configuration.html)
