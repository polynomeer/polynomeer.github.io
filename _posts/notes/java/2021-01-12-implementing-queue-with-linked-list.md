---
title: "LinkedList로 Queue를 구현할 때 핵심은 무엇인가"
date: 2021-01-12
categories: [Notes, Java]
tags: [Java, Queue, LinkedList, Data Structure]
---

Queue는 먼저 들어온 데이터가 먼저 나가는 FIFO(First-In, First-Out) 구조다. 프린터 작업 대기열, 메시지 처리, BFS 탐색처럼 순서 보장이 필요한 상황에서 자주 쓰인다.

## Queue의 핵심 연산

- `enqueue`: 뒤에 넣기
- `dequeue`: 앞에서 빼기
- `peek`: 앞 원소 확인

이 세 가지가 자연스럽게 빠르게 동작해야 Queue 구현으로서 의미가 있다.

## 왜 LinkedList가 Queue와 잘 맞는가

Queue는 앞에서 삭제하고 뒤에서 삽입하는 구조다. 단일 연결 리스트나 이중 연결 리스트에서 `head`와 `tail`을 잘 유지하면 두 연산을 모두 `O(1)`에 가깝게 처리할 수 있다.

반대로 배열 기반 구현은 앞에서 꺼낼 때 남은 원소를 당기는 실수를 하기 쉽다. 물론 원형 큐로 풀 수 있지만, 초기 학습에서는 LinkedList 기반이 더 직관적이다.

## 구현에서 중요한 포인트

### head와 tail 둘 다 필요하다

삽입을 빠르게 하려면 `tail`이 필요하고, 삭제를 빠르게 하려면 `head`가 필요하다. 둘 중 하나만 있으면 한쪽 연산이 느려질 수 있다.

### 빈 큐 처리

비어 있는 상태에서 `dequeue`나 `peek`를 호출했을 때 어떻게 동작할지 먼저 정해야 한다. 예외를 던질지, `null`을 반환할지, 별도 결과 타입을 쓸지는 구현 정책의 문제다.

### 마지막 원소 제거 시 상태 초기화

원소가 하나 남은 상태에서 `dequeue`를 하면 `head`와 `tail`을 모두 비워야 한다. 이 지점을 놓치면 다음 연산에서 꼬이기 쉽다.

## Queue와 Deque는 어떻게 다른가

Queue는 앞에서 빼고 뒤에 넣는 한 방향 모델이다. Deque는 양쪽 끝 모두 열려 있다.

즉:

- Queue: FIFO 흐름이 핵심
- Deque: 양방향 조작이 핵심

문제가 순수 FIFO라면 Queue가 더 명확하다.

## 실무에서는 무엇을 쓰는가

직접 구현을 제외하면 Java에서는 `Queue` 인터페이스와 `ArrayDeque`, `LinkedList`, `PriorityQueue`, `BlockingQueue` 같은 구현체를 상황에 맞게 고른다.

실무에서는 "LinkedList로 구현할 수 있는가"보다:

- 단순 FIFO인가
- 우선순위가 필요한가
- 멀티스레드 환경인가

를 먼저 보는 편이 좋다.

## 정리

LinkedList 기반 Queue 구현의 핵심은 단순하다.

- 앞 삭제와 뒤 삽입을 빠르게 유지한다
- `head`, `tail`, `size`를 일관되게 관리한다
- 빈 큐와 마지막 원소 제거를 정확히 처리한다

Queue는 가장 기본적인 자료구조 중 하나지만, 구현 관점에서 보면 포인터와 경계 상태를 정확히 다루는 연습에 좋은 예시다.
