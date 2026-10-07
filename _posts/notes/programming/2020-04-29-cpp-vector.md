---
title: "C++의 vector를 어떻게 이해해야 하는가"
date: 2020-04-29
categories: [Notes, Programming]
tags: [C++, Vector, Dynamic Array, Data Structure]
---

`vector`는 C++에서 가장 자주 쓰는 컨테이너 중 하나다. 개념적으로는 동적 배열(dynamic array)에 가깝다.

---

## vector의 핵심

- 연속된 메모리 공간을 사용한다
- 크기를 동적으로 늘릴 수 있다
- 인덱스 접근이 빠르다

즉, 배열의 장점과 동적 확장의 편의성을 함께 가져가는 구조다.

cppreference는 `vector`의 원소가 연속으로 저장되므로 반복자뿐 아니라 일반 포인터에 오프셋을 더하는 방식으로도 접근할 수 있고, `vector` 원소에 대한 포인터를 배열 원소 포인터를 기대하는 함수에 넘길 수 있다고 설명한다([cppreference: std::vector](https://en.cppreference.com/w/cpp/container/vector)). C 스타일 API에 `v.data()`를 넘길 수 있는 이유다.

---

## size와 capacity

`vector`를 이해하는 데 가장 중요한 구분은 크기(size)와 용량(capacity)이다.

- `size()`: 지금 들어 있는 원소 수
- `capacity()`: 재할당 없이 담을 수 있는 원소 수

`vector`는 원소를 넣을 때마다 메모리를 새로 잡지 않는다. 앞으로 늘어날 것을 대비해 여유 공간을 미리 잡아 두고, 그 여유가 다 찼을 때만 더 큰 공간으로 옮긴다. 그래서 같은 원소 수의 정적 배열보다 메모리를 더 쓰는 경우가 많다.

```cpp
#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> v;
    for (int i = 0; i < 10; ++i) {
        v.push_back(i);
        cout << "size=" << v.size() << " capacity=" << v.capacity() << '\n';
    }
    return 0;
}
```

이 코드를 돌려 보면 `size`는 1씩 늘지만 `capacity`는 가끔씩 한꺼번에 커진다. 한 번에 얼마나 커지는지는 표준 라이브러리 구현에 따라 다를 수 있으므로, 출력되는 capacity 값은 환경마다 다를 수 있다.

---

## 연산별 비용

cppreference가 정리한 복잡도는 다음과 같다.

| 연산 | 복잡도 |
| --- | --- |
| 임의 접근 (`v[i]`, `v.at(i)`) | O(1) |
| 맨 뒤 삽입, 삭제 (`push_back`, `pop_back`) | 분할 상환 O(1) |
| 중간 삽입, 삭제 (`insert`, `erase`) | 끝까지의 거리에 비례하는 O(n) |

맨 뒤 삽입이 분할 상환 O(1)인 이유는 위의 capacity 때문이다. 대부분의 `push_back`은 남은 공간에 원소를 하나 놓기만 한다. 공간이 부족한 순간에만 전체 원소를 새 공간으로 옮기는 O(n) 작업이 생기고, 이 비용을 전체 삽입 횟수에 나눠 보면 한 번당 상수가 된다.

---

## 왜 자주 쓰이는가

대부분의 문제 풀이와 일반 애플리케이션 코드에서:

- 순차 저장
- 인덱스 접근
- 뒤에 원소 추가

가 많기 때문이다. 이런 경우 `vector`는 기본 선택이 되기 쉽다.

문제 풀이에서 그래프의 인접 리스트를 `vector<int> adj[N]`처럼 표현하는 것도 같은 이유다. 각 정점의 이웃을 뒤에 계속 추가하고, 탐색할 때는 앞에서부터 순서대로 읽는다.

---

## 주의할 점

크기가 늘어날 때 내부 버퍼를 재할당하면서 기존 원소를 복사할 수 있다. 따라서 참조나 포인터가 무효화될 수 있다는 점을 알아야 한다.

cppreference의 `push_back` 설명은 이를 정확히 적는다. 연산 후 새 `size()`가 이전 `capacity()`보다 크면 재할당이 일어나고, 이때 `end()`를 포함한 모든 반복자와 원소에 대한 모든 참조가 무효화된다. 그렇지 않으면 `end()` 반복자만 무효화된다([cppreference: push_back](https://en.cppreference.com/w/cpp/container/vector/push_back)).

이 규칙 때문에 아래 코드는 위험하다.

```cpp
vector<int> v = {1, 2, 3};
int& first = v[0];
v.push_back(4);      // 재할당이 일어나면 first는 해제된 메모리를 가리킨다
cout << first;       // 정의되지 않은 동작이 될 수 있다
```

반복문 안에서 같은 `vector`에 `push_back`하면서 반복자로 순회하는 코드도 같은 이유로 깨질 수 있다. `erase`도 비슷하다. 지운 지점과 그 뒤의 반복자, 참조가 무효화된다([cppreference: erase](https://en.cppreference.com/w/cpp/container/vector/erase)).

---

## 재할당을 줄이는 방법: reserve

넣을 원소 수를 미리 안다면 `reserve`로 용량을 먼저 확보한다. cppreference는 원소 수를 미리 알 때 `reserve()`로 재할당을 없앨 수 있다고 설명한다.

```cpp
vector<int> v;
v.reserve(n);              // capacity를 n 이상으로 확보
for (int i = 0; i < n; ++i) {
    v.push_back(i);        // n개까지는 재할당이 일어나지 않는다
}
```

`reserve(new_cap)`는 `new_cap`이 현재 용량보다 클 때만 새 공간을 잡고, 그때는 모든 반복자와 참조가 무효화된다. 현재 용량 이하라면 아무것도 하지 않는다([cppreference: reserve](https://en.cppreference.com/w/cpp/container/vector/reserve)). `reserve`는 용량만 늘리고 크기는 그대로라는 점도 헷갈리기 쉽다. `reserve(n)` 직후에 `v[0]`에 접근하면 안 된다. 크기까지 n으로 만들려면 `resize(n)`을 쓴다.

---

## operator[]와 at

- `v[i]`: 범위 검사를 하지 않는다. 존재하지 않는 원소에 접근하면 정의되지 않은 동작이다.
- `v.at(i)`: 범위 검사를 하고, 범위를 벗어나면 `std::out_of_range` 예외를 던진다.

문제 풀이처럼 성능이 중요하고 인덱스가 확실한 곳에서는 `[]`를, 입력에 따라 인덱스가 범위를 벗어날 수 있는 곳에서는 `at`을 쓰면 버그를 일찍 발견할 수 있다.

---

## 정리

`vector`는 C++에서의 기본 동적 배열이다. 빠른 인덱스 접근과 유연한 크기 조절이 장점이지만, 재할당과 참조 무효화 특성을 함께 이해하고 써야 한다.

## 참고

- [std::vector](https://en.cppreference.com/w/cpp/container/vector) — cppreference
- [std::vector::push_back](https://en.cppreference.com/w/cpp/container/vector/push_back) — cppreference
- [std::vector::reserve](https://en.cppreference.com/w/cpp/container/vector/reserve) — cppreference
- [std::vector::erase](https://en.cppreference.com/w/cpp/container/vector/erase) — cppreference
- [std::vector::at](https://en.cppreference.com/w/cpp/container/vector/at) — cppreference
- [std::vector::operator\[\]](https://en.cppreference.com/w/cpp/container/vector/operator_at) — cppreference
