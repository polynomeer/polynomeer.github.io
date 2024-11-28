---
title: "Lock-Free와 CAS - 락 없이 공유 변수를 바꾸는 방법과 그 한계"
date: 2024-11-28
status: published
categories: [Notes, Java]
tags: [Java, Concurrency, Lock-Free, CAS, Atomic]
---

[카카오뱅크 알림 플랫폼 리뷰](/posts/kakaobank-notification-platform/)에 이런 문장이 나온다. 큐를 나누는 시점을 "CAS로 원자적으로 잡고", 그 구현을 Lock-Free라고 부른다. [Kleppmann 분산락 리뷰](/posts/kleppmann-distributed-locking/)에서도 ZooKeeper znode 버전을 쓰기 조건에 넣으면 "CAS가 된다"고 적었다. 두 글 모두 CAS와 Lock-Free를 설명 없이 썼으므로, 이 글에서 처음부터 정리한다.

## CAS는 "그대로면 바꿔라"를 한 번에 하는 연산이다

CAS(compare-and-swap, 자바에서는 compare-and-set)는 세 값을 받는다. 메모리 위치, 기대하는 값, 새 값이다. 그 위치의 현재 값이 기대한 값과 같을 때만 새 값으로 바꾸고, 성공 여부를 돌려준다. 비교와 교체 사이에 다른 스레드가 끼어들 수 없다는 점이 핵심이다. Michael과 Scott의 논문은 이 연산을 IBM System 370에서 도입된 것으로 소개한다([Michael & Scott, PODC 1996](https://www.cs.rochester.edu/~scott/papers/1996_PODC_queues.pdf)).

자바에서는 `AtomicInteger.compareAndSet(expectedValue, newValue)`가 이 연산이다. 현재 값이 `expectedValue`와 같으면 `newValue`로 바꾸고 `true`를, 다르면 `false`를 돌려준다([AtomicInteger](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/AtomicInteger.html)). `java.util.concurrent.atomic` 패키지는 스스로를 단일 변수에 대한 lock-free 스레드 안전 프로그래밍을 지원하는 작은 도구 모음이라고 설명한다([atomic 패키지](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/package-summary.html)).

## CAS 루프: 실패하면 다시 읽는다

CAS 한 번으로는 "1 더하기" 같은 갱신을 표현할 수 없다. 읽고, 계산하고, CAS로 쓰고, 실패하면 처음부터 다시 한다. 이것이 CAS 루프다. JDK 21의 `Unsafe.getAndAddInt`가 바로 이 모양이다([Unsafe.java, jdk-21.0.4](https://github.com/openjdk/jdk21u/blob/jdk-21.0.4-ga/src/java.base/share/classes/jdk/internal/misc/Unsafe.java)).

```java
public final int getAndAddInt(Object o, long offset, int delta) {
    int v;
    do {
        v = getIntVolatile(o, offset);                       // 1. 현재 값을 읽는다
    } while (!weakCompareAndSetInt(o, offset, v, v + delta)); // 2. 그대로면 v+delta로 바꾼다
    return v;                                                // 실패하면 1로 돌아간다
}
```

`AtomicInteger.incrementAndGet()`은 이 메서드를 부른다. 다만 이 메서드에는 `@IntrinsicCandidate`가 붙어 있다. HotSpot이 이 메서드를 손으로 짠 어셈블리나 컴파일러 IR로 바꿀 수 있다는 표시다([IntrinsicCandidate](https://github.com/openjdk/jdk21u/blob/jdk-21.0.4-ga/src/java.base/share/classes/jdk/internal/vm/annotation/IntrinsicCandidate.java)). 그래서 소스에 보이는 루프가 실제로 실행되는 기계어와 같다는 보장은 없다.

직접 루프를 쓰는 대신 `updateAndGet(fn)`에 함수를 넘길 수도 있다. Javadoc은 이 함수가 부작용이 없어야 한다고 적는다. 스레드 간 경쟁으로 갱신이 실패하면 함수가 다시 호출될 수 있기 때문이다. 함수 안에서 로그를 남기거나 외부 호출을 하면, 그 일이 여러 번 일어날 수 있다.

## Lock-Free와 Wait-Free는 다른 보장이다

락을 쓰는 코드에서는 락을 쥔 스레드가 멈추면 나머지가 전부 기다린다. 페이지 폴트, 스케줄링 선점, GC 정지가 그 원인이 될 수 있다. Michael과 Scott은 이런 알고리즘을 blocking이라 부르고, non-blocking 알고리즘은 공유 자료구조에 작업하려는 프로세스가 하나 이상 있으면 그중 어떤 작업은 유한한 단계 안에 끝난다고 보장한다고 정의했다. 오늘날 lock-free라고 부르는 성질이 이것이다.

CAS 루프는 이 성질을 갖는다. 내 CAS가 실패했다는 것은 다른 스레드의 CAS가 성공했다는 뜻이므로, 시스템 전체로는 항상 누군가 앞으로 나아간다. 그러나 특정 스레드 하나는 운 나쁘게 계속 질 수 있다.

그보다 강한 보장이 wait-free다. Herlihy는 wait-free 구현을 다른 프로세스의 실행 속도와 무관하게 모든 프로세스가 모든 연산을 유한한 단계 안에 끝내는 것으로 정의했다([Herlihy, Wait-Free Synchronization, ACM TOPLAS 1991](https://cs.brown.edu/~mph/Herlihy91/p124-herlihy.pdf)). 정리하면 다음과 같다.

| 성질 | 보장하는 것 | 예 |
| --- | --- | --- |
| blocking | 없음. 한 스레드가 멈추면 다른 스레드도 멈출 수 있다 | `synchronized`, `ReentrantLock` |
| lock-free | 전체 중 누군가는 진행한다 | CAS 루프, `ConcurrentLinkedQueue`(Michael & Scott 알고리즘 기반) |
| wait-free | 모든 스레드가 각자 유한한 단계 안에 끝난다 | 훨씬 드물고 구현이 어렵다 |

그래서 "Lock-Free라서 빠르다"는 정확한 말이 아니다. lock-free가 주는 것은 속도가 아니라 진행 보장이다. 경쟁이 심해지면 CAS 루프는 실패와 재시도로 CPU를 쓰고, 이 구간에서는 락보다 느려질 수 있다. 그 비용은 [동시성 도구의 비용](/posts/concurrency-primitives-cost/)에서 `synchronized`, `ReentrantLock`, `LongAdder`와 함께 다뤘다.

## ABA 문제

CAS는 값이 같은지만 본다. 그 사이에 값이 바뀌었다가 돌아왔는지는 모른다. 스레드 1이 A를 읽고 멈춘 사이 다른 스레드가 A를 B로, 다시 A로 바꾸면, 스레드 1의 CAS는 성공한다. 정수 카운터라면 문제가 없지만, 연결 리스트의 노드 포인터라면 그 사이에 노드가 제거되고 재사용됐을 수 있다. 이것이 ABA 문제다.

Michael과 Scott은 가장 흔한 해법으로 포인터에 수정 카운터를 붙이고, CAS가 성공할 때마다 카운터를 올리는 방식을 든다. 자바의 `AtomicStampedReference`가 이 구조다. 참조와 정수 "stamp"를 함께 들고, 두 값이 모두 기대와 같을 때만 바꾼다([AtomicStampedReference](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/AtomicStampedReference.html)). Kleppmann 리뷰에서 znode 버전을 쓰기 조건에 넣는 것, DB에서 `version` 컬럼으로 하는 낙관적 락도 같은 생각이다. 값 대신 "몇 번째 변경인가"를 비교한다.

## 메모리 배리어 한 문단

CAS는 원자성만 주는 것이 아니다. CPU와 컴파일러는 성능을 위해 메모리 읽기·쓰기의 순서를 바꿀 수 있고, 메모리 배리어(fence)는 그 재배치를 막는 지점이다. 자바의 `VarHandle.compareAndSet`은 현재 값을 `getVolatile`의 의미로 읽고 새 값을 `setVolatile`의 의미로 쓴다([VarHandle](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/invoke/VarHandle.html)). 그래서 CAS가 성공하기 전에 쓴 값은, CAS로 바뀐 값을 읽은 다른 스레드에게도 보인다. 카카오뱅크 글에서 CAS로 분할 시점을 잡은 것이 안전한 이유도 여기에 있다. volatile과 happens-before의 정확한 규칙은 [자바 메모리 모델](/posts/java-memory-model/)에 정리했다.

## 정리

- CAS는 비교와 교체를 한 번에 하고, 실패하면 다시 읽어서 재시도하는 루프로 쓴다. 재시도될 수 있으므로 갱신 함수에 부작용을 넣으면 안 된다.
- lock-free는 "누군가는 진행한다"는 보장이지 속도 보장이 아니다. 모든 스레드의 진행까지 보장하는 것은 wait-free다.
- 값만 비교하면 ABA를 놓친다. 버전이나 stamp를 함께 비교하면 막을 수 있고, 낙관적 락과 fencing token도 같은 원리다.
- 자바의 CAS는 volatile 읽기·쓰기의 메모리 효과를 함께 가진다.

## 참고

- [Java SE 21 API: java.util.concurrent.atomic 패키지](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/package-summary.html), [AtomicInteger](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/AtomicInteger.html), [AtomicStampedReference](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/AtomicStampedReference.html)
- [Java SE 21 API: VarHandle](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/invoke/VarHandle.html), 메모리 접근 모드와 fence 메서드
- [OpenJDK jdk21u: Unsafe.java](https://github.com/openjdk/jdk21u/blob/jdk-21.0.4-ga/src/java.base/share/classes/jdk/internal/misc/Unsafe.java), `getAndAddInt`의 CAS 루프, [IntrinsicCandidate.java](https://github.com/openjdk/jdk21u/blob/jdk-21.0.4-ga/src/java.base/share/classes/jdk/internal/vm/annotation/IntrinsicCandidate.java)
- [Java SE 21 API: ConcurrentLinkedQueue](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentLinkedQueue.html), Michael & Scott 기반 non-blocking 구현
- Maged M. Michael, Michael L. Scott, [Simple, Fast, and Practical Non-Blocking and Blocking Concurrent Queue Algorithms](https://www.cs.rochester.edu/~scott/papers/1996_PODC_queues.pdf), PODC 1996, 1절(non-blocking 정의, ABA 문제)
- Maurice Herlihy, [Wait-Free Synchronization](https://cs.brown.edu/~mph/Herlihy91/p124-herlihy.pdf), ACM TOPLAS, 1991, 1절(wait-free 정의)
- [동시성 도구의 비용](/posts/concurrency-primitives-cost/), [자바 메모리 모델](/posts/java-memory-model/)
