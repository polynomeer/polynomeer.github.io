---
title: "Java에서 배열과 리스트를 어떻게 구분해야 하는가"
date: 2021-01-12
categories: [Notes, Java]
tags: [Java, Array, List, ArrayList, Collections]
---

Java에서 여러 값을 담는 가장 기본적인 선택지는 배열과 리스트다. 둘 다 순서를 가진 데이터를 담는다는 점은 같지만, 사용 방식과 제약은 꽤 다르다.

## 배열의 특징

배열은 같은 타입의 값을 고정된 크기로 담는 구조다.

```java
int[] numbers = new int[10];
```

배열의 핵심 특징:

- 크기가 고정된다
- 인덱스로 접근한다
- 메모리 구조가 단순하다

배열은 성능과 단순성이 장점이지만, 크기 변경이 불편하다.

Java 언어 명세(JLS) 10장은 이 성질을 명확히 적어 둔다. 배열은 동적으로 생성되는 객체이고, 한 번 만들어진 배열 객체의 길이는 바뀌지 않는다("Once an array object is created, its length never changes.", [JLS §10](https://docs.oracle.com/javase/specs/jls/se21/html/jls-10.html)). 길이는 `public final` 필드인 `length`로 읽는다. 더 큰 배열이 필요하면 새 배열을 만들어 값을 복사하고, 변수가 새 배열을 가리키게 해야 한다.

인덱스는 0부터 시작하며, 길이가 n인 배열은 0부터 n-1까지로 접근한다. 모든 접근은 실행 시점에 범위 검사를 거치고, 범위를 벗어나면 `ArrayIndexOutOfBoundsException`이 던져진다.

## 리스트의 특징

리스트는 컬렉션 프레임워크 안에서 크기를 유연하게 다룰 수 있는 추상화다.

```java
List<String> names = new ArrayList<>();
```

리스트의 장점:

- 크기를 동적으로 조절할 수 있다
- 컬렉션 API를 함께 쓸 수 있다
- 다양한 구현체를 상황에 따라 바꿀 수 있다

즉, 애플리케이션 코드에서는 배열보다 리스트가 더 자주 등장한다.

가장 많이 쓰는 구현체인 `ArrayList`도 내부는 배열이다. Javadoc은 `ArrayList`를 `List` 인터페이스의 "크기 조절 가능한 배열 구현(Resizable-array implementation)"이라고 소개한다([ArrayList Javadoc](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayList.html)). 내부 배열이 가득 차면 더 큰 배열을 만들어 옮기는데, 같은 문서는 `get`, `set`, `size`는 상수 시간이고 `add`는 분할 상환(amortized) 상수 시간, 즉 n개를 추가하는 데 O(n)이 든다고 설명한다. 가끔 일어나는 배열 확장 비용을 전체 추가 횟수에 나눠 보면 한 번당 비용이 상수라는 뜻이다. 리스트가 "크기를 동적으로 조절한다"는 말은 배열의 고정 크기 제약을 없앴다는 뜻이 아니라, 그 제약을 구현 안에 감췄다는 뜻에 가깝다.

## 언제 배열이 더 적합한가

- 크기가 고정된 데이터
- 성능과 단순성이 중요할 때
- 라이브러리나 저수준 API가 배열을 요구할 때

예를 들어 이미지 버퍼, 고정 길이 테이블, 원시 타입 처리에서는 배열이 자연스럽다.

원시 타입에서 차이가 특히 크다. `int[]`는 `int` 값을 그대로 연속해서 담지만, 제네릭은 원시 타입을 쓸 수 없으므로 리스트는 `List<Integer>`가 되어야 한다. 이때 각 원소는 `Integer` 객체이고 리스트는 그 객체들의 참조를 담는다. 숫자 백만 개를 담는다면 `int[]`는 값 백만 개로 끝나지만, `List<Integer>`는 참조 백만 개와 (캐시되지 않는 값이라면) `Integer` 객체들을 함께 만든다. 값을 넣고 꺼낼 때마다 박싱과 언박싱도 일어난다.

## 언제 리스트가 더 적합한가

- 원소 수가 가변적일 때
- 추가/삭제가 자주 일어날 때
- 컬렉션 API 활용이 필요할 때

대부분의 비즈니스 로직에서는 리스트가 더 실용적이다.

메서드의 파라미터와 반환 타입을 `List`로 선언하면, 호출하는 쪽은 구현체가 `ArrayList`인지 다른 것인지 몰라도 된다. 나중에 구현체를 바꿔도 시그니처가 그대로 유지된다. 정렬, 필터링, 스트림 같은 API를 바로 쓸 수 있다는 점도 리스트를 고르는 실용적인 이유다. 다만 "추가/삭제가 자주 일어날 때"는 끝에 추가하는 경우를 말한다. `ArrayList`의 중간에 넣거나 빼면 뒤의 원소를 모두 한 칸씩 옮겨야 하므로 선형 시간이 든다. 이 차이는 [배열과 연결 리스트는 언제 차이가 커지는가](/posts/array-vs-linked-list/)에서 더 다뤘다.

## 배열과 리스트를 혼동하기 쉬운 지점

배열은 언어 차원의 구조고, `List`는 인터페이스다. 그래서 둘은 단순히 "옛날 것 vs 최신 것" 관계가 아니라, 추상화 수준이 다르다.

- 배열: 언어 기본 구조
- 리스트: 컬렉션 프레임워크 추상화

### 타입 검사 시점이 다르다

배열은 공변(covariant)이다. `String`이 `Object`의 하위 타입이면 `String[]`도 `Object[]`의 하위 타입으로 취급된다. 그래서 다음 코드는 컴파일된다.

```java
Object[] objects = new String[1];
objects[0] = 1; // 컴파일은 되지만 실행 시 ArrayStoreException
```

JLS §10.5는 배열 원소에 대입할 때마다 실행 시점에 타입을 검사하고, 맞지 않으면 `ArrayStoreException`을 던진다고 설명한다. 반면 제네릭은 불공변(invariant)이라 `List<String>`을 `List<Object>` 변수에 대입하는 것 자체가 컴파일 오류다. 배열은 잘못된 대입을 실행 중에 발견하고, 리스트는 컴파일 시점에 막는다.

### 배열을 리스트로 바꿀 때

배열과 리스트를 오가는 코드에서 자주 틀리는 부분이 있다. `Arrays.asList`는 새 리스트를 만드는 것이 아니라 원래 배열을 그대로 감싼 고정 크기 리스트를 돌려준다. Javadoc에 따르면 리스트를 고치면 배열에, 배열을 고치면 리스트에 반영된다([Arrays.asList Javadoc](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Arrays.html#asList%28T...%29)).

```java
String[] array = {"a", "b", "c"};
List<String> view = Arrays.asList(array);

view.set(0, "x");      // array[0]도 "x"가 된다
view.add("d");         // UnsupportedOperationException: 크기를 바꿀 수 없다

List<String> copy = new ArrayList<>(Arrays.asList(array)); // 독립된 가변 리스트
```

Java 9부터 쓸 수 있는 `List.of`는 또 다르다. `List` Javadoc의 "Unmodifiable Lists" 절에 따르면 이 리스트는 원소를 추가, 삭제, 교체할 수 없고(변경 메서드는 `UnsupportedOperationException`), `null` 원소를 허용하지 않는다([List Javadoc](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/List.html)).

| 생성 방법 | 크기 변경 | 원소 교체 | 원본 배열과 연결 | null |
| --- | --- | --- | --- | --- |
| `Arrays.asList(array)` | 불가 | 가능 | 연결됨 | 허용 |
| `List.of(...)` | 불가 | 불가 | 없음 | 불허 |
| `new ArrayList<>(...)` | 가능 | 가능 | 없음 | 허용 |

반대로 리스트를 배열로 바꿀 때는 `toArray`를 쓴다. Javadoc은 이 메서드를 배열 기반 API와 컬렉션 기반 API 사이의 다리라고 설명한다. `list.toArray(new String[0])`처럼 원하는 타입의 배열을 넘기면 그 타입의 배열을 돌려받는다.

## 정리

배열은 고정 크기와 단순성이 강점이고, 리스트는 가변성과 API 활용성이 강점이다. 어떤 것이 더 좋다기보다, **데이터 크기 변화와 사용 맥락에 어떤 쪽이 더 맞는가**를 기준으로 고르는 편이 정확하다.

추가로 기억할 기준은 두 가지다. 원시 타입을 대량으로 다룬다면 박싱 비용이 없는 배열이 유리하고, 타입 안전성과 API 계약이 중요하다면 컴파일 시점에 검사되는 리스트가 유리하다. 둘을 변환할 때는 `Arrays.asList`가 원본 배열을 공유하는 고정 크기 뷰라는 점을 먼저 확인해야 한다.

## 참고

- [The Java Language Specification, Java SE 21, Chapter 10. Arrays](https://docs.oracle.com/javase/specs/jls/se21/html/jls-10.html) — Oracle Docs
- [ArrayList (Java SE 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayList.html) — Oracle Docs
- [List (Java SE 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/List.html) — Oracle Docs
- [Arrays.asList (Java SE 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Arrays.html#asList%28T...%29) — Oracle Docs
