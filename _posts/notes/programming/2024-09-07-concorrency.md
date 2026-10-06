---
title: Java Concurrency
date: 2024-09-05
categories: [Notes, Programming]
tags: [Java, Concurrency]
---

여러 스레드가 같은 객체의 필드를 함께 읽고 쓰면, 각 스레드가 따로 실행될 때는 생기지 않던 오류가 생긴다. Java 튜토리얼은 이 오류를 두 가지로 나눈다. 여러 스레드가 공유 데이터에 접근하면서 연산이 섞이는 스레드 간섭(thread interference)과, 스레드마다 공유 메모리를 서로 다르게 보는 메모리 일관성 오류(memory consistency error)다 ([Oracle](https://docs.oracle.com/javase/tutorial/essential/concurrency/sync.html)).

## 스레드 간섭이 생기는 이유

`c++`는 한 줄이지만 한 번에 끝나는 연산이 아니다. 현재 값을 읽고, 1을 더하고, 결과를 다시 쓰는 세 단계로 나뉜다 ([Oracle](https://docs.oracle.com/javase/tutorial/essential/concurrency/interfere.html)).

```java
class Counter {
    private int c = 0;

    public void increment() { c++; }
    public void decrement() { c--; }
    public int value() { return c; }
}
```

초기값이 0일 때 스레드 A가 `increment()`, 스레드 B가 `decrement()`를 거의 동시에 호출하면 다음 순서가 가능하다.

1. A가 `c`를 읽는다 (0).
2. B가 `c`를 읽는다 (0).
3. A가 1을 더해 1을 얻는다.
4. B가 1을 빼서 -1을 얻는다.
5. A가 1을 쓴다.
6. B가 -1을 쓴다.

A의 결과는 B의 쓰기에 덮여 사라진다. 실행할 때마다 순서가 달라지므로 재현이 어렵다.

## 동시성을 제어하는 방법

### synchronized

메서드나 블록에 `synchronized`를 붙이면 같은 객체의 모니터 락을 가진 스레드 하나만 그 구간을 실행한다. 튜토리얼은 synchronized 메서드를 스레드 간섭과 메모리 일관성 오류를 함께 막는 단순한 관용구로 소개한다. 대신 한 번에 한 스레드만 실행하므로 병렬성은 줄어든다.

```java
class SynchronizedCounter {
    private int c = 0;

    public synchronized void increment() { c++; }
    public synchronized int value() { return c; }
}
```

`ReentrantLock`은 같은 일을 `lock()`과 `unlock()` 호출로 명시적으로 한다. 락을 메서드 경계 밖으로 넘기거나 여러 락을 다뤄야 할 때 쓴다.

### volatile

`volatile` 변수에 대한 쓰기는 같은 변수에 대한 이후 읽기와 happens-before 관계를 만든다. 그래서 한 스레드가 쓴 값이 다른 스레드에 항상 보이고, 읽는 쪽은 그 쓰기 이전에 일어난 변경까지 함께 본다 ([Oracle](https://docs.oracle.com/javase/tutorial/essential/concurrency/atomic.html)). 다만 `volatile`은 가시성만 보장한다. `c++`처럼 읽기와 쓰기가 나뉜 연산은 여전히 섞일 수 있으므로, 한 스레드가 쓰고 나머지는 읽기만 하는 플래그 같은 용도에 맞다.

### Atomic 클래스

`java.util.concurrent.atomic` 패키지는 단일 변수에 대한 원자적 연산을 제공한다. 이 클래스들의 `get`과 `set`은 `volatile` 변수의 읽기·쓰기처럼 동작한다 ([Oracle](https://docs.oracle.com/javase/tutorial/essential/concurrency/atomicvars.html)).

```java
import java.util.concurrent.atomic.AtomicInteger;

class AtomicCounter {
    private final AtomicInteger c = new AtomicInteger(0);

    public void increment() { c.incrementAndGet(); }
    public int value() { return c.get(); }
}
```

이 외에도 `ConcurrentHashMap` 같은 동시성 컬렉션을 쓰거나, 상태가 바뀌지 않는 불변 객체로 설계해 공유 상태 자체를 없애는 방법이 있다.

## 주의할 점

- 원자적 연산은 섞이지 않지만, 그것만으로 동기화가 필요 없어지지는 않는다. 튜토리얼은 원자적 접근만 쓰는 방식이 더 효율적인 대신 메모리 일관성 오류를 피하는 책임이 프로그래머에게 더 많이 남는다고 설명한다.
- 원자적 변수 두 개를 차례로 갱신하는 연산은 전체로 보면 원자적이지 않다. 여러 필드를 함께 바꿔야 하면 락으로 묶는다.
- `synchronized` 범위를 넓게 잡으면 안전하지만 처리량이 떨어진다. 공유 상태를 줄이는 쪽이 먼저다.

## 참고

- [[Java] Multi Thread환경에서 동시성 제어를 하는 방법](https://deveric.tistory.com/104) — deveric.tistory.com
- [Synchronization](https://docs.oracle.com/javase/tutorial/essential/concurrency/sync.html) — Oracle Java Tutorials
- [Thread Interference](https://docs.oracle.com/javase/tutorial/essential/concurrency/interfere.html) — Oracle Java Tutorials
- [Atomic Access](https://docs.oracle.com/javase/tutorial/essential/concurrency/atomic.html) — Oracle Java Tutorials
- [Atomic Variables](https://docs.oracle.com/javase/tutorial/essential/concurrency/atomicvars.html) — Oracle Java Tutorials
