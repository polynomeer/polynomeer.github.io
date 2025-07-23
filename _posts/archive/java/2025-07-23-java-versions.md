---
title: "Evolution of Java: Version-by-Version Breakdown"
date: 2025-07-23
categories: [Archive, Java]
tags: [Java Features, Java Versions]
---

Java는 버전이 업그레이드되면서 성능 개선, 문법 추가, 새로운 API 도입, 보안 강화 등 다양한 변화가 있었다.

## Java 7 (2011)

**코드 가독성과 예외 처리 개선**

* **Try-with-resources**: 자원 자동 해제 (`AutoCloseable`)
* **다이아몬드 연산자 (`<>`)**: 타입 추론 가능
* **멀티캐치(Multi-catch)**: 여러 예외 한 번에 처리
* **Switch문에 String 사용 가능**
* **NIO.2 도입**: 비동기 파일 I/O 기능 강화

---

## Java 8 (2014) - **가장 큰 변화 중 하나**

**함수형 프로그래밍 도입**

* **Lambda(람다) 표현식 (`->`)**
* **Stream API**: 데이터 처리 파이프라인
* **Optional 클래스**: null 처리 개선
* **인터페이스에서 default 메서드**
* **java.time 패키지**: 새로운 날짜/시간 API

---

## Java 9 (2017)

**모듈화 도입**

* **Project Jigsaw**: 모듈 시스템(`module-info.java`)
* **JShell**: Java REPL (인터랙티브 실행)
* **Stream API 개선**: `takeWhile`, `dropWhile` 등 추가
* **공식 HTTP/2 Client (incubator 상태)**

---

## Java 10 (2018)

**로컬 변수 타입 추론**

* `var` 키워드 도입 (단, 메서드 내부에서만 사용 가능)

---

## Java 11 (2018, LTS 버전)

**생산성 및 표준화 개선**

* **`var`를 lambda 매개변수에도 사용 가능**
* **새로운 String 메서드**: `isBlank()`, `lines()`, `repeat()`
* **HttpClient API 정식 채택**
* **JEP 181**: Nest-based access control (내부 클래스 접근 개선)
* Oracle JDK와 OpenJDK 라이선스 분리 시작

---

## Java 12 \~ Java 14 (2019\~2020)

* **Switch 표현식 개선 (Java 12, 미리보기 → Java 14에 정식 도입)**

  ```java
  int result = switch (day) {
      case MONDAY -> 1;
      case TUESDAY -> 2;
      default -> 0;
  };
  ```
  
* **Text Blocks (Java 13 preview → Java 15 정식)**

---

## Java 15 \~ Java 16

* **Text Blocks 정식 도입**
* **Records** (Java 14 preview → Java 16 정식): 불변 데이터 클래스

  ```java
  public record Person(String name, int age) {}
  ```
* **Pattern Matching for instanceof (Java 16)**

---

## Java 17 (2021, LTS)

* **Sealed Classes**: 클래스 상속 제한
* **Pattern Matching for switch (미리보기)**
* **Strong encapsulation** of JDK internals
* LTS 버전이라 장기적으로 많이 사용됨

---

## Java 18 \~ Java 20

* **Virtual Threads (Project Loom, Java 19/20 미리보기)**
* **Record Patterns**, **Pattern Matching 개선**
* **Structured Concurrency (초기화 단계)**

---

## Java 21 (2023, LTS)

* **Virtual Threads 정식 도입**: 초경량 스레드 (`Thread.ofVirtual()`)
* **Pattern Matching for switch 정식**
* **String Templates (미리보기)**
* **Sequenced Collections 도입**

