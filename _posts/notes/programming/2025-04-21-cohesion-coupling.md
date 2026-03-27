---
title: "응집도와 결합도에 관하여: About Cohesion and Coupling"
date: 2025-04-21
categories: [Archive, Programming]
tags: [Cohesion, Coupling]
---

**응집도와 결합도**를 이야기하기에 앞서, 자주 나오는 **"모듈(Module)"**이라는 단어가 정확히 어떤 의미인지 정리해보았다.

# 모듈(Module)

## 모듈(Module)이란?

> **모듈**은 소프트웨어를 구성하는 **기능적 단위 또는 구성 단위**로, 관련된 코드(클래스, 함수, 설정 등)를 **의미 있게 묶은 단위**를 말한다.
>
> In computer [software](https://www.techtarget.com/searchapparchitecture/definition/software), a module is an extension to a main program dedicated to a specific function. In programming, a module is a section of [code](https://www.techtarget.com/whatis/definition/code) that is added in as a whole or is designed for easy reusability.

이론적인 정의에 의하면 **관련된 것들의 의미있는 묶음**이라고 한다. 정의 자체가 애매모호한 면이 있다.

## 모듈의 대표적 정의 (관점별)

| 관점 | 의미 |
|------|------|
| **코드 관점** | 하나의 패키지, 클래스 묶음, JAR, 프로젝트 디렉토리 등 |
| **배포 관점** | 별도 배포 가능한 유닛 (ex. Microservice, JAR, WAR) |
| **기능 관점** | 사용자 관리, 주문 처리, 결제 등 **기능 단위** |
| **아키텍처 관점** | Bounded Context, Layered Architecture의 영역 |
| **빌드/의존성 관점** | Gradle의 `:user`, `:order`처럼 분리된 서브 프로젝트 |

---

## 예시로 보는 다양한 모듈의 형태

### 1. Java/Spring에서의 모듈

자바에서 모듈이란 보통 독립적으로 배포될 수 있는 코드의 단위를 말한다. 그 단위는 보통 패키지 단위로 이루어진다.

```plaintext
com.example.user       ← 사용자 기능 모듈
com.example.payment    ← 결제 기능 모듈
com.example.product    ← 상품 기능 모듈
```

- 각 패키지는 하나의 **모듈 역할** 수행
- 기능 중심으로 응집되어 있음 → 응집도 ↑

---

### 2. Gradle 기반 멀티 모듈 프로젝트
```plaintext
root-project
├── user-service     ← 사용자 관련 모듈
├── order-service    ← 주문 처리 모듈
├── common-library   ← 공통 유틸/도메인
```

- 각 서브 프로젝트는 **독립 컴파일**, **의존성 명시**, **독립 배포 가능**
- 이 경우 모듈 간 **결합도**는 build.gradle의 의존성으로 드러남

---

### 3. 마이크로서비스에서의 모듈

MSA 구조에서는 각 서비스가 독립된 모듈의 의미를 갖는다.

```plaintext
[User Service] ← 독립 모듈
[Order Service] ← 독립 모듈
[Payment Service] ← 독립 모듈
```

- 각각이 하나의 **서버**, **DB**, **컨텍스트**를 갖는 완전한 모듈
- Kafka, REST, gRPC 등의 메시지를 통해 통신

---

## 응집도/결합도와 모듈의 관계

| 개념 | 정의 | 예시 |
|------|------|------|
| **모듈의 응집도** | 모듈 내부의 컴포넌트들이 얼마나 **같은 목적**을 수행하는가 | `user` 모듈이 인증, 회원가입, 로그인만 담당 |
| **모듈 간 결합도** | 한 모듈이 다른 모듈의 내부를 얼마나 **알고/의존**하는가 | `order` 모듈이 `user` DB를 직접 조회하면 결합도 ↑ |

---

# 응집도와 결합도

## 응집도 (Cohesion)

> **하나의 모듈 내부 구성 요소들이 얼마나 밀접하게 관련되어 있는가?**

### 정의
- 한 모듈 안의 기능, 클래스, 메서드 등이 **하나의 목적/책임**을 중심으로 얼마나 밀접하게 모여 있는지를 나타냅니다.
- 응집도가 높을수록 모듈이 **하나의 일만 잘 함**.

### 응집도 수준 (낮음 → 높음)
| 수준 | 설명 |
|------|------|
| Coincidental (우연적) | 관련 없는 기능이 모여 있음 |
| Logical (논리적) | 유사한 성격의 기능이 모여 있으나 하나로 분리 안 됨 (e.g. if-else로 선택) |
| Temporal (시간적) | 실행 시점이 비슷한 기능 묶음 (e.g. 초기화 코드 모음) |
| Procedural (절차적) | 특정 절차에 따라 실행되는 기능 묶음 |
| Communicational (통신적) | 동일한 데이터에 접근하는 기능 묶음 |
| Sequential (순차적) | 앞 기능의 출력이 다음 기능의 입력 |
| Functional (기능적) | **하나의 명확한 기능 수행 (가장 이상적)** |

### 예시
```java
// 높은 응집도: 한 클래스가 사용자 로그인만 담당
class AuthService {
    boolean login(String username, String password) {
        // 인증 로직
    }

    void logout() {
        // 로그아웃 로직
    }
}
```

---

## 결합도 (Coupling)
> **모듈 간의 상호 의존성이 얼마나 강한가?**

### 정의
- 하나의 모듈이 다른 모듈에 **얼마나 많이 의존하는가**, 얼마나 많이 **알고 있어야 하는가**를 나타냅니다.
- 결합도가 낮을수록 **유지보수와 확장성이 좋음**.

### 결합도 수준 (높음 → 낮음)
| 수준 | 설명 |
|------|------|
| Content (내용 결합) | 다른 모듈 내부를 직접 참조 (가장 나쁨) |
| Common (공통 결합) | 전역 변수 공유 |
| External (외부 결합) | 외부 장치나 포맷 의존 |
| Control (제어 결합) | 제어 플래그를 전달하여 실행 흐름을 제어 |
| Stamp (스탬프 결합) | 구조체나 객체 전체를 전달 (일부 정보만 필요해도) |
| Data (데이터 결합) | 필요한 데이터만 인자로 전달 (이상적) |
| Message (메시지 결합) | 메시지 기반 통신 (ex. 이벤트, MQ 등. 가장 이상적) |

### 예시
```java
// 낮은 결합도: 인터페이스에만 의존
class UserService {
    private final UserRepository repo;

    UserService(UserRepository repo) {
        this.repo = repo;
    }

    void registerUser(User user) {
        repo.save(user); // repo가 어떻게 저장하는지는 알 필요 없음
    }
}
```

---

## 요약 비교

| 구분 | 응집도 (Cohesion) | 결합도 (Coupling) |
|------|------------------|-------------------|
| 의미 | 모듈 내부의 응집성 | 모듈 간의 의존성 |
| 목표 | **높을수록 좋음** | **낮을수록 좋음** |
| 좋은 설계 | 한 가지 일만 잘 함 | 외부에 덜 의존함 |
| 대표 사례 | 기능별 클래스 | 인터페이스 활용 |

---

## 응집도를 높이는 방법 (Cohesion ↑)

> 하나의 클래스/모듈이 **하나의 책임(Single Responsibility)**에 집중하게 만들어라

### 방법 1. SRP 원칙 적용 (단일 책임 원칙)
- 클래스나 메서드는 **하나의 일만** 하도록 분리
- 👎 Bad:
  ```java
  class UserService {
      void registerUser() {...}
      void validateUser() {...}
      void sendEmail() {...}
  }
  ```
- 👍 Good:
  ```java
  class UserValidator { void validate() {...} }
  class EmailSender { void send() {...} }
  ```

---

### 방법 2. 기능별로 레이어 분리
- Controller, Service, Repository, Domain, Validator 등으로 역할 분리
- 계층별로 **비슷한 목적의 기능끼리** 묶음 → 기능적 응집도 상승

---

### 방법 3. 관련 데이터와 메서드를 함께 묶기 (객체지향)
- 객체의 상태(`field`)와 동작(`method`)을 한곳에 모아 관리

```java
class Order {
    private List<Item> items;
    public BigDecimal calculateTotal() { ... } // 응집도 ↑
}
```

---

### 방법 4. 유틸성/도우미 클래스 분리
- 공통 관심사 로직을 `Utils`, `Helpers`, `Converter`, `Mapper`로 분리
- 단, 너무 범용적이면 오히려 응집도가 낮아질 수 있음 (주의)

---

## 결합도를 낮추는 방법 (Coupling ↓)

> 클래스가 다른 클래스에 **직접적으로 의존하지 않도록** 만들어라

---

### 방법 1. 인터페이스에 의존 (의존 역전 원칙, DIP)

- 👎 Bad: 구체 구현에 의존
  ```java
  class PaymentService {
      private final KakaoPayClient client = new KakaoPayClient();
  }
  ```

- 👍 Good: 인터페이스에 의존
  ```java
  interface PayClient {
      void pay();
  }
  
  class KakaoPayClient implements PayClient { ... }
  
  class PaymentService {
      private final PayClient client;
  
      public PaymentService(PayClient client) {
          this.client = client;
      }
  }
  ```

---

### 방법 2. DI (의존성 주입) 사용

- Spring에서는 생성자 주입을 통해 외부에서 주입 → 결합도 낮아짐
```java
@Service
public class OrderService {
    private final OrderRepository orderRepository;

    public OrderService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }
}
```

---

### 방법 3. 이벤트 기반 구조 (관심사 분리)

- 직접 호출 대신 **이벤트를 발행** → 관심 있는 모듈이 처리
- 이벤트를 사용하면 **모듈 간 직접 의존을 제거**할 수 있음

```java
// 발행
publisher.publishEvent(new UserRegisteredEvent(user));

// 처리
@EventListener
public void handleUserRegistered(UserRegisteredEvent event) {
    emailService.sendWelcomeEmail(event.getEmail());
}
```

---

### 방법 4. API 게이트웨이, 메시지 브로커 활용 (시스템 간 결합도 낮춤)

- 마이크로서비스에서는 Kafka, RabbitMQ, gRPC, REST API 등으로 메시지 기반 연결
- 직접 호출을 줄이고, 서비스 간 유연한 연결 가능

---

## 보너스: 코드 설계 관점 정리표

| 목표 | 실천 방법 | 키워드 |
|------|-----------|--------|
| 응집도 높이기 | SRP, 기능 단위 모듈화 | `Service`, `Validator`, `Domain Logic` |
| 결합도 낮추기 | 인터페이스, DI | `@Component`, `@Service`, `@Autowired` |
| 모듈 분리 | 이벤트 기반 | `ApplicationEventPublisher`, `@EventListener` |
| 시스템 결합도 낮추기 | 메시지 브로커 | `Kafka`, `RabbitMQ`, `WebHook` |

---

## 마무리 팁

- 클래스가 "이 일을 해야 하나?" 물었을 때 "YES"가 하나만 나와야 응집도가 높은 것
- 어떤 기능을 수정하려고 할 때 여러 클래스를 같이 바꿔야 한다면 결합도가 높은 것

---

# 응집도와 결합도의 대상 범위

## 대상 범위에 따른 응집도와 결합도의 의미

| 적용 대상 | 응집도 의미 | 결합도 의미 | 예시 |
|-----------|-------------|--------------|------|
| **메서드 단위** | 한 메서드가 하나의 명확한 기능만 수행하는가 | 내부에서 다른 메서드나 상태를 얼마나 의존하는가 | `calculateDiscount()` 메서드가 여러 계산과 로깅을 섞어 하지 않는가 |
| **클래스 단위** | 클래스가 하나의 책임만 수행하는가 (SRP) | 다른 클래스와 얼마나 밀접하게 연결되어 있는가 | `UserService`가 DB, Email, File 모두 처리하면 응집도 ↓, 결합도 ↑ |
| **패키지/모듈 단위** | 기능적으로 유사한 컴포넌트가 한 모듈에 있는가 | 모듈 간 의존성이 얼마나 있는가 | `user`, `payment`, `notification` 모듈이 서로 직접 호출하면 결합도 ↑ |
| **마이크로서비스 단위** | 서비스가 하나의 Bounded Context에 집중하는가 | 서비스 간 데이터/API 의존성이 얼마나 강한가 | 결제 서비스가 주문 DB에 직접 접근하면 결합도 ↑ |
| **시스템 아키텍처 단위** | 도메인별 시스템 책임이 명확한가 | 시스템 간 통신이 loosely coupled한가 | Kafka, gRPC, REST를 적절히 사용해 시스템 간 결합도를 조절함 |

---

## 예시로 살펴보는 계층별 적용

### 1. 메서드 수준 – 응집도

```java
// ❌ 나쁜 예: 너무 많은 책임
void processUser(User user) {
    validate(user);
    save(user);
    sendEmail(user);
    auditLog(user);
}

// ✅ 좋은 예: 단일 책임
void validate(User user) { ... }
void save(User user) { ... }
```

---

### 2. 클래스 수준 – 응집도 & 결합도

```java
// ❌ 나쁜 예
class UserService {
    EmailSender emailSender = new EmailSender(); // 강한 결합
    void register(User user) {
        ...
        emailSender.send(user);
    }
}

// ✅ 좋은 예: 인터페이스 기반 결합도 ↓
class UserService {
    private final EmailSender emailSender;
    public UserService(EmailSender emailSender) {
        this.emailSender = emailSender;
    }
}
```

---

### 3. 모듈/패키지 수준

- `user`, `product`, `order` 패키지가 서로의 internal 클래스를 직접 import하면 → 결합도 ↑
- `user.controller`, `user.service`, `user.domain`으로 구성되면 → 응집도 ↑

---

### 4. 마이크로서비스 수준

```plaintext
[Order Service] ---Kafka--> [Inventory Service]
            \
             \--REST--> [Payment Service]
```

- 이벤트 기반 통신 (Kafka): **결합도 낮춤**
- REST 동기 호출: 적절하면 OK, 하지만 과도하면 **결합도 ↑**

---

## 요약

| 수준 | 응집도 높이는 전략 | 결합도 낮추는 전략 |
|------|-------------------|--------------------|
| 메서드 | 한 기능만 수행 | 최소한의 의존 호출 |
| 클래스 | SRP, 상태+행동 묶기 | 인터페이스, DI, AOP |
| 모듈 | Bounded Context | 외부 API 최소화, 헥사고날 구조 |
| 시스템 | DDD Context 유지 | Kafka, Event, REST 분리 |

---

응집도와 결합도는 단일 함수에서부터 전체 시스템 아키텍처까지 **모든 수준에서 적용되는 개념**이다.

---

# **_'높은 응집도, 낮은 결합도'_**에 대한 오해와 사실

흔히 소프트웨어의 좋은 설계를 위해서 높은 응집도와 낮은 결합도를 언급한다. 하지만 실제 소프트웨어와 시스템은 단순히 "이 시스템은 높은 응집도와 낮은 결합도를 가진 시스템이군!"이라고 명확하게 단정짓기가 어렵다. 

> "High cohesion, low coupling" is one of the most misunderstood principles in software engineering.
>
> - **Cohesion** is about the internal focus of a thing - how well its components work together to fulfil a **single purpose**.
> - **Coupling** is about the external relationships between things - how much they **depend** on one another.
>
> When applied to a **code module**, cohesion measures how closely related its functions are. For example, **a Utils module likely has low cohesion** as it's typically a dumping ground for unrelated helper functions.
>
> When applied to a **system**, cohesion measures how much its components (services, subsystems, etc.) are **aligned towards achieving a single goal.**
>
> A service with well-defined boundaries and responsibilities will likely have high cohesion. Conversely, a **User service** that handles authentication, account management and sending notifications about account updates has **low cohesion** as it handles many unrelated responsibilities.
>
> What about coupling?
>
> A good way to think about coupling is in terms of **change propagation**. That is, how much does System B need to change if we change System A.
>
> Coupling is everywhere and comes in many different forms: https://lnkd.in/ehVD2N3r
>
> Some coupling (e.g. data format dependency) requires coordinated changes between systems.
>
> Other forms of couplings are less obvious but are even more problematic to deal with.
>
> For example, temporal coupling links the availability of one service to another. This often leads to **cascade failures** and necessitates other practices (e.g. retries, exponential backoff, fallbacks, chaos engineering and so on) to mitigate.
>
> So there you have it, the difference between "Cohesion" and "Coupling".
>
> They measure similar but, ultimately, different qualities in software.
>
> _source: ["High cohesion, low coupling" is one of the most misunderstood principles in software engineering.](https://www.linkedin.com/posts/theburningmonk_high-cohesion-low-coupling-is-one-of-the-activity-7282296949469286400-vx42?utm_source=share&utm_medium=member_desktop&rcm=ACoAADEqc_gBVpLfRzgxCVge7Ge1NqR1JkkM-gs)_

위의 글처럼 응집도와 결합도는 다차원적으로 해석해야하며, 관점에 따라 그 척도가 달라질 수 있다. 특히 결합도에 대한 고찰을 다차원적으로 설명한 글이 있어서 가져와 보았다.

---

Gregor Hohpe의 글 **“The Many Facets of Coupling”**은 소프트웨어 아키텍처에서 자주 언급되는 **결합도(Coupling)** 개념을 **다차원적으로** 분석하며, 단순히 "결합도는 낮을수록 좋다"는 통념을 넘어서는 통찰을 제공한다.

> ## 결합도란 무엇인가?
>
> 결합도는 **시스템 간의 독립적인 변화 가능성**을 측정하는 지표로, 한 시스템의 변경이 다른 시스템에 영향을 미치는 정도를 나타낸다. 즉, 시스템 A의 변경이 시스템 B에 영향을 준다면, A와 B는 해당 변경에 대해 결합되어 있다고 볼 수 있다.
>
> ## 결합도는 이진적이지 않다
>
> 결합도는 단순히 "결합됨" 또는 "결합되지 않음"으로 나뉘는 이진적인 속성이 아니다. 실제로는 다양한 정도와 형태로 존재하며, 이를 이해하는 것이 중요하다. 예를 들어, 메서드 이름 변경과 같은 기능적 변경은 현대 IDE의 리팩토링 기능으로 쉽게 관리할 수 있지만, **시스템 간의 위치 변경이나 데이터 형식 변경은 더 큰 영향을 미칠 수 있다.**
>
> ## 결합도의 다양한 측면
>
> 결합도는 여러 차원에서 발생할 수 있으며, 주요 측면은 다음과 같다.
>
> 1. **기술적 결합(Technology Coupling)** 시스템이 동일한 기술 스택에 의존할 때 발생한다. 예를 들어, Java RMI나 .NET Remoting과 같은 특정 기술에 의존하면, 다른 기술로의 전환이 어렵다.
> 2. **위치 결합(Location Coupling)** 시스템이 통신 상대의 물리적 위치(IP 주소 등)에 의존할 때 발생한다. 동적 디렉토리 조회나 메시지 채널을 사용하면 이러한 결합을 줄일 수 있다.
> 3. **데이터 형식 결합(Data Format Coupling)** 시스템 간에 교환되는 데이터의 형식에 대한 의존성이다. 고정된 이진 형식보다 XML이나 JSON과 같은 유연한 형식을 사용하면 결합도를 낮출 수 있다.
> 4. **시간적 결합(Temporal Coupling)** 시스템이 동기적으로 통신할 때 발생한다. 한 시스템의 지연이나 장애가 다른 시스템에 직접적인 영향을 미칠 수 있습니다. 비동기 메시징을 통해 이러한 결합을 완화할 수 있다.
> 5. **프로그래밍 모델 결합(Programming Model Coupling)** 시스템이 동일한 객체 모델이나 클래스 구조에 의존할 때 발생한다. 문서 기반의 메시징은 이러한 결합을 줄이는 데 도움이 된다.
>
> ## 결합도와 통제력의 관계
>
> 적절한 결합도의 수준은 시스템 간의 **통제력에 따라 달라진다.** 모든 구성 요소를 완전히 통제할 수 있다면, 더 높은 결합도를 감수할 수 있다. 그러나 **외부 시스템**이나 **제3자 서비스**와 통합할 때는 **낮은 결합도**를 유지하는 것이 중요하다.
>
> ## 결합도 관리의 실용적 접근
>
> 결합도를 효과적으로 관리하기 위해서는 예상되는 변경 사항의 가능성과 영향을 평가하고, 이에 따라 적절한 수준의 결합도를 설계해야 한다. 예를 들어, 기술 스택의 변경 가능성이 높다면 기술적 결합을 줄이는 방향으로 설계해야 한다.
>
> ## 결론
>
> 결합도는 단순히 낮추는 것이 목표가 아니라, 시스템의 요구사항과 변경 가능성에 따라 **적절한 수준의 결합도를 설계**하는 것이 중요하다. 왜냐하면 결합도를 제거하기 위해서 실행한 변경사항이 자칫 시스템에 큰 장애로 이어질 수 있기 때문이다. 이를 위해 결합도의 다양한 측면을 이해하고, 시스템 간의 통제력을 고려한 설계 전략을 수립해야 한다.
>
> _출처: [The Many Facets of Coupling](https://www.enterpriseintegrationpatterns.com/ramblings/coupling_facets.html)_

이처럼 응집도와 결합도는 환경과 상황에 따라 다차원적으로 해석하고 측정할 수 있어야하며, 이를 바탕으로 가장 적절한 선택을 하는것이 바람직하다.

------

# 실무에서의 응집도와 결합도에 대한 접근법

실제로 실무에서 엔지니어로서 일을 하다보면, 응집도보다는 결합도에 대한 언급을 더 자주하게된다. 분명히 DDD, 객체지향, SOLID, 캡슐화 등 응집도에도 큰 비중을 두는 이론을 공부하면서 실무에서 막상 일을해보면, 많은 회사에서 응집도에 대한 논의보다 결합도에 대한 논의가 더 집중적으로 이루어지며, 종종 언급되는 상황이 발상한다. 왜일까?

## 왜 "응집도"보다 "결합도"가 더 자주 언급되는가?

| 구분           | 응집도 (Cohesion)                           | 결합도 (Coupling)                                   |
| -------------- | ------------------------------------------- | --------------------------------------------------- |
| 핵심 질문      | 이 모듈이 하나의 일만 잘 하고 있는가?       | 이 모듈이 다른 모듈과 얼마나 연결되어 있는가?       |
| 주요 이슈      | 클래스 내부가 너무 비대하거나 책임이 불명확 | 변경 전파, 장애 전파, 테스트 불가능 등              |
| 문제 발생 빈도 | 구조 설계 초기, 리팩토링 시 고려됨          | 실시간 장애, 변경 실패, 서비스 불안정에서 자주 발생 |
| 측정·판단      | 정적 분석 또는 리뷰로 비교적 쉬움           | 런타임 분석, 변경 영향 분석 등 동적 판단이 필요     |
| 실무 체감도    | 상대적으로 낮음                             | 상대적으로 높음 (서비스 간 API 의존, 배포 영향 등)  |

위의 비교표에서 볼 수 있듯이 응집도가 다루는 주요 이슈보다 결합도에 의해서 드러나는 이슈가 훨씬 **심각하며 파급력이 크다.** 이는 우리가 응집도 보다는 "강결합되어서 문제가 있다."라는 등 결합도에 대한 언급을 더 자주하게 되는 이유일 것이다.

현실적인 결합도 문제 예시들을 살펴보자.

- REST API 변경 → 하위 시스템 오류 발생
  - A 시스템에서 필드 이름 하나 바꿨는데, B, C, D 서비스가 모두 장애
- 마이크로서비스 간 강한 의존 → 장애 전파
  - 인증 서비스가 죽으면 전 서비스가 로그인 검증 못 해서 전체 다운
- 테스트 시 다른 모듈 없으면 동작 안 함
  - 단위 테스트를 하려는데 다른 컴포넌트도 같이 띄워야 함 (Mock 없이 테스트 불가)

## 그럼 응집도는 덜 중요한가?

그렇지는 않다. 응집도는 결합도 못지않게 중요하다. 다만, 응집도는 개발자의 역량과 기본기에 연관된 부분이 많아서 티가 잘 안 날뿐이다.

- **응집도는 설계 품질의 기반**이다. 응집도가 높아야 **각 모듈이 독립적으로 발전**할 수 있고,
- **결합도를 낮추는 것**은 전제 조건으로 **응집된 모듈이 존재**해야 가능한 일이다.

응집도는 상대적으로 **정적인 설계 품질 지표**이고, 결합도는 **동적인 운영 문제 및 변경 위험성의 핵심 요인**이라는 점에서 실무에서는 더 자주, 더 중요하게 다뤄지는 경향이 있다.

비유로 이해하자면 **응집도**는 **장인의 작업 공간 정리**와 같다. 도구들이 기능별로 잘 모여 있으면 효율적이지만, 작업 자체에는 즉각 문제가 안 생긴다. 반면, **결합도**는 **도구 간 전선 연결**이야. 한 전선이 끊어지면 다른 도구가 작동을 안 하는 상황에서는 **문제가 즉시 발생한다.**

응집도는 설계 품질을 높이고 유지보수성을 확보하며, 결합도는 변경에 따른 위험, 장애 전파의 핵심 요인이다. 실무 고려 우선순위는 결합도 → 응집도 순으로 중요도가 체감되는 것이 보통이다. 하지만 응집도 없는 결합도 관리도 의미가 없으므로 균형이 필요하다.

## 추천 실무 접근법

- 설계 초기: **기능 중심 응집도**에 집중 (SRP, DDD, 헥사고날 아키텍처, 캡슐화 등)
- 개발 중/운영 중: **결합도 모니터링 및 최소화**에 집중 (인터페이스 분리, 메시지 브로커, Retry/Timeout 설계 등)
- 변경/리팩토링 시: **응집도 재조정 + 결합도 완화 병행**

---

# 참고자료

- [The Many Facets of Coupling](https://www.enterpriseintegrationpatterns.com/ramblings/coupling_facets.html)
- ["High cohesion, low coupling" is one of the most misunderstood principles in software engineering.](https://www.linkedin.com/posts/theburningmonk_high-cohesion-low-coupling-is-one-of-the-activity-7282296949469286400-vx42/)
- [Low Coupling, High Cohesion](https://medium.com/clarityhub/low-coupling-high-cohesion-3610e35ac4a6)