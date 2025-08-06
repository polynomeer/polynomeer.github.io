---
title: "Spring Boot DevTools: Features, Pros and Cons, and Is It Right for Your Project?"
date: 2025-08-06
categories: [Archive, Spring]
tags: ["Spring Boot DevTools"]
---

`spring-boot-devtools`는 **Spring Boot 개발을 더 빠르고 편리하게** 도와주는 도구 모음이다. 주로 **개발 환경에서만** 사용되며, 운영환경에서는 **비활성화**되도록 설정한다.

## 주요 기능

1. **자동 재시작 (Automatic Restart)**
   * 소스 코드나 설정 파일을 변경하면 애플리케이션이 자동으로 재시작된다.
   * 클래스패스(classpath) 하위의 정적 리소스(`static`, `templates`) 변경은 재시작 없이 자동 반영된다.
   
2. **라이브 리로드 (Live Reload)**

   * 브라우저 플러그인(LiveReload)이 설치되어 있으면, HTML/CSS 변경 시 브라우저가 자동 새로고침된다.

3. **캐시 비활성화 (Caching Disable)**
   * 템플릿 엔진(예: Thymeleaf)의 캐시를 꺼서 파일을 수정하면 즉시 반영된다.
   * 개발 중에는 캐시가 오히려 방해되기 때문에 유용하다.
   
4. **빠른 재시작을 위한 ClassLoader 분리**
   * static, template 외의 코드 변경 시, 전체 앱을 다시 시작하지 않고 **선택적으로 재시작**해서 속도가 더 빠르다.
   
5. **Remote Debugging (원격 개발 지원)**
* 로컬 IDE에서 원격 서버에 있는 앱을 빠르게 수정하고 반영할 수 있게 도와준다.

---

## 사용 방법

**Maven**:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-devtools</artifactId>
    <scope>runtime</scope>
    <optional>true</optional>
</dependency>
```

**Gradle**:

```groovy
dependencies {
    developmentOnly("org.springframework.boot:spring-boot-devtools")
}
```

참고로, Maven에서는 `scope`의 분리를 통해서, Gradle에서는 `developmentOnly`를 명시해야 운영 환경에 포함되지 않는다. devtools를 운영 환경에서 사용할 시 치명적인 버그를 유발할 수도 있으므로 주의해야 한다. 이 위험성에 대해서는 뒷부분에서 설명한다.

### 자주 쓰이는 상황

* HTML, CSS, JS, Thymeleaf 템플릿 빠른 반영
* 컨트롤러 수정 시 자동 재시작
* 서버 재시작 없이 빠른 피드백 루프

### 주의 사항

운영 서버에는 **절대 포함하지 않아야** 한다. 특히 재시작 기능은 Eclipse/IntelliJ 등의 자동 빌드 설정에 따라 다르게 작동할 수 있다.

---

## Automatic Restart & Live Reload

Automatic Restart와 Live Reload 기능이 동작하는 조건에 대해서 좀 더 살펴보자.

| 변경 대상                                    | 반영 방식         | 설명                                                         |
| -------------------------------------------- | ----------------- | ------------------------------------------------------------ |
| **컨트롤러, 서비스, 레포지토리 (Java 코드)** | Automatic Restart | Java 소스나 클래스 파일이 변경되면 애플리케이션이 재시작됨   |
| **application.properties / yml**             | Automatic Restart | 설정 파일이 바뀌면 앱이 재시작됨                             |
| **템플릿 파일 (Thymeleaf 등)**               | Live Reload       | HTML 템플릿은 브라우저가 자동 새로고침 됨 (LiveReload가 설치되어 있을 경우) |
| **정적 파일 (CSS, JS, 이미지)**              | Live Reload       | `static/`, `public/` 디렉토리의 파일은 자동 반영됨 (브라우저 새로고침 필요) |
| **라이브러리 버전, 의존성 변경**             | 없음              | Maven/Gradle 의존성은 재빌드 후 수동 재시작 필요             |
| **데이터베이스 스키마 변경**                 | 없음              | 직접 반영 필요 (Hibernate DDL auto 설정이 켜져 있다면 일부 적용 가능) |

자동 재시작(Automatic Restart)이 발생하는 경우는 다음과 같다. 기본적으로 Spring Boot는 클래스패스에 있는 `.class` 파일이 바뀌면 자동으로 재시작한다. 즉, `src/main/java` 하위에서 빌드된 클래스 변경이 대상이다.

* `@RestController` 수정
* `@Service` 또는 `@Component` 내부 로직 변경
* `application.yml` / `application.properties` 수정
* Java 코드에서 설정 관련 변경 (예: CORS, Filter 추가 등)

라이브 리로드(Live Reload)는 브라우저에서 플러그인을 통해 지원해야 동작한다. 크롬에서는 [LiveReload Chrome](https://chromewebstore.google.com/detail/livereload/jnihajbhpnppcggbcgedagnkighmdlei?pli=1)이라는 확장 프로그램을 사용하면 된다. REST API 서버는 보통 템플릿이나 정적 자원을 쓰지 않으므로, 이 기능은 UI 개발할 때 더 유용하다. Live Reload가 동작하는 조건은 다음과 같다.

* `src/main/resources/templates/` (예: `.html`)  변경
* `src/main/resources/static/` (예: `.js`, `.css`, `.png`)에 있는 파일이 변경

이 기능을 활용하기 위해서는 IDE에 몇 가지 설정을 확인해야한다.

**IDE 자동 빌드 켜기**

* IntelliJ: `File > Settings > Build, Execution, Deployment > Compiler > Build project automatically`

  `Ctrl+Shift+A` → "Registry" → `compiler.automake.allow.when.app.running` → 체크
* Eclipse: `Project > Build Automatically` 켜기

---

## spring-boot-devtools 성능

Spring Boot DevTools는 다음과 같은 방식으로 \*\*빠른 재시작(fast restart)\*\*을 구현한다.

### 클래스 로더(ClassLoader) 분리

* **애플리케이션 코드** (예: `com.myapp.*`)는 별도의 클래스로더에서 로딩
* 라이브러리(JAR 등)는 공유 클래스로더에서 로딩
* 변경되면 **애플리케이션 코드만 새로 로드** → 라이브러리는 재사용

그래서 의존성(JAR)이 바뀌지 않았다면, 전체를 다시 초기화할 필요가 없으므로 일부만 다시 로딩하여 성능이 빨라진다. 속도는 시스템 사양과 애플리케이션 규모에 따라 다르지만, 일반적으로 다음과 같은 수준의 성능 차이를 보인다.

| 종류                    | 소요 시간 예시 (상대적) |
| --------------------- | -------------- |
| 일반 Spring Boot 전체 재시작 | 4\~10초 이상      |
| DevTools 재시작          | 1\~3초          |

물론, 작은 프로젝트에서는 체감이 적지만, 프로젝트가 커질수록 차이가 커진다.

참고로 spring-boot-devtools는 내부적으로 완전히 "핫 리로드" 방식은 아니다.

* DevTools는 \*\*자동 재시작(Auto Restart)\*\*이지, 진짜 Java 코드 수준의 \*\*핫스왑(HotSwap)\*\*은 아니다.
* Java의 HotSwap은 JVM 디버깅 도구(예: IntelliJ의 HotSwap, DCEVM, JRebel 등)로 별도로 구현해야 한다.

---

## spring-boot-devtools의 잠재적 문제

spring-boot-devtools는 클래스 로더가 분리된 구조를 통해서 빠른 재시작을 제공한다고 했다. 하지만 이 때문에 여러가지 문제가 발생할 수 있다.

### 1. 싱글턴/정적 객체가 서로 다른 클래스 로더에서 로딩됨

* `static`, `singleton`, `@Component`, `@Service`로 정의한 객체가 변경되면 다른 클래스 로더에서 다시 로딩됨.
* 이때 다른 클래스로더에서 만들어진 객체와의 비교 (`==`, `instanceof`)가 **예상과 다르게 작동**할 수 있음.

> 예: `MyService`가 싱글턴인데, 라이브러리에서 `instanceof MyService` 체크 시 false가 뜨는 현상.

### 2. 스레드 로컬(ThreadLocal)이나 캐시 관련 문제

* 클래스 로더가 바뀌면서 **기존 ThreadLocal이 고립**되거나 **메모리 누수** 발생 가능.
* 특히 `ScheduledExecutorService`, `CompletableFuture`, `ThreadLocal` 등을 활용한 비동기 처리 코드에서 발생.

### 3. JPA 엔티티나 Hibernate 캐시 문제

* `@Entity` 클래스가 바뀌면 Hibernate 내부 캐시에 등록된 메타 정보가 꼬일 수 있음.
* → 재시작해도 런타임 오류(예: `EntityNotFoundException`, `ClassCastException`) 발생 가능

### 4. 서드파티 라이브러리와의 호환 이슈

* 일부 라이브러리(Jackson, Logback, Netty 등)는 클래스 로더에 민감하게 반응.
* 이런 라이브러리가 **캐싱된 객체를 재사용**하려다 클래스 불일치 예외가 발생할 수 있음.

### 5. 파일 핸들 또는 리소스 누수

* 재시작 시에 리소스를 제대로 정리하지 않으면 파일이나 포트를 잠그고 남는 경우 발생
  (예: H2, SQLite, Netty 서버 등에서 종종 발생)

이런 문제가 발생할 경우, 예를 들면 다음과 같은 에러나 증상이 나타난다.

* `ClassCastException` 또는 `ClassNotFoundException`
* `instanceof` 체크 실패
* 캐시나 싱글턴이 예상대로 동작하지 않음
* "포트가 이미 사용 중입니다" 오류
* REST 요청을 보내도 반영이 안 됨 (캐시된 컨텍스트 사용 중)

---

## 해결 전략

| 상황                       | 권장 대처                                                    |
| ------------------------ | -------------------------------------------------------- |
| 클래스 불일치 발생 시             | 완전 수동 재시작 (`Ctrl+C` 후 다시 실행)                             |
| ThreadLocal, Executor 사용 | 종료 시 명시적으로 shutdown / cleanup 코드 작성                      |
| 복잡한 상태 유지 객체             | 상태를 최소화하거나 테스트 시 재시작 사용 지양                               |
| LiveReload와 동시에 사용       | 필요 없으면 `spring.devtools.livereload.enabled=false` 설정     |
| devtools 제외하고 싶을 때       | `spring.devtools.restart.enabled=false` 또는 dependency 제거 |

---

## 결론

실무에서 팀에 spring-boot-devtools의 잠재적 문제가 무엇이고, 발생가능성이 있는 기능을 모두가 주의하기는 어렵다는 생각이 든다. 팀에 새로운 멤버가 들어와서 JPA 엔티티를 추가했다가 개발환경에서 Automatic Restart로 인한 에러를 접하는 경우, 당황할 것이 분명하다. 따라서 서버나 REST API 등을 개발하는 조직에서 spring-boot-devtools를 도입하는 것은 현실적으로 어려울 것이라고 판단된다.

다만, 팀의 규모가 크지않고, Thymeleaf 같은 템플릿 엔진으로 풀스택 개발을 하는 조직에서는 충분히 도입할만한 가치가 있을것이다. 특히, 프론트 엔드 개발에서 Live Reload가 지원되는 것과 지원되지 않는 것은 정말 큰 차이가 있다.

따라서 팀에서 활용할 수 있는 devtools의 기능이 무엇이고, 잠재적 문제상황에 대해서 얼마나 팀의 구성원이 이해하고 있는지를 잘 판단하고, devtools의 도입을 결정해야할 것이다.
