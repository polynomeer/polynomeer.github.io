---
title: "API 버저닝과 호환성 - 스키마 진화 규칙"
date: 2026-08-03
categories: [Notes, Architecture]
tags: [API Design, Versioning, Compatibility, Schema, Kafka, REST]
---

버저닝을 "URL에 v1을 붙일까 헤더로 할까"의 문제로 시작하면 핵심을 놓친다. 실제 비용은 v2를 만든 뒤에 생긴다. 두 버전을 동시에 운영하고, 언제 v1을 끄고, 그 사이 버그는 양쪽에 고친다. 그래서 첫 질문은 "어떻게 버저닝할까"가 아니라 **"버전을 올리지 않고 바꿀 수 있는가"** 여야 한다.

## 호환성의 네 가지

메시지 스키마에서 쓰는 어휘가 API에도 그대로 적용된다.

| | 뜻 |
| --- | --- |
| **하위 호환(backward)** | 새 코드가 **옛 데이터**를 읽을 수 있다 |
| **상위 호환(forward)** | 옛 코드가 **새 데이터**를 읽을 수 있다 |
| 양방향(full) | 둘 다 |
| 없음 | 동시에 배포해야 한다 |

어느 쪽이 필요한지는 누가 먼저 배포되는가가 정한다.

- 서버를 먼저 배포하고 클라이언트가 따라온다면: 옛 클라이언트가 새 응답을 읽어야 하므로 상위 호환이 필요하다.
- 저장된 이벤트를 새 소비자가 읽는다면: 새 코드가 옛 데이터를 읽어야 하므로 하위 호환이다.
- 롤링 배포 중에는 옛 버전과 새 버전이 동시에 돈다. 둘 다 필요하다.

실무에서 가장 자주 간과되는 것은 마지막 경우다. 무중단 배포를 한다면 배포 중 몇 분 동안 두 버전이 공존하고, 그 동안 양방향 호환이 없으면 그 시간이 장애다.

## 안전한 변경과 깨는 변경

경험칙은 단순하다.

안전한 변경

- 선택적 필드 추가
- 새 엔드포인트 추가
- 열거형에 값 추가(소비자가 모르는 값을 무시하도록 만들어져 있을 때만)
- 응답에 필드 추가(소비자가 알 수 없는 필드를 무시할 때만)

깨는 변경

- 필드 제거, 이름 변경
- 타입 변경 (문자열 → 숫자, 단일 값 → 배열)
- 필수 필드 추가
- 의미 변경. **가장 위험하다.** 스키마는 그대로인데 `amount`가 원 단위에서 전 단위로 바뀌면 어떤 검사도 잡지 못한다
- 오류 코드나 상태 코드의 의미 변경
- 기본값 변경

안전한 변경 목록은 "알 수 없는 필드를 무시한다"는 전제 위에 서 있다. Jackson은 기본적으로 알 수 없는 필드에 예외를 던지므로([`FAIL_ON_UNKNOWN_PROPERTIES`](https://javadoc.io/static/com.fasterxml.jackson.core/jackson-databind/2.17.0/com/fasterxml/jackson/databind/DeserializationFeature.html#FAIL_ON_UNKNOWN_PROPERTIES), Javadoc에 기본값이 enabled로 적혀 있다), 이 설정을 끄지 않으면 필드 추가만으로 클라이언트가 깨진다. 스프링의 [`Jackson2ObjectMapperBuilder`](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/http/converter/json/Jackson2ObjectMapperBuilder.html)는 이 기능을 끈 채로 `ObjectMapper`를 만든다. protobuf는 알 수 없는 필드를 보존하도록 설계돼 있어 이 문제가 없다. [proto3 가이드](https://protobuf.dev/programming-guides/proto3/#unknowns)에 따르면 옛 바이너리는 새 필드를 무시하고, 다시 직렬화할 때도 보존한다.

## 버전을 올리지 않는 기법

확장 필드. 새 의미는 새 필드로 추가하고 옛 필드는 채워 둔다. 한동안 둘 다 쓰고 옛 것을 나중에 제거한다.

필드 단위 폐기. 전체 버전을 올리는 대신 필드에 `deprecated`를 표시하고, 사용 여부를 지표로 추적한다. 아무도 안 쓸 때 제거한다. 사용량을 모르면 제거할 수 없으므로 계측이 선행되어야 한다.

관용적 읽기(tolerant reader). 소비자가 아는 것만 읽고 나머지는 무시한다. 이것이 지켜지면 생산자의 추가 변경이 전부 안전해진다.

## 그래도 버전을 올려야 할 때

| 방식 | 장점 | 단점 |
| --- | --- | --- |
| URL (`/v1/orders`) | 명확하고 캐시·라우팅이 쉽다 | 리소스 식별자가 버전마다 달라진다 |
| 헤더 (`Accept: application/vnd.x.v2+json`) | URL이 안정적 | 프록시·캐시·디버깅이 불편 |
| 쿼리 (`?version=2`) | 간단 | 캐시 키 오염 |

정답은 없고, URL 방식이 운영상 가장 단순하다는 것이 대체적인 실무 합의다. 방식보다 무게가 큰 것은 **폐기 계획**이다. 버전을 만들 때 다음 셋을 함께 정한다.

1. 옛 버전의 지원 종료 시점
2. 사용량을 어떻게 볼 것인가
3. 강제 종료 전 어떻게 알릴 것인가 (`Deprecation`, `Sunset` 헤더. [RFC 8594](https://datatracker.ietf.org/doc/html/rfc8594)의 `Sunset`은 URI가 응답하지 않게 될 것으로 예상되는 시점을 알리는 헤더다)

이것이 없으면 v1은 영원히 남는다.

## 이벤트 스키마는 더 엄격하다

API는 요청-응답이라 양쪽이 살아 있지만, 이벤트는 저장된다. 1년 전 이벤트를 오늘의 코드가 읽어야 할 수 있다.

- Avro는 스키마 레지스트리와 호환성 규칙(`BACKWARD`, `FORWARD`, `FULL`)을 강제한다.
- protobuf는 필드 번호가 계약이다. 번호를 재사용하면 조용히 깨진다. 제거한 번호는 `reserved`로 막는다. [가이드](https://protobuf.dev/programming-guides/proto3/#fieldreserved)에 따르면 `reserved` 번호를 다시 쓰면 protoc가 오류를 낸다.
- JSON은 강제가 없으므로 규칙을 사람이 지켜야 한다.

[ParityPay 5편](/posts/parity-pay-outbox/)의 한계에 "스키마 진화를 다루지 않았다"를 적었다. 이벤트에 `event_version`이 있고 발행 전 봉투 스키마를 검증하지만, 소비자가 옛 버전을 어떻게 다룰지가 정해져 있지 않았다. 이벤트 소싱이라면 더 엄격하다. 저장된 사건은 과거의 사실이라 고칠 수 없고, 읽을 때 변환하는 업캐스팅이 필요하다([이벤트 소싱과 CQRS](/posts/event-sourcing-and-cqrs/)).

## 이 설명이 깨지는 곳

- 내부 API와 외부 API는 다른 규칙을 쓸 수 있다. 모든 소비자를 통제할 수 있으면 조율된 변경이 가능하다. 외부 공개 API는 그럴 수 없다.
- 버전이 늘면 테스트가 곱해진다. 계약 테스트(Pact 등)로 소비자 기대를 고정하지 않으면 회귀를 못 잡는다.
- 의미 변경은 어떤 도구도 못 잡는다. 스키마 검사, 타입 시스템, 계약 테스트 전부 통과한다. 리뷰와 명명으로 막을 수밖에 없다.
- API 게이트웨이의 변환은 임시방편이다. 두 버전의 차이를 게이트웨이에서 메우면 그 로직이 또 하나의 유지 대상이 된다.

## 무엇을 재면 확인되는가

1. 필드별 사용량을 계측하고 실제로 쓰이지 않는 필드가 있는지 본다. 제거 결정의 근거가 된다.
2. 롤링 배포 중 옛 버전과 새 버전이 공존하는 시간을 재고, 그 동안 오류율이 오르는지 본다.
3. 옛 클라이언트로 새 응답을, 새 클라이언트로 옛 응답을 읽어 보는 테스트를 CI에 둔다.

3번이 양방향 호환을 실제로 보장하는 유일한 방법이다.

## 실무와의 접점

[Shadow Release로 조회를 옮긴 경험](/posts/shadow-release-query-migration/)이 이 글과 맞닿는다. MyBatis 결과와 QueryDSL 결과를 나란히 비교하며 옮겼는데, 그때 확인한 것이 계약이 유지되는가였다. 구현을 바꾸면서 응답을 한 글자도 바꾸지 않는 것이 목표였고, 그것을 코드 리뷰가 아니라 두 결과의 비교로 확인했다. 그래서 호환성은 리뷰에서 주장할 것이 아니라 검사로 확인할 것이라고 보게 됐다.

## 정리

- 롤링 배포를 한다면 배포 중 몇 분 동안은 양방향 호환이 필요하다.
- 필드 추가가 안전하려면 소비자가 알 수 없는 필드를 무시해야 한다. Jackson 기본값은 그 반대이고, 스프링의 빌더는 이를 끈다.
- 버전을 만들 때 폐기 시점, 사용량 측정, 고지 방법을 함께 정하지 않으면 v1은 영원히 남는다.

## 참고

- [Confluent: Schema Evolution and Compatibility](https://docs.confluent.io/platform/current/schema-registry/fundamentals/avro.html)
- [Protocol Buffers: Updating a Message Type](https://protobuf.dev/programming-guides/proto3/#updating)
- [RFC 8594: The Sunset HTTP Header Field](https://datatracker.ietf.org/doc/html/rfc8594)
- [Jackson `DeserializationFeature` Javadoc (2.17)](https://javadoc.io/static/com.fasterxml.jackson.core/jackson-databind/2.17.0/com/fasterxml/jackson/databind/DeserializationFeature.html)
- [Spring Framework: `Jackson2ObjectMapperBuilder`](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/http/converter/json/Jackson2ObjectMapperBuilder.html)
- Martin Fowler, [Tolerant Reader](https://martinfowler.com/bliki/TolerantReader.html)
