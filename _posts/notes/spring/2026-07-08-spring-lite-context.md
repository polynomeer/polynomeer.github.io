---
title: spring-lite로 이해하는 Spring 구현 2 - AnnotationConfigApplicationContext로 보는 IoC와 생명주기
date: 2026-07-04
categories: [Notes, Spring]
tags: [Spring, IoC, DI, Bean Lifecycle, Java]
series: spring-lite
series_title: spring-lite로 이해하는 Spring 구현
series_order: 2
series_description: spring-lite 프로젝트를 바탕으로 IoC 컨테이너, AOP, MVC, 트랜잭션, 부트스트랩을 구현 관점에서 해설하는 시리즈.
---

## 컨테이너가 먼저다

Spring을 설명할 때 AOP, MVC, Boot가 자주 먼저 언급되지만, 실제 기반은 늘 컨테이너다. `spring-lite`에서도 그 중심은 `AnnotationConfigApplicationContext`다.

이 클래스는 크게 네 가지를 맡는다.

- BeanDefinition 등록
- 컴포넌트 스캔
- Bean 생성과 의존성 주입
- 초기화/소멸을 포함한 생명주기 관리

즉, 이 클래스 하나를 이해하면 "애노테이션 기반 프레임워크가 실제로 어떻게 객체 그래프를 조립하는가"가 꽤 선명하게 보인다.

## 시작점은 register, scan, refresh다

생성자는 세 가지 사용 방식을 연다.

- 설정 클래스 기반 등록
- base package 기반 스캔
- 이후 `refresh()`

핵심 흐름은 단순하다.

1. `register()` 또는 `scan()`으로 후보를 모은다.
2. `BeanDefinition`을 등록한다.
3. `refresh()`에서 실제 Bean을 생성한다.

여기서 중요한 점은 **등록과 생성이 분리되어 있다는 것**이다. 스프링도 마찬가지로 먼저 메타데이터를 만들고, 그다음 실제 객체를 생성한다.

## registerDiscoveredClass가 메타데이터를 만든다

후보 클래스를 만나면 바로 객체를 만들지 않는다. 먼저 이 클래스가 관리 대상인지, 조건을 만족하는지, 어떤 종류의 Bean인지 판별한다.

- 인터페이스, 애노테이션, enum 제외
- `@Component` 또는 `@Configuration` 여부 확인
- 조건 애노테이션 매칭
- `BeanDefinition.Kind` 결정

이후 `BeanNameGenerator`로 이름을 만들고 `BeanDefinition`을 등록한다. 즉, 컨테이너는 실제 객체보다 먼저 **이름, 타입, kind, qualifier 같은 메타정보**를 축적한다.

이 구조가 중요한 이유는, 의존성 해결이나 후처리기 적용이 결국 객체 자체보다 메타데이터를 기준으로 이루어지기 때문이다.

## `@Configuration`과 `@Bean`은 별도 흐름이 있다

`spring-lite`는 `@Configuration` 클래스를 단순 컴포넌트처럼만 보지 않는다. `Kind.CONFIGURATION`으로 별도 취급하면서, 내부의 `@Bean` 메서드도 추가 등록한다.

이 설계는 Spring의 중요한 감각을 잘 따라간다.

- `@Component`는 타입 자체가 빈 후보
- `@Bean`은 메서드 반환값이 빈 후보

즉, Bean 등록 경로가 하나가 아니라 둘이라는 점을 코드로 드러낸다.

## refresh()가 실제 조립을 시작한다

`refresh()` 흐름은 짧지만 의미가 크다.

1. `instantiateBeanPostProcessors()`
2. `instantiateConfigurationBeans()`
3. `instantiateBeanPostProcessors()`
4. `instantiateRemainingSingletons()`

여기서 눈에 띄는 부분은 `BeanPostProcessor`를 먼저 만들고, 설정 Bean 생성 이후 다시 한 번 후처리기를 정리한다는 점이다. 이유는 간단하다. 어떤 후처리기는 설정 클래스나 `@Bean` 메서드를 통해 늦게 등록될 수 있기 때문이다.

즉, 이 컨테이너는 후처리기를 단순 부가 기능이 아니라 **생성 파이프라인 자체를 바꾸는 존재**로 취급한다.

## getBean()은 결국 createBean()으로 내려간다

`getBean(String)`은 먼저 싱글톤 캐시를 보고, 없으면 `BeanDefinition`을 찾아 `createBean()`을 호출한다. 이 구조는 매우 전형적이다.

- singleton cache
- bean definition lookup
- create if absent

Spring을 깊게 보지 않아도 자주 듣는 "singleton registry" 감각이 여기서 나온다.

중요한 점은 `beansInCreation`을 별도로 관리한다는 것이다. 이 집합은 생성 중 재진입을 제어하고, `getBeansOfType()` 같은 조회에서 아직 생성 중인 Bean을 건너뛰게 만든다. 순환 참조 전체를 해결하는 수준은 아니지만, 최소한 생성 도중 재귀 폭주를 피하는 장치는 갖춘 셈이다.

## 생성자 주입이 기본 축이다

이 프로젝트의 의존성 주입은 생성자 주입 감각이 강하다. 클래스의 생성자를 읽고, 각 파라미터를 타입, `@Qualifier`, `@Value` 기준으로 해석한다.

이 구조가 좋은 이유는 다음과 같다.

- 필수 의존성이 명확하다.
- 불완전한 객체를 만들 가능성이 줄어든다.
- 주입 시점이 생성 시점과 맞물려 읽기 쉽다.

여기에 `PropertyResolver`를 통한 `@Value` 해석까지 붙으면서, 단순 타입 Bean 주입과 프로퍼티 주입이 한 컨테이너 안에서 연결된다.

## Bean lifecycle은 최소하지만 핵심은 있다

`spring-lite`는 Bean lifecycle을 과하게 확장하지 않지만, 핵심 포인트는 담고 있다.

- `BeanPostProcessor`
- `@PostConstruct`
- `@PreDestroy`
- `close()` 시 destroy callback 역순 실행

특히 `destroyCallbacks`를 별도로 쌓아두고 종료 시 역순으로 실행하는 구조는 꽤 중요하다. 객체 생성 순서의 반대로 정리하는 감각이 있어야 의존성 있는 자원을 안전하게 내릴 수 있기 때문이다.

즉, 생명주기는 "객체를 만든다"에서 끝나지 않고 **초기화와 종료를 포함한 자원 관리 문제**라는 점을 코드가 보여준다.

## 조건부 등록도 이 레벨에서 해석된다

이 프로젝트는 `ConditionalOnBean`, `ConditionalOnClass`, `ConditionalOnMissingBean`, `ConditionalOnProperty`도 포함한다. 흥미로운 점은 이런 Boot스러운 조건부 등록도 별도 마법이 아니라, 결국 컨테이너가 후보를 등록할 때 평가하는 규칙이라는 점이다.

즉, 조건부 등록을 이해할 때도 핵심은 "애노테이션 이름"이 아니라 **등록 시점에 어떤 상태를 기준으로 BeanDefinition을 받아들일지 결정하는 로직**이다.

## spring-lite 컨테이너가 특히 잘 보여주는 것

이 구현을 읽으면서 가장 중요한 포인트는 다음 세 가지였다.

### 1. Spring은 메타데이터 기반 조립기다

애노테이션은 직접 객체를 만들지 않는다. 컨테이너가 애노테이션을 읽고 메타데이터를 만들고 그 메타데이터로 객체를 조립한다.

### 2. 생명주기는 후처리기와 분리해서 볼 수 없다

`BeanPostProcessor`가 들어오는 순간, "객체 생성 완료"라는 개념은 단순하지 않다. 프록시 적용도 결국 이 파이프라인 위에 올라간다.

### 3. Boot 기능도 결국 컨테이너의 등록 규칙 위에 올라간다

조건부 등록, 자동 설정 같은 기능도 화려해 보이지만, 밑바탕은 BeanDefinition 등록과 refresh 과정이다.

## 정리

`AnnotationConfigApplicationContext`는 작지만 Spring 컨테이너의 중요한 감각을 꽤 잘 담고 있다.

- 먼저 메타데이터를 등록하고
- refresh에서 실제 Bean을 만들고
- 생성자 주입으로 의존성을 해결하고
- 후처리기와 라이프사이클 콜백을 적용하고
- 종료 시 destroy callback을 실행한다

즉, 컨테이너는 단순 객체 팩토리가 아니라 **애플리케이션 객체 그래프의 생성, 초기화, 확장, 종료를 관리하는 런타임 조립기**다.

다음 글에서는 이 컨테이너 위에 어떻게 프록시가 올라가고, `@Transactional`이 어떻게 메서드 인터셉션으로 연결되는지 본다.
