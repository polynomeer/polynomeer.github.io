---
title: "세마포어와 permit - 동시에 몇 개까지 들일지를 세는 도구, 그리고 벌크헤드"
date: 2024-12-27
status: published
categories: [Notes, Java]
tags: [Java, Concurrency, Semaphore, Bulkhead, Lock]
---

[무너지는 Spring 서버 1편](/posts/tomcat-thread-exhaustion/)의 조치는 두 가지였다. 읽기 타임아웃 2초, 그리고 "벌크헤드 permit 20"이다. 업스트림 호출 안에 동시에 들어갈 수 있는 요청 스레드 수를 세마포어로 20개로 묶고, permit을 100ms 안에 못 얻으면 503으로 거절했다. 그 결과 thread dump에서 업스트림 읽기에 있는 스레드가 정확히 20개였다. 이 글은 세마포어와 permit이 무엇인지, 왜 그 숫자가 dump에 그대로 보였는지를 정리한다.

## 세마포어는 남은 자리 수를 세는 카운터다

세마포어는 정수 하나를 가진 동기화 도구다. 이 정수를 **permit**(허가) 수라고 부른다. 주차장 입구의 "남은 자리 20" 표시판을 떠올리면 된다.

- 들어가려는 스레드는 `acquire()`로 permit 하나를 받는다. 남은 수가 1 줄어든다. 남은 것이 없으면 생길 때까지 기다린다.
- 다 쓴 스레드는 `release()`로 permit을 돌려준다. 남은 수가 1 늘고, 기다리던 스레드 하나가 들어갈 수 있다.

Java의 `java.util.concurrent.Semaphore` 문서도 개념상 permit 집합을 가진다고 설명하면서, 실제 permit 객체는 없고 사용 가능한 개수만 센다고 적는다([Semaphore](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/Semaphore.html)). permit은 표 한 장이 아니라 숫자 하나다.

## 뮤텍스와 무엇이 다른가

뮤텍스(상호 배제 락)는 "한 번에 하나만" 들어가게 한다. 세마포어는 "한 번에 N개까지"다. permit이 1인 세마포어는 뮤텍스처럼 쓸 수 있고, 이것을 이진 세마포어라고 부른다.

차이가 하나 더 있다. **소유자가 없다.** `ReentrantLock`은 락을 잡은 스레드만 풀 수 있다. 세마포어는 permit을 받은 스레드가 아니어도 `release()`를 부를 수 있다. 문서는 올바른 사용이 애플리케이션의 프로그래밍 관례로 정해진다고 적는다. 그래서 받은 만큼 정확히 돌려주는 책임은 호출하는 코드에 있다. 받지 않고 돌려주면 permit이 21개, 22개로 늘어나도 세마포어는 막지 않는다.

| | 뮤텍스 (`ReentrantLock`, `synchronized`) | 세마포어 |
| --- | --- | --- |
| 동시에 들어가는 수 | 1 | N (생성자에 지정) |
| 소유자 | 잡은 스레드 | 없음 |
| 주로 지키는 것 | 공유 상태의 정합성 | 자원 사용량의 상한 |

락 자체의 비용은 [동시성 도구의 비용](/posts/concurrency-primitives-cost/)에서 다뤘다.

## acquire와 tryAcquire의 차이

`acquire()`는 permit이 생길 때까지 무한히 기다린다. 요청 스레드에서 이것을 쓰면 문제가 생긴다. 업스트림이 느려 permit이 안 돌아오면 요청 스레드가 세마포어 앞에서 줄을 서고, 결국 Tomcat 스레드 200개가 업스트림 대신 세마포어 앞에 묶인다. 기다리는 자리만 바뀌었을 뿐 고갈은 그대로다.

`tryAcquire(timeout, unit)`은 정해진 시간 안에 permit을 얻으면 `true`, 시간이 지나면 `false`를 돌려준다. 1편의 `UpstreamClient`는 이것을 쓴다.

```java
boolean acquired = bulkhead.tryAcquire(100, TimeUnit.MILLISECONDS);
if (!acquired) {
    throw new BulkheadFullException();   // 503으로 바뀐다
}
try {
    return exchange(path);               // 업스트림 호출, 읽기 타임아웃 2초
} finally {
    bulkhead.release();                  // 성공이든 예외든 반드시 돌려준다
}
```

`release()`가 `finally` 안에 있어야 한다. 업스트림이 504로 끝나도 permit은 돌아와야 하기 때문이다. 그리고 permit을 얻지 못한 경로는 `try` 밖에서 끝나므로 받지 않은 permit을 돌려주지 않는다. 앞에서 말한 "소유자 없음"의 함정을 코드 구조로 막은 것이다.

## dump에서 세마포어 대기는 어떻게 보이는가

1편 fixed 조건의 dump에서 permit을 기다리는 스레드는 다음과 같았다.

```text
   java.lang.Thread.State: TIMED_WAITING (parking)
	at jdk.internal.misc.Unsafe.park(java.base@21.0.12/Native Method)
	- parking to wait for  <0x00000000e14c9880> (a java.util.concurrent.Semaphore$NonfairSync)
	at java.util.concurrent.locks.LockSupport.parkNanos(...)
	...
	at java.util.concurrent.Semaphore.tryAcquire(java.base@21.0.12/Semaphore.java:415)
	at io.opslab.app.UpstreamClient.call(UpstreamClient.java:60)
```

`tryAcquire`에 시간을 줬으므로 내부에서 `parkNanos`를 부르고, 상태는 `TIMED_WAITING`이다. `NonfairSync`는 공정성 옵션을 끈 기본 생성자라는 뜻이다. 문서에 따르면 비공정 모드에서는 새로 온 스레드가 오래 기다린 스레드보다 먼저 permit을 받을 수 있다. 생성자에 `true`를 주는 공정 모드는 `acquire`를 부른 순서(FIFO)대로 permit을 준다. dump를 읽는 법은 [thread dump 읽는 법](/posts/thread-dump-basics/)에 정리했다.

permit을 얻은 스레드는 업스트림 읽기(`Net.poll`)로 가고, 그 수는 permit 수를 넘을 수 없다. dump에서 `Net.poll`이 정확히 20개였던 이유가 이것이다.

## 세마포어로 만든 벌크헤드

[벌크헤드](/posts/bulkhead/)는 배의 격벽처럼 자원을 칸으로 나눠 한 칸의 침수가 배 전체로 번지지 않게 하는 패턴이다. 1편에서 칸막이가 지킨 자원은 Tomcat 요청 스레드였다. 업스트림이 아무리 느려도 그 업스트림에 묶일 수 있는 스레드는 20개뿐이고, 나머지 180개는 `/api/fast` 같은 다른 요청을 처리한다.

Resilience4j도 벌크헤드 구현 두 가지 중 하나로 세마포어 방식(`SemaphoreBulkhead`)을 두고, 동시 호출 상한(`maxConcurrentCalls`)과 꽉 찼을 때 기다릴 최대 시간(`maxWaitDuration`)을 설정으로 받는다([Resilience4j Bulkhead](https://resilience4j.readme.io/docs/bulkhead)). 1편의 permit 20과 100ms가 각각 이 둘에 해당한다.

## 정리

- permit은 객체가 아니라 남은 자리 수다. 세마포어는 그 수를 줄이고 늘리며 기다리게 할 뿐이다.
- 세마포어에는 소유자가 없다. 받은 경로에서만 `finally`로 돌려주는 구조가 permit 수를 지킨다.
- 요청 스레드에서는 `acquire()` 대신 시간을 준 `tryAcquire`를 쓴다. 그렇지 않으면 고갈이 세마포어 앞으로 옮겨갈 뿐이다.
- permit 수가 dump에 그대로 보인 것은 세마포어가 "업스트림 호출 안에 동시에 있는 스레드 수"를 직접 정하기 때문이다.

## 참고

- [무너지는 Spring 서버 1편](/posts/tomcat-thread-exhaustion/) — permit 20, 100ms 거절의 실험 결과
- [Java SE 21 API - Semaphore](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/Semaphore.html) — permit 개념, `tryAcquire`의 반환값, 공정성, 소유자가 없다는 설명
- [Resilience4j - Bulkhead](https://resilience4j.readme.io/docs/bulkhead) — `SemaphoreBulkhead`와 `maxConcurrentCalls`, `maxWaitDuration`
- [spring-ops-lab](https://github.com/polynomeer/spring-ops-lab) — `UpstreamClient.java`
