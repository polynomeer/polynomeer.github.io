---
title: JavaScript setTimeout()
date: 2024-09-05
categories: [Notes, Programming]
tags: [JavaScript]
---

`setTimeout()`은 지정한 시간이 지난 뒤 함수나 코드를 한 번 실행하도록 타이머를 등록하는 함수다. 브라우저에서는 `window`의 메서드이고, 반환값은 타이머를 식별하는 양의 정수다 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout)).

## 왜 필요한가

JavaScript 프로그램은 한 스레드에서 실행되므로, 오래 걸리는 작업을 기다리는 동안 다른 일을 할 수 없다. `setTimeout()`은 콜백을 예약만 하고 즉시 반환하는 비동기 함수라서, 나중에 할 일을 지금의 실행 흐름에서 떼어 놓을 수 있다. 일정 시간 뒤에 알림을 띄우거나, 입력이 멈춘 뒤에만 검색 요청을 보내는 디바운스 같은 패턴이 이 위에서 만들어진다.

## 사용법

```javascript
setTimeout(func)
setTimeout(func, delay)
setTimeout(func, delay, param1, param2 /* ... */)
```

`delay`는 밀리초 단위이고 생략하면 0이다. 세 번째 인자부터는 콜백에 그대로 전달된다. 반환된 ID를 `clearTimeout()`에 넘기면 실행 전에 취소할 수 있다.

```javascript
const id = setTimeout((name) => {
  console.log(`hello, ${name}`);
}, 1000, "polynomeer");

// 1초가 지나기 전에 취소
clearTimeout(id);
```

## delay 0은 즉시가 아니다

`setTimeout()`은 콜백을 예약하고 바로 반환한다. `delay`를 0으로 줘도 콜백은 현재 실행 중인 코드가 끝난 뒤, 다음 이벤트 사이클에서 실행된다.

```javascript
console.log("1");
setTimeout(() => console.log("3"), 0);
console.log("2");
// 1, 2, 3 순서로 출력된다
```

`delay`는 최소 대기 시간이지 실행 시각의 보장이 아니다. 앞선 코드가 오래 실행되면 콜백은 그만큼 늦어진다.

## 주의할 점

- 중첩 호출의 최소 지연: 브라우저는 `setTimeout`이 중첩해서 5번 예약된 뒤부터 최소 4ms의 지연을 강제한다.
- 비활성 탭: 백그라운드 탭에서는 타이머가 더 강하게 늦춰진다. Firefox 데스크톱은 비활성 탭에 최소 1초를 적용한다.
- 최대값: `delay`는 부호 있는 32비트 정수로 변환되므로 2147483647ms(약 24.8일)를 넘기면 오버플로가 일어나 즉시 실행되거나 엉뚱한 시점에 실행될 수 있다.
- `this` 유실: 객체의 메서드를 그대로 넘기면 `this`가 그 객체를 가리키지 않는다. 화살표 함수로 감싸거나 `bind()`를 쓴다.

```javascript
setTimeout(() => counter.count("bar"), 1000);
setTimeout(counter.count.bind(counter), 1000, "bar");
```

- 문자열 코드: 함수 대신 문자열을 넘기면 그 값을 코드로 실행한다. MDN은 이런 API를 인젝션 싱크로 분류하고 XSS 경로가 될 수 있다고 경고한다. 항상 함수를 넘긴다.

## 참고

- [Window: setTimeout() method](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout) — MDN Web Docs
- [Introducing asynchronous JavaScript](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Async_JS/Introducing) — MDN Web Docs
