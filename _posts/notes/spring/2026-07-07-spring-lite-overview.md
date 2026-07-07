---
title: spring-lite로 이해하는 Spring 구현 1 - 프로젝트 구조와 설계 범위
date: 2026-07-03
categories: [Notes, Spring]
tags: [Spring, Java, Framework, Architecture, DI]
series: spring-lite
series_title: spring-lite로 이해하는 Spring 구현
series_order: 1
series_description: spring-lite 프로젝트를 바탕으로 IoC 컨테이너, AOP, MVC, 트랜잭션, 부트스트랩을 구현 관점에서 해설하는 시리즈.
---

## 왜 spring-lite를 읽는가

Spring Framework를 사용할 때는 `@Component`, `@Configuration`, `@Transactional`, `@RestController` 같은 애노테이션을 자연스럽게 쓰게 된다. 하지만 실제로는 이 애노테이션들이 각각 독립된 마법이 아니라, 컨테이너, 프록시, 웹 디스패치, 트랜잭션, 부트스트랩 계층이 맞물린 결과다.

`spring-lite`는 이 흐름을 아주 큰 프레임워크 전체가 아니라, 학습 가능한 크기의 코드로 다시 쪼개서 보여주는 프로젝트다. README 기준 목표 범위도 비교적 명확하다.

- `@Component` 기반 Bean 등록과 생성자 주입
- `ApplicationContext`와 `@Configuration` / `@Bean`
- `@RestController`, `@GetMapping`, `@PostMapping` 기반 MVC
- 프록시 기반 AOP
- `@Transactional`과 JDBC 템플릿
- `MiniSpringApplication.run()` 형태의 부트스트랩

즉, "Spring을 완전히 재구현한다"보다 **실무에서 가장 자주 만지는 핵심 축을 직접 손으로 다시 만들어 본다**는 방향에 가깝다.

## 모듈이 어떻게 나뉘어 있는가

이 프로젝트는 멀티 모듈 구조다.

- `spring-lite-core`
- `spring-lite-context`
- `spring-lite-aop`
- `spring-lite-web`
- `spring-lite-jdbc`
- `spring-lite-tx`
- `spring-lite-boot`
- `spring-lite-test`
- `example-app`

이 나눔이 좋은 이유는, Spring이 실제로도 하나의 덩어리라기보다 계층적으로 쌓인 프레임워크라는 점을 잘 드러내기 때문이다.

### core

`spring-lite-core`에는 공통 애노테이션과 리플렉션, 프로퍼티 해석이 들어 있다.

- `@Component`, `@Service`, `@Repository`, `@Controller`
- `@Configuration`, `@Bean`
- `@Autowired`, `@Qualifier`, `@Value`
- `ConditionalOnBean`, `ConditionalOnClass`, `ConditionalOnMissingBean`, `ConditionalOnProperty`
- `ReflectionUtils`, `PropertyResolver`

여기서는 아직 컨테이너가 없다. 대신 컨테이너가 해석해야 할 **메타데이터와 공통 유틸리티**가 먼저 정의된다.

### context

실제 IoC 컨테이너의 중심은 `spring-lite-context`에 있다.

- `ApplicationContext`
- `BeanDefinition`
- `AnnotationConfigApplicationContext`
- `ClassPathScanner`
- `BeanPostProcessor`

Spring의 핵심을 하나만 꼽으라면 결국 컨테이너인데, 이 모듈이 그 컨테이너를 담당한다.

### aop / tx / jdbc

그다음 레이어가 흥미롭다.

- `spring-lite-aop`: 프록시와 인터셉션
- `spring-lite-tx`: `@Transactional`과 트랜잭션 경계
- `spring-lite-jdbc`: `JdbcTemplate`, `RowMapper`, `DataSource`

즉, 트랜잭션을 단독 기능으로 보지 않고 **AOP 위에 얹힌 JDBC 사용 경험**으로 구현했다. 이건 Spring을 이해할 때 중요한 설계 감각이다.

### web / boot

웹과 부트스트랩도 분리돼 있다.

- `spring-lite-web`: `DispatcherServlet`, `HandlerMapping`, `HandlerAdapter`, argument resolver
- `spring-lite-boot`: `MiniSpringApplication`, 자동 설정, `JdkWebServer`

이 구조를 보면 왜 실제 Spring도 `spring-context`, `spring-webmvc`, `spring-jdbc`, `spring-tx`, `spring-boot`처럼 나뉘는지 감이 온다.

## example-app이 중요한 이유

이 프로젝트는 프레임워크 모듈만 있는 것이 아니라 `example-app`이 함께 있다. 이 점이 중요하다.

예제 앱에는 주문 조회/생성 시나리오가 있고, 다음 흐름이 실제로 연결된다.

- `@MiniSpringBootApplication`으로 실행
- 컨테이너 초기화
- `@RestController` 스캔
- `DispatcherServlet`으로 HTTP 요청 처리
- 서비스 계층에 `@Transactional` 적용

즉, 프레임워크 코드를 따로 읽는 것만으로 끝나지 않고, **어떤 사용자 코드가 어떤 인프라를 거쳐 동작하는가**를 바로 확인할 수 있다.

## 이 프로젝트를 읽을 때 좋은 순서

레포 README에도 문서 읽기 순서가 정리돼 있지만, 코드 기준으로는 아래 순서가 가장 자연스럽다.

1. `MiniSpringApplication.run()`으로 시작점을 본다.
2. `AnnotationConfigApplicationContext`에서 컨테이너 생성 흐름을 본다.
3. `ProxyFactory`와 `TransactionalBeanPostProcessor`로 프록시 적용 방식을 본다.
4. `DispatcherServlet`과 `RequestMappingHandlerMapping`으로 웹 요청 흐름을 본다.
5. `JdbcTemplate`과 `TransactionManager`로 데이터 접근과 트랜잭션 경계를 본다.

이 순서가 좋은 이유는 프레임워크 내부 계층이 실제 실행 순서와 꽤 비슷하게 연결되기 때문이다.

## spring-lite가 보여주는 설계 감각

이 프로젝트를 보면 Spring의 핵심을 다음처럼 요약할 수 있다.

- 애노테이션은 메타데이터일 뿐이다.
- 진짜 핵심은 그것을 해석하는 컨테이너다.
- 부가기능은 프록시와 후처리기로 붙는다.
- 웹은 별도 디스패치 파이프라인 위에 올라간다.
- Boot는 모든 것을 조립해서 실행 진입점을 만든다.

즉, 우리가 평소 쓰는 Spring 경험은 사실 하나의 기술이 아니라 **계층적으로 겹쳐진 여러 작은 메커니즘의 합성 결과**다.

## 이 시리즈에서 볼 것

이후 글에서는 이 구조를 실제 구현 기준으로 하나씩 풀어 본다.

1. `AnnotationConfigApplicationContext`로 보는 IoC/DI와 Bean lifecycle
2. `ProxyFactory`, `TransactionalBeanPostProcessor`, `JdbcTemplate`로 보는 AOP와 트랜잭션
3. `DispatcherServlet`, `HandlerMapping`, argument resolver로 보는 MVC 요청 처리
4. `MiniSpringApplication`과 자동 설정으로 보는 부트스트랩 조립 방식

`spring-lite`의 장점은 코드 양이 작아서가 아니라, **Spring의 핵심을 계층별로 분해해서 읽게 만든다**는 데 있다. 그래서 이 프로젝트를 읽는 과정 자체가 곧 Spring의 내부 구조를 다시 이해하는 과정이 된다.
