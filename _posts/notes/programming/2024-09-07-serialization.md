---
title: Serialization and Deserialization
date: 2024-09-05
categories: [Notes, Programming]
tags: [Java, Serialization]
---

직렬화(serialization)는 객체의 상태를 바이트 스트림으로 바꾸는 과정이고, 역직렬화(deserialization)는 그 바이트 스트림에서 객체를 다시 만드는 과정이다. 메모리 안에만 있던 객체를 파일에 저장하거나 네트워크로 보내려면 정해진 형식의 바이트로 바꿔야 하기 때문에 필요하다. 게임을 멈췄다가 다시 시작할 때 멈춘 지점부터 이어지는 것도 상태를 저장하고 복원하는 같은 원리다 ([Codementor](https://www.codementor.io/java/tutorial/serialization-and-deserialization-in-java)).

---

## Java의 직렬화

Java에서는 클래스가 `java.io.Serializable`을 구현하면 직렬화할 수 있다. 이 인터페이스에는 메서드도 필드도 없고, 직렬화 가능하다는 의미를 표시하는 역할만 한다. 직렬화 가능한 클래스의 하위 타입도 모두 직렬화 가능하다 ([Javadoc](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/io/Serializable.html)).

실제 변환은 `ObjectOutputStream.writeObject()`와 `ObjectInputStream.readObject()`가 한다.

```java
class User implements Serializable {
    private static final long serialVersionUID = 1L;

    private String name;
    private transient String password; // 직렬화에서 제외

    User(String name, String password) {
        this.name = name;
        this.password = password;
    }
}

// 직렬화
try (ObjectOutputStream out = new ObjectOutputStream(
        new BufferedOutputStream(new FileOutputStream("user.ser")))) {
    out.writeObject(new User("polynomeer", "secret"));
}

// 역직렬화
try (ObjectInputStream in = new ObjectInputStream(
        new BufferedInputStream(new FileInputStream("user.ser")))) {
    User user = (User) in.readObject(); // password는 null
}
```

`transient`를 붙인 필드는 직렬화되지 않고, 역직렬화하면 타입의 기본값(참조 타입은 `null`)으로 채워진다. 비밀번호처럼 저장하면 안 되는 값에 쓴다.

---

## serialVersionUID

역직렬화할 때 JVM은 보낸 쪽과 받는 쪽이 직렬화 관점에서 호환되는 클래스를 가졌는지 `serialVersionUID`로 확인한다. 값이 다르면 `InvalidClassException`이 발생한다. 선언하지 않으면 클래스 구조에서 기본값을 계산하는데, 이 계산은 컴파일러 구현에 따라 달라질 수 있는 세부 사항에 민감하다. 그래서 Javadoc은 enum을 제외한 모든 직렬화 가능 클래스가 값을 명시적으로 선언하고, 가능하면 `private`으로 둘 것을 강하게 권한다.

---

## 주의할 점

- 신뢰할 수 없는 데이터의 역직렬화는 본질적으로 위험하다. Javadoc은 이를 피해야 하며, 받는다면 Secure Coding Guidelines의 기준으로 검증하라고 경고한다. 외부와 주고받는 데이터에는 JSON 같은 데이터 형식을 쓰는 편이 안전하다.
- 직렬화 가능한 클래스가 직렬화 불가능한 클래스를 상속하면, 역직렬화 때 가장 가까운 직렬화 불가능 상위 클래스의 인자 없는 생성자로 그 상위 클래스의 필드를 초기화한다. 이 생성자에 접근할 수 없으면 역직렬화가 실패한다.
- 직렬화 형식을 직접 제어해야 하면 `writeObject`, `readObject`, `writeReplace`, `readResolve`를 정해진 시그니처로 구현한다.
- 필드를 추가하거나 지우면 이미 저장된 바이트와의 호환성이 깨질 수 있다. 오래 보관하는 데이터라면 클래스 변경이 직렬화 형식 변경이기도 하다는 점을 염두에 둔다.

## 참고

- [Serialization and Deserialization in Java](https://www.codementor.io/java/tutorial/serialization-and-deserialization-in-java) — Codementor
- [Serializable (Java SE 21 & JDK 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/io/Serializable.html) — Oracle
