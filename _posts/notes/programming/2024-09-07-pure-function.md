---
title: Pure Function
date: 2024-09-05
categories: [Notes, Programming]
tags: [Functional Programming]
---

컴퓨터 프로그래밍에서 순수함수(pure function)란, 다음과 같은 속성을 갖는다.

1. 함수가 같은 아규먼트(입력)에 대해서 항상 같은 리턴값(결과)을 낸다.
2. 함수의 평가는 [사이드 이펙트](https://en.wikipedia.org/wiki/Side_effect_(computer_science))가 없다.

## 두 조건의 의미

첫 번째 조건은 결과가 인자 외의 것에 의존하지 않는다는 뜻이다. Wikipedia는 지역 static 변수, 비지역 변수, 가변 참조 인자, 입력 스트림에 따라 결과가 달라지면 안 된다고 정리한다. 두 번째 조건은 함수가 바깥에 흔적을 남기지 않는다는 뜻이다. 비지역 변수나 가변 참조 인자를 바꾸거나 입출력 스트림을 건드리면 사이드 이펙트다 ([Wikipedia](https://en.wikipedia.org/wiki/Pure_function)).

```javascript
// 순수함수
function add(a, b) {
  return a + b;
}

// 순수하지 않음: 결과가 바깥 변수에 의존한다
let rate = 0.1;
function tax(price) {
  return price * rate;
}

// 순수하지 않음: 인자로 받은 배열을 바꾼다
function addItem(cart, item) {
  cart.push(item);
  return cart;
}

// 순수한 버전: 새 배열을 반환한다
function addItemPure(cart, item) {
  return [...cart, item];
}
```

`Math.random()`, `Date.now()`, `console.log()`, 네트워크 요청을 호출하는 함수도 같은 이유로 순수하지 않다.

## 왜 중요한가

순수함수의 호출은 그 결과값으로 바꿔 써도 프로그램의 동작이 바뀌지 않는다. 이 성질을 참조 투명성(referential transparency)이라고 한다. 여기서 몇 가지 이점이 따라온다.

- 테스트: 입력과 기대 출력만으로 검증할 수 있다. 목(mock)이나 사전 상태 설정이 필요 없다.
- 캐싱: 같은 입력이면 같은 출력이므로 결과를 조회 테이블에 저장해 재사용(메모이제이션)할 수 있다.
- 추론과 최적화: 호출 순서나 횟수가 결과에 영향을 주지 않으므로 코드를 읽기 쉽고, 컴파일러도 최적화하기 쉽다.

```javascript
function memoize(fn) {
  const cache = new Map();
  return (n) => {
    if (!cache.has(n)) cache.set(n, fn(n));
    return cache.get(n);
  };
}

const slowSquare = (n) => n * n;
const fastSquare = memoize(slowSquare); // slowSquare가 순수하기 때문에 안전하다
```

## 주의할 점

- 프로그램이 의미 있는 일을 하려면 결국 입출력이 필요하다. 입출력은 본질적으로 순수하지 않으므로, 순수한 계산과 부수효과가 있는 경계를 나누는 것이 목표다. 순수 함수형 언어는 I/O 모나드로 이 경계를 표현한다.
- 순수하지 않은 함수에 메모이제이션을 적용하면 오래된 값을 돌려주는 버그가 생긴다.
- 함수 안에서 지역 변수를 바꾸는 것은 바깥에서 관찰할 수 없으므로 순수성을 깨지 않는다. 문제는 바깥에 보이는 변경이다.

## 참고

- [Pure function](https://en.wikipedia.org/wiki/Pure_function) — Wikipedia
- [Side effect (computer science)](https://en.wikipedia.org/wiki/Side_effect_(computer_science)) — Wikipedia
- [순수 함수란? (함수형 프로그래밍의 뿌리, 함수의 부수효과를 없앤다)](https://jeong-pro.tistory.com/23) — jeong-pro.tistory.com
- [수학에서 기원한 프로그래밍 패러다임, 순수 함수](https://evan-moon.github.io/2019/12/29/about-pure-functions/) — evan-moon.github.io
- [What Is a Pure Function in JavaScript?](https://www.freecodecamp.org/news/what-is-a-pure-function-in-javascript-acb887375dfe/) — freeCodeCamp
- [Functional Programming: Pure Functions](https://www.sitepoint.com/functional-programming-pure-functions/) — SitePoint
- [Basics of JavaScript Pure Functions](https://blog.bitsrc.io/basics-of-javascript-pure-functions-3e6f3437066) — blog.bitsrc.io
- [What are Pure Functions?](https://programmingwithmosh.com/javascript/what-are-pure-functions/) — programmingwithmosh.com: Programming with Mosh
- [Is this a pure function?](https://stackoverflow.com/questions/58744557/is-this-a-pure-function) — Stack Overflow
- [Pure Functions](https://elmprogramming.com/pure-functions.html) — elmprogramming.com: Beginning Elm
- [Higher-order Function](/posts/higher-order-function/)
