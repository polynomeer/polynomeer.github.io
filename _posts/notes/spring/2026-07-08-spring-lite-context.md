---
title: spring-lite로 이해하는 Spring 구현 2 - AnnotationConfigApplicationContext로 보는 IoC와 생명주기
date: 2026-07-04
status: published
categories: [Notes, Spring]
tags: [Spring, IoC, DI, Bean Lifecycle, Java]
series: spring-lite
series_title: spring-lite로 이해하는 Spring 구현
series_order: 2
series_description: spring-lite 프로젝트를 바탕으로 IoC 컨테이너, AOP, MVC, 트랜잭션, 부트스트랩을 구현 관점에서 해설하는 시리즈.
---

[GitHub 저장소](https://github.com/polynomeer/spring-lite)

이 글의 코드 링크는 커밋 `bd8ea3f` 기준이다. 이후 저장소가 바뀌어 지금 `main`과는 다를 수 있다.

## 결국 먼저 봐야 하는 건 컨테이너였다

Spring을 공부할 때는 자꾸 AOP나 MVC부터 눈에 들어온다. 더 눈에 띄고, 실무에서 직접 만지는 코드와도 가깝기 때문이다. 그런데 `spring-lite`를 따라가다 보면 다시 원점으로 돌아오게 된다. AOP도 MVC도 컨테이너 위에 올라가 있기 때문이다.

`spring-lite`에서 그 중심은 `AnnotationConfigApplicationContext`다. 이 클래스가 맡는 역할은 넷이다.

- BeanDefinition 등록
- 컴포넌트 스캔
- Bean 생성과 의존성 주입
- 초기화/소멸까지 포함한 생명주기 관리

이 넷을 따라가면 애노테이션 기반 프레임워크가 객체 그래프를 어떻게 조립하는지([IoC와 DI](/posts/ioc-di/))가 코드로 보인다.

## `register`, `scan`, `refresh` 이 셋이 먼저 보였다

컨테이너 사용 흐름은 의외로 단순하다.

1. `register()` 또는 `scan()`으로 후보를 모은다.
2. `BeanDefinition`을 등록한다.
3. `refresh()`에서 실제 Bean을 만든다.

이 구현은 **등록과 생성을 분리해서 보여준다.** Spring을 쓰다 보면 둘이 한 번에 일어나는 것처럼 느껴지는데, 실제로는 먼저 메타데이터를 모으고 그다음 객체를 만든다.

## 컨테이너는 객체보다 먼저 메타데이터를 만든다

후보 클래스를 만났다고 바로 객체를 만들지 않는다. 먼저 이 클래스가 관리 대상인지, 어떤 종류인지, 어떤 이름을 가질지 정리한다.

- 인터페이스, 애노테이션, enum 제외
- `@Component` 또는 `@Configuration` 여부 확인
- 조건 애노테이션 검사
- `BeanDefinition.Kind` 결정

그다음에야 `BeanNameGenerator`로 이름을 만들고 [`BeanDefinition`](/posts/spring-internals-lab-bean-definition/)을 등록한다.

그래서 Spring을 "애노테이션이 객체를 만든다" 식으로 이해하면 순서가 틀린다. 실제로는 컨테이너가 먼저 메타데이터를 쌓고, 나중에 그 메타데이터를 기준으로 객체를 조립한다.

## `@Configuration`과 `@Bean`은 등록 경로가 다르다

`spring-lite`는 `@Configuration` 클래스를 그냥 컴포넌트 하나로 취급하지 않는다. `Kind.CONFIGURATION`으로 따로 보고, 그 안에 있는 `@Bean` 메서드까지 다시 등록한다.

- `@Component`는 클래스 자체가 빈 후보
- `@Bean`은 메서드 반환값이 빈 후보

같은 빈 등록처럼 보여도 컨테이너 입장에서는 처리 경로가 둘이다.

## `refresh()`에서 조립이 시작된다

이 구현에서 [`refresh()`](/posts/spring-internals-lab-refresh/)는 아래 순서로 간다([소스](https://github.com/polynomeer/spring-lite/blob/bd8ea3fb4e3a4855bd912c450b67e30757a22924/spring-lite-context/src/main/java/lite/spring/context/support/AnnotationConfigApplicationContext.java#L111-L121)).

1. `instantiateBeanPostProcessors()`
2. `instantiateConfigurationBeans()`
3. `instantiateBeanPostProcessors()`
4. `instantiateRemainingSingletons()`

처음엔 `BeanPostProcessor`를 두 번 만드는 게 이상해 보였다. 이유는 설정 Bean이나 `@Bean` 메서드를 통해 후처리기가 늦게 등록될 수 있기 때문이다.

후처리기는 이후에 만들어지는 모든 Bean에 적용되므로 다른 Bean보다 먼저 준비돼야 한다. 그래서 컨테이너는 후처리기를 부가 기능이 아니라 생성 파이프라인 자체를 바꾸는 확장점으로 다룬다. 실제 Spring 문서도 `BeanPostProcessor`가 다른 Bean의 초기화에 적용되려면 일찍 인스턴스화돼야 한다고 적는다([Spring: Container Extension Points](https://docs.spring.io/spring-framework/reference/core/beans/factory-extension.html)).

## `getBean()`은 생성 중 상태를 따로 관리한다

`getBean(String)` 흐름은 익숙한 패턴이다.

- singleton cache 확인
- BeanDefinition 조회
- 없으면 생성

설명만 들으면 평범한 factory처럼 보인다. 평범한 factory와 다른 점은 `beansInCreation`이라는 집합을 따로 관리한다는 것이다.

이 집합 덕분에:

- 생성 중 재진입을 감지하고([소스](https://github.com/polynomeer/spring-lite/blob/bd8ea3fb4e3a4855bd912c450b67e30757a22924/spring-lite-context/src/main/java/lite/spring/context/support/AnnotationConfigApplicationContext.java#L258-L264))
- `getBeansOfType()` 같은 조회에서 아직 완성되지 않은 Bean을 건너뛸 수 있다([소스](https://github.com/polynomeer/spring-lite/blob/bd8ea3fb4e3a4855bd912c450b67e30757a22924/spring-lite-context/src/main/java/lite/spring/context/support/AnnotationConfigApplicationContext.java#L148-L165))

순환 참조(A가 B를, B가 A를 필요로 하는 구조)를 해결하지는 않는다. 재진입을 만나면 예외를 던질 뿐이다. 그래도 최소한 컨테이너가 "지금은 만들고 있는 중"이라는 상태를 별도로 관리한다는 점이 보인다.

## 생성자 주입이 기본값으로 추천되는 이유

`spring-lite`의 의존성 주입은 생성자 주입이 중심이다. 클래스 생성자를 보고, 각 파라미터를 타입, `@Qualifier`, `@Value` 기준으로 해석한다.

직접 구현을 보면 생성자 주입이 기본값처럼 추천되는 이유가 보인다. Spring 문서도 "The Spring team generally advocates constructor injection, as it lets you implement application components as immutable objects and ensures that required dependencies are not null."라고 적는다([Spring: Dependency Injection](https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html)). 불변 객체로 만들 수 있고 필수 의존성이 null이 아님을 보장한다는 뜻이다.

- 필수 의존성이 생성 시점에 드러난다.
- 반쯤 만들어진 객체를 만들 가능성이 줄어든다.
- 객체를 볼 때 "무엇이 꼭 필요한가"가 바로 보인다.

여기에 `PropertyResolver`를 통한 `@Value` 해석까지 들어오면서, 단순한 Bean 주입과 설정값 주입이 같은 파이프라인 안에서 연결된다.

## lifecycle은 필요한 만큼 들어 있다

`spring-lite`의 [lifecycle](/posts/spring-lifecycle/) 구현은 크지 않지만 다음은 갖췄다.

- `BeanPostProcessor`
- `@PostConstruct`
- `@PreDestroy`
- `close()` 시 destroy callback 역순 실행

`destroyCallbacks`는 등록 순서를 유지하는 맵에 모아두고, `close()`에서 마지막 것부터 거꾸로 실행한다([소스](https://github.com/polynomeer/spring-lite/blob/bd8ea3fb4e3a4855bd912c450b67e30757a22924/spring-lite-context/src/main/java/lite/spring/context/support/AnnotationConfigApplicationContext.java#L189-L192)). 자원 정리는 생성의 역순이어야 안정적이라는 원칙을 코드로 옮긴 것이다.

그래서 생명주기는 객체 생성에서 끝나지 않고, **초기화와 종료까지 포함한 자원 관리 문제**가 된다.

## 조건부 등록도 결국 컨테이너 단계의 문제다

`ConditionalOnBean`, `ConditionalOnClass`, `ConditionalOnMissingBean`, `ConditionalOnProperty`도 여기서 같이 다룬다.

Boot 기능처럼 보이는 조건부 등록도 별도 장치가 아니다. **컨테이너가 등록 시점에 후보를 받아들일지 말지 결정하는 규칙**이다. 그래서 봐야 할 것은 애노테이션 이름보다 언제, 어떤 상태를 보고 등록 여부를 판단하는가다.

## 만들고 따라가며 남은 세 가지 감각

이 구현을 보고 나서 내 머리에 남은 건 크게 세 가지였다.

### 1. Spring은 메타데이터 기반 조립기다

애노테이션이 객체를 직접 만드는 게 아니라, 컨테이너가 메타데이터를 보고 조립한다.

### 2. lifecycle과 후처리기는 분리해서 볼 수 없다

[`BeanPostProcessor`](/posts/spring-internals-lab-bean-lifecycle/)가 들어오는 순간, "객체 생성이 끝났다"는 말은 더 이상 단순하지 않다. 프록시도 이 파이프라인 위에 붙는다.

### 3. Boot 기능도 여기서부터 시작된다

조건부 등록이나 [자동 설정](/posts/spring-lite-boot/) 같은 기능도 BeanDefinition 등록과 `refresh()` 위에 올라간다.

## 정리

컨테이너는 객체 팩토리라기보다 객체 그래프의 생성, 초기화, 확장, 종료를 순서대로 관리하는 런타임 조립기다. 그 순서는 등록, `refresh()`, 생성자 주입, 후처리기와 lifecycle 콜백, 역순 destroy callback이다.

다음 글은 이 컨테이너 위에 프록시가 어떻게 올라가는지, `@Transactional`이 왜 프록시 문제인지 다룬다.

## 참고

- [spring-lite `AnnotationConfigApplicationContext` (bd8ea3f)](https://github.com/polynomeer/spring-lite/blob/bd8ea3fb4e3a4855bd912c450b67e30757a22924/spring-lite-context/src/main/java/lite/spring/context/support/AnnotationConfigApplicationContext.java)
- [Spring: Dependency Injection](https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html)
- [Spring: Container Extension Points](https://docs.spring.io/spring-framework/reference/core/beans/factory-extension.html)
