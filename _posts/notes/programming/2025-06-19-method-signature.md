---
title: Function Signature
date: 2025-06-19
categories: [Archive, Programming]
tags: [Function Signature]
---

## 함수/메소드 시그니처

메소드 시그니처(Method Signature) 또는 함수 시그니처(Function Signature)란, 프로그래밍 언어에서 **메소드를 고유하게 식별할 수 있는 정보**를 말한다. 컴파일러가 이를 판단할 때 논리적으로 구분할 수 있는 최소 단위이다. 이는 메소드 오버로딩(overloading)을 판단할 때 기준이 되며, **메소드 이름**과 **매개변수 목록(parameter list)**으로 구성된다.

### 구성 요소

대부분의 언어(Java, C++, Kotlin 등)에서는 메소드 시그니처를 다음과 같이 정의한다.

```java
리턴타입 메소드이름(매개변수1, 매개변수2, ...)
```

이 중 시그니처에 포함되는 건 아래의 두 개이다.

* **메소드 이름**
* **매개변수의 타입, 개수, 순서**

대부분 이 두 가지만으로 컴파일러가 시그니처를 판단하지만, 언어별로 조금 차이가 있을 수 있다. 

이중에서 포함되지 않는 건 다음과 같다.

* 리턴 타입
* 접근 제어자 (예: `public`, `private`)
* 예외 목록 (`throws`)

그렇다면 위의 목록은 왜 메소드 시그니처에 포함되지 않는 것일까?

### 리턴 타입이 메소드 시그니처에 포함되지 않는 이유

리턴 타입을 시그니처에 포함했을때, 자바기준으로 코드상에서 식별하기가 모호해진다. 예를 들어 다음과 같은 메소드를 두 개 정의하고 싶다고 가정해보자.

```java
int convert(String s);
double convert(String s); // 컴파일 오류 발생
```

이렇게 작성하면 두 번째 메소드를 정의하는 행에서 컴파일 에러가 발생할 것이다. 이까지만 보면 리턴타입까지도 시그니처에 포함해서 허용해주어도 될것같은데? 하는 생각도 든다. 하지만 이 메소드를 호출하는 코드를 보면 확실히 모호하다.

```java
convert("123");
```

이처럼 **호출 시점에** 컴파일러가 어떤 메소드라고 판단해야할까? 논리적으로 판단기준이 명확하지 않다. 굳이 이를 지원하게 하려면 명시적 형변환을 해야할 것이고, 코드 가독성은 떨어지면서 오히려 컴파일러의 구현 복작도는 증가할 것이다. 따라서 자바에서는 **최소한의 구분기준만**을 메소드 시그니처로 정했다.

접근 제어자도 메소드의 사용 가능 법위를 제한할 뿐, 호출 시점에

---

## 메소드 시그니처 들여다보기

### 컴파일러 입장에서 생각해보기

컴파일러 입장에서는 메소드의 **호출 시점에 정확히 특정 메소드를 식별**해서 호출되도록 해야한다. 그러기 위해서는 모호함이 없고 정확한 판단 기준이 있어야할 것이다. 같은 블록 내부에서 메소드 이름이 다른 경우에는 식별 기준이 아주 명확하다. 더 나아가서 같은 이름을 가지면서 파라미터 구성만 다른 시그니처를 가진 서로 다른 메소드. 즉, 오버로딩된 메소드 간의 구분도 메소드 시그니처에 의하면 아주 명확하다.

```java
public int add(int a, int b)      // 시그니처: add(int, int)
public double add(double x, double y) // 시그니처: add(double, double)
```

두 메소드는 이름은 같지만 매개변수 타입이 달라 시그니처가 다르다 → 즉, 오버로딩이 가능하다.

```java
public int add(int a, int b)
private int add(int x, int y)
```

위의 두 메소드는 같은 시그니처: `add(int, int)` → 오버로딩이 아니다. 중복에대한 컴파일 오류가 발생한다.

### 왜 시그니처로만 판단할까?

1. **컴파일 타임에 메소드 호출을 결정해야 하기 때문**

   자바는 정적 타입 언어이다. 따라서 컴파일러는 어떤 메소드를 호출할지 미리 결정해야한다. 이 리턴 타입으로는 어떤 메소드를 호출할지 알 수 없다. 예를 들어, `obj.print("Hello")`만 보고 어떤 리턴 타입을 기대하는지 알 수 없다.

2. **가독성과 일관성 확보**

   시그니처 기준만 보면 오버로딩 여부를 쉽게 판단 가능하다.

### 바이트 코드 분석 및 컴파일 과정

메소드 시그니처는 실제로 컴파일러가 해당 메소드를 식별해서 정확히 실행하기 위한 식별자 값이다. 그러면 실제로 자바에서 이 메소드 시그니처가 어떤 바이트코드 값으로 매핑되고, JVM이 **어떤 기준으로 해당 메소드를 실제로 실행하는지** 확인해보려고 한다.

#### 바이트 코드 분석

예제 코드 (Java 소스 수준)

```java
public class Demo {
    public void sayHello(String name) {
        System.out.println("Hello, " + name);
    }

    public static void main(String[] args) {
        Demo d = new Demo();
        d.sayHello("Ham");
    }
}
```

javac로 컴파일하고

```bash
javac Demo.java
```

바이트코드를 확인하면

```bash
javap -c Demo
```

바이트 코드 결과는 다음과 같다.

```java
public class Demo {
  public Demo();
    Code:
       0: aload_0
       1: invokespecial #1 // Method java/lang/Object."<init>":()V
       4: return

  public static void main(java.lang.String[]);
    Code:
       0: new           #2 // class Demo
       3: dup
       4: invokespecial #3 // Method Demo."<init>":()V
       7: astore_1
       8: aload_1
       9: ldc           #4 // String Alice
      11: invokevirtual #5 // Method Demo.sayHello:(Ljava/lang/String;)V
      14: return
}
```

`invokevirtual` 명령 분석

```java
11: invokevirtual #5 // Method Demo.sayHello:(Ljava/lang/String;)V
```

이 행에서 알 수 있는 정보는 다음과 같다.

- `invokevirtual`: 인스턴스 메소드 호출을 의미 (→ 동적 바인딩)
- `#5`: 상수 풀에서 5번 인덱스를 참조한다는 의미이다. 이는 Constant Pool의 인덱스이다.
- `Demo.sayHello:(Ljava/lang/String;)V`: 이 부분은 javap가 실제로 Constant Pool에서 #5를 역참초하여 표현해주는 주석이다. 이 정보는 내부적으로 [Method Descriptor](https://docs.oracle.com/javase/specs/jvms/se17/html/jvms-4.html#jvms-4.3.3)라는 시그니처를 표현한 일종의 문자열 형태로 저장된다.
  - 메소드 이름: `sayHello`
  - 파라미터: `Ljava/lang/String;` → 즉, `String` 하나
  - 리턴 타입: `V` → `void`

#### 컴파일 및 실행 과정

Java 컴파일러는 우선 소스코드에서 메소드 시그니처를 보고 호출할 메소드를 결정한다. 그리고 바이트코드 생성 시점에 해당 메소드의 디스크립터를 삽입한다. 실행시점에 JVM은 메소드 디스크립터를 통해 정확한 바인딩을 수행한다. 그리고 바이트코드와 Constant Pool을 참조해 실제 메모리에서 호출하는 방식으로 실행한다.

---

## 결론

메소드 시그니처는 컴파일러가 판단할 수 있으면서도 코드 가독성을 최대한 지킬 수 있는 최소한의 기준이다. 이를 기준으로 컴파일러는 호출 시점에 정확히 어떤 메소드를 호출할지 결정할 수 있고, 오버로딩된 메소드까지 정확히 식별할 수 있다. 이를 통해 최소한의 가독성을 보장하면서 메소드 오버로딩을 통한 코드 확장성까지 보장할 수 있게 된다.

## 참고자료

- [Signature (functions)](https://developer.mozilla.org/en-US/docs/Glossary/Signature/Function)
- [Type signature](https://en.wikipedia.org/wiki/Type_signature#Java)
- [JVM Spec §4.3.3: Method Signature](https://docs.oracle.com/javase/specs/jls/se17/html/jls-8.html#jls-8.4.2)
- [Java Language Specification, §8.4.9: Overloading](https://docs.oracle.com/javase/specs/jls/se17/html/jls-8.html#jls-8.4.9)
- [JVM Specification, §4.3.3: MethodDescriptor](https://docs.oracle.com/javase/specs/jvms/se17/html/jvms-4.html#jvms-4.3.3)
- [Does a Method’s Signature Include the Return Type in Java?](https://www.baeldung.com/java-method-signature-return-type?utm_source=chatgpt.com)
- [Function Signature — What is it?](https://mayowaobisesan.medium.com/function-signature-what-is-it-eeb16658e624)
