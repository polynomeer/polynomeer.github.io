---
title: spring-lite로 이해하는 Spring 구현 1 - 프로젝트 구조와 설계 범위
date: 2026-07-03
status: draft
categories: [Notes, Spring]
tags: [Spring, Java, Framework, Architecture, DI]
series: spring-lite
series_title: spring-lite로 이해하는 Spring 구현
series_order: 1
series_description: spring-lite 프로젝트를 바탕으로 IoC 컨테이너, AOP, MVC, 트랜잭션, 부트스트랩을 구현 관점에서 해설하는 시리즈.
---

## 왜 `spring-lite`를 만들고 들여다봤나

Spring을 오래 쓰다 보면 익숙해지는 애노테이션들이 있다. `@Component`, `@Configuration`, `@Transactional`, `@RestController` 같은 것들이다. 문제는 익숙해질수록 오히려 내부가 더 안 보인다는 점이다. 잘 돌아가니까 그냥 쓰게 되고, 어느 순간부터는 "왜 이렇게 동작하는가"보다 "원래 이런가 보다" 쪽으로 넘어가게 된다.

`spring-lite`를 만들기 시작한 이유도 딱 그 지점이었다. Spring 전체 소스를 처음부터 끝까지 파는 건 범위가 너무 크고, 반대로 블로그 글이나 강의 자료만 보면 구조가 너무 평평하게 정리돼 있다. 그 중간쯤에서, **실제로 손으로 다시 만들어 볼 수 있을 만큼 작지만 그래도 Spring의 핵심 축은 남아 있는 코드**가 필요했다.

이 프로젝트가 다루는 범위는 꽤 명확하다.

- `@Component` 기반 Bean 등록과 생성자 주입
- `ApplicationContext`와 `@Configuration` / `@Bean`
- `@RestController`, `@GetMapping`, `@PostMapping` 기반 MVC
- 프록시 기반 AOP
- `@Transactional`과 JDBC 템플릿
- `MiniSpringApplication.run()` 형태의 부트스트랩

즉 "Spring을 완전히 다시 만든다"보다, **실무에서 자주 만지는 축을 직접 구현하면서 비교 학습한다**는 쪽에 가깝다.

## 처음 봤을 때 좋았던 건 모듈 경계였다

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

이 구성이 좋았던 이유는 Spring을 "하나의 큰 프레임워크"가 아니라 **층층이 쌓인 조합물**로 보게 만들기 때문이다.

### `core`는 아직 컨테이너가 아니다

`spring-lite-core`에는 애노테이션과 공통 유틸리티가 들어 있다.

- `@Component`, `@Service`, `@Repository`, `@Controller`
- `@Configuration`, `@Bean`
- `@Autowired`, `@Qualifier`, `@Value`
- `ConditionalOnBean`, `ConditionalOnClass`, `ConditionalOnMissingBean`, `ConditionalOnProperty`
- `ReflectionUtils`, `PropertyResolver`

처음엔 이 모듈이 약간 심심해 보였는데, 오히려 이게 중요했다. 여기에는 아직 컨테이너가 없다. 대신 컨테이너가 읽어야 할 **메타데이터와 공통 도구**만 먼저 있다. Spring도 결국 이런 순서로 쌓인다.

### `context`에서 비로소 "Spring 같다"는 느낌이 난다

실제 IoC 컨테이너의 중심은 `spring-lite-context`다.

- `ApplicationContext`
- `BeanDefinition`
- `AnnotationConfigApplicationContext`
- `ClassPathScanner`
- `BeanPostProcessor`

이 모듈을 따라가다 보면 애노테이션이 직접 일을 하는 게 아니라, 결국 컨테이너가 메타데이터를 읽고 객체 그래프를 조립한다는 감각이 생긴다. Spring 공부를 하면서 자꾸 "애노테이션 중심"으로 생각하게 되는데, 실제로는 언제나 컨테이너가 중심이라는 걸 여기서 다시 확인하게 된다.

### AOP, 트랜잭션, JDBC가 나뉘어 있는 게 인상적이었다

그다음이 `spring-lite-aop`, `spring-lite-tx`, `spring-lite-jdbc`다.

- `spring-lite-aop`: 프록시와 인터셉션
- `spring-lite-tx`: `@Transactional`과 트랜잭션 경계
- `spring-lite-jdbc`: `JdbcTemplate`, `RowMapper`, `DataSource`

이 구조를 보고 좋았던 건, 트랜잭션을 별도 DB 기능처럼 두지 않고 **AOP 위에 얹힌 JDBC 사용 경험**으로 풀어냈다는 점이다. `@Transactional`을 이해할 때 프록시를 먼저 봐야 하는 이유가 이 모듈 경계만으로도 꽤 잘 드러난다.

### `web`과 `boot`는 결국 "조립의 마지막 단계"처럼 보인다

- `spring-lite-web`: `DispatcherServlet`, `HandlerMapping`, `HandlerAdapter`, argument resolver
- `spring-lite-boot`: `MiniSpringApplication`, 자동 설정, `JdkWebServer`

이쯤 오면 Spring이 왜 `spring-context`, `spring-webmvc`, `spring-jdbc`, `spring-tx`, `spring-boot`처럼 나뉘는지 감이 온다. 전부 한 번에 이해하려고 하면 너무 크지만, 이렇게 레이어를 잘라 보면 어느 정도 손에 잡힌다.

## `example-app`이 같이 있는 게 꽤 중요했다

이 프로젝트는 프레임워크 코드만 모아 둔 저장소가 아니다. `example-app`이 같이 있다.

처음엔 그냥 데모 정도로 생각했는데, 흐름을 따라가다 보니 오히려 이게 중요한 축이었다.

- `@MiniSpringBootApplication`으로 실행
- 컨테이너 초기화
- `@RestController` 스캔
- `DispatcherServlet`으로 HTTP 요청 처리
- 서비스 계층에 `@Transactional` 적용

즉 프레임워크 내부만 따로 보는 게 아니라, **사용자 코드가 그 위에 올라가면 실제로 어떤 흐름이 되는지**를 바로 확인할 수 있다. 개인적으로는 이 연결이 있어야 "아, 이 구현이 여기서 쓰이겠구나"라는 감각이 생겼다.

## 내가 읽은 순서는 이랬다

README에도 정리돼 있지만, 실제로는 다음 순서가 제일 자연스러웠다.

1. `MiniSpringApplication.run()`으로 시작점을 본다.
2. `AnnotationConfigApplicationContext`에서 컨테이너 흐름을 본다.
3. `ProxyFactory`와 `TransactionalBeanPostProcessor`로 프록시 적용 방식을 본다.
4. `DispatcherServlet`과 `RequestMappingHandlerMapping`으로 웹 요청 흐름을 본다.
5. `JdbcTemplate`과 `TransactionManager`로 데이터 접근과 트랜잭션 경계를 본다.

이 순서가 좋았던 이유는, 실제 실행 흐름에 꽤 가깝기 때문이다. Boot가 시작점을 만들고, 컨테이너가 Bean을 만들고, 후처리기가 프록시를 붙이고, 웹 요청이 들어오고, 그 안에서 JDBC가 연결을 쓴다. 추상 설명보다 훨씬 덜 헷갈린다.

## 만들고 따라가며 남은 한 줄 요약

`spring-lite`를 보고 나서 Spring을 다시 요약하면 대략 이렇다.

- 애노테이션은 메타데이터다.
- 진짜 중심은 그것을 해석하는 컨테이너다.
- 부가기능은 프록시와 후처리기로 붙는다.
- 웹은 별도 디스패치 파이프라인으로 올라간다.
- Boot는 이 전체를 실행 가능한 애플리케이션으로 묶는다.

이 말 자체는 익숙한 정리처럼 들릴 수 있는데, 직접 구현 코드를 한 번 보고 나면 느낌이 조금 다르다. "원래 그런가 보다"가 아니라 "정말 저 구조로 이어져 있구나" 쪽에 가까워진다.

## 이 시리즈에서는 뭘 보게 될까

이후 글에서는 이 구조를 하나씩 조금 더 가까이에서 본다.

1. `AnnotationConfigApplicationContext`로 보는 IoC/DI와 Bean lifecycle
2. `ProxyFactory`, `TransactionalBeanPostProcessor`, `JdbcTemplate`로 보는 AOP와 트랜잭션
3. `DispatcherServlet`, `HandlerMapping`, argument resolver로 보는 MVC 요청 처리
4. `MiniSpringApplication`과 자동 설정으로 보는 부트스트랩 조립 방식

내가 `spring-lite`를 좋게 본 이유는 "작아서 보기 쉽다"보다, **Spring의 핵심을 딱 비교 학습하기 좋은 크기로 쪼개 놨다**는 데 있다. 그래서 이 시리즈도 강의 노트처럼 정리하기보다, 직접 구현해 보면서 어떤 감각이 남았는지에 더 가깝게 풀어보려고 한다.
