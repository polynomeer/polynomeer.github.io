---
title: Stateless(무상태)가 Idempotent(멱등성)을 의미하는가?
date: 2025-07-03
categories: [Notes, Web]
tags: [Stateless, Idempotency]
---

## "Stateless(무상태)"가 "Idempotent(멱등성)"을 의미하는가?

결론부터 말하면 "아니다". 두 개념은 관련은 있지만 다른 의미를 가지며, **Stateless하다고 해서 반드시 Idempotent한 것은 아니다.**

Stateless 애플리케이션은 종종 멱등성을 고려해 설계되고, 멱등성은 무상태 서비스에서 바람직한 특성이다. 그래도 두 개념은 서로 다르다. Stateless한 애플리케이션은 각 요청을 독립적으로 처리하며, 저장된 세션 정보에 의존하지 않는다. 그렇다고 해서 모든 작업이 멱등성을 가지는 것은 아니다.

두 용어의 출처부터 보면 차이가 분명하다. REST의 stateless 제약을 정의한 [Fielding의 논문 5.1.3절](https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm#sec_5_1_3)은 클라이언트의 각 요청이 그 요청을 이해하는 데 필요한 정보를 모두 담아야 하고 서버에 저장된 문맥을 이용할 수 없다고 쓰고, "Session state is therefore kept entirely on the client."(따라서 세션 상태는 전부 클라이언트가 가진다)라고 덧붙인다. 반면 [RFC 9110 9.2.2절](https://www.rfc-editor.org/rfc/rfc9110.html#idempotent.methods)은 같은 요청을 여러 번 보냈을 때 서버에 의도한 효과가 한 번 보낸 것과 같으면 그 메서드를 멱등(idempotent)이라고 정의한다. 앞의 것은 세션 상태를 어디에 두는지의 문제이고, 뒤의 것은 반복 요청의 효과에 관한 문제다.

그렇다면, 역은 성립할까? 즉, 멱등성이 보장되면 무상태일까? 이것도 아니다. 멱등성은 요청을 여러 번 반복해도 시스템의 최종 상태가 동일한지를 보는 개념이다. Stateless는 요청 처리 시 과거의 상태나 세션을 저장하고 사용하지 않는지에 관한 개념이다. 즉, 멱등성은 "결과"에 관한 것이고, Stateless는 "처리 방식"에 관한 것이다.

실생활에서의 예시를 살펴보자. 리모컨의 채널이나 볼륨의 +/- 조작은 Stateless하면서 멱등적이지 않다.

- 리모컨은 현재 채널이나 볼륨 상태를 기억하지 않는다.
- 오직 "채널 올려", "볼륨 내려" 같은 입력 명령만 보낸다.
- TV가 현재 상태를 추적하며 해당 입력을 해석해 반응한다.

즉, 리모컨은 명령을 기억하지 않으며, 각 입력은 독립적이다(Stateless).

하지만 동일한 명령을 반복할 경우 시스템 상태가 계속 바뀐다(Not Idempotent).

- `볼륨 올리기` 명령을 3번 보내면, 볼륨이 1 → 2 → 3 으로 변한다.
- 따라서 같은 명령을 반복하면 상태가 계속 변한다.

리모컨에서 채널 or 볼륨을 숫자로 설정한다면 어떨까?

- `볼륨을 10으로 설정`은 멱등적이다. 몇 번 보내든 결과는 항상 볼륨 10이다.
- `채널을 11번으로 설정`도 멱등적이다. 몇 번 보내든 결과는 항상 채널 11번이다.

같은 리모컨이라도 명령의 유형에 따라 멱등성 여부가 달라진다. 그래서 멱등성을 확보하려면 **"상태 변화량"이 아닌 "목표 상태"를 명시**하는 방식으로 설계해야 한다. (예: `볼륨을 15로 설정` → 멱등적, `볼륨을 한 칸 올려라` → 비멱등적)


---

## 왜 Stateless ≠ Idempotent 인가? (반례)

- Stateless한 API라도, 요청을 여러 번 보내면 **서로 다른 결과**를 낼 수 있다.
- 예를 들어 `POST /order` 요청은 매번 새로운 주문을 생성하므로, 반복하면 주문이 계속 생성된다. Stateless하지만 멱등하지 않다.
- 반면 `PUT /user/123`은 같은 데이터를 보낸다면 반복해도 항상 같은 결과다. Stateless하고 멱등하다. HTTP 메서드별 멱등성과 재시도 계약은 [멱등한 API 설계](/posts/idempotent-api-design/)에 따로 정리했다.

### 멱등하지만 Stateful한 API

- 어떤 API가 사용자 요청을 처리할 때, 서버가 클라이언트의 세션 정보나 이전 요청 로그를 내부적으로 저장하고 사용한다면, 이는 Stateful이다.
- 그러나 이 API가 요청을 여러 번 받아도 최종 시스템 상태가 동일하다면, 멱등성은 유지된다.

> e.g. 내부적으로 세션 캐시를 기반으로 처리 결과를 관리하여 멱등성을 보장하는 API

### 예시: 로그인 시도 제한

로그인 API는 보통 stateless하고 멱등하지 않은 API이다. 예를 들어, 로그인을 요청할때 사용자의 자격증명을 받아서 즉시 인증한다. 이 서버는 과거에 이 사용자가 로그인 했는지 여부를 신경쓰지 않는다. 각 로그인 요청은 서로 독립적이며, 서버는 오직 현재 들어온 요청 정보(아이디/비밀번호  등)만으로 판단한다. 따라서 이 API는 **stateless**하다. 하지만 로그인 요청을 여러번 반복하면, 매번 새로운 세션이 생성되거나, 다른 JWT 토큰이 발급될 수 있다. 요청을 여러번 했을 때 응답 결과나 시스템 상태가 달라질 수 있으므로 이는 멱등하지 않다.

그런데 어떤 시스템이 보안 정책상 로그인 실패 횟수를 세션이나 Redis에 저장한다면, 서버가 이전 시도를 기억하므로 이 API는 stateful이 된다. 이때 같은 요청을 반복하면 실패 횟수가 늘고 결국 계정이 잠기므로 멱등하지도 않다. 이 경우는 아래 3번 조합에서 다시 다룬다. 멱등하면서 stateful한 예는 1번 조합의 결제 요청 추적이다.

---

## Stateful/Stateless + Idempotent 조합 Cases

이 글에서 stateful은 서버가 이전 요청의 처리 이력(세션, 실패 횟수, `request_id` 처리 이력)을 기억해 다음 요청을 처리할 때 쓰는 경우를 말한다. 주문 데이터처럼 요청의 결과로 저장되는 리소스 자체는 여기서 말하는 상태로 보지 않는다.

### 1. **Stateful + Idempotent**

> 상태를 기억하지만, 같은 요청을 여러 번 해도 결과가 같다.

예시: **결제 승인 요청 추적 시스템**

클라이언트가 결제 승인 요청을 보낼 때 `request_id`를 함께 보낸다. 서버는 이 `request_id`를 DB에 저장하고, 이전에 처리한 내역이 있다면 해당 결과를 그대로 반환한다. 따라서 요청이 중복되어도 처리 결과가 항상 동일하다. 키의 단위와 저장 위치, 만료는 [멱등성 설계](/posts/idempotency-key-design/)에서 다룬다.

```http
POST /payments
Body: { "amount": 1000, "request_id": "abc123" }
```

- 첫 번째 요청: 결제 승인 → 응답 저장
- 두 번째 요청: 같은 `request_id` → 저장된 결과 재사용

이때 결제 API는 항상 동일한 처리결과를 보장하므로 멱등성이 있다. 그리고 멱등성을 보장하기 위해서 상태(request_id 처리 이력)를 기억하므로 stateful하다.

### 2. **Stateless + Idempotent**

> 상태를 기억하지 않지만, 같은 요청을 여러 번 해도 결과가 같다.

예시: **리소스 업데이트 API (`PUT`)**

```http
PUT /users/123
Body: { "name": "Alice", "email": "alice@example.com" }
```

매 요청마다 서버는 요청에 포함된 값으로 사용자 정보를 덮어쓴다. 이전 상태나 요청 이력을 기억하지 않는다(stateless). 업데이트 API를 여러 번 호출해도 사용자 정보는 동일하게 유지된다(idempotent).

서버리스 아키텍처에서는 stateless + idempotent 조합이 권장된다. Steef-Jan Wiggers는 [서버리스 함수에 대한 글](https://www.serverlessnotes.com/docs/azure-functions-write-stateless-functions)에서 함수가 한 가지 일만 하고, stateless하고 idempotent해야 하며, 가능한 한 빨리 끝나야 한다고 썼다.

### 3. **Stateful + Not Idempotent**

> 상태를 기억하고, 같은 요청을 여러 번 하면 결과가 달라진다.

예시: **로그인 실패 시도 제한 시스템**

```http
POST /login
Body: { "username": "user", "password": "wrong-pass" }
```

서버는 로그인 실패 횟수를 세션 또는 Redis에 저장한다. 같은 요청을 반복하면 로그인 실패 횟수가 증가하고, 일정 횟수 초과 시 계정이 잠긴다.

로그인 실패 횟수를 상태로 저장하므로 stateful하다. 요청을 반복하면 그 횟수가 바뀌고 결과도 달라지므로 멱등하지 않다.

### 4. **Stateless + Not Idempotent**

> 상태는 저장하지 않지만, 요청을 여러 번 하면 결과가 달라진다.

예시: **새로운 주문 생성 API (`POST`)**

```http
POST /orders
Body: { "item_id": 1, "quantity": 2 }
```

요청할 때마다 서버는 새로운 주문 ID를 생성하고 DB에 저장하는 API가 있다고 하자. 이 API는 과거 요청과 무관하게 항상 새로운 리소스를 생성한다(stateless). 반복 호출 시 주문이 중복으로 생성된다(not idempotent).

---

## 결론

멱등성(idempotency)은 같은 요청을 다시 보내도 안전한지, 즉 재시도의 안전성에 관한 성질이다. 무상태성(statelessness)은 서버가 과거 요청을 기억하는지, 즉 요청 처리 방식에 관한 성질이다. 두 성질은 서로 독립적이라서 **어느 하나가 다른 하나를 보장하지 않으며**, 네 가지 조합이 모두 가능하다.

| 조건                    | 설명                                                         |
| ----------------------- | ------------------------------------------------------------ |
| Stateless ⇒ Idempotent? | 아니요. (e.g. POST 요청은 Stateless하지만 멱등하지 않음)     |
| Idempotent ⇒ Stateless? | 아니요. (e.g. 세션 상태나 캐시를 저장하는 멱등 API는 stateful) |

이 글에서는 웹 기반으로 설명했지만, 같은 질문을 EJB 클러스터링 맥락에서 다룬 [C2 위키의 토론](https://wiki.c2.com/?DoesBeingStatelessImplyBeingIdempotent)이 있다. 그 토론에는 저축 계좌에서 당좌 계좌로 200달러를 옮기는 호출은 stateless로 구현할 수 있지만 멱등하지 않고, 거래 번호(2747262)를 붙여 200달러를 옮기는 호출은 멱등하게 만들 수 있다는 예가 나온다. 요약에서는 중간 계층 컴포넌트가 클라이언트에 대해서는 stateless이면서도, 저장소 쪽에서는 멱등하거나 멱등하지 않은 작업에 참여할 수 있다고 정리한다. 거래 번호를 요청에 담는다는 점에서 1번 조합의 `request_id`와 같은 발상이다.

---

## 참고자료

- [Roy T. Fielding. *Architectural Styles and the Design of Network-based Software Architectures*, 5.1.3 Stateless](https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm#sec_5_1_3)
- [RFC 9110. *HTTP Semantics*, 9.2.2 Idempotent Methods](https://www.rfc-editor.org/rfc/rfc9110.html#idempotent.methods)
- [Wiki C2 (June 17, 2005). *Does Being Stateless Imply Being Idempotent*](https://wiki.c2.com/?DoesBeingStatelessImplyBeingIdempotent)
- [Steef-Jan Wiggers. *Write Stateless and Idempotent Functions*](https://www.serverlessnotes.com/docs/azure-functions-write-stateless-functions)