---
title: "Java에서 this와 super는 언제 어떻게 써야 하는가"
date: 2021-01-14
categories: [Notes, Java]
tags: [Java, this, super, OOP, Inheritance]
---

`this`와 `super`는 자바 문법 중에서도 자주 쓰이지만, 왜 필요한지 맥락 없이 외우기 쉬운 키워드다. 둘 다 결국 **현재 객체와 상속 구조에서 참조 대상을 분명히 하기 위한 장치**라고 보면 이해가 쉬워진다.

## `this`는 무엇을 가리키는가

`this`는 현재 객체 자신을 가리킨다.

즉, 인스턴스 메서드나 생성자 안에서 `this`를 사용하면 "지금 동작 중인 객체"를 명시적으로 참조할 수 있다.

## 가장 흔한 용도: 필드와 매개변수 구분

```java
public class Person {
    private String name;

    public Person(String name) {
        this.name = name;
    }
}
```

생성자 매개변수 `name`과 필드 `name`이 같은 이름일 때 `this.name`은 필드를 의미한다. `this`가 없으면 매개변수에 매개변수를 대입하는 형태가 되어 의도한 동작이 되지 않는다.

핵심은 `this`가 "현재 객체의 필드"를 분명히 해준다는 점이다.

## 다른 생성자를 호출할 때의 `this()`

`this`는 생성자 오버로딩을 정리할 때도 유용하다.

```java
public class Person {
    private final String name;
    private final int age;

    public Person(String name) {
        this(name, 20);
    }

    public Person(String name, int age) {
        this.name = name;
        this.age = age;
    }
}
```

여기서 `this(name, 20)`은 같은 클래스의 다른 생성자를 호출한다. 생성자 초기화 로직이 여러 곳에 흩어지지 않도록 만드는 데 효과적이다.

주의할 점은 `this()` 호출은 생성자 내부의 첫 줄이어야 한다는 것이다.

## `super`는 무엇을 가리키는가

`super`는 부모 클래스 쪽을 가리킨다.

상속 관계에서 자식 클래스가 부모의 필드, 메서드, 생성자를 명시적으로 참조하고 싶을 때 사용한다.

## 부모 메서드를 호출할 때의 `super`

```java
public class Animal {
    public void sound() {
        System.out.println("some sound");
    }
}

public class Dog extends Animal {
    @Override
    public void sound() {
        super.sound();
        System.out.println("bark");
    }
}
```

자식 클래스에서 메서드를 재정의했더라도, `super.sound()`를 통해 부모 구현을 먼저 호출할 수 있다.

이 방식은 부모 동작을 완전히 버리지 않고 확장할 때 유용하다.

## 부모 생성자를 호출할 때의 `super()`

```java
public class Animal {
    private final String name;

    public Animal(String name) {
        this.name = name;
    }
}

public class Dog extends Animal {
    public Dog(String name) {
        super(name);
    }
}
```

부모 클래스 생성자에서 초기화해야 할 상태가 있으면, 자식 생성자에서 `super(...)`로 부모 생성자를 호출해야 한다.

이 역시 생성자 첫 줄에 와야 한다.

## `this`와 `super`의 차이

- `this`: 현재 객체 자신
- `super`: 현재 객체가 상속한 부모 클래스 쪽

둘 다 참조 대상을 분명히 하는 키워드이지만, 하나는 현재 인스턴스 문맥을, 다른 하나는 상속 계층의 상위 문맥을 가리킨다.

## 언제 `this`가 과해지는가

모든 필드 접근에 습관적으로 `this`를 붙이는 스타일도 있지만, 꼭 필요한 상황이 아니라면 코드가 장황해질 수 있다. 보통은 다음 정도에서 명확한 가치가 있다.

- 매개변수와 필드 이름이 겹칠 때
- 다른 생성자를 호출할 때
- 메서드 체이닝에서 현재 객체를 반환할 때

## 언제 `super`가 과해지는가

`super`가 자주 등장한다면 상속 구조가 너무 깊거나, 부모 구현에 과도하게 의존하고 있다는 신호일 수 있다. 실무에서는 상속보다 조합이 더 단순한 경우가 많기 때문에, `super` 사용이 많은 구조는 한 번쯤 재검토할 가치가 있다.

## 정리

- `this`는 현재 객체를 가리킨다
- `this()`는 같은 클래스의 다른 생성자를 호출한다
- `super`는 부모 클래스의 멤버를 가리킨다
- `super()`는 부모 생성자를 호출한다

이 두 키워드는 문법 암기보다, **현재 문맥과 상위 문맥을 어떻게 구분할 것인가**라는 관점에서 이해하는 것이 오래 간다.
