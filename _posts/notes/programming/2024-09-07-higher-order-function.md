---
title: Higher-order Function
date: 2024-09-05
categories: [Notes, Programming]
tags: [Functional Programming]
---

고차함수(higher-order function)는 함수를 아규먼트로 전달받거나 함수를 결과로 반환하는 함수를 말한다. 고차함수는 아규먼트로 받은 함수를 필요한 시점에 호출하거나 클로저를 생성하여 반환한다. 자바스크립트의 함수는 일급 객체이므로 값처럼 아규먼트로 전달할 수 있으며 반환할 수도 있다.

## 일급 함수가 전제다

고차함수는 언어가 함수를 일급(first-class)으로 다룰 때 성립한다. MDN은 함수를 다른 변수처럼 다루는 언어, 곧 함수를 다른 함수의 인자로 넘기고, 다른 함수에서 반환하고, 변수에 값으로 대입할 수 있는 언어를 일급 함수를 가진 언어라고 정의한다. 고차함수는 이 성질에서 바로 나오는 결과다 ([MDN](https://developer.mozilla.org/en-US/docs/Glossary/First-class_Function)).

## 왜 쓰는가

반복문 안에서 "무엇을 할지"와 "어떻게 순회할지"가 섞여 있으면 같은 순회 코드를 조건마다 다시 써야 한다. 고차함수는 순회나 실행 시점 같은 공통 흐름을 함수 하나에 두고, 달라지는 동작만 인자로 받는다. 그래서 동작을 조합하고 재사용하기 쉬워진다.

## 함수를 인자로 받는 경우

인자로 넘긴 함수를 콜백(callback)이라고 부른다. 배열의 `map`, `filter`, `reduce`가 대표적인 고차함수다.

```javascript
const numbers = [1, 2, 3, 4, 5];

const evens = numbers.filter((n) => n % 2 === 0); // [2, 4]
const squares = numbers.map((n) => n * n);        // [1, 4, 9, 16, 25]
const sum = numbers.reduce((acc, n) => acc + n, 0); // 15
```

직접 만들어 보면 구조가 드러난다. `repeat`은 몇 번 반복할지만 알고, 매번 무엇을 할지는 호출하는 쪽이 정한다.

```javascript
function repeat(n, action) {
  for (let i = 0; i < n; i++) {
    action(i);
  }
}

repeat(3, (i) => console.log(`run ${i}`));
```

## 함수를 반환하는 경우

함수를 반환하는 고차함수는 반환된 함수가 바깥 함수의 변수를 기억하는 클로저를 만든다.

```javascript
function multiplier(factor) {
  return (x) => x * factor;
}

const double = multiplier(2);
const triple = multiplier(3);

double(5); // 10
triple(5); // 15
```

`multiplier`가 반환된 뒤에도 `double`은 `factor`가 2였다는 것을 기억한다. 이 동작은 [Closure](/posts/closure/)에서 자세히 다룬다.

## 주의할 점

- 콜백이 바깥 상태를 바꾸면 고차함수를 쓰더라도 코드의 흐름을 추적하기 어렵다. `map`이나 `filter`에 넘기는 함수는 [순수함수](/posts/pure-function/)로 두는 편이 안전하다.
- 메서드를 콜백으로 넘기면 `this` 바인딩이 바뀔 수 있다. 화살표 함수로 감싸거나 `bind()`로 고정한다.
- `map`, `filter`를 여러 번 이어 붙이면 그때마다 중간 배열이 생긴다. 큰 배열에서는 한 번의 `reduce`나 반복문이 나을 수 있다.

## 참고

- [고차함수란?](https://velog.io/@victor/%EA%B3%A0%EC%B0%A8%ED%95%A8%EC%88%98%EB%9E%80%EA%B3%A0%EC%B0%A8%ED%95%A8%EC%88%98) — velog (@victor)
- [First-class Function](https://developer.mozilla.org/en-US/docs/Glossary/First-class_Function) — MDN Web Docs
- [Closure](/posts/closure/)
- [Pure Function](/posts/pure-function/)
