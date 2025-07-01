---
title: Spring Lifecycle
date: 2025-06-30
categories: [Archive, Spring]
tags: [Spring, Bean Lifecycle]
---

## Spring Lifecycle

스프링 프레임워크는 스프링 컨테이너라는 틀 안에서 모든 객체가 실행되고 종료된다. 스프링 컨테이너는 Bean이라는 객체를 생성, 의존성 주입, 생명주기 관리, 설정 등을 담당하는 핵심 구성요소이다.

이 스프링 컨테이너가 관리하는 Bean은 공통적인 생명주기(lifecycle)을 갖는다. 이는 스프링 컨테이너가 Bean 객체를 생성, 초기화, 사용, 소멸하는 전체 과정을 의미한다. 따라서 이를 이해하면 Bean의 생명주기를 제어하고 필요한 시점에 원하는 작업을 수행할 수 있다. 전체 흐름은 다음과 같다.

> 1. Spring 컨테이너 초기화
> 2. Bean 인스턴스 생성
> 3. 의존성 주입 (DI)
> 4. Bean 이름 설정 및 BeanFactory 설정
> 5. 초기화 콜백 (@PostConstruct, InitializingBean 등)
> 6. Bean 사용
> 7. 소멸 콜백 (@PreDestroy, DisposableBean 등)
> 8. 컨테이너 종료

## 1. Spring 컨테이너 초기화

Spring 빈 생명주기에서 **스프링 컨테이너 초기화 단계**는 가장 첫 단계로, 전체 애플리케이션 동작의 출발점이다.
 이 단계에서는 **Spring 컨테이너(ApplicationContext)**가 생성되고, 구성정보(`@Configuration`, `@ComponentScan`, `@Bean`)를 바탕으로 Bean들을 준비한다.

- `ApplicationContext` 또는 `AnnotationConfigApplicationContext` 등의 컨테이너 객체 생성
- 설정 클래스(`@Configuration`, XML 등) 기반으로 Bean 정의 로딩
- 빈 정의(BeanDefinition) 파싱 및 저장
- 빈 클래스 인스턴스 생성
- 의존성 주입 수행
- 초기화 콜백 호출

### 전체 흐름 요약 (Spring Boot 기준)

```
SpringApplication.run()  
   ↓
ApplicationContext 생성 (IoC 컨테이너 생성)  
   ↓
@Configuration, @ComponentScan 기반 BeanDefinition 등록  
   ↓
BeanFactoryPostProcessor 적용  
   ↓
Bean 인스턴스 생성 → 의존성 주입 → 초기화  
   ↓
ApplicationRunner / CommandLineRunner 실행  
```

### 1.1. `ApplicationContext` 생성

- Spring Boot 기준: `SpringApplication.run(MyApp.class)` 호출
- 이 때 `AnnotationConfigApplicationContext` 또는 `GenericApplicationContext`가 내부적으로 생성됨
- BeanFactory (IoC 컨테이너의 핵심) 도 함께 구성됨

```java
ApplicationContext context = new AnnotationConfigApplicationContext(AppConfig.class);
```

### 1.2. Bean 정의 읽기 (BeanDefinition 생성)

- `@Configuration`, `@Component`, `@ComponentScan`, `@Bean` 등을 파싱하여 **BeanDefinition 객체** 생성
- BeanDefinition에는 클래스 타입, scope, lazy 여부, 의존성 정보 등 메타정보가 포함됨

예:

```java
@Bean
public MyService myService() {
    return new MyServiceImpl();
}
```

→ `myService`라는 이름의 BeanDefinition 생성됨

### 1.3. BeanFactoryPostProcessor 실행

- 컨테이너 초기화 과정에서 **BeanFactoryPostProcessor** (예: `ConfigurationClassPostProcessor`)가 실행되어,
  - 프로퍼티 값 치환 (`@Value`)
  - 프로파일 활성화 (`@Profile`)
  - 설정 클래스에서 추가적인 Bean 등록 등을 처리함

### 1.4. Bean 생성 전 후처리기 등록 (BeanPostProcessor)

- `@Autowired`, `@PostConstruct`, `@PreDestroy` 등 처리하기 위한 후처리기(Processor)들이 등록됨
- AOP 프록시 생성 등도 이 시점에 등록

### 1.5. Singleton Bean 선 생성 (Eager Init)

- `@Scope("singleton")` 빈들은 이 시점에 모두 미리 생성됨
- 생성자 호출, 의존성 주입(DI), 초기화 메서드까지 실행됨

### 1.6. ApplicationContext 준비 완료

- `SmartInitializingSingleton`, `ApplicationListener`, `@EventListener` 등은 컨텍스트가 완전히 초기화된 이후 실행됨
- `ApplicationRunner`, `CommandLineRunner`는 이 시점 이후 실행

### 내부 구조 (Spring Boot 기준)

```plaintext
SpringApplication.run()
   └── create ApplicationContext
         └── prepareEnvironment()
         └── create BeanFactory
               └── load BeanDefinition
               └── apply BeanFactoryPostProcessors
               └── register BeanPostProcessors
               └── instantiate singleton Beans
```

---

## 2. Spring Bean 인스턴스 생성

Spring Bean 생명주기에서 **Bean 인스턴스 생성 단계**는 **컨테이너가 Bean 객체를 메모리에 생성하는 순간**으로, 전체 생명주기의 핵심이다. 이 단계에서 객체를 생성하는 방식, 순서, 그리고 확장 포인트를 제대로 이해하면 커스터마이징과 디버깅, 테스트에 유리하다.

Spring Bean 인스턴스 생성은 Spring 컨테이너가 **BeanDefinition의 메타정보**를 바탕으로 **new 키워드를 이용해 실제 객체를 생성**하는 과정이다.

### Bean 생성 단계 요약

1. `BeanDefinition` 등록 (설정 정보 기반)
2. 인스턴스 생성 (기본 생성자 or 팩토리 메서드)
3. `@Autowired`, `@Value` 기반 의존성 주입
4. Aware 인터페이스 처리 (`BeanNameAware`, `ApplicationContextAware` 등)
5. 초기화 콜백 처리 (`@PostConstruct`, `afterPropertiesSet()`, `init-method`)
6. 프록시 처리 (AOP가 적용되면 CGLIB 또는 JDK 프록시로 wrapping)

### 어떤 방식으로 Bean 인스턴스를 생성하나?

**기본 생성자 사용**

```java
@Component
public class MyService {
    public MyService() {
        System.out.println("생성자 호출됨");
    }
}
```

- 기본 생성자가 자동 호출됨 (리플렉션으로 `newInstance()` 수행)

**생성자 주입 (DI와 결합)**

```java
@Component
public class OrderService {
    private final ProductService productService;

    public OrderService(ProductService productService) {
        this.productService = productService;
        System.out.println("OrderService 생성자 호출됨");
    }
}
```

- `@Autowired` 없어도 단일 생성자면 자동 주입
- Spring이 의존 객체를 먼저 생성한 후, 생성자 호출 시 함께 주입

**팩토리 메서드로 생성**

```java
@Configuration
public class AppConfig {
    @Bean
    public ProductService productService() {
        return new ProductService();  // 개발자가 직접 인스턴스 생성
    }
}
```

- `@Bean` 메서드는 내부적으로 **팩토리 메서드 방식**으로 Bean을 생성함

### 내부 동작 흐름 (AbstractAutowireCapableBeanFactory)

```text
doCreateBean()  
   ↓
createBeanInstance()       ← 인스턴스 생성
   ↓
populateBean()             ← 의존성 주입
   ↓
initializeBean()           ← 초기화 콜백
   ↓
applyBeanPostProcessors()  ← 프록시 처리
```

------

## 3. 의존성 주입(DI)

DI는 스프링 프레임워크의 핵심 철학인 IoC(Inversion of Control)를 **구체적으로 구현**하는 방식이다. 이는 객체가 직접 필요한 의존 객체를 생성하거나 찾지 않고, 외부에서 주입받도록 하는 설계 원칙이다. 전통 방식에서는 A가 B를 new로 직접 생성하지만, DI 방식에서는 A가 B를 **외부(Spring Container)로부터 주입받는다.**

### 3.1. 스프링에서 DI 동작 흐름

```
1. 컨테이너가 BeanDefinition 파싱
2. 의존성 관계 파악 (생성자, 필드, 메서드)
3. 의존 대상 Bean 먼저 생성
4. 대상 객체에 주입 (@Autowired, @Inject, @Value 등)
```

### 3.2. 주요 DI 애노테이션

| 애노테이션                     | 설명                                                |
| ------------------------------ | --------------------------------------------------- |
| `@Autowired`                   | 스프링 DI 기본 애노테이션 (생성자, 필드, 세터 등)   |
| `@Qualifier("beanName")`       | Bean 이름으로 주입 (동일 타입이 여러 개일 때 사용)  |
| `@Value("${config.key}")`      | 프로퍼티 값 주입                                    |
| `@Inject`                      | JSR-330 표준 (자바 표준 DI), `@Autowired` 대체 가능 |
| `@Resource(name = "beanName")` | JDK 제공 (byName 주입)                              |

### 3.3. 내부 동작 구조

```text
Bean 생성 (AbstractAutowireCapableBeanFactory)
   ↓
populateBean()
   ↓
autowireByType or autowireByName
   ↓
dependencyDescriptor 생성
   ↓
resolveDependency()
   ↓
DI 대상 Bean 주입
```

### 3.4. 주의사항

| 상황             | 고려사항                                               |
| ---------------- | ------------------------------------------------------ |
| 빈이 순환참조    | 생성자 주입 시 오류 발생 (스프링 5 이후 디폴트로 금지) |
| 다형성 주입      | `@Qualifier`, `@Primary` 사용 필요                     |
| 선택적 의존성    | `@Autowired(required = false)` 또는 `Optional<T>` 사용 |
| 설정 클래스 주입 | `@ConfigurationProperties` 또는 `@Value` 사용          |

---

## 4. Bean 이름 설정 및 BeanFactory 설정

Spring Bean 생명주기에서 **"Bean 이름 설정"과 "BeanFactory 설정"** 단계는 Spring 컨테이너가 Bean을 생성한 뒤 **컨테이너 내부 메타정보**를 주입하는 과정이다. 이 과정은 일반적으로 `Aware` 인터페이스를 통해 제공된다.

이 단계에서 다음과 같은 역할을 한다.

> "너는 이름이 ‘orderService’이고, 현재 컨테이너는 이 BeanFactory/ApplicationContext야"
>  → Bean이 자신을 감싸고 있는 **Spring 컨테이너 환경 정보에 접근**할 수 있게 해준다.

Bean이 생성된 후, 의존성 주입을 마친 후, **초기화 콜백(`@PostConstruct`) 직전**에 발생한다.

### 4.1. 주요 인터페이스와 역할

| 인터페이스                | 역할                    | 설명                             |
| ------------------------- | ----------------------- | -------------------------------- |
| `BeanNameAware`           | Bean 이름 설정          | `setBeanName(String name)` 호출  |
| `BeanClassLoaderAware`    | 클래스 로더 정보 설정   | 주로 AOP 프록시 등에 사용됨      |
| `BeanFactoryAware`        | BeanFactory 주입        | 의존 객체 수동 조회 가능         |
| `ApplicationContextAware` | ApplicationContext 주입 | 이벤트 발행, 리소스 로딩 등 가능 |

### 4.2. 동작 순서 요약

```text
1. Bean 인스턴스 생성
2. 의존성 주입 (@Autowired)
3. setBeanName() 호출
4. setBeanFactory() 호출
5. setApplicationContext() 호출
6. 초기화 콜백 (@PostConstruct, InitializingBean 등)
```

### 4.3. 예제 코드

**예제 코드**

```java
@Component
public class MyBean implements BeanNameAware, BeanFactoryAware, ApplicationContextAware {

    @Override
    public void setBeanName(String name) {
        System.out.println("Bean 이름 설정됨: " + name);
    }

    @Override
    public void setBeanFactory(BeanFactory beanFactory) {
        System.out.println("BeanFactory 설정됨: " + beanFactory.getClass().getSimpleName());
    }

    @Override
    public void setApplicationContext(ApplicationContext context) {
        System.out.println("ApplicationContext 설정됨: " + context.getClass().getSimpleName());
    }
}
```

**실행 결과**

```text
Bean 이름 설정됨: myBean
BeanFactory 설정됨: DefaultListableBeanFactory
ApplicationContext 설정됨: AnnotationConfigApplicationContext
```

### 4.4. 실무 활용 예시

| 인터페이스                | 실무 활용 예                                                 |
| ------------------------- | ------------------------------------------------------------ |
| `BeanFactoryAware`        | 다른 Bean을 **동적으로 로딩** (`beanFactory.getBean(Class<T>)`) |
| `ApplicationContextAware` | `context.publishEvent()` 또는 `context.getResource()`        |
| `BeanNameAware`           | Bean을 Map으로 관리할 때, 이름 기준 식별 필요할 경우         |

---

## 5. 초기화 콜백

Spring에서 **초기화 콜백(Initialization Callback)**은 Bean이 생성되고 의존성 주입이 완료된 **직후에 초기화 로직을 실행하는 방법**이다. 즉, “모든 준비가 끝났을 때, 마지막으로 개발자가 하고 싶은 작업을 실행”하는 타이밍이다.

### 5.1. 동작 순서

```text
1. Bean 생성자 호출
2. @Autowired 등 의존성 주입
3. setBeanName(), setApplicationContext() 등 Aware 인터페이스
4. → @PostConstruct 호출
5. → InitializingBean.afterPropertiesSet() 호출
6. → init-method 호출
```

### 5.2. 초기화 콜백 방식 3가지

| 방법               | 선언 방식                        | 설명                                    | 우선순위 |
| ------------------ | -------------------------------- | --------------------------------------- | -------- |
| `@PostConstruct`   | 애노테이션                       | 가장 간단하고 실무에서 가장 많이 사용됨 | 1        |
| `InitializingBean` | 인터페이스                       | afterPropertiesSet() 메서드 오버라이드  | 2        |
| `init-method`      | XML or `@Bean(initMethod="...")` | 선언적 방법 (과거 사용)                 | 3        |

세 가지 방식중 하나로 구현이 가능하다. 만약 셋 다 구현해두었다면 위 순서대로 실행된다.

#### `@PostConstruct` – 가장 직관적이고 실무 권장 방식

```java
@Component
public class MyService {
    @PostConstruct
    public void init() {
        System.out.println("▶️ @PostConstruct 호출됨");
    }
}
```

- 의존성 주입이 끝난 직후 한 번만 호출됨
- 단, `private`이어도 호출 가능 (권장: `public` or `protected`)
- `javax.annotation` 또는 `jakarta.annotation` 패키지

#### `InitializingBean` 인터페이스

```java
@Component
public class MyService implements InitializingBean {
    @Override
    public void afterPropertiesSet() {
        System.out.println("▶️ afterPropertiesSet() 호출됨");
    }
}
```

- 직접 구현하면 스프링이 자동 호출
- 구현 시 `@PostConstruct`와 함께 쓰는 것보다 **둘 중 하나만 사용하는 것이 좋음**

#### `init-method` 방식

**Java Config**

```java
@Bean(initMethod = "init")
public MyService myService() {
    return new MyService();
}
```

**XML 방식**

```xml
<bean id="myService" class="com.example.MyService" init-method="init"/>
```

- 메서드 이름으로 지정
- 해당 메서드는 `public`이어야 하며 `void` 반환해야 함
- 애노테이션보다 덜 직관적 → **스프링 부트에서는 거의 사용하지 않음**

### 5.3. 실무 팁

| 팁                         | 설명                                                         |
| -------------------------- | ------------------------------------------------------------ |
| `@PostConstruct` 사용 권장 | 가장 직관적이며 테스트에도 적합                              |
| 테스트 시 주의             | `@PostConstruct`는 객체 생성 직후 실행되므로 단위 테스트에서는 mocking 어려울 수 있음 |
| 여러 개 중복 정의 x        | 한 Bean에 여러 초기화 방식 동시에 쓰지 말 것 (의도치 않은 호출 순서 발생 가능) |
| AOP와 충돌                 | `@PostConstruct`는 AOP Proxy 적용 전 호출됨 → `@Transactional`은 이 시점에는 **미적용** |

### 5.4. 요약

| 항목          | 설명                                                      |
| ------------- | --------------------------------------------------------- |
| **목적**      | Bean 생성 + 주입 후 초기화 작업 수행                      |
| **권장 방식** | `@PostConstruct`                                          |
| **실행 순서** | `@PostConstruct` → `afterPropertiesSet()` → `init-method` |
| **주의점**    | AOP 적용 전에 호출됨, 너무 많은 방식 중복 금지            |

------

## 6. Bean 사용

Spring Bean의 생명주기에서 **"Bean 사용" 단계**는 Bean이 생성되고 초기화된 이후, 실제 애플리케이션 로직 내에서 해당 Bean이 **의도된 기능을 수행하는 시점**을 의미한다. 이 단계는 개발자 입장에서는 가장 자연스럽게 경험하는 부분이며, Spring 프레임워크는 이 시점을 위해 모든 생명주기 관리 작업을 수행한다. 참고로, AOP Advice도 이 시점에 실행된다. `@PostContrcut` 시점에는 AOP가 적용되지 않으므로 주의하자.

예를 들어, 다음과 같은 내용들이 이 시점에 실행된다.

- `@Service`에서 `@Repository` 호출
- `@Controller`에서 `@Service` 호출
- `Scheduler`, `EventListener` 내부 로직 실행 등

### 6.1. 사용 방식 예시

**의존성 주입을 통해 사용하는 경우**

```java
@Service
public class OrderService {
    private final ProductService productService;

    @Autowired
    public OrderService(ProductService productService) {
        this.productService = productService;
    }

    public void order() {
        productService.reduceStock();
    }
}
```

- `OrderService`는 Spring 컨테이너가 생성한 Bean이고,
- 내부에서 `ProductService`라는 또 다른 Bean을 사용하고 있음

**`ApplicationContext`에서 직접 꺼내 사용하는 경우**

```java
@Component
public class ManualCaller implements ApplicationRunner {
    @Autowired
    private ApplicationContext context; // ApplicationContext 주입

    @Override
    public void run(ApplicationArguments args) {
        MyService myService = context.getBean(MyService.class);
        myService.execute();  // Bean 사용
    }
}
```

- 주로 테스트, 유틸성 코드, 동적 DI 필요 시 사용

**Scheduler, EventListener 등을 통한 간접 사용**

```java
@Component
public class MyScheduler {
    @Scheduled(fixedDelay = 5000)
    public void runScheduledTask() {
        System.out.println("Bean이 스케줄러에 의해 사용됨");
    }
}

@Component
public class EventConsumer {
    @EventListener
    public void handleEvent(MyEvent event) {
        System.out.println("이벤트 발생 시 Bean 사용됨");
    }
}
```

### 6.2. Bean 사용 시 특징

| 항목                             | 설명                                                         |
| -------------------------------- | ------------------------------------------------------------ |
| 싱글톤(Singleton)                | 기본 스코프에서는 여러 번 사용해도 하나의 인스턴스를 공유    |
| 트랜잭션                         | `@Transactional`이 붙은 메서드는 Spring AOP로 감싸진 후 사용됨 |
| AOP 적용                         | `@Cacheable`, `@Async`, `@Retryable` 등도 Bean 사용 시 자동 적용 |
| Thread Safety                    | 공유 자원이므로 상태를 가질 경우 **스레드 안전**에 주의 필요 |
| DI 컨텍스트 내부에서만 사용 가능 | Bean은 Spring 컨테이너가 관리해야 DI, AOP 등이 적용됨 (직접 new 금지) |

Bean은 DI 컨텍스트 내부에서만 사용 가능하므로 직접 new로 생성하는 것은 금지한다. new로 생성한 Bean 객체는 컨테이너가 관리하지 않기 때문에 AOP, DI, 라이프사이클에서 모두 정상 동작하지 않는다.

### 6.3. 실무 활용: Bean을 사용하는 대표적인 상황

| 상황             | Bean 사용 방식                                |
| ---------------- | --------------------------------------------- |
| 웹 요청 처리     | `@Controller` → `@Service` → `@Repository`    |
| 이벤트 기반 처리 | `@EventListener`, `ApplicationEventPublisher` |
| 비동기 작업      | `@Async` 붙은 메서드 호출                     |
| 배치/Scheduler   | `@Scheduled` 사용                             |
| 도메인 서비스    | `@Component` 또는 `@Service` 기반 Bean 호출   |

이외에도 싱글톤으로 하나의 객체만 생성해서 사용할만한 클래스라면 Bean으로 등록해놓고 사용할 수 있다. 다만, 공유 자원이므로 상태를 가질 경우 thread safe를 주의해야한다.

------

## 7. 소멸 콜백(Destroy Callback)

Spring Bean 생명주기에서 **소멸 콜백(Destroy Callback)**은 Spring 컨테이너가 종료될 때 **Bean이 자원을 반납하거나 정리(clean-up) 작업을 수행할 수 있도록 제공하는 마지막 기회**이다. 즉, 컨테이너가 “Bean은 이제 안 써. 정리해.”라고 알리는 시점입니다.

### 7.1. 소멸 콜백(Destroy Callback)이란?

Spring Bean이 컨테이너에서 제거되기 전에 호출되는 **정리(clean-up) 메서드**이다. (파일 닫기, DB 연결 해제, 스레드 종료, 로그 기록 등)

### 7.2. 소멸 콜백 방식 3가지

| 방식             | 선언 방법                             | 설명                          | 우선순위 |
| ---------------- | ------------------------------------- | ----------------------------- | -------- |
| `@PreDestroy`    | 애노테이션                            | 가장 간편하고 실무에서 권장됨 | 1️⃣        |
| `DisposableBean` | 인터페이스                            | `destroy()` 메서드 구현       | 2️⃣        |
| `destroyMethod`  | XML 또는 `@Bean(destroyMethod="...")` | 선언적 방식                   | 3️⃣        |

#### `@PreDestroy`

```java
@Component
public class MyBean {

    @PreDestroy
    public void preDestroy() {
        System.out.println("🧹 @PreDestroy 호출됨");
    }
}
```

- `javax.annotation.PreDestroy` 또는 `jakarta.annotation.PreDestroy`
- 컨테이너가 종료되기 직전에 호출됨
- Bean이 Spring에 의해 관리될 때만 동작

#### `DisposableBean` 인터페이스

```java
@Component
public class MyBean implements DisposableBean {
    @Override
    public void destroy() {
        System.out.println("🧹 DisposableBean.destroy() 호출됨");
    }
}
```

- `destroy()` 메서드 오버라이드
- `@PreDestroy`와 함께 사용 시 둘 다 호출됨 (`@PreDestroy` → `destroy()` 순)

#### `destroyMethod` 속성 (구식 또는 Java Config)

```java
@Bean(destroyMethod = "cleanup")
public MyBean myBean() {
    return new MyBean();
}
public class MyBean {
    public void cleanup() {
        System.out.println("🧹 destroy-method 호출됨");
    }
}
```

- `@PreDestroy`, `destroy()`와 달리 **빈 등록 시 명시적으로 메서드 이름 지정**

### 7.2. 소멸 콜백 주의사항

| 주의사항                                           | 설명                                             |
| -------------------------------------------------- | ------------------------------------------------ |
| 컨테이너 관리 밖의 객체는 콜백 실행 안 됨          | 직접 new 한 객체는 적용되지 않음                 |
| 프로토타입 스코프 Bean은 소멸 콜백이 호출되지 않음 | 수동으로 `destroy()` 호출해야 함                 |
| AOP 적용 전후와 무관                               | 소멸 콜백은 AOP와 충돌 없음                      |
| `@PreDestroy`는 예외 던지지 않는 것이 좋음         | 예외 시 다른 콜백 메서드가 실행되지 않을 수 있음 |

### 7.3. 스프링 부트에서 컨텍스트 종료 흐름

```text
Application 종료 시
  → ApplicationContext.close()
    → 모든 Singleton Bean 대상
        → @PreDestroy 호출
        → destroy() 호출
        → destroy-method 호출
```

### 7.4. 실제 사용 예시

| 사용 예          | 설명                               |
| ---------------- | ---------------------------------- |
| 커넥션 풀 정리   | HikariDataSource 등에서 연결 해제  |
| 파일/리소스 닫기 | `FileOutputStream.close()` 등      |
| 스레드 종료      | ExecutorService shutdown 등        |
| 캐시 삭제        | Redis 또는 local cache 메모리 해제 |

### 7.5. 요약

| 항목          | 설명                                                         |
| ------------- | ------------------------------------------------------------ |
| **정의**      | Spring 컨테이너가 종료되기 직전 실행되는 정리용 메서드       |
| **실행 시점** | ApplicationContext가 `close()` 될 때                         |
| **방법**      | `@PreDestroy` → `DisposableBean.destroy()` → `destroy-method` 순 |
| **권장 방식** | `@PreDestroy`                                                |
| **주의사항**  | 프로토타입 Bean에는 자동 호출 x                              |

---

## 8. 컨테이너 종료

Spring의 **컨테이너 종료(Container Shutdown)**는 Spring 애플리케이션이 종료될 때 발생하는 **마지막 생명주기 단계**로, 컨테이너가 내부 자원과 Bean을 **정리하고 안전하게 종료하는 과정**이다. 이 과정은 리소스 누수 방지, 외부 연결 종료, 작업 중단 등을 위한 핵심 시점이다. 이때 Spring `ApplicationContext`가 **더 이상 유효하지 않게 되며**, 내부적으로 관리되던 **Bean, 쓰레드, 커넥션 등의 자원을 안전하게 정리하는 과정**이다.

```
INFO - Shutting down ExecutorService 'applicationTaskExecutor'
INFO - Closing JPA EntityManagerFactory
INFO - Closing ApplicationContext
INFO - ApplicationContext closed and resources released
```

위와 같은 로그가 바로 이 시점에 출력되는 로그이다.

### 8.1. 컨테이너 종료 트리거 방식

| 트리거                            | 설명                                        |
| --------------------------------- | ------------------------------------------- |
| `Ctrl+C` 또는 `SIGTERM`           | JVM 종료 시 자동 감지                       |
| `context.close()`                 | `ConfigurableApplicationContext` 수동 종료  |
| `SpringApplication.exit(context)` | Spring Boot에서 명시적 종료                 |
| 내장 WAS 종료                     | `Tomcat/Jetty/Undertow` 종료 시 함께 종료됨 |

### 8.2. 종료 순서 흐름

```text
1. JVM 종료 요청 발생
2. Spring의 Shutdown Hook 동작 시작
3. ApplicationContext.close() 호출
4. SmartLifecycle Bean → stop() 호출
5. Singleton Bean → @PreDestroy, destroy() 호출
6. BeanPostProcessor 등 리소스 정리
7. 커넥션 풀, 쓰레드, 캐시 해제
8. JVM 종료
```

### 8.3. 종료 시 호출되는 주요 구성요소

| 순서 | 구성요소                   | 설명                                              |
| ---- | -------------------------- | ------------------------------------------------- |
| 1️⃣    | `SmartLifecycle.stop()`    | 비동기 작업 정지 (예: 스케줄러, KafkaListener 등) |
| 2️⃣    | `@PreDestroy`              | Bean 정리 로직 실행                               |
| 3️⃣    | `DisposableBean.destroy()` | 명시적 인터페이스 구현                            |
| 4️⃣    | `@Bean(destroyMethod=...)` | JavaConfig 또는 XML 기반 정리 메서드 호출         |
| 5️⃣    | `ContextClosedEvent`       | 애플리케이션 종료 알림 이벤트                     |

### 8.4. 예제 코드

**소멸 콜백 등록된 Bean**

```java
@Component
public class MyResource implements DisposableBean {
    @PreDestroy
    public void onPreDestroy() {
        System.out.println("🧹 @PreDestroy 실행됨");
    }

    @Override
    public void destroy() {
        System.out.println("🧹 DisposableBean.destroy() 실행됨");
    }
}
```

**종료 이벤트 리스너**

```java
@Component
public class ShutdownListener implements ApplicationListener<ContextClosedEvent> {
    @Override
    public void onApplicationEvent(ContextClosedEvent event) {
        System.out.println("📦 ApplicationContext 종료 감지됨");
    }
}
```

### 8.5. 실무에서 중요한 이유

| 이유           | 설명                                                 |
| -------------- | ---------------------------------------------------- |
| 자원 누수 방지 | DB 연결, Redis, 파일, 커넥션 풀을 반드시 정리해야 함 |
| 쓰레드 종료    | `@Async`, `@Scheduled` 스레드 풀 종료 필요           |
| 로그 수집      | 애플리케이션 종료 로그 출력 및 종료 시 상태 보고     |
| 상태 동기화    | 상태 저장, shutdown 알림 전송 등                     |

### 8.6. 주의사항

| 항목                                                     | 설명                                  |
| -------------------------------------------------------- | ------------------------------------- |
| 프로토타입(Prototype) Bean은 소멸 콜백 호출 x            | 직접 관리 필요                        |
| `@PreDestroy`는 예외 발생 시 중단 가능                   | 안정적으로 처리해야 함                |
| 쓰레드 풀 종료하지 않으면 JVM 종료 안 됨                 | `ExecutorService.shutdown()` 필수     |
| 강제 종료(`System.exit(0)`) 시 콜백 실행 안 될 수도 있음 | `Runtime.addShutdownHook()` 사용 고려 |

### 8.7. 요약 정리

| 항목            | 설명                                                         |
| --------------- | ------------------------------------------------------------ |
| **정의**        | Spring 컨테이너가 Bean과 리소스를 안전하게 정리하고 종료하는 과정 |
| **트리거**      | JVM 종료, `context.close()`, `SpringApplication.exit()` 등   |
| **순서**        | `SmartLifecycle.stop()` → `@PreDestroy` → `destroy()` → `ContextClosedEvent` |
| **주의**        | 비동기 작업, 커넥션, 쓰레드 종료 누락 주의                   |
| **실무 포인트** | 상태 저장, 알림 전송, 외부 연결 해제, shutdown log 처리      |
