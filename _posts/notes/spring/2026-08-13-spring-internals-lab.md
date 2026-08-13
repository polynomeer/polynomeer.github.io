---
title: "spring-internals-lab로 다시 읽는 Spring: 문서, 실험, 축소 구현을 함께 돌리는 학습법"
date: 2026-08-13
categories: [Notes, Spring]
tags: [Spring, Java, Framework, Debugging, Architecture]
---

## Spring은 사용법만 알아서는 오래 못 버틴다

실무에서 Spring을 쓰다 보면 익숙한 애노테이션은 금방 늘어난다. `@Component`, `@Configuration`, `@Transactional`, `@RestController` 정도는 자연스럽게 손에 붙는다. 문제는 장애 분석이나 설계 판단이 필요한 순간이다.

- Bean은 정확히 언제 생성되는가
- 왜 self-invocation에서는 `@Transactional`이 먹지 않는가
- MVC 요청은 어떤 단계를 거쳐 컨트롤러 메서드에 도달하는가
- Boot의 자동 설정은 어디까지가 기본값이고 어디서부터가 사용자 구성인가

이 질문들은 사용법만 익혀서는 잘 풀리지 않는다. 결국 프레임워크가 어떻게 조립되는지 봐야 한다.

`spring-internals-lab`은 바로 그 지점을 겨냥한 학습 프로젝트다. README 기준으로 20주 동안 Spring 공식 문서, 레퍼런스 구현, 디버깅, 축소 구현을 함께 따라가며 내부 구조를 추적한다. 저장소는 단순 노트 모음이 아니라 `experiments`, `mini-spring`, `spring-extensions`, `docs`가 나뉜 구조이고, 22개 모듈과 217개 테스트를 통해 학습 내용을 코드로 고정해 둔다.

## 이 프로젝트가 괜찮은 이유는 학습 단위를 잘 쪼개기 때문이다

이 레포의 핵심은 "소스 코드를 읽었다"에서 멈추지 않는다는 점이다. README에 적힌 학습 루프는 꽤 명확하다.

1. 공식 문서와 Javadoc을 먼저 읽는다.
2. 작은 질문을 만든다.
3. 최소 예제로 실제 동작을 확인한다.
4. 인터페이스와 구현체를 나눠서 본다.
5. 디버거와 테스트로 호출 순서를 추적한다.
6. 핵심 메커니즘만 남긴 축소 버전을 다시 구현한다.
7. 마지막에 설계 의도를 문장으로 정리한다.

Spring을 공부할 때 흔히 막히는 이유는 범위가 너무 넓기 때문이다. 반대로 이 프로젝트는 컨테이너, 프록시, 트랜잭션, 웹, 부트스트랩을 각각 독립된 문제로 잘라서 다룬다. 그래서 "Spring 전체"라는 막연한 대상이 아니라 "Bean 후처리기가 프록시를 붙이는 지점", "HandlerMapping이 경로를 등록하는 규칙"처럼 관찰 가능한 단위로 내려온다.

## `experiments`와 `mini-spring`을 같이 가져가는 구성이 특히 좋다

이 프로젝트는 단순히 미니 프레임워크만 만드는 식으로 끝나지 않는다. 실제 Spring 상에서 동작을 검증하는 `experiments`와, 핵심 메커니즘을 줄여 다시 만드는 `mini-spring`이 함께 있다.

이 둘을 분리해 두면 장점이 분명하다.

- `experiments`는 "실제 Spring이 진짜 이렇게 동작하는가"를 확인하는 자리다.
- `mini-spring`은 "그 동작을 만들려면 최소한 어떤 구조가 필요한가"를 드러내는 자리다.

즉, 관찰과 재구현이 한쪽으로 치우치지 않는다. 소스만 읽으면 해석이 공중에 뜰 수 있고, 재구현만 하면 실제 프레임워크와 멀어질 수 있다. 이 프로젝트는 그 사이를 잘 메운다.

## 컨테이너 파트는 Spring의 중심이 어디인지 다시 보여준다

`mini-spring`의 `AnnotationConfigApplicationContext`를 보면 Spring의 중심이 여전히 컨테이너라는 사실이 분명해진다. 이 클래스는 `beanDefinitions`, `singletons`, `beanPostProcessors`, `destroyCallbacks`, `beansInCreation` 같은 자료구조를 직접 들고 있고, `refresh()`에서 다음 순서로 조립을 시작한다.

1. `BeanPostProcessor` 인스턴스화
2. `@Configuration` 기반 Bean 생성
3. 다시 후처리기 정리
4. 나머지 singleton 생성

여기서 중요한 점은 애노테이션이 직접 객체를 만들지 않는다는 사실이다. 먼저 메타데이터가 등록되고, 그다음 컨테이너가 생명주기와 의존성 규칙에 따라 실제 객체를 만든다. `@PostConstruct`, `@PreDestroy`, destroy callback 역순 실행까지 들어 있어서, Bean lifecycle을 단순 생성 문제가 아니라 자원 관리 문제로 보게 만든다.

실무에서 Bean 초기화 타이밍, 순환 참조, 후처리기 적용 순서를 묻는 질문이 어려운 이유도 여기 있다. 겉으로는 애노테이션 몇 개지만, 내부에서는 컨테이너가 꽤 많은 책임을 진다.

## 트랜잭션 파트는 AOP와 JDBC가 분리된 기능이 아니라는 점을 보여준다

`TransactionalBeanPostProcessor`는 초기화가 끝난 Bean을 보고 `@Transactional` 유무를 검사한 뒤 프록시를 씌운다. 이 프록시는 `ProxyFactory`가 만든다. 인터페이스가 있으면 JDK 동적 프록시를 쓰고, 없으면 ByteBuddy와 Objenesis를 이용한 서브클래싱 프록시로 내려간다.

구조는 작지만 의미는 정확하다.

- 트랜잭션은 컨테이너가 직접 실행하는 기능이 아니다.
- 메서드 호출 경계를 가로채는 프록시가 먼저 필요하다.
- JDBC는 그 경계 안에서 같은 커넥션을 공유해야 한다.

`JdbcTemplate`도 이 흐름을 따라간다. 현재 트랜잭션에 묶인 커넥션이 있으면 그것을 우선 사용하고, 없으면 `DataSource`에서 새 커넥션을 연다. 이 한 줄기만 따라가도 왜 `@Transactional`이 단순 선언이 아니라 프록시, 인터셉터, 커넥션 바인딩의 합성 결과인지 이해하게 된다.

이런 구조를 코드로 한 번 본 뒤에는 self-invocation, 프록시 경계, 트랜잭션 전파 같은 주제를 훨씬 덜 추상적으로 받아들이게 된다.

## 웹 파트는 DispatcherServlet을 작은 부품의 합으로 분해한다

`DispatcherServlet` 구현도 학습 포인트가 분명하다. 요청이 들어오면 하나의 거대한 메서드가 처리하는 것이 아니라 다음 조합으로 나뉜다.

- `RequestMappingHandlerMapping`
- `RequestMappingHandlerAdapter`
- `JsonReturnValueHandler`
- `DefaultExceptionResolver`

`handle()` 흐름도 전형적이다. 먼저 handler를 찾고, 없으면 404를 반환하고, 있으면 adapter가 호출을 위임하고, 반환값은 별도 handler가 직렬화하며, 예외는 resolver가 처리한다.

특히 `RequestMappingHandlerMapping`이 `@RestController` Bean을 스캔하고, 클래스 레벨 `@RequestMapping`과 메서드 레벨 `@GetMapping` / `@PostMapping`을 합쳐 최종 경로를 만들며, path variable 개수와 패턴 길이 기준으로 정렬하는 부분은 실제 MVC가 왜 그렇게 많은 협력 객체로 쪼개져 있는지 납득하게 만든다.

Spring MVC를 처음 볼 때는 `@GetMapping` 한 줄이 전부처럼 느껴지지만, 실제로는 "경로 등록", "호출 대상 선택", "인자 바인딩", "반환값 처리", "예외 변환"이 별도 책임으로 나뉘어 있다. 이 프로젝트는 그 분리를 아주 작은 코드로 보여준다.

## Boot 파트는 결국 조립 계층이라는 사실을 드러낸다

`MiniSpringApplication.run()`은 놀랄 만큼 짧다. 애플리케이션 클래스를 등록하고, `BootInfrastructureRegistrar.registerDefaults(context)`로 자동 설정 클래스를 넣고, `refresh()`를 호출한 뒤 `WebServer` Bean을 꺼내 `start()` 한다.

여기서 Boot의 본질이 잘 보인다.

- 새 컨테이너를 만드는 것이 아니다.
- 기존 컨테이너에 어떤 인프라를 어떤 순서로 채울지 결정한다.
- 웹, JSON, JDBC, 트랜잭션을 기본 조합으로 묶어 준다.

실제 코드에서도 `JsonAutoConfiguration`, `TransactionAutoConfiguration`, `JdbcAutoConfiguration`, `WebAutoConfiguration`이 별도 등록된다. 즉, Boot는 마법을 추가하는 층이라기보다 이미 있는 메커니즘을 조립 가능한 기본값 체계로 묶는 층에 가깝다.

## 이 프로젝트를 읽고 나면 질문하는 방식이 달라진다

`spring-internals-lab`의 가장 큰 장점은 지식을 늘려 준다는 점보다 질문의 수준을 바꿔 준다는 점에 있다. 예전에는 "왜 안 되지"에서 멈췄다면, 이런 프로젝트를 읽고 나서는 질문이 더 구체적으로 바뀐다.

- 이 문제는 Bean 등록 시점 문제인가, 초기화 후처리 문제인가
- 프록시가 붙는 시점과 실제 호출 경계가 어긋난 것인가
- MVC에서 handler 선택은 됐는데 argument resolution에서 실패한 것인가
- Boot 자동 설정 조건이 맞지 않아 BeanDefinition 자체가 등록되지 않은 것인가

이 차이는 단순한 학습 만족감보다 훨씬 중요하다. 실무 장애 대응, 코드 리뷰, 인터뷰 답변 모두에서 설명력이 달라진다.

## 정리

`spring-internals-lab`은 "Spring을 직접 구현해 봤다"는 데 의미가 있는 프로젝트가 아니다. 더 정확히 말하면, Spring을 이해할 때 필요한 관찰 단위를 잘 고른 프로젝트다.

- 실제 Spring 위에서 동작을 검증하고
- 축소 구현으로 구조를 다시 만들고
- 테스트와 디버깅으로 호출 순서를 고정하고
- 마지막에 설계 의도를 언어로 정리한다

Spring 내부를 공부할 때 가장 어려운 부분은 기능 수가 아니라 추상화 층이 많다는 점이다. 이 프로젝트는 그 층을 컨테이너, 프록시, 트랜잭션, MVC, Boot로 나눠서 하나씩 붙잡게 만든다. 그래서 "Spring을 안다"는 말을 사용법이 아니라 구조 이해에 가깝게 다시 정의하게 만든다.
