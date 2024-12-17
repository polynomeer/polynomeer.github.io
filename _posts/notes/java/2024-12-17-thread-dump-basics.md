---
title: "thread dump 읽는 법 - 스레드 상태와 스택 프레임, 그리고 RUNNABLE이 CPU를 쓴다는 뜻이 아닌 이유"
date: 2024-12-17
status: published
categories: [Notes, Java]
tags: [Java, JVM, Thread Dump, Thread Pool, Concurrency, Observability]
---

[무너지는 Spring 서버 1편](/posts/tomcat-thread-exhaustion/)에서 업스트림 하나가 느려지자 그것을 호출하지도 않는 `/api/fast`가 죽었다. CPU 사용률은 낮았다. 지표만 보면 서버는 한가했다. 원인을 확정한 것은 thread dump였다. 요청 스레드 200개 전부가 `sun.nio.ch.Net.poll`에 멈춰 있었다. 이 글은 그 한 줄을 읽기 위해 필요한 것을 처음부터 정리한다.

## thread dump는 한 시점의 스냅샷이다

thread dump는 JVM 안의 모든 스레드가 **그 순간** 어떤 상태로 어떤 메서드를 실행하고 있는지 적은 텍스트다. 사진 한 장과 같다. 한 장으로는 "지금 많이 기다린다"까지만 알 수 있다. 몇 초 간격으로 여러 장을 떠서 같은 스레드가 같은 자리에 계속 있는지를 봐야 "막혀 있다"고 말할 수 있다. 1편에서 부하 전, 부하 중 두 번, 종료 후까지 시점별로 뜬 이유가 이것이다.

## jcmd로 뜬다

JDK에 포함된 `jcmd`로 뜬다. 인자 없이 실행하면 실행 중인 JVM 프로세스 목록을 보여주고, `Thread.print` 명령이 모든 스레드와 스택 트레이스를 출력한다([jcmd](https://docs.oracle.com/en/java/javase/21/docs/specs/man/jcmd.html)).

```bash
jcmd                          # JVM 프로세스 목록
jcmd 12345 Thread.print       # pid 12345의 thread dump
jcmd 12345 Thread.print -l    # java.util.concurrent 락 정보까지
```

1편의 실험 저장소는 컨테이너 안에서 `jcmd 1 Thread.print`를 실행해 파일로 받는다. 오래된 글에서 자주 보이는 `jstack`도 같은 일을 하지만, JDK 문서는 이 명령이 지원 대상이 아니고 이후 릴리스에서 빠질 수 있다고 적는다([jstack](https://docs.oracle.com/en/java/javase/21/docs/specs/man/jstack.html)). 새로 스크립트를 짠다면 `jcmd`를 쓰는 편이 낫다.

## 스레드 하나의 항목을 읽는 법

아래는 1편 anti 조건에서 실제로 뜬 dump의 일부다. 아래쪽 프레임은 줄였다.

```text
"http-nio-8080-exec-1" #30 [34] daemon prio=5 os_prio=0 cpu=102.40ms elapsed=42.99s ... runnable
   java.lang.Thread.State: RUNNABLE
	at sun.nio.ch.Net.poll(java.base@21.0.12/Native Method)
	at sun.nio.ch.NioSocketImpl.park(java.base@21.0.12/NioSocketImpl.java:191)
	at sun.nio.ch.NioSocketImpl.implRead(java.base@21.0.12/NioSocketImpl.java:309)
	at java.net.Socket$SocketInputStream.read(java.base@21.0.12/Socket.java:1099)
	...
	at sun.net.www.http.HttpClient.parseHTTPHeader(java.base@21.0.12/HttpClient.java:827)
	...
	at io.opslab.app.UpstreamClient.exchange(UpstreamClient.java:76)
	at io.opslab.app.UpstreamClient.call(UpstreamClient.java:55)
	at io.opslab.app.ApiController.upstream(ApiController.java:37)
```

- 첫 줄의 `"http-nio-8080-exec-1"`은 스레드 이름이다. `http-nio-8080-exec-N`은 Tomcat 요청 스레드라는 뜻이다. `cpu=`는 이 스레드가 지금까지 쓴 CPU 시간, `elapsed=`는 생성 후 지난 시간이다.
- 둘째 줄이 스레드 상태다.
- `at`으로 시작하는 줄이 스택 프레임이다. **맨 위가 지금 실행 중인 메서드**이고, 아래로 갈수록 그것을 호출한 쪽이다. 그래서 아래에서 위로 읽으면 이야기가 된다. 컨트롤러가 `UpstreamClient`를 불렀고, HTTP 응답 헤더를 읽으려고 소켓에서 읽기를 시작했고, 데이터가 오지 않아 `Net.poll`에서 기다리는 중이다.

1편에서 "최상위 프레임"이라고 부른 것이 이 맨 윗줄이다. 스레드 수백 개를 최상위 프레임별로 세면 서버가 무엇에 시간을 쓰는지가 표 한 장으로 나온다.

## 스레드 상태 여섯 가지

`java.lang.Thread.State`에는 상태가 여섯 개 있다([Thread.State](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Thread.State.html)). dump에서 자주 보는 것은 가운데 넷이다.

| 상태 | 뜻 | dump에서 흔한 모습 |
| --- | --- | --- |
| `RUNNABLE` | JVM 입장에서 실행 중. 단, OS의 다른 자원(예: CPU)을 기다리는 중일 수 있다 | 계산 중, 또는 소켓 읽기 같은 네이티브 호출 안 |
| `BLOCKED` | `synchronized` 블록에 들어가려고 모니터 락을 기다린다 | `waiting to lock <0x...>` |
| `WAITING` | 다른 스레드가 무언가 해 줄 때까지 기한 없이 기다린다. `Object.wait()`, `Thread.join()`, `LockSupport.park()` | 할 일이 없는 풀 스레드 |
| `TIMED_WAITING` | 기한을 두고 기다린다. `Thread.sleep`, `LockSupport.parkNanos` 등 | 타임아웃이 걸린 대기 |

나머지 둘은 시작 전인 `NEW`와 끝난 `TERMINATED`다.

`Unsafe.park`라는 프레임은 `LockSupport.park` 계열이 바닥에서 부르는 자리다. 1편의 부하 전 dump에서 요청 스레드 10개가 `WAITING (parking)`으로 `Unsafe.park`에 있었는데, 아래 프레임을 보면 Tomcat의 `TaskQueue.take`다. 일감 큐가 비어 쉬고 있다는 뜻이다. 같은 `Unsafe.park`라도 아래 프레임이 [`Semaphore.tryAcquire`](/posts/semaphore-and-permits/)라면 permit을 기다리는 중이다. 최상위 프레임만이 아니라 그 아래 몇 줄을 같이 봐야 하는 이유다.

## RUNNABLE은 CPU를 쓰고 있다는 뜻이 아니다

1편에서 가장 헷갈리는 지점이 여기다. 스레드 200개가 `RUNNABLE`인데 CPU는 놀고 있었다.

`Thread.State` 문서는 이 상태들이 JVM의 상태이고 **운영체제 스레드 상태를 반영하지 않는다**고 적는다. `Net.poll`은 네이티브 메서드다. 스레드는 커널 안에서 소켓에 데이터가 오기를 기다리며 잠들어 있다. 하지만 JVM이 보기에는 네이티브 코드를 실행 중이므로 `RUNNABLE`로 표시한다.

이것은 `cpu=` 값으로 확인된다. 같은 실행에서 `exec-1`의 첫 줄을 시점별로 보면 다음과 같다.

| 시점 | `elapsed` | `cpu` |
| --- | ---: | ---: |
| 부하 중 (이른 시점) | 17.57s | 99.30ms |
| 종료 후 | 98.10s | 108.68ms |

80초가 지나는 동안 CPU를 9ms 남짓 썼다. 스레드는 `RUNNABLE`로 표시됐지만 거의 내내 잠들어 있었다. 그래서 dump에서 `RUNNABLE`을 보면 상태 이름보다 최상위 프레임을 먼저 본다. `Net.poll`, `socketRead`, `epollWait` 같은 자리라면 I/O를 기다리는 중이다. CPU 시간이 어디로 가는지 따로 재는 방법은 [off-CPU 프로파일링 실험](/posts/off-cpu-profiling-experiment/)에서 다뤘다.

## 정리

- dump 한 장은 사진이다. 막혀 있다고 말하려면 시점을 달리한 여러 장에서 같은 스레드가 같은 자리에 있어야 한다.
- 스택은 맨 위가 지금 실행 중인 메서드다. 아래에서 위로 읽으면 누가 무엇을 불러 어디서 멈췄는지가 나온다.
- `Unsafe.park`처럼 같은 최상위 프레임도 아래 프레임에 따라 "쉬는 중"과 "permit 대기"로 갈린다.
- `RUNNABLE`은 JVM의 분류다. 네이티브 I/O에서 잠든 스레드도 `RUNNABLE`로 나오므로 `cpu=`와 최상위 프레임으로 실제로 일하는지를 확인한다.

## 참고

- [무너지는 Spring 서버 1편](/posts/tomcat-thread-exhaustion/) — 이 글의 dump가 나온 실험
- [Java SE 21 API - Thread.State](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Thread.State.html) — 여섯 상태와 각 상태로 들어가는 메서드, OS 상태를 반영하지 않는다는 설명
- [JDK 21 Tool Specifications - jcmd](https://docs.oracle.com/en/java/javase/21/docs/specs/man/jcmd.html) — `Thread.print`와 `-l`, `-e` 옵션
- [JDK 21 Tool Specifications - jstack](https://docs.oracle.com/en/java/javase/21/docs/specs/man/jstack.html) — 지원 대상이 아니라는 안내
- [spring-ops-lab](https://github.com/polynomeer/spring-ops-lab) — 원본 dump는 `reports/data/s1-*/threads-*.txt`
