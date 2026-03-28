---
title: Connection Pool
date: 2024-09-07
categories: [Notes, Web]
tags: [Database, Connection Pool, JDBC]
---

## Connection Pool이 필요한 이유

애플리케이션이 요청마다 새 DB 연결을 만들고 닫으면 비용이 크다. TCP 연결, 인증, 세션 초기화가 반복되기 때문이다. 요청 수가 많아지면 연결 생성 비용만으로도 응답 시간이 흔들린다.

Connection Pool은 미리 만들어 둔 연결을 재사용해서 이 비용을 줄인다.

## 동작 방식

대략적인 흐름은 다음과 같다.

1. 애플리케이션 시작 시 일정 수의 연결을 생성한다.
2. 요청이 오면 풀에서 사용 가능한 연결을 꺼낸다.
3. 작업이 끝나면 연결을 닫는 대신 풀에 반환한다.
4. 풀은 유휴 연결, 최대 연결 수, 타임아웃을 관리한다.

즉 `close()`를 호출하더라도 실제 소켓을 끊는 것이 아니라 풀에 반납되는 경우가 많다.

## 주요 설정

- `maximumPoolSize`: 동시에 유지할 최대 연결 수
- `minimumIdle`: 최소 유휴 연결 수
- `connectionTimeout`: 연결 획득 대기 시간
- `idleTimeout`: 오랫동안 사용하지 않은 연결 정리 시간
- `maxLifetime`: 너무 오래된 연결 교체 시간

이 값들은 DB 서버의 최대 연결 수와 함께 봐야 한다. 애플리케이션 풀 크기만 늘리면 오히려 DB를 압박할 수 있다.

## 자주 하는 오해

- 풀이 크면 무조건 성능이 좋아진다.
- 연결 부족은 풀 크기만 늘리면 해결된다.
- SQL이 느린데도 연결 풀 문제라고 생각한다.

실제로는 느린 쿼리, 락 경합, 장시간 트랜잭션 때문에 연결이 오래 점유되는 경우가 더 많다. 이때는 풀 크기보다 **점유 시간**을 줄여야 한다.

## 실무에서 봐야 할 지표

- active connections
- idle connections
- pending threads
- connection acquisition time
- long transaction count

풀이 자주 바닥난다면 단순히 연결 수 부족인지, 쿼리 시간이 긴지, 트래픽 피크가 특정 시점에 몰리는지부터 확인해야 한다.

## 정리

Connection Pool은 단순 캐시가 아니라 **DB 연결을 제한된 자원으로 관리하는 장치**다. 설정값 자체보다, 연결이 오래 점유되는 원인을 함께 봐야 제대로 튜닝할 수 있다.
