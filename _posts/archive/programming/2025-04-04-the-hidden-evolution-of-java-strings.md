---
title: The Hidden Evolution of Java Strings
date: 2025-04-04
categories: [Programming, Java]
tags: [Java, String]
---

## Java `String` 클래스의 변천사 (Java 1 ~ Java 21)

Java에서 `String` 클래스는 자바 언어의 핵심 중 하나로, 수많은 개선이 이루어졌다. 특히 Java 9 이후부터는 성능과 메모리 최적화를 위해 **내부 구조가 크게 바뀌었고**,  Java 21까지 계속해서 진화해왔다. 이 글에서는 Java 1부터 21까지의 `String` 클래스의 **내부 구조와 기능 변화 중심**으로 정리해보았다.

---

### ☕ Java 1.0 ~ Java 8 (1996 ~ 2014)

#### 내부 구조:
```java
private final char[] value; // UTF-16 기반 (2 bytes per character)
```

- 모든 문자열은 **UTF-16 인코딩**으로 저장.
- ASCII 문자만 있어도 무조건 2바이트 사용.
- 한 글자당 2바이트 = **메모리 낭비** 가능성.
- 불변 객체 (immutable), `final` 필드.

#### 주요 특징:
- `StringBuilder`, `StringBuffer`, `String.intern()`, `equals()`, `hashCode()` 등 안정화.
- JVM 상에서 가장 많이 사용되는 클래스 중 하나.

---

### ⚡ Java 9 (2017) — **Compact Strings 도입!**

#### 내부 구조 대개 이렇게 바뀜:

```java
private final byte[] value;  // 문자열 데이터 저장 (UTF-8 X)
private final byte coder;    // LATIN1 (0) 또는 UTF16 (1)
```

- **Compact Strings** 기능 도입:
  - ASCII 문자만 쓰는 경우 `LATIN1` (1 byte per char)
  - 유니코드 문자가 포함되면 `UTF16` (2 bytes per char)
- 메모리 효율 대폭 향상 (최대 50% 절약)
- `COMPACT_STRINGS`라는 `static final boolean` 플래그로 처리됨.

#### 🌟 이점:
- GC 부담 줄고
- CPU 캐시 효율 좋아짐
- 대부분의 문자열이 ASCII일 경우 효과적

---

### 🔒 Java 12 (2019) — `String::transform`, `indent`, `describeConstable`

- `String::transform(Function)` 메서드 추가 (Java 12):
  ```java
  String result = "hello".transform(s -> s.toUpperCase()); // "HELLO"
  ```
- `indent(int)` → 들여쓰기 쉽게 처리 가능
- `describeConstable()` → `String`을 `ConstantDesc`로 표현 (JEP 334)

---

### 🔡 Java 13 (2019) — 텍스트 블록 (Text Blocks) 미리보기

- `"Java is\nawesome"` → `"""Java is\nawesome"""` 형식으로 표현 가능
- 줄 바꿈/탭/여백 유지가 편해짐

---

### 🪟 Java 15 (2020) — 텍스트 블록 정식 도입

```java
String json = """
    {
        "name": "chatgpt",
        "type": "ai"
    }
    """;
```

- 기존 `"줄바꿈\n해야 했던 문자열"`보다 가독성 높아짐.

---

### 🚀 Java 17 (2021) — 패턴 매칭 기반 개선 시작

- `instanceof` → 자동 캐스팅 가능
  ```java
  if (obj instanceof String s) {
      System.out.println(s.toLowerCase());
  }
  ```

---

### 💎 Java 19~21 (2022~2023~2024) — **String Templates (미리보기), 패턴 매칭 향상**

#### Java 21 (2023) — 주요 변화:
> Java 21은 LTS(장기지원) 버전입니다.

#### 🧩 주요 기능들:

1. ### 🔸 **String Templates (미리보기, JEP 430)**

```java
String name = "Alice";
int age = 30;
String result = STR."Hello \{name}, you are \{age} years old!";
```

- `${}` 같은 표현을 `\{}`로 사용.
- 더 안전하고 가독성 높은 문자열 생성 방식 도입.

2. ### 🔸 **Unnamed Patterns / Variables (JEP 443)**

- 더 간결한 패턴 매칭이 가능해짐

3. ### 🔸 **Latin1 최적화 지속 + 성능 향상**

- `String.hashCode()` 계산, `equals()`, `substring()` 등 내부적으로 계속 JIT 최적화됨.

---

## 📊 버전별 요약 테이블

| Java 버전 | 주요 변화 |
|-----------|-----------|
| 1.0 ~ 8   | `char[]` 기반 UTF-16, 불변 객체 |
| 9         | 🧠 Compact Strings 도입 → `byte[] + coder` 구조 |
| 12        | `transform()`, `indent()` 등 유틸 메서드 추가 |
| 13 ~ 15   | 📋 Text Blocks (멀티라인 문자열) |
| 17        | 패턴 매칭, 인스턴스 자동 캐스팅 |
| 19~21     | 🧩 String Templates (JEP 430), 성능 향상, 코드 가독성 개선 |

---

## 🧠 보너스: Compact Strings 성능 향상 포인트

- `"123"` → `byte[3]`, coder = LATIN1
- `"한글"` → `byte[4]`, coder = UTF16
- JIT 컴파일 시 `COMPACT_STRINGS`는 static final이라 constant folding 되어 브랜치 제거 가능!
