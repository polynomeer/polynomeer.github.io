---
title: Redis Sentinel Replication
date: 2025-08-22
categories: [Notes, Cache]
tags: [Redis, Sentinel, Replication]
---

## Sentinel Replication이 다루는 문제

Redis를 운영할 때 중요한 것은 단순한 캐시 성능만이 아니라, master 장애가 났을 때 얼마나 빨리 복구할 수 있는가다. Sentinel Replication은 이 지점을 위한 구조다.

기본 구성은 다음과 같다.

- 1개의 master
- 여러 개의 replica
- 여러 개의 sentinel 프로세스

Sentinel은 master와 replica를 감시하고, master 장애 시 replica 중 하나를 새 master로 승격한다.

## 복제 구조

replica는 master의 데이터를 복제해 읽기 부하를 일부 분산하고, 장애 시 승격 후보 역할을 한다. 다만 비동기 복제이기 때문에, 장애 직전의 일부 쓰기가 replica에 완전히 반영되지 않았을 가능성은 항상 염두에 둬야 한다.

## Sentinel의 역할

Sentinel은 단순 모니터링 도구가 아니다. 실제로는 다음 책임을 가진다.

- master 상태 감시
- 장애 판정
- failover 조정
- 새 master 정보 알림

애플리케이션은 Sentinel을 직접 조회하거나, Sentinel을 이해하는 클라이언트 라이브러리를 통해 현재 master 위치를 얻는다.

## 운영 시 주의점

### 과반수와 네트워크 분리

Sentinel은 여러 프로세스의 합의로 failover를 진행한다. 그래서 홀수 개 구성과 네트워크 분리 상황을 같이 고려해야 한다.

### 복제 지연

replica가 master를 충분히 따라오지 못하면 장애 시 데이터 손실 범위가 커질 수 있다. 복제 지연은 반드시 모니터링해야 한다.

### replica 읽기의 일관성

replica 읽기는 최신성이 약해질 수 있다. 강한 최신성이 필요한 데이터라면 무조건 replica 읽기를 붙이는 방식은 위험할 수 있다.

## 정리

Redis Sentinel Replication은 고가용성을 위한 운영 구조다. 샤딩은 필요 없지만 master 장애 대응 자동화가 필요할 때 가장 먼저 검토할 수 있는 선택지다.
