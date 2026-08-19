---
title: spring-lite로 이해하는 Spring 구현 5 - MiniSpringApplication과 자동 설정 조립 방식
date: 2026-07-07
status: writing
categories: [Notes, Spring]
tags: [Spring Boot, Auto Configuration, Java, Framework, MVC]
series: spring-lite
series_title: spring-lite로 이해하는 Spring 구현
series_order: 5
series_description: spring-lite 프로젝트를 바탕으로 IoC 컨테이너, AOP, MVC, 트랜잭션, 부트스트랩을 구현 관점에서 해설하는 시리즈.
---

## 마지막에 다시 보니 Boot는 "조립 담당"에 가까웠다

Spring Boot를 오래 쓰다 보면 `SpringApplication.run()` 한 줄이 너무 익숙해진다.

```java
public static void main(String[] args) {
    SpringApplication.run(App.class, args);
}
```

그래서 어느 순간부터는 Boot를 별도 거대한 기술처럼 느끼게 된다. 그런데 `spring-lite`의 마지막 모듈을 구현하고 흐름을 따라가 보니 오히려 반대로 보였다. Boot의 본질은 생각보다 단순했다. **컨테이너, 웹, 트랜잭션, JDBC 같은 인프라를 적절한 순서로 등록하고 실행하는 조립 계층**에 더 가까웠다.

## `MiniSpringApplication.run()`이 정말 짧다

이 구현의 좋은 점은 실행 시작점이 과하게 크지 않다는 것이다.

1. `AnnotationConfigApplicationContext` 생성
2. 애플리케이션 클래스 등록
3. `BootInfrastructureRegistrar.registerDefaults(context)`
4. `context.refresh()`
5. `WebServer` Bean 조회 후 `start()`

이 흐름을 보면 Boot를 다시 이렇게 설명하게 된다.

- Boot가 별도 컨테이너를 만드는 건 아니다.
- 결국 모든 것은 컨테이너 위에 Bean으로 등록된다.

즉 Boot는 Spring의 대체물이 아니라, **컨테이너를 언제 무엇으로 채울지 결정하는 초기화 레이어**다.

## `BootInfrastructureRegistrar`가 의외로 많은 걸 말해 준다

`BootInfrastructureRegistrar.registerDefaults()`는 다음 자동 설정 클래스들을 등록한다.

- `JsonAutoConfiguration`
- `TransactionAutoConfiguration`
- `JdbcAutoConfiguration`
- `WebAutoConfiguration`

이 구조를 보고 좋았던 건, Boot의 핵심이 결국 "자동 설정 클래스 목록을 컨테이너에 넣는다"는 사실이 아주 직접적으로 드러난다는 점이었다.

실제 Spring Boot가 복잡해지는 것도 결국 여기서 시작한다. 스타터와 자동 설정이 늘어날수록 "어떤 조건에서 어떤 Bean을 만들지" 조합이 커진다.

## 자동 설정도 결국 컨테이너 규칙의 확장이다

앞 글에서 본 것처럼 `spring-lite-context`에는 이미 조건부 등록 애노테이션이 있다.

- `ConditionalOnBean`
- `ConditionalOnClass`
- `ConditionalOnMissingBean`
- `ConditionalOnProperty`

이걸 보고 나니 Boot 자동 설정을 "새로운 마법"으로 보기보다, **컨테이너가 후보 BeanDefinition을 등록할 때 평가하는 규칙을 더 적극적으로 활용하는 방식**으로 보는 편이 더 맞다고 느꼈다.

실제 Boot를 공부할 때도 이 감각이 꽤 중요하다. 어떤 화려한 기능처럼 보기보다 "어떤 Bean들이 어떤 조건으로 조립되는가"를 보는 편이 훨씬 덜 헷갈린다.

## 웹 서버도 결국 Bean이라는 점이 좋았다

`spring-lite-boot`는 `WebServer`, `WebServerFactory`, `JdkWebServer` 같은 타입을 둔다.

이게 좋았던 이유는, 서버조차 별도 전역 자원처럼 다루지 않고 **컨테이너가 관리하는 Bean**으로 본다는 점 때문이다.

이 구조 덕분에:

- 서버 구현체를 바꾸기 쉽고
- 테스트에서 다른 factory를 넣기 쉽고
- 시작과 종료 책임을 컨테이너 lifecycle과 연결하기 쉽다

즉 Boot는 서버를 "밖에서 띄운다"보다 "애플리케이션 내부 조립 요소로 끌고 들어온다"에 더 가깝다.

## `example-app`이 있어서 마지막까지 감이 끊기지 않았다

여기서도 `example-app`이 꽤 중요했다. `ExampleApplication`은 `@MiniSpringBootApplication`으로 시작하고, 그 안에 주문 관련 컨트롤러와 서비스, 저장소가 있다.

그 결과 하나의 `run()` 호출만으로 아래 흐름이 이어진다.

- 컨테이너 초기화
- 컴포넌트 스캔
- 컨트롤러 매핑
- 웹 서버 기동
- HTTP 요청 처리
- 서비스 계층 트랜잭션 적용

즉 Boot 계층이 잘 설계됐는지는 자동 설정 클래스만 보면 안 되고, **실제 사용자 애플리케이션이 얼마나 적은 코드로 인프라를 끌어올 수 있는지**로 봐야 한다는 걸 여기서 다시 확인하게 된다.

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

그런데 오히려 이 단순함 때문에 본질이 잘 보였다. "자동 설정이 결국 컨테이너 조립을 얼마나 대신해 주는가"라는 질문만 또렷하게 남기 때문이다.

## 시리즈를 마치며

`spring-lite`를 처음 만들기 시작할 때는 "Spring 비슷한 걸 작게 만든 프로젝트" 정도로 생각했는데, 끝까지 구현 흐름을 따라가고 나니 인상이 조금 달라졌다.

- 컨테이너는 객체 그래프를 조립하고
- 후처리기는 프록시 같은 부가기능을 붙이고
- 웹 계층은 요청을 메서드 호출로 번역하고
- Boot는 이 전체를 실행 가능한 애플리케이션으로 묶는다

그래서 이 프로젝트를 가장 좋게 보는 방법은 "Spring을 흉내 냈다"보다, **Spring이 왜 지금 같은 모듈 구조와 실행 모델을 갖게 되었는지 비교 학습하는 작은 실험실**처럼 보는 쪽에 더 가깝다고 느꼈다.

이 시리즈도 그런 감각을 남기는 데 초점을 맞췄다. 강의 노트처럼 깔끔하게 정리하는 것도 중요하지만, 직접 구현을 따라가며 "어디서 감이 잡혔는가"를 기록하는 편이 개인적으로는 훨씬 오래 남았다.
