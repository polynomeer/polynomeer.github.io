---
title: "동시성 도구의 비용 - synchronized, ReentrantLock, CAS가 경쟁에서 갈리는 지점"
date: 2026-03-09
categories: [Notes, Java]
tags: [Java, Concurrency, Lock, CAS, Atomic, Performance, JVM]
---

"`synchronized`는 느리니 `AtomicInteger`를 쓰자"는 조언을 자주 듣는다. 절반만 맞다. 경쟁이 없으면 둘 다 거의 공짜이고, 경쟁이 심하면 CAS 쪽이 더 나빠지는 구간이 있다. 각 도구가 경쟁 아래에서 무엇을 하는지 보면 언제 무엇을 쓸지가 정해진다.

## synchronized: 경쟁이 없으면 거의 공짜다

JVM의 모니터 락은 경쟁 정도에 따라 다르게 동작한다. 경쟁이 없으면 객체 헤더에 소유 스레드를 기록하는 **가벼운 락(thin lock)** 으로 CAS 한 번에 끝난다. 실제로 경쟁이 생기면 **무거운 락(fat lock)** 으로 승격되고, 대기 스레드는 OS 수준에서 멈춘다(park). 이때 컨텍스트 스위칭과 커널 진입 비용이 붙는다.

즉 비용은 `synchronized`라는 키워드가 아니라 **경쟁 여부**가 만든다. 경쟁 없는 `synchronized`를 제거하는 최적화는 대개 측정값 없이 하는 일이다.

(과거에 있던 편향 락(biased locking)은 JDK 15에서 기본 비활성화되고 JDK 18에서 제거됐다. 오래된 벤치마크 글이 말하는 수치는 지금과 다를 수 있다.)

## ReentrantLock: 같은 배타성에 기능이 더 있다

`ReentrantLock`은 `AbstractQueuedSynchronizer` 위에 만들어졌고, 경쟁 시 대기 큐에 넣고 park한다는 점은 `synchronized`와 같다. 차이는 성능이 아니라 **할 수 있는 일**이다.

| | `synchronized` | `ReentrantLock` |
| --- | --- | --- |
| 타임아웃 대기 | 불가 | `tryLock(timeout)` |
| 인터럽트 | 불가 | `lockInterruptibly()` |
| 공정성 선택 | 불가(비공정) | 생성자 인자 |
| 조건 변수 | `wait`/`notify` 하나 | `Condition` 여러 개 |
| 해제 | 블록 끝에서 자동 | `finally`에서 직접 |

**공정 락은 비싸다.** 도착 순서를 지키려면 대기 큐를 엄격히 따라야 하고, 그 과정에서 스레드를 깨우고 재우는 일이 늘어난다. 기아(starvation)가 실제 문제일 때만 쓰는 옵션이다.

실무에서 `ReentrantLock`을 고르는 이유는 대개 `tryLock(timeout)`이다. "락을 못 잡으면 기다리지 말고 거절"이 필요한 경우인데, 그것은 성능이 아니라 장애 격리의 요구다.

## CAS와 Atomic: 낙관적이라는 말의 뜻

`AtomicInteger.incrementAndGet()`은 락을 잡지 않는다. 현재 값을 읽고, 새 값을 계산하고, "내가 읽은 값이 그대로면 바꿔라"를 원자적으로 시도한다(compare-and-swap). 실패하면 다시 읽고 다시 시도한다.

경쟁이 없으면 한 번에 성공하고, 락보다 빠르다. **경쟁이 심하면 재시도가 늘어난다.** N개 스레드가 같은 변수를 두드리면 매 순간 하나만 성공하고 나머지는 헛돌며 CPU를 쓴다. 게다가 그 변수가 담긴 캐시 라인이 코어 사이를 계속 오간다(cache line bouncing). 락은 대기 스레드를 재워서 CPU를 놓지만, CAS 루프는 CPU를 쥔 채 실패한다.

그래서 경쟁이 극심한 카운터에는 `LongAdder`가 있다. 스레드마다 다른 셀에 더하고 읽을 때 합친다. 쓰기가 잦고 읽기가 드문 카운터에 맞는 교환이다.

## 고를 때의 순서

1. **공유 가변 상태를 없앤다.** 불변 객체, 스레드 확인(confinement), 메시지 전달. 가장 싼 동기화는 하지 않는 것이다.
2. **표준 동시성 컬렉션을 쓴다.** `ConcurrentHashMap`은 버킷 단위로 잠그고, 직접 만든 락보다 대개 낫다.
3. **단일 변수면 `Atomic*`, 쓰기가 매우 잦은 카운터면 `LongAdder`.**
4. **여러 변수의 불변식을 지켜야 하면 락.** 기본은 `synchronized`, 타임아웃이나 인터럽트가 필요하면 `ReentrantLock`.

## 이 설명이 깨지는 곳

- **가상 스레드에서 `synchronized`는 과거에 핀닝을 일으켰다.** 캐리어 스레드가 묶여 동시성이 떨어졌고, 그래서 `ReentrantLock`으로 바꾸라는 권고가 있었다. JDK 24에서 이 제약이 해소됐으므로, 실행하는 JDK 버전에 따라 조언이 다르다([가상 스레드의 내부](/posts/virtual-threads-internals/)).
- **마이크로벤치마크가 가장 자주 틀리는 영역이 여기다.** JIT가 경쟁 없는 락을 제거하거나 루프를 통째로 없앨 수 있다. JMH 없이 잰 수치는 대개 무의미하다([JIT 컴파일](/posts/jit-compilation/)).
- **락 경합이 아니라 대기가 문제인 경우가 더 많다.** DB나 외부 호출을 기다리는 스레드는 락 때문에 느린 것이 아니다([Tomcat 스레드 고갈](/posts/tomcat-thread-exhaustion/)).
- **여러 프로세스에 걸친 동시성은 이 도구들의 범위 밖이다.** 그 자리에는 DB의 조건부 갱신이나 분산락이 오고, 후자는 별개의 실패 모드를 갖는다([ParityPay 10편](/posts/parity-pay-lock-lease/)).

## 무엇을 재면 확인되는가

JMH로 스레드 수를 1, 2, 4, 8, 16으로 늘려 가며 같은 연산을 재면 세 가지가 보인다.

1. 경쟁이 없을 때 `synchronized`와 `AtomicInteger`의 차이가 생각보다 작다는 것.
2. 스레드가 늘면 CAS의 처리량이 어느 지점부터 **떨어지기 시작한다**는 것.
3. `LongAdder`가 그 지점 이후로 갈린다는 것.

정확성은 다른 도구다. 재배치와 가시성 위반은 jcstress로 확인한다([자바 메모리 모델](/posts/java-memory-model/)).

## 실무와의 접점

[지분율 시스템](/series/batch-structure-improvement/)에서 만든 것은 프로세스 안의 락이 아니라 Redis 분산락이었다. 같은 "배타성"이라는 단어를 쓰지만 실패 모드가 전혀 다르다. JVM 락은 프로세스가 죽으면 같이 사라지고, 분산락은 프로세스가 죽어도 남아서 TTL이 정리해야 한다. [ParityPay 10편](/posts/parity-pay-lock-lease/)의 결론이 그 차이에서 나왔다. **락을 고르기 전에 "무엇과 무엇 사이의 배타성인가"부터 정해야 한다.**

## 정리

- 비용은 키워드가 아니라 경쟁이 만든다. 경쟁 없는 `synchronized`는 CAS 한 번 수준이다.
- `ReentrantLock`이 주는 것은 속도가 아니라 타임아웃, 인터럽트, 조건 변수다. 공정 락은 비싸다.
- CAS는 경쟁이 없으면 빠르고 심하면 재시도로 CPU를 태운다. 락은 재우고 CAS는 헛돈다.
- 쓰기가 매우 잦은 카운터에는 `LongAdder`.
- 가장 싼 동기화는 공유 가변 상태를 만들지 않는 것이다.

## 참고

- [Java: ReentrantLock](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/locks/ReentrantLock.html)
- [JEP 374: Deprecate and Disable Biased Locking](https://openjdk.org/jeps/374)
- Goetz et al., *Java Concurrency in Practice*
- [멀티스레딩 정리](/posts/multi-threading/)
