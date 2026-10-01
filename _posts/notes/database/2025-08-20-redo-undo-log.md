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

그래서 undo는 rollback과 [MVCC](/posts/mvcc/) 쪽, redo는 crash recovery와 [durability](/posts/acid/) 쪽에 가깝다.

## Undo Log

데이터를 변경하기 전에 이전 값을 남겨두는 로그다.

역할:

- 롤백 시 원복
- MVCC에서 과거 버전 제공

[InnoDB 매뉴얼](https://dev.mysql.com/doc/refman/8.0/en/innodb-undo-logs.html)에 따르면 다른 트랜잭션이 consistent read(스냅샷 읽기)로 원래 데이터를 봐야 할 때 undo log record에서 변경 전 값을 가져온다. 그래서 undo log는 단순 복구 기록이 아니라 읽기 일관성에도 관여한다.

## Redo Log

변경 사실을 다시 적용할 수 있게 남기는 로그다. [매뉴얼](https://dev.mysql.com/doc/refman/8.0/en/innodb-redo-log.html)은 redo log를 crash recovery 때 미완료 트랜잭션이 쓴 데이터를 바로잡는 디스크 기반 구조로 정의한다.

역할:

- 커밋된 변경 보존
- 장애 후 재적용

데이터 파일에 변경이 완전히 반영되기 전에 로그를 먼저 안정적으로 남겨서, 장애가 나더라도 복구 가능하게 한다. 이 순서는 [WAL과 체크포인트](/posts/wal-and-checkpoint/)에서 더 다뤘다.

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

트랜잭션 내부 동작, MVCC, crash recovery를 볼 때마다 두 로그 중 어느 쪽이 관여하는지 먼저 가르면 동작을 따라가기 쉬워진다.

## 참고

- [MySQL 8.0 Reference Manual: Undo Logs](https://dev.mysql.com/doc/refman/8.0/en/innodb-undo-logs.html)
- [MySQL 8.0 Reference Manual: Redo Log](https://dev.mysql.com/doc/refman/8.0/en/innodb-redo-log.html)
