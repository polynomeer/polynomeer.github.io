---
title: @TransactionalEventListener 빠른 체크 노트
date: 2025-05-13
categories: [Notes, Spring]
tags: [Spring, Transaction, "@TransactionalEventListener"]
---

`@TransactionalEventListener`를 쓸 때 가장 먼저 확인할 것은 두 가지다.

- 이벤트가 실제로 트랜잭션 안에서 발행되는가
- 내가 원하는 실행 시점이 커밋 이후인가, 즉시 실행인가

## 핵심 요약

- 기본 `@EventListener`는 발행 즉시 실행된다.
- `@TransactionalEventListener`는 트랜잭션 phase에 맞춰 실행된다.
- `AFTER_COMMIT`은 트랜잭션이 없으면 실행되지 않는다.
- `fallbackExecution = true`는 편하지만 "커밋 이후 보장"을 약하게 만든다.

## 언제 적합한가

- DB 반영이 확정된 뒤 메시지를 발행해야 할 때
- 롤백되면 메일/알림/외부 연동도 함께 막아야 할 때

## 주의할 점

- self-invocation 때문에 `@Transactional`이 빠져 있지 않은지
- 테스트에서 트랜잭션 설정 때문에 리스너가 기대와 다르게 동작하지 않는지
- 비동기 처리와 함께 섞었을 때 트랜잭션 경계가 달라지지 않는지

## 한 줄 결론

이 애너테이션은 "이벤트 리스너"보다 "트랜잭션 경계 이후 작업 예약"으로 이해하는 편이 훨씬 정확하다.
