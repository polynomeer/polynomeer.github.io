---
title: Integer.toString(int) vs String.valueOf(int) vs "" + int
date: 2025-04-04
categories: [Archive, Java]
tags: [Java, String]
---

# Integer.toString(3) vs String.valueOf(3) vs "" + 3

자바에서 int를 문자열로 변환하는 방법은 여러가지가 있는데, 각 방식에 따라 차이점이 존재한다. `Integer.toString(3)`, `String.valueOf(3)`, 그리고 `"" + 3`는 모두 `int`를 문자열로 바꾸는 방법이지만, **미묘한 성능 차이**와 **내부 구현 차이**가 있다. 이 세 가지를 **성능**, **내부 동작**, **메모리**, **JIT 최적화 관점**에서 하나씩 살펴보았다.

------

## 1. `Integer.toString(int i)`

### 🔧 내부 동작

```java
public static String toString(int i) {
    int size = DecimalDigits.stringSize(i); // 자리수 계산
    if (COMPACT_STRINGS) {
        byte[] buf = new byte[size]; // Latin1 버퍼
        StringLatin1.getChars(i, size, buf);
        return new String(buf, LATIN1);
    } else {
        byte[] buf = new byte[size * 2]; // UTF16 버퍼
        StringUTF16.getChars(i, size, buf);
        return new String(buf, UTF16);
    }
}
```

### 💡 상세 요약

| 항목           | 설명                                                         |
| -------------- | ------------------------------------------------------------ |
| **동작 방식**  | 숫자의 자리수 계산 → byte 배열에 직접 숫자 문자 삽입 → `String` 생성 |
| **인코딩**     | Latin1 또는 UTF-16 선택 (자바 9+ 기준)                       |
| **성능**       | 가장 빠름 (중간 객체 없음, 최적화 경로 직접)                 |
| **JIT 최적화** | `COMPACT_STRINGS`는 `static final`이라 constant-folding 가능 |
| **메모리**     | Latin1 사용 시 1 byte/char → 절반 메모리 사용                |

📌 **결론**: 성능과 메모리 측면에서 **가장 우수**한 방식. 특히 성능 민감한 코드에서는 이 방식이 유리하다.

------

## 2. `String.valueOf(int i)`

### 🔧 내부 동작

```java
public static String valueOf(int i) {
    return Integer.toString(i); // 그대로 toString 호출
}
```

➡️ 그냥 **`Integer.toString(i)`의 thin wrapper**이다. 하지만 null을 처리하는 공통 로직이 포함되어있어서 null에 대해서 런타임 에러에 대해서 비교적 안전하다.

### 💡 상세 요약

| 항목           | 설명                                                         |
| -------------- | ------------------------------------------------------------ |
| **동작 방식**  | 내부적으로 `Integer.toString(i)` 호출                        |
| **장점**       | 오버로드 많아서 `Object`, `null` 등에도 유연                 |
| **성능**       | 거의 동일하지만 미세하게 느릴 수 있음 (호출 depth 1단계 증가) |
| **JIT 최적화** | 컴파일러가 인라인 처리하므로 큰 차이 없음                    |

📌 **결론**: `null`이 올 수 있는 경우나 **모든 타입을 처리해야 할 때**는 이걸 쓰는 게 더 안전함.

------

## 3. `"" + int` (문자열 연결)

### 🔧 내부 동작

컴파일 시 다음처럼 변환된다.

```java
String s = new StringBuilder().append("").append(3).toString();
```

이건 어떤 리터럴이나 표현식과 `+`를 쓸 때 생기는 공통된 컴파일 최적화 방식입니다.

### 💡 상세 요약

| 항목           | 설명                                                         |
| -------------- | ------------------------------------------------------------ |
| **동작 방식**  | `StringBuilder` 생성 → `append("")` → `append(3)` (→ 내부적으로 `Integer.toString(3)`) → `toString()` |
| **객체 생성**  | 최소 2개 (`StringBuilder`, `String`)                         |
| **성능**       | 가장 느림 (GC 부담 증가, 메서드 호출 많음)                   |
| **JIT 최적화** | 제한적 최적화 가능. 반복문 안에서는 성능 저하 심각해짐       |
| **가독성**     | 간편해 보이지만 성능 손해 있음                               |

📌 **결론**: 간단한 디버깅 용도로는 괜찮지만, **반복 루프나 성능 민감한 코드에서는 피해야 한다.**

------

## 4. 최종 비교

| 방식                  | 내부 처리                      | 성능        | 메모리 효율          | 권장 상황                            |
| --------------------- | ------------------------------ | ----------- | -------------------- | ------------------------------------ |
| `Integer.toString(i)` | 직접 byte[] 조작 (최적화 경로) | 🥇 최고      | 🥇 최고 (Latin1 사용) | 성능 최우선 상황                     |
| `String.valueOf(i)`   | `Integer.toString(i)` 호출     | 🥈 거의 동일 | 🥇 동일               | 범용 처리 (`Object`, `null` 등 포함) |
| `"" + i`              | `StringBuilder`로 문자열 결합  | 🥉 느림      | 🥉 추가 객체 생성     | 디버깅용, 단순 로그 출력 정도만      |

------

## ✨ JDK 9 이후의 String 메모리 구조

자바 8까지는 문자열이 내부적으로 **`char[]` (2 byte per char)**를 사용했지만,
 **자바 9부터는 `byte[] + coder` 구조**로 바뀌었다.

```java
// Java 9+
final byte[] value; // 실제 문자열
final byte coder;   // LATIN1(0) or UTF16(1)
```

이 덕분에 **Latin1만 쓰면 메모리 절반**으로 줄어들고, 캐시 효율도 좋아졌다. 그리고 그 최적화를 활용한 대표적인 예가 바로 `Integer.toString()`이다.
