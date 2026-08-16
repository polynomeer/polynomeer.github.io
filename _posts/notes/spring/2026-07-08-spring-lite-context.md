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

## 결국 먼저 봐야 하는 건 컨테이너였다

Spring을 공부할 때는 자꾸 AOP나 MVC부터 눈에 들어온다. 더 눈에 띄고, 실무에서 직접 만지는 코드와도 가깝기 때문이다. 그런데 `spring-lite`를 따라가다 보면 다시 원점으로 돌아오게 된다. 결국 다 컨테이너 위에 올라가 있기 때문이다.

`spring-lite`에서 그 중심은 `AnnotationConfigApplicationContext`다. 이 클래스가 맡는 역할은 꽤 명확하다.

- BeanDefinition 등록
- 컴포넌트 스캔
- Bean 생성과 의존성 주입
- 초기화/소멸까지 포함한 생명주기 관리

이걸 한 번 따라가 보면 "애노테이션 기반 프레임워크가 실제로는 어떻게 객체 그래프를 조립하는가"가 꽤 또렷해진다.

## `register`, `scan`, `refresh` 이 셋이 먼저 보였다

컨테이너 사용 흐름은 의외로 단순하다.

1. `register()` 또는 `scan()`으로 후보를 모은다.
2. `BeanDefinition`을 등록한다.
3. `refresh()`에서 실제 Bean을 만든다.

처음 봤을 때 가장 좋았던 건, 이 구현이 **등록과 생성을 분리해서 보여준다는 점**이었다. Spring을 쓰다 보면 둘이 한 번에 일어나는 것처럼 느껴지는데, 실제로는 먼저 메타데이터를 모으고 그다음 객체를 만든다.

## 컨테이너는 객체보다 먼저 메타데이터를 만든다

후보 클래스를 만났다고 바로 객체를 만들지 않는다. 먼저 이 클래스가 관리 대상인지, 어떤 종류인지, 어떤 이름을 가질지 정리한다.

- 인터페이스, 애노테이션, enum 제외
- `@Component` 또는 `@Configuration` 여부 확인
- 조건 애노테이션 검사
- `BeanDefinition.Kind` 결정

그다음에야 `BeanNameGenerator`로 이름을 만들고 `BeanDefinition`을 등록한다.

이 구조를 보고 나면 Spring을 "애노테이션이 객체를 만든다" 식으로 이해하면 안 된다는 게 분명해진다. 실제로는 컨테이너가 먼저 메타데이터를 쌓고, 나중에 그 메타데이터를 기준으로 객체를 조립한다.

## `@Configuration`과 `@Bean`은 생각보다 중요한 분기였다

`spring-lite`는 `@Configuration` 클래스를 그냥 컴포넌트 하나로 취급하지 않는다. `Kind.CONFIGURATION`으로 따로 보고, 그 안에 있는 `@Bean` 메서드까지 다시 등록한다.

이 지점이 꽤 중요했다.

- `@Component`는 클래스 자체가 빈 후보
- `@Bean`은 메서드 반환값이 빈 후보

말로 쓰면 익숙한데, 코드로 보면 "등록 경로가 둘이다"는 게 확실히 다르게 느껴진다. 같은 빈 등록처럼 보여도 컨테이너 입장에서는 처리 경로가 다르다.

## `refresh()`는 진짜 조립이 시작되는 순간이다

이 구현에서 `refresh()`는 아래 순서로 간다.

1. `instantiateBeanPostProcessors()`
2. `instantiateConfigurationBeans()`
3. `instantiateBeanPostProcessors()`
4. `instantiateRemainingSingletons()`

처음엔 두 번이나 `BeanPostProcessor`를 만드는 게 이상해 보였는데, 구현을 따라가다 보니 이유가 자연스럽다. 설정 Bean이나 `@Bean` 메서드를 통해 후처리기가 늦게 등록될 수 있기 때문이다.

이걸 보고 남은 감각은 하나였다. 컨테이너는 후처리기를 부가 기능으로 취급하지 않는다. 오히려 **생성 파이프라인 자체를 바꾸는 핵심 확장점**으로 본다.

## `getBean()`도 결국 별거 아닌 듯하면서 핵심이다

`getBean(String)` 흐름은 익숙한 패턴이다.

- singleton cache 확인
- BeanDefinition 조회
- 없으면 생성

설명만 들으면 평범한 factory처럼 보이지만, 직접 구현을 보면 여기서 컨테이너의 감각이 확실히 나온다. 특히 `beansInCreation`을 따로 관리하는 부분이 그렇다.

이 집합 덕분에:

- 생성 중 재진입을 감지하고
- `getBeansOfType()` 같은 조회에서 아직 완성되지 않은 Bean을 건너뛸 수 있다

즉 아직 완전한 순환 참조 해결까지는 아니더라도, 최소한 컨테이너가 "지금은 만들고 있는 중"이라는 상태를 별도로 관리한다는 점이 보인다.

## 생성자 주입이 왜 계속 기본값으로 추천되는지도 이해가 갔다

`spring-lite`의 의존성 주입은 생성자 주입이 중심이다. 클래스 생성자를 보고, 각 파라미터를 타입, `@Qualifier`, `@Value` 기준으로 해석한다.

직접 구현을 보면 왜 생성자 주입이 자꾸 기본값처럼 추천되는지도 이해가 간다.

- 필수 의존성이 생성 시점에 드러난다.
- 반쯤 만들어진 객체를 만들 가능성이 줄어든다.
- 객체를 볼 때 "무엇이 꼭 필요한가"가 바로 보인다.

여기에 `PropertyResolver`를 통한 `@Value` 해석까지 들어오면서, 단순한 Bean 주입과 설정값 주입이 같은 파이프라인 안에서 연결된다.

## lifecycle도 생각보다 꼭 필요한 만큼은 들어 있다

`spring-lite`가 lifecycle을 과하게 크게 구현하진 않지만, 그렇다고 너무 얇지도 않다.

- `BeanPostProcessor`
- `@PostConstruct`
- `@PreDestroy`
- `close()` 시 destroy callback 역순 실행

특히 `destroyCallbacks`를 따로 모아두고 종료 시 역순 실행하는 부분이 좋았다. 이건 단순히 "기능이 있다"보다, 자원 정리는 생성의 역순이어야 안정적이라는 감각을 담고 있기 때문이다.

즉 생명주기는 "객체 생성"에서 끝나는 게 아니라, **초기화와 종료까지 포함한 자원 관리 문제**라는 걸 다시 보여준다.

## 조건부 등록도 결국 컨테이너 단계의 문제다

`ConditionalOnBean`, `ConditionalOnClass`, `ConditionalOnMissingBean`, `ConditionalOnProperty`도 여기서 같이 다룬다.

이걸 보고 나서 좋았던 건, Boot스러운 기능처럼 보이는 조건부 등록도 결국은 별도 마법이 아니라 **컨테이너가 등록 시점에 후보를 받아들일지 말지 결정하는 규칙**이라는 점이 분명해진다는 것이다.

즉 핵심은 애노테이션 이름이 아니라, 언제 어떤 상태를 보고 등록 여부를 판단하는가다.

## 만들고 따라가며 남은 세 가지 감각

이 구현을 보고 나서 내 머리에 남은 건 크게 세 가지였다.

### 1. Spring은 메타데이터 기반 조립기다

애노테이션이 객체를 직접 만드는 게 아니라, 컨테이너가 메타데이터를 보고 조립한다.

### 2. lifecycle과 후처리기는 분리해서 볼 수 없다

`BeanPostProcessor`가 들어오는 순간, "객체 생성이 끝났다"는 말은 더 이상 단순하지 않다. 프록시도 결국 이 파이프라인 위에 붙는다.

### 3. Boot 기능도 여기서부터 시작된다

조건부 등록이나 자동 설정 같은 기능도 결국은 BeanDefinition 등록과 `refresh()` 위에 올라간다.

## 정리

`AnnotationConfigApplicationContext`를 직접 따라가 보니, Spring 컨테이너를 다시 이렇게 설명할 수 있었다.

- 먼저 메타데이터를 등록하고
- `refresh()`에서 실제 Bean을 만들고
- 생성자 주입으로 의존성을 해결하고
- 후처리기와 lifecycle 콜백을 적용하고
- 종료 시 destroy callback을 실행한다

결국 컨테이너는 단순 객체 팩토리가 아니라, **애플리케이션 객체 그래프의 생성, 초기화, 확장, 종료를 관리하는 런타임 조립기**다.

다음 글에서는 이 컨테이너 위에 어떻게 프록시가 올라가고, `@Transactional`이 왜 결국 프록시 문제인지 이어서 본다.
