---
title: Java 21 Features
date: 2025-04-14
categories: [Archive, Java]
tags: [Java]
---

# Java 21 주요 기능 정리

### 1. **Virtual Threads (가상 스레드)**  
> **JEP 444: Virtual Threads (Finalized)**  
- 수천, 수만 개의 경량 스레드를 생성할 수 있는 기능
- 기존 `Thread` API 그대로 사용 가능 (`Thread.ofVirtual().start(() -> ...)`)
- I/O 블로킹 문제를 해결하고, 고성능 동시성 프로그래밍 가능
- 서버 애플리케이션 (특히 Spring WebFlux, Netty 등)과의 궁합이 좋음

---

### 2. **Record Patterns (레코드 패턴)**  
> **JEP 440: Record Patterns (Finalized)**  
- 패턴 매칭을 사용하여 레코드의 필드를 추출할 수 있음  
```java
record Point(int x, int y) {}
if (obj instanceof Point(int x, int y)) {
    System.out.println(x + y);
}
```
- 향후 `sealed`, `record`, `pattern matching` 조합으로 강력한 구조 분해 및 타입 검사 가능

---

### 3. **Pattern Matching for switch (스위치 패턴 매칭)**  
> **JEP 441: Pattern Matching for switch (Finalized)**  
- `switch` 문에서 타입 검사 + 구조 분해 가능  
```java
switch (obj) {
    case String s -> System.out.println("문자열: " + s);
    case Integer i -> System.out.println("정수: " + i);
    default -> throw new IllegalArgumentException();
}
```

---

### 4. **Sequenced Collections**  
> **JEP 431: Sequenced Collections (Finalized)**  
- `List`, `Set`, `Map` 등에서 **순서를 명확하게 보장하는 새로운 인터페이스**  
- `SequencedCollection`, `SequencedSet`, `SequencedMap`  
- `addFirst()`, `addLast()`, `reversed()` 같은 API 제공

---

### 5. **Unnamed Patterns and Variables (Preview)**  
> **JEP 443: 언네임드 패턴과 변수 (`_`)**  
- 사용하지 않는 변수에 `_`를 사용해 코드 간결화  
```java
if (obj instanceof Point(int _, int y)) {
    System.out.println("y만 사용: " + y);
}
```

---

### 6. **Scoped Values (Preview)**  
> **JEP 446: 스레드 간 안전하게 값을 전달하는 방식**  
- `ThreadLocal`의 대체 가능성
- 가상 스레드와 궁합이 좋고, **불변성**과 **컨텍스트 전달**에 적합  
```java
ScopedValue<String> USER = ScopedValue.newInstance();
ScopedValue.where(USER, "August").run(() -> {
    System.out.println(USER.get());
});
```

---

### 7. **String Templates (Preview)**  
> **JEP 430: 문자열 템플릿을 위한 문법 도입**  
- `${}` 형식의 템플릿 식 지원 예정 (향후 템플릿 엔진 통합 가능성 있음)

---

### 8. **Foreign Function & Memory API (Finalized)**  
> **JEP 442**  
- JNI 없이 **native 코드 (C 라이브러리 등)** 와 안전하게 상호작용 가능  
- `MemorySegment`, `MemoryLayout`, `CLinker` 등을 이용한 **제로-오버헤드 외부 함수 호출**

---

## 📌 그 외 기타 개선 사항

- `ZGC`, `G1GC` 등 GC 성능 최적화
- Javadoc 개선 (`--snippet-path`)
- Linux/RISC-V 64 지원 (JEP 438)

---

## 🧩 정리된 요약

| 기능 영역 | 주요 기능 |
|-----------|-----------|
| 동시성 | Virtual Threads, Scoped Values |
| 패턴 매칭 | Record Patterns, Pattern Matching for switch |
| 컬렉션 | Sequenced Collections |
| FFI | Foreign Function & Memory API |
| 품질 개선 | GC 최적화, 플랫폼 지원 확장 |

---
