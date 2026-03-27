---
title: Redo Log와 Undo Log를 어떻게 구분해야 하는가
date: 2025-08-20
categories: [Notes, Database]
tags: [Database, Redo Log, Undo Log]
---

## 둘 다 왜 필요한가

트랜잭션과 복구를 이해하려면 redo log와 undo log를 분리해서 볼 수 있어야 한다. 둘 다 "로그"지만 목적이 다르다.

- undo log: 이전 상태로 되돌리기
- redo log: 커밋된 변경 다시 반영하기

즉, undo는 rollback과 MVCC 쪽, redo는 crash recovery와 durability 쪽에 가깝다.

## Undo Log

데이터를 변경하기 전에 이전 값을 남겨두는 로그다.

역할:

- 롤백 시 원복
- MVCC에서 과거 버전 제공

그래서 undo log는 단순 복구 기록이 아니라 읽기 일관성에도 관여한다.

## Redo Log

변경 사실을 다시 적용할 수 있게 남기는 로그다.

역할:

- 커밋된 변경 보존
- 장애 후 재적용

데이터 파일에 변경이 완전히 반영되기 전에 로그를 먼저 안정적으로 남겨서, 장애가 나더라도 복구 가능하게 한다.

## 함께 보면 이해가 쉬운 흐름

1. 트랜잭션이 row 변경 시작
2. 변경 전 값은 undo에 남김
3. 변경 내용은 메모리/버퍼에 반영
4. redo log에 기록
5. commit
6. 장애 시 redo로 복구, rollback 시 undo로 원복

## 자주 헷갈리는 점

- undo가 durability를 직접 책임지는 것은 아니다.
- redo가 과거 읽기 버전을 제공하는 것은 아니다.
- 둘은 대체 관계가 아니라 역할 분담 관계다.

## 정리

undo log는 "되돌리기", redo log는 "다시 반영하기"라고 기억하면 시작이 쉽다. 트랜잭션 내부 동작, MVCC, crash recovery를 이해할수록 두 로그의 역할 차이가 더 분명해진다.
