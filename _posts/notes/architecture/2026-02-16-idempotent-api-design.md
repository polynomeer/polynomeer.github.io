---
title: "멱등한 API 설계 - HTTP 메서드의 의미와 재시도 계약"
date: 2026-02-16
categories: [Notes, Architecture]
tags: [API Design, Idempotency, REST, HTTP, Retry, Payment]
---

"PUT은 멱등하고 POST는 아니다"는 자주 인용되는데, 그 문장이 실제로 무엇을 약속하는지는 덜 이야기된다. 멱등성은 구현이 알아서 주는 성질이 아니라 API가 클라이언트와 맺는 계약이고, 계약인 이상 양쪽이 할 일이 있다.

## 명세가 정의하는 것

[RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2)은 두 성질을 나눈다.

- 안전(safe): 요청이 서버 상태를 바꾸지 않는다. `GET`, `HEAD`, `OPTIONS`, `TRACE`.
- 멱등(idempotent): 같은 요청을 여러 번 보낸 효과가 한 번 보낸 것과 같다. `PUT`, `DELETE`와 안전한 메서드 전부(`GET`, `HEAD`, `OPTIONS`, `TRACE`).

`POST`는 둘 다 아니다. 그래서 브라우저가 새로고침 시 재전송을 경고한다. 같은 절은 클라이언트가 비멱등 요청을 자동으로 재시도하지 않아야 하고(SHOULD NOT), 프록시는 자동으로 재시도해서는 안 된다(MUST NOT)고 적는다.

첫째, 멱등은 응답이 같다는 뜻이 아니다. `DELETE`를 두 번 보내면 처음은 200, 다음은 404일 수 있다. 명세가 말하는 것은 서버 상태의 효과이지 응답 코드가 아니다. RFC 9110도 연결이 끊겨 멱등 요청을 다시 보내는 경우를 두고 "It knows that repeating the request will have the same intended effect, even if the original request succeeded, though the response might differ."라고 적는다(원래 요청이 성공했더라도 반복의 의도된 효과는 같지만, 응답은 다를 수 있다).

둘째, 명세는 메서드의 의도를 정할 뿐 구현을 검사하지 않는다. `PUT /orders/1`을 구현하면서 매번 새 이력을 append하면 그 API는 멱등하지 않다. 메서드 이름이 성질을 주지 않는다.

## POST를 멱등하게 만드는 것: 멱등 키

결제 생성처럼 "새 리소스를 만드는데 두 번 만들면 안 되는" 경우, 자원 식별자를 클라이언트가 정할 수 없으므로 `PUT`으로 바꿀 수 없다. 이때 쓰는 것이 [멱등 키](/posts/idempotency-key-design/)다.

```http
POST /payments
Idempotency-Key: 6a3f1b2c-...
Content-Type: application/json

{"amount": 10000, "orderId": "A-1"}
```

서버는 키를 보고 세 가지 중 하나를 한다.

| 상태 | 동작 |
| --- | --- |
| 처음 보는 키 | 처리하고 결과를 키와 함께 저장 |
| 처리 중인 키 | 409 또는 대기. 동시 진입을 막는다 |
| 끝난 키 | 저장해 둔 **최초 결과**를 그대로 반환 |

"여러 번 보낸 효과가 한 번과 같다"를 실제로 구현하는 것은 세 번째 동작이다. 재시도에 새 결과를 만들지 않고 처음 결과를 돌려준다. Idempotency-Key 드래프트도 처리 중인 키로 다시 온 요청에는 409를 권한다([draft-ietf-httpapi-idempotency-key-header-07](https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.html)).

키의 단위는 둘 중 하나다.

- 요청 단위: 클라이언트가 UUID를 만든다. "이 버튼 누름 한 번"이 단위다. 같은 주문에 대한 서로 다른 결제를 허용한다.
- 엔티티 단위: `payment-1234-refund`처럼 결정적으로 만든다. "결제 1234의 환불은 한 번"이 강제된다.

## 계약의 나머지 절반은 클라이언트가 지킨다

서버가 아무리 잘해도 다음이 지켜지지 않으면 멱등성은 없다.

1. 재시도에 같은 키를 쓴다. [재시도](/posts/timeout-retry-backoff/)마다 새 UUID를 만들면 서버는 서로 다른 의도로 볼 수밖에 없다.
2. 호출 전에 키를 저장한다. 응답을 못 받고 프로세스가 죽어도 같은 키로 재시도하려면 키가 먼저 기록돼 있어야 한다.
3. 페이로드를 바꾸지 않는다. 같은 키에 다른 금액이 오면 서버는 거부해야 하고(드래프트는 422를 권한다), 그 검증이 없으면 조용히 첫 결과를 돌려주며 금액 불일치를 숨긴다.
4. 성공을 소비하면 키를 해제한다. 다음 요청이 옛 키를 재사용하지 않게.

[Airbnb의 Orpheus 리뷰](/posts/airbnb-orpheus-idempotency/)에서 이 네 항목에 백오프·지터를 쓴 재시도 전략을 더한 다섯 항목이 2019년에 한 목록으로 정리돼 있는 것을 봤다. 서버 설계와 같은 무게로 클라이언트 책임을 적은 것이 그 글의 강점이었다.

## 키는 얼마나 오래 보관하는가

저장한 결과는 무한히 둘 수 없다. 보존 기간이 계약의 일부다.

- 너무 짧으면: 느린 재시도가 보존 기간을 넘겨 도착해 새 요청으로 처리된다. 이중 결제다.
- 너무 길면: 테이블이 처리량에 비례해 자란다.

기준은 "클라이언트의 최대 재시도 창"이다. 재시도 정책이 최대 24시간이면 보존은 그보다 길어야 한다. 이 둘이 문서에서 연결돼 있지 않은 API가 많다.

## 이 설명이 깨지는 곳

- 멱등성은 외부 부작용까지 막지 않는다. RFC 9110도 멱등성은 사용자가 요청한 것에만 적용되고, 서버는 요청마다 로그를 남기거나 다른 비멱등 부작용을 둘 수 있다고 적는다. 저장은 한 번이어도 메일이 두 번 나갈 수 있다. 부작용마다 별도의 멱등 처리가 필요하다.
- 읽기 전용이 곧 안전은 아니다. `GET /export?token=...`이 서버에서 파일을 만들고 과금한다면 그것은 안전하지 않다.
- 타임아웃은 실패가 아니다. 멱등 키가 있어도 클라이언트가 "실패했으니 새 키로 다시"를 하면 무용지물이다. 타임아웃 뒤에는 재전송이 아니라 조회가 먼저다([ParityPay 3편](/posts/parity-pay-unknown-state/)).
- `Idempotency-Key`는 아직 표준이 아니다. IETF 드래프트(07판, 2025-10-15)이고 datatracker에는 만료된 Internet-Draft로 표시된다. 벤더마다 헤더 이름과 동작이 다르다. 연동 문서에서 직접 확인해야 한다.

## 무엇을 재면 확인되는가

1. 같은 키로 N번 동시에 보내고 부작용이 정확히 1회인지 센다. 순차 재시도보다 동시 재시도가 더 어려운 조건이다.
2. 키 저장을 "조회 후 없으면 삽입"으로 만들고 동시 요청을 보내면 무엇이 깨지는지.
3. 보존 기간을 넘긴 재시도가 어떻게 처리되는지.

2번은 [ParityPay 4편의 결함 E](/posts/parity-pay-experiments-and-defects/)가 정확히 그 경우였다. 원장 계정을 "조회 후 없으면 삽입"으로 만들었다가 동시 요청에 유니크 제약 위반이 났고, `INSERT ... ON CONFLICT DO NOTHING` 후 조회로 바꿨다. 멱등 저장소는 이 방식이어야 "읽고 판단하는 사이"가 사라진다.

## 실무와의 접점

[2021년 결제대행 연동](/posts/payment-gateway-2021-retrospective/)에서 "같은 결제를 두 번 보내면 대행사는 어떻게 하는가"를 묻지 않았다. 우리 쪽 멱등 키가 있었는지, 대행사가 그것을 존중했는지 확인하지 않았고, 스케줄러가 한 대라 문제가 나지 않았을 뿐이다. 멱등성은 서버가 혼자 갖는 성질이 아니라 양쪽이 지키는 계약이라는 것이 그때 없던 관점이다.

## 정리

- 안전과 멱등은 다른 성질이고, 멱등은 응답이 아니라 서버 상태의 효과를 말한다.
- `POST`를 멱등하게 만드는 것은 멱등 키이고, 끝난 키에는 최초 결과를 돌려주는 것이 핵심이다.
- 키의 단위(요청 단위 대 엔티티 단위)가 "무엇이 한 번인가"를 정한다.
- 보존 기간은 클라이언트의 최대 재시도 창보다 길어야 한다.

## 참고

- [RFC 9110: HTTP Semantics - Method Properties](https://datatracker.ietf.org/doc/html/rfc9110#name-common-method-properties)
- [IETF draft: The Idempotency-Key HTTP Header Field](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) · [07판 본문](https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.html)
- [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Stateless와 멱등성 정리](/posts/stateless-and-idempotent/)
