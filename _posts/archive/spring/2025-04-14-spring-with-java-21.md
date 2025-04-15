---
title: Java 21 Features with Spring
date: 2025-04-14
categories: [Archive, Programming]
tags: [Java, Spring]
---

## 💡 Spring Boot 3.2 + Java 21 연계 활용 예시

### 1. ✅ **Virtual Threads + Spring Boot 3.2**
> Java 21의 **가상 스레드(Virtual Thread)** 와 Spring Boot 3.2는 기본적으로 호환됩니다.

#### 📌 주요 효과
- 기존 `@RestController` 기반 **서블릿 API (Tomcat)** 도 가상 스레드로 실행 가능
- **비동기 프로그래밍 없이도 고성능 처리 가능** → 동기식 코드로도 높은 동시성

#### ⚙️ 설정 방법
```yaml
# application.yml
server:
  tomcat:
    protocol: org.apache.coyote.http11.Http11Nio2Protocol
```

```java
@Bean
public TomcatProtocolHandlerCustomizer<?> protocolHandlerVirtualThreadExecutor() {
    return protocolHandler -> protocolHandler.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
}
```

#### 👍 기대 효과
- 기존의 `WebClient`, `CompletableFuture`, `@Async` 없이도 동시성 향상
- 요청 수가 많은 API 서버에 적합 (예: 대용량 배치 처리, IO-bound 서비스)

---

### 2. ✅ **Scoped Values**  
> `ThreadLocal` 대체: **가상 스레드에서도 안전하게 사용 가능**

```java
ScopedValue<String> USER_ID = ScopedValue.newInstance();

public void controller() {
    ScopedValue.where(USER_ID, "user-123").run(() -> {
        service(); // 내부적으로 USER_ID.get() 사용 가능
    });
}
```

- ✅ 트랜잭션 ID, 요청자 ID, 타임존 등 **컨텍스트 전파**에 적합
- 🚫 기존 `ThreadLocal`은 가상 스레드와 궁합이 안 좋음 → 이걸로 대체 가능

---

### 3. ✅ **Pattern Matching for `switch` / Record Patterns**
> 요청 DTO, 커맨드 핸들러 등에서 **패턴 기반 분기 처리**

```java
sealed interface Command permits CreateUser, DeleteUser {}
record CreateUser(String name) implements Command {}
record DeleteUser(Long id) implements Command {}

public void handle(Command command) {
    switch (command) {
        case CreateUser(var name) -> userService.create(name);
        case DeleteUser(var id) -> userService.delete(id);
    }
}
```

- 💡 복잡한 `if-else` / `instanceof` 분기문 제거
- 서비스 계층의 분기 로직을 명확하고 타입 안전하게 구현 가능

---

### 4. ✅ **Foreign Function & Memory API**
> 아직 Spring에서는 직접 활용 사례가 적지만, **고성능 네이티브 호출** 시 사용 가능  
예: C 기반 음원 분석 라이브러리, 영상 인코딩 등과의 연동에 활용

---

### 5. ✅ **Sequenced Collections**
> 컨트롤러나 서비스에서 순서가 중요한 데이터 다룰 때 명시적 인터페이스 사용 가능

```java
SequencedSet<String> history = new LinkedHashSet<>();
history.addFirst("eventA");
history.addLast("eventB");
```

- `LinkedHashSet`, `LinkedHashMap` 등을 더 명확하게 활용 가능
- 템플릿 엔진, 히스토리 로그, 순차 UI 렌더링에서 유용

---

## ✅ 정리: 실무 적용 가이드

| 기능 | Spring 실무 활용 |
|------|------------------|
| Virtual Threads | Tomcat 가상 스레드 설정 → IO 성능 향상 |
| Scoped Values | 요청 컨텍스트 전파 (ex. userId, traceId) |
| Record Patterns | Command/DTO 처리 로직 간결화 |
| Sequenced Collections | 순서 있는 데이터 처리 명확하게 |
| Foreign Function API | JNI 대체 (네이티브 라이브러리 호출) |
