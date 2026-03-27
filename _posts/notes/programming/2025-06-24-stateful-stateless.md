---
title: Stateful vs Stateless
date: 2025-06-24
categories: [Archive, Programming]
tags: [Stateful, Stateless]
---

## State

소프트웨어에서 상태(State)란 어떤 시점에 객체나 시스템이 가지고 있는 정보, 조건, 또는 상태값을 말한다. 즉, 현재 상황을 나타내는 값들의 집합이다. 예를 들면, 컴퓨터 프로그램의 상태는 변수 값, 로그인 여부, 페이지 위치값 등이 해당된다.

```java
class User {
    String name;      // 이름 변수값 -> 상태
    boolean loggedIn; // 로그인 여부 -> 상태
}
```

웹 개발에서의 상태도 특정 공간(서버 메모리 or DB, 캐시 등)에 저장된 값이다. 사용자가 로그인했는가? 장바구니에 몇 개의 상품이 담겼는가? 마지막으로 본 페이지는 어디인가? 와 같은 정보의 값이 모두 상태이다. *[State (computer science) - Wikipedia](https://en.wikipedia.org/wiki/State_(computer_science))*

## Stateful

Stateful(상태 유지형)은 시스템이나 컴포넌트가 이전의 상호작용(상태)을 기억하고, 그 상태에 기반하여 다음 동작을 결정하는 방식을 말한다. 즉, 시스템이 이전 요청의 상태를 저장하고, 그에 따라 다음 동작을 결정하는 것이다.

예를 들어, 쇼핑몰 장바구니의 상태를 서버에서 기억한다면 stateful하다. 로그인한 상태를 서버가 세션으로 유지하는 경우도 마찬가지이다. 대표적으로 TCP 통신은 연결 상태를 유지하며 데이터의 순서, 전송 여부를 관리하므로 stateful하다.

### 상태 유지 방식

Stateful 시스템은 대부분 다음 중 하나 이상을 통해 상태를 유지한다.

- **서버 메모리/세션**: 로그인 정보, 작업 진행 상황 등 저장 (예: `HttpSession`, Redis 세션)
- **DB 또는 파일 저장소**: 상태 정보를 영속화 (예: 채팅방의 마지막 메시지 읽은 위치)
- **TCP 상태 테이블**: 연결 상태 (`ESTABLISHED`, `CLOSE_WAIT` 등) 유지

### Stateful Architecture: a server remembers who you are

![stateful](/Users/hammac/Study/polynomeer.github.io/assets/img/posts/stateful.png)

stateful 시스템에서 상태는 보통 서버의 메모리, 세션, DB 등에 저장한다. 이때 각 요청의 의미는 이전 상태에 따라 달라진다. 즉, 컨텍스트 의존적이므로 멱등성을 보장하지 못한다.

상태를 저장하는 위치는 개별적이므로 전체 리소스는 증가한다. 장점은 사용자 맞춤 응답이 가능하며, 상호작용(interaction)이 자연스럽다는 것이다. 단점은 개별적으로 저장하므로 서버 확장 및 장애 복구 시 상태를 공유하는 게 어렵고 복잡해진다.

---

## Stateless

**Stateless(무상태)**란, 시스템이나 컴포넌트가 **요청 간에 아무런 상태 정보를 저장하지 않고**, **각 요청을 완전히 독립적으로 처리하는 방식**을 말한다. 참고로, **독립적으로 처리된다**는게 반드시 **동일하게 처리된다**는 의미는 아니므로 멱등성(Idempotent)과는 구별해서 생각해야한다. → [Stateless vs Idempotent](TODO)

예를 들어, REST API는 매 요청마다 필요한 정보(e.g. 인증 토큰)를 모두 포함해야 한다. HTTP도 각 요청은 독립적이며, 서버는 이전 요청 상태를 기억하지 않는다. 브라우저가 보낸 각 요청은 서버에게 새로운 요청처럼 보인다. UDP는 대표적인 무상태 프로토콜이다. 연결없이 데이터를 전송하며, 수신측에서는 수신 여부나 순서를 모른다. 또 함수형 프로그래밍에서는 함수가 외부 상태없이 입력만으로 출력이 결정되는데 (pure function), 이 개념도 stateless라고 볼 수 있다.

### Stateless Architecture: no server remembers who you are

![stateless](/Users/hammac/Study/polynomeer.github.io/assets/img/posts/stateless.png)

Stateless 시스템에서 상태는 저장하지 않으며, 클라이언트가 상태 정보를 직접 포함해서 보낸다. 각 요청의 의미는 동일하므로, 컨텍스트 없이 처리된다.

서버 간 상태 공유는 불필요하므로 확장성은 높다. 이처럼 확장성이 우수하며, 단순하고, 이를 통해 고가용성을 확보할 수 있다는 장점이 있다. 반면에, 상태를 유지하려면 클라이언트나 외부 저장소(Redis 등) 사용이 반드시 필요하다. 

------

## Stateful vs Stateless

### 특징 비교

| 항목                         | Stateless           | Stateful                  |
| ---------------------------- | ------------------- | ------------------------- |
| 요청 간 상태 기억            | 없음                | 있음                      |
| 서버 확장성                  | 쉬움                | 세션 동기화 필요 → 복잡함 |
| 예시                         | REST API, HTTP, UDP | 세션 기반 로그인, TCP     |
| 복잡도                       | 낮음                | 높음                      |
| 사용자(클라이언트) 맞춤 처리 | 불리함              | 유리함                    |

### 실무 예시

| 상황          | Stateless             | Stateful                |
| ------------- | --------------------- | ----------------------- |
| 로그인 처리   | JWT 토큰 (상태 없음)  | 세션 기반 로그인        |
| API 서버 설계 | REST API              | 일부 게임 서버 API 등   |
| 통신 프로토콜 | UDP                   | TCP                     |
| 클러스터 확장 | 쉬움 (서버 상태 없음) | 어렵거나 세션 공유 필요 |

---

## 참고 자료

- [Understanding State: The Foundation for Building Dynamic Programs](https://www.linkedin.com/pulse/understanding-state-foundation-building-dynamic-programs-moni-keo-cjgfc/)
- [Stateful vs. stateless applications](https://www.redhat.com/en/topics/cloud-native-apps/stateful-vs-stateless)
- [Stateful vs Stateless Architectures Explained](https://www.youtube.com/watch?v=20tpk8A_xa0)
- [Stateful vs. Stateless: Understanding the Key Differences](https://www.spiceworks.com/tech/cloud/articles/stateful-vs-stateless/)