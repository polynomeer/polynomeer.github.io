---
title: "equals()와 hashCode()를 함께 오버라이드해야 하는 이유"
date: 2025-06-25
categories: [Notes, Java]
tags: [Java, equals, hashCode, Collection]
---

Java에서 `equals()`와 `hashCode()`는 객체 동일성을 다룰 때 가장 자주 마주치는 메서드다. 문제는 이 둘을 따로 생각하면 거의 항상 오류가 생긴다는 점이다. 특히 `HashMap`, `HashSet` 같은 해시 기반 컬렉션에서는 둘의 계약을 지키지 않으면 겉으로는 멀쩡해 보여도 논리적으로 잘못된 동작이 발생한다.

## 왜 두 메서드를 같이 봐야 하나

해시 기반 컬렉션은 보통 두 단계를 거쳐 동작한다.

1. `hashCode()`로 버킷 위치를 찾는다.
2. 같은 버킷 안에서 `equals()`로 같은 객체인지 확인한다.

즉:

- `hashCode()`는 "어디를 볼지"를 결정하고
- `equals()`는 "정말 같은지"를 결정한다

이 구조 때문에 둘 중 하나만 잘 구현해도 충분하지 않다.

## 가장 흔한 문제

### `equals()`만 오버라이드한 경우

논리적으로 같은 객체인데도 `HashSet`에서 중복 제거가 되지 않거나, `HashMap`에서 키를 찾지 못할 수 있다.

```java
Set<Person> set = new HashSet<>();
set.add(new Person("August"));
set.add(new Person("August"));

System.out.println(set.size()); // 1을 기대했지만 2가 될 수 있다.
```

이 경우 `equals()`는 같다고 판단해도, `hashCode()`가 다르면 서로 다른 버킷으로 들어가므로 중복으로 취급된다.

### `hashCode()`만 오버라이드한 경우

이 경우도 올바르지 않다. 해시 충돌은 허용되지만, 결국 `equals()`가 논리적 동일성을 설명하지 못하면 같은 객체인지 판단할 수 없다.

## Java의 계약을 먼저 이해해야 한다

Java에서는 다음 계약을 지켜야 한다.

1. `a.equals(b) == true`이면 반드시 `a.hashCode() == b.hashCode()`여야 한다.
2. `a.hashCode() == b.hashCode()`라고 해서 반드시 `a.equals(b)`일 필요는 없다.

즉, 같은 객체라면 해시코드도 같아야 하지만, 같은 해시코드가 곧 같은 객체를 뜻하지는 않는다.

## 왜 특히 해시 기반 컬렉션에서 문제가 커지나

예를 들어 `HashMap`에 키를 넣고 다시 조회한다고 하자.

```java
Map<Person, String> map = new HashMap<>();
map.put(new Person("August"), "developer");

System.out.println(map.get(new Person("August")));
```

사람 입장에서는 같은 이름을 가진 `Person`이므로 같은 키처럼 보인다. 하지만 `hashCode()`가 다르면 아예 다른 버킷을 찾아가고, 결국 `null`이 반환될 수 있다.

이런 문제는 테스트가 없으면 뒤늦게 발견되는 경우가 많다. 특히 조회는 실패했는데 컴파일도 되고 예외도 안 나는 식으로 숨어 있기 쉽다.

## 어떤 필드를 기준으로 비교해야 하나

가장 중요한 질문은 "이 객체의 동일성은 무엇으로 정의되는가"이다.

예를 들면:

- 사용자 객체는 `userId`로 볼지
- 주문 객체는 `orderId`로 볼지
- 값 객체는 모든 필드를 비교할지

이 기준이 명확하지 않으면 `equals()`와 `hashCode()` 구현도 흔들린다.

즉, 메서드를 작성하기 전에 먼저 **도메인에서 동일성을 어떻게 정의하는지**를 결정해야 한다.

## 일반적인 구현 예시

```java
public final class Person {
    private final String name;
    private final int age;

    public Person(String name, int age) {
        this.name = name;
        this.age = age;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Person)) return false;
        Person person = (Person) o;
        return age == person.age && Objects.equals(name, person.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name, age);
    }
}
```

이 예시에서 중요한 것은 `equals()`와 `hashCode()`가 **같은 필드 집합**을 기준으로 계산된다는 점이다.

## 실무에서 자주 하는 실수

### 가변 필드를 기준으로 해시코드를 만드는 경우

객체를 `HashSet`에 넣은 뒤, 해시코드 계산에 사용한 필드를 바꾸면 컬렉션 내부 위치와 현재 해시코드가 어긋날 수 있다. 그러면 다시 찾지 못하는 이상한 상태가 된다.

그래서 해시 기반 컬렉션의 키가 되는 객체는 가능하면 불변 객체로 두는 것이 안전하다.

### IDE가 생성한 코드를 그대로 쓰는 경우

IDE 자동 생성은 편리하지만, 비교 대상 필드를 생각 없이 모두 넣으면 도메인 의미와 다른 구현이 될 수 있다. 자동 생성은 시작점일 뿐이고, 최종 기준은 직접 검토해야 한다.

### 상속 구조에서 동일성 규칙이 꼬이는 경우

`instanceof`를 쓸지 `getClass()`를 쓸지에 따라 비교 범위가 달라진다. 상속 구조에서는 대칭성 문제가 생길 수 있기 때문에 값 객체라면 상속보다 조합이 더 나은 경우도 많다.

## 언제 꼭 오버라이드해야 하나

다음 경우에는 거의 필수라고 보면 된다.

- 해시 기반 컬렉션의 키나 원소로 사용할 때
- 값 객체를 만들 때
- 논리적 동일성이 참조 동일성과 다를 때

반대로 엔티티처럼 식별자가 확정되기 전까지 상태가 계속 바뀌는 객체라면, 동일성 기준을 더 신중하게 잡아야 한다.

## 정리

`equals()`와 `hashCode()`는 각각 따로 존재하지만, 실제로는 하나의 계약으로 다뤄야 한다.

- `equals()`는 논리적 동일성을 정의하고
- `hashCode()`는 그 동일성이 해시 컬렉션에서 제대로 동작하도록 보조한다

둘 중 하나라도 어긋나면 `HashMap`, `HashSet`은 조용히 잘못된 동작을 한다. 그래서 중요한 것은 문법이 아니라, **객체 동일성을 어떤 필드로 정의할지 먼저 결정하는 것**이다.
