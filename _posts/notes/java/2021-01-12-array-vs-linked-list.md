---
title: "배열과 연결 리스트는 언제 차이가 커지는가"
date: 2021-01-12
categories: [Notes, Java]
tags: [Java, Array, LinkedList, Data Structure]
---

배열과 연결 리스트는 모두 선형 자료구조지만, 성능 특성과 사용 시나리오는 꽤 다르다. 차이는 결국 **어디에 강하고 어디에서 비용이 드는가**에 있다.

## 두 구조가 메모리에 놓이는 방식

배열은 원소를 한 덩어리의 연속된 공간에 차례로 둔다. 원소 크기가 같으므로 `i`번째 원소의 위치는 "시작 주소 + i × 원소 크기"로 바로 계산된다.

연결 리스트는 원소마다 노드를 따로 만들고, 각 노드가 다음 노드(이중 연결 리스트라면 이전 노드도)를 가리킨다. 노드는 메모리 여기저기에 흩어져 있을 수 있고, `i`번째 원소에 가려면 머리부터 링크를 따라가야 한다. 연결 방식에 따른 종류는 [단일, 이중, 환형 연결 리스트](/posts/linked-list-types/)에 정리했다.

```text
배열         [ 10 | 20 | 30 | 40 ]        연속된 칸, 위치를 계산으로 찾는다

연결 리스트   [10]-> [20]-> [30]-> [40]    노드마다 다음 노드를 가리킨다
```

아래의 차이는 모두 이 배치에서 나온다.

## 배열의 강점

- 인덱스 접근이 빠르다
- 메모리 구조가 연속적이다
- 캐시 친화적이다

그래서 조회 중심 작업에서는 배열 기반 구조가 유리한 경우가 많다.

캐시 친화적이라는 말은 CPU가 메모리를 읽을 때 필요한 값 하나만이 아니라 주변 영역을 함께 캐시로 가져온다는 점과 관련이 있다. 배열을 앞에서부터 순회하면 다음 원소가 이미 캐시에 올라와 있을 가능성이 높다. 연결 리스트는 다음 노드가 어디 있을지 모르므로 이 이점을 얻기 어렵다.

## 연결 리스트의 강점

- 삽입과 삭제가 구조적으로 유연하다
- 노드를 연결만 바꾸면 된다

다만 "항상 빠른 삽입/삭제"라고 단순화하면 안 된다. 어느 위치의 노드인지 먼저 찾아야 한다면 탐색 비용이 따로 든다.

배열의 중간에 원소를 넣으려면 그 뒤의 원소를 모두 한 칸씩 밀어야 한다. 연결 리스트는 앞뒤 노드의 링크 두세 개만 바꾸면 된다. 연결 리스트의 삽입이 빠르다는 말은 이 "링크를 바꾸는 단계"만 본 것이다.

## 가장 큰 차이: 접근 방식

배열은 임의 접근(random access)에 강하다.

연결 리스트는 순차 접근(sequential access)에 가깝다.

즉:

- 특정 인덱스 조회가 많다 -> 배열 쪽이 유리
- 앞뒤 삽입/삭제 중심이다 -> 연결 리스트가 유리할 수 있다

연산별 비용을 표로 정리하면 다음과 같다. n은 원소 수다.

| 연산 | 배열 (동적 배열) | 연결 리스트 (이중) |
| --- | --- | --- |
| i번째 원소 조회 | O(1) | O(n) |
| 맨 뒤에 추가 | 분할 상환 O(1) | O(1) |
| 맨 앞에 추가 | O(n) | O(1) |
| 위치를 이미 알고 있는 곳에 삽입 | O(n) (뒤 원소 이동) | O(1) |
| i번째 위치에 삽입 | O(n) (뒤 원소 이동) | O(n) (위치 탐색) |
| 값으로 검색 | O(n) | O(n) |

마지막 두 줄이 중요하다. "i번째 위치에 삽입"처럼 위치를 찾는 일부터 해야 하는 경우, 연결 리스트도 결국 O(n)이다.

## Java 표준 라이브러리에서는

Java의 `ArrayList`와 `LinkedList` 문서는 이 차이를 그대로 적어 둔다.

- `ArrayList`: `size`, `isEmpty`, `get`, `set`, `iterator`, `listIterator`는 상수 시간이고, `add`는 분할 상환 상수 시간(amortized constant time)이다. 즉 원소 n개를 추가하는 데 O(n)이 든다. 나머지 연산은 대략 선형 시간이며, 상수 계수가 `LinkedList`보다 낮다([ArrayList Javadoc](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayList.html)).
- `LinkedList`: `List`와 `Deque`의 이중 연결 리스트 구현이다. 인덱스로 접근하는 연산은 지정한 인덱스에 더 가까운 쪽 끝(처음 또는 끝)부터 리스트를 순회한다([LinkedList Javadoc](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/LinkedList.html)).

분할 상환 상수 시간은 대부분의 추가는 O(1)이지만, 내부 배열이 가득 차서 더 큰 배열로 옮기는 순간에는 O(n)이 들고, 그 비용을 전체 추가 횟수로 나누면 한 번당 상수라는 뜻이다.

`LinkedList`에서 삽입의 장점을 실제로 얻으려면 위치를 다시 찾지 않아야 한다. `list.add(i, x)`는 매번 i번째까지 순회하지만, `ListIterator`로 순회하면서 그 자리에서 `add`나 `remove`를 호출하면 링크만 바꾼다.

```java
ListIterator<String> it = linkedList.listIterator();
while (it.hasNext()) {
    if (it.next().isBlank()) {
        it.remove(); // 현재 위치의 노드를 바로 떼어 낸다
    }
}
```

## 실무에서는 왜 배열 기반 구조가 더 자주 쓰이나

실무의 많은 로직은 조회 빈도가 높고, 메모리 지역성의 이점도 크다. 그래서 `ArrayList` 같은 배열 기반 구조가 기본 선택이 되는 경우가 많다.

연결 리스트는 이론적으로는 삽입/삭제 장점이 있지만, 실제 애플리케이션에서는 노드 객체 오버헤드와 순차 탐색 비용 때문에 생각보다 덜 유리할 수 있다.

노드 객체 오버헤드는 원소 하나마다 값 외에 다음, 이전 노드를 가리키는 참조와 객체 자체의 헤더가 따로 붙는다는 뜻이다. 원소가 많을수록 같은 데이터를 담는 데 드는 메모리가 배열보다 커진다.

큐나 스택처럼 양 끝만 다루는 경우에도 `LinkedList`가 유일한 선택은 아니다. `ArrayDeque` 문서는 이 클래스가 스택으로 쓸 때 `Stack`보다, 큐로 쓸 때 `LinkedList`보다 빠를 가능성이 높다고 적는다([ArrayDeque Javadoc](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayDeque.html)). 연결 리스트로 큐를 직접 구현할 때의 포인트는 [LinkedList로 Queue를 구현할 때](/posts/implementing-queue-with-linked-list/)에 따로 적었다.

## 정리

배열과 연결 리스트의 비교는 단순히 `조회 vs 삽입` 표로 끝나는 문제가 아니다. 실제로는:

- 접근 패턴
- 메모리 비용
- 표준 라이브러리 구현 특성

을 함께 봐야 한다. 기본 선택은 배열 기반 구조가 많지만, 양끝 조작과 연결 중심 문제에서는 연결 리스트가 더 자연스러운 경우도 분명히 있다. Java에서 배열과 `List` 인터페이스 자체를 어떻게 구분해 쓰는지는 [Java에서 배열과 리스트를 어떻게 구분해야 하는가](/posts/array-and-list-in-java/)에서 이어진다.

## 참고

- [ArrayList](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayList.html) — Java SE 21 API
- [LinkedList](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/LinkedList.html) — Java SE 21 API
- [ArrayDeque](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayDeque.html) — Java SE 21 API
