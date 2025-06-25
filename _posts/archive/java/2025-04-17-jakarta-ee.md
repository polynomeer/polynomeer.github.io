---
title: Jakarta EE 기업용 Java의 진화
date: 2025-04-17
categories: [Archive, Java]
tags: [Java, Jakarta EE]
---

# ☕ Jakarta EE: 기업용 Java의 진화

---

**Jakarta EE**는 단순히 Java EE의 새로운 이름 그 이상이다. Jakarta EE는 **기업용 Java 기술의 차세대 플랫폼**이며, Java 생태계의 역사, 오픈소스 전환, 그리고 기술적 혁신의 상징이다. 아래에서 Jakarta EE의 **역사**, **구성**, **차이점**, **실무 적용**까지 체계적으로 설명한다.

## 1. Jakarta EE란 무엇인가?

> **Jakarta EE는 Java EE의 후속 오픈소스 플랫폼으로, Eclipse Foundation에서 운영하는 엔터프라이즈 Java 표준입니다.**

### 기본 개념
- 대규모 기업 애플리케이션 개발을 위한 **서버 사이드 Java 표준 플랫폼**
- REST API, 웹소켓, 트랜잭션, 보안, 메시징, DI 등 엔터프라이즈 기능을 제공
- **Spring**의 핵심 아이디어 대부분도 Jakarta EE 기반에서 영향을 받음

---

## 2. Jakarta EE의 역사

| 시점 | 내용 |
|------|------|
| 1999~2017 | Oracle(Sun) 주도로 **Java EE** 운영 (JSR 기반) |
| 2017 | Oracle, Java EE를 Eclipse Foundation에 기증 |
| 2018 | **Jakarta EE** 브랜드 출범 |
| 2020 | **`javax.*` → `jakarta.*` 패키지명 전환** (상표 문제) |
| 2022~ | Jakarta EE 9, 10 릴리스 (Spring Boot 3.x와 연계 시작) |

Jakarta EE는 Java EE와 동일한 기술 사양을 계승하면서, **오픈소스화 + 커뮤니티** 주도 개발로 전환된 플랫폼이다.

---

## 3. Jakarta EE 주요 구성 요소

| 명세 | 설명 | 예시 |
|------|------|------|
| **Jakarta Servlet** | HTTP 요청/응답 처리 | `@WebServlet`, 필터 |
| **Jakarta Persistence** | ORM 기반 JPA | `@Entity`, `@Id`, `EntityManager` |
| **Jakarta Validation** | Bean Validation | `@NotNull`, `@Email` |
| **Jakarta RESTful Web Services (JAX-RS)** | REST API 구현 | `@GET`, `@POST`, `@Path` |
| **Jakarta Faces (JSF)** | 서버 기반 UI 구성 | XHTML 기반 UI |
| **Jakarta CDI** | 의존성 주입 (DI) | `@Inject`, `@RequestScoped` |
| **Jakarta Transactions** | 트랜잭션 처리 | `@Transactional` |
| **Jakarta Messaging (JMS)** | 메시징 API | JMS queue/topic |

Jakarta EE는 **모듈형 명세 구조**로, 필요한 기능만 조합하여 사용할 수 있다.

---

## 4. Java EE vs Jakarta EE 차이점

| 항목 | Java EE | Jakarta EE |
|------|---------|------------|
| 운영 주체 | Oracle (JCP) | Eclipse Foundation |
| 표준화 방식 | JSR (Java Specification Request) | JESP (Jakarta EE Specification Process) |
| 패키지명 | `javax.*` | `jakarta.*` |
| 라이선스 | 일부 상용 성격 포함 | **완전한 오픈소스** |
| 개발 속도 | 느림, 폐쇄적 | 빠르고 커뮤니티 주도 |
| 호환성 | Java EE 8까지 | Jakarta EE 9 이상 |

### 핵심 전환 포인트
Java EE → Jakarta EE 전환 시 가장 큰 변화는 **패키지명 전환(`javax` → `jakarta`)**이다. 이로 인해 **Spring Boot 3.x**, **TomEE**, **Payara**, **WildFly** 등 모든 구현체가 이를 기반으로 다시 구성되었다.

---

## 5. Jakarta EE vs Spring Framework

| 항목 | Jakarta EE | Spring Framework |
|------|------------|------------------|
| 표준 or 구현 | 표준 명세 (API 정의) | 구현체이자 프레임워크 |
| 주체 | Eclipse Foundation | Pivotal (→ VMware) |
| 주 용도 | WAS 기반 엔터프라이즈 앱 | 범용 Java 개발 |
| DI 방식 | CDI (Contexts and Dependency Injection) | 자체 DI 컨테이너 |
| 애플리케이션 실행 방식 | WAR 배포 방식 or Jakarta Servlet | 주로 embedded 서버 (Spring Boot) |

Spring은 Jakarta EE 명세(JPA, Validation 등)를 내부적으로 사용하며, Spring Boot 3부터는 **Jakarta EE 10 완전 호환**이 필수이다. Jakarta만으로도 웹 서버를 구현할 수 있도록 지원하는데, 특별한 이점이 있지 않는한 웹 프레임워크는 대부분 Spring을 기반으로 하면서 자바 코드 중 일부만 Jakarta EE를 조합해서 사용하는 경우가 많을 것으로 예상된다. 아래의 글에서는 서로가 경쟁관계가 아니라고 평가하는 전문가의 말을 인용하였다.

> *It’s important to note that Spring/SpringBoot is reliant on Jakarta EE developments for its operation and is **not necessarily competitive with Jakarta EE**. Both are critical ingredients to the healthy enterprise Java ecosystem.*
>
> _[**The Eclipse Foundation Releases 2023 Jakarta EE Developer Survey Report**](https://www.i-programmer.info/news/80-java/16614-the-eclipse-foundation-releases-2023-jakarta-ee-developer-survey-report.html)_

---

## 6. Jakarta EE 실무 적용 예시

Jakarta EE만으로도 충분히 웹 기반의 API 서버를 구현할 수 있다. 아래의 예시코드를 보면 다소 생소하지만 깔끔한 코드로 보인다.

### REST API 구성 (JAX-RS 기반)

```java
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/hello")
public class HelloResource {
    @GET
    @Produces(MediaType.TEXT_PLAIN)
    public String sayHello() {
        return "Hello from Jakarta EE!";
    }
}
```

### 엔티티 구성 (JPA)

```java
import jakarta.persistence.*;

@Entity
public class User {
    @Id
    @GeneratedValue
    private Long id;

    @Column(nullable = false)
    private String username;
}
```

### Bean Validation

Bean validation은 JSR-380을 마지막으로 버전 이름도 Jakarta Validation x.x 으로 변경되었다. -> https://beanvalidation.org/

```java
import jakarta.validation.constraints.NotBlank;

public class SignupForm {
    @NotBlank
    private String email;
}
```

---

## 7. Jakarta EE 구현체 예시

| 구현체 | 설명 |
|--------|------|
| **Eclipse GlassFish** | Jakarta EE 공식 레퍼런스 구현체 |
| **Payara Server** | 상용 지원이 있는 Jakarta EE WAS |
| **WildFly** | Red Hat 기반 오픈소스 WAS |
| **Apache TomEE** | Tomcat 기반 Jakarta EE 서버 |
| **Open Liberty** | IBM 기반 경량 WAS |
