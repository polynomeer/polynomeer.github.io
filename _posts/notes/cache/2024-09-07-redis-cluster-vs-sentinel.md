---
title: Redis Cluster vs Sentinel
date: 2024-09-05
categories: [Notes, Cache]
tags: [Redis, Cluster, Sentinel]
---

## 두 방식이 해결하는 문제는 다르다

`Redis Cluster`와 `Redis Sentinel`은 둘 다 Redis를 여러 대 운영할 때 등장하지만, 목적이 다르다.

- `Sentinel`: 장애 감지와 자동 failover 중심
- `Cluster`: 데이터 샤딩과 수평 확장 중심

즉 Sentinel은 같은 데이터를 더 안전하게 운영하는 구조이고, Cluster는 데이터를 여러 노드에 나눠 담아 확장하는 구조에 가깝다.

## Redis Sentinel

Sentinel 구조에서는 보통 하나의 master와 여러 replica를 둔다. Sentinel 프로세스들이 master 상태를 감시하다가 장애를 감지하면 replica 중 하나를 새 master로 승격한다.

장점:

- 구성 개념이 비교적 단순하다.
- 자동 장애 전환을 제공한다.
- 단일 데이터셋을 그대로 다루기 쉽다.

한계:

- 기본적으로 master 한 대의 메모리 한계를 가진다.
- 쓰기 확장은 되지 않는다.
- 샤딩이 필요한 규모에는 맞지 않는다.

## Redis Cluster

Cluster는 데이터를 hash slot 단위로 여러 master에 분산 저장한다. 여러 노드가 하나의 큰 Redis 공간을 나눠 맡는다고 보면 된다.

장점:

- 데이터 용량을 수평 확장할 수 있다.
- 쓰기 부하도 여러 노드에 분산할 수 있다.
- 노드 단위 장애 복구 구조를 가질 수 있다.

한계:

- 운영 복잡도가 더 높다.
- multi-key 연산은 slot 제약을 받는다.
- 클라이언트가 cluster topology를 이해해야 하는 경우가 많다.

## 무엇을 선택할까

Sentinel이 잘 맞는 경우:

- 샤딩은 필요 없고 고가용성이 중요하다.
- 세션, 단순 캐시, 단일 데이터셋 운영이 중심이다.

Cluster가 잘 맞는 경우:

- 데이터 크기가 한 노드 한계를 넘는다.
- 쓰기 트래픽도 수평 분산이 필요하다.
- 샤딩 제약을 감수할 수 있다.

## 정리

Sentinel은 고가용성 중심, Cluster는 확장성 중심이다. 둘을 비교할 때는 "어느 쪽이 더 좋은가"보다 **장애 복구가 필요한가, 샤딩이 필요한가**를 먼저 구분해야 한다.
