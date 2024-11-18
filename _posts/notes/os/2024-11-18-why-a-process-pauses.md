---
title: "프로세스는 왜 멈추는가 - GC, 페이지 폴트, CPU 경합, SIGSTOP, VM 정지와 스스로 알 수 없는 멈춤"
date: 2024-11-18
status: published
categories: [Notes, OS]
tags: [OS, Process, Garbage Collection, Page Fault, Signal, Distributed Lock, Lease]
---

[Kleppmann의 분산락 글 리뷰](/posts/kleppmann-distributed-locking/)는 이런 장면에서 시작한다. 클라이언트 1이 락을 쥐고 파일을 읽는다. 쓰기 직전에 프로세스가 잠깐 멈춘다. 그 사이 lease가 끝나고 클라이언트 2가 락을 쥐고 쓴다. 클라이언트 1이 깨어나 자기 lease가 끝난 줄 모르고 쓴다. 두 쓰기가 겹친다.

이 장면에서 낯선 것은 "프로세스가 멈춘다"는 부분이다. 코드에는 멈추라는 줄이 없다. 이 글은 코드와 상관없이 프로세스가 멈추는 원인을 하나씩 보고, 멈춘 프로세스가 왜 그 사실을 스스로 알 수 없는지를 설명한다.

## 멈춤은 코드 밖에서 온다

여기서 멈춤(pause)은 프로세스가 살아 있지만 명령을 하나도 실행하지 못하는 구간을 말한다. 블로킹 IO 대기처럼 코드가 스스로 기다리는 것과 다르다. 코드는 다음 줄을 실행하려 했는데, 그 아래의 런타임, 커널, 하이퍼바이저가 실행을 막는다.

[Kleppmann의 원문](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)은 원인을 GC, 페이지 폴트, 네트워크 디스크, CPU 경합, `SIGSTOP` 순으로 든다. 여기에 VM 정지를 더해 층별로 정리하면 이렇다.

| 층 | 원인 | 길이의 감각 |
| --- | --- | --- |
| 런타임 | stop-the-world GC | 밀리초에서, 드물게 수 분 |
| 커널 메모리 | 페이지 폴트, 스왑 | 디스크 한 번 읽는 시간부터 |
| 커널 스케줄러 | CPU 경합, cgroup 스로틀링 | 스케줄 주기 단위(기본 100ms 주기) |
| 커널 시그널 | `SIGSTOP` | 누군가 `SIGCONT`를 보낼 때까지 |
| 하이퍼바이저 | VM 일시 정지, 라이브 마이그레이션 | 보통 짧지만 상한을 모른다 |

## 런타임: stop-the-world GC

JVM의 GC는 객체를 옮기거나 참조를 정리하는 동안 애플리케이션 스레드를 전부 세운다. 이것을 stop-the-world라고 부른다. JDK의 G1 문서는 G1이 [가비지 수집과 공간 회수를 stop-the-world 정지 안에서 수행한다](https://docs.oracle.com/en/java/javase/21/gctuning/garbage-first-g1-garbage-collector1.html)고 적는다. 목표는 정지를 "수백 밀리초를 넘지 않게" 맞추는 것이고, 보장이 아니라 목표다. 힙을 다 쓰면 G1도 전체 힙을 압축하는 Full GC로 간다.

ZGC는 [최대 정지 시간이 1밀리초 미만이고 힙 크기와 무관하다](https://docs.oracle.com/en/java/javase/21/gctuning/available-collectors.html)고 문서에 적혀 있다. 그래도 정지가 0은 아니다. Kleppmann은 stop-the-world GC 정지가 수 분까지 간 사례가 있다고 적는다. GC 동작 자체는 [자바 GC 정리](/posts/java-garbage-collection/)에 따로 적었다.

## 커널: 페이지 폴트와 스왑

프로세스가 보는 메모리 주소는 가상 주소다. 그 주소의 페이지가 아직 물리 메모리에 없으면 CPU가 페이지 폴트를 일으키고, 커널이 페이지를 디스크에서 읽어 올 때까지 그 스레드는 멈춘다. 원문의 표현으로는 변수 하나를 읽었는데 디스크 읽기가 되고, 디스크가 EBS 같은 네트워크 디스크면 그 읽기가 동기 네트워크 요청이 된다.

메모리가 부족해서 힙 일부가 스왑으로 밀려나 있으면 더 나쁘다. GC는 살아 있는 객체를 찾느라 힙의 넓은 범위를 읽으므로, 스왑된 페이지를 만날 때마다 디스크 읽기를 기다린다. GC 정지와 페이지 폴트가 곱해진다. JVM 서버에서 스왑을 끄거나 힙을 물리 메모리보다 넉넉히 작게 잡는 이유다.

## 커널: CPU 경합과 스로틀링

실행 가능한 스레드가 코어보다 많으면 스케줄러는 차례를 돌린다. 내 스레드는 실행할 준비가 됐어도 차례를 기다린다. 원문은 이것을 "CPU를 두고 다투는 다른 프로세스가 많을 때"로 든다.

컨테이너에서는 같은 일이 상한 때문에도 생긴다. cgroup CPU 상한은 100ms 주기마다 정해진 CPU 시간만 쓰게 하고, 그 주기에 할당량을 다 쓰면 주기가 끝날 때까지 아무 스레드도 실행되지 않는다. 사용률이 낮아도 멈춘다. 자세한 동작은 [컨텍스트 스위칭과 cgroup](/posts/context-switching-and-cgroup/)에 적었다.

## 커널: SIGSTOP

시그널은 커널이 프로세스에 보내는 짧은 알림이다. 대부분의 시그널은 프로세스가 핸들러를 달아 가로채거나 무시할 수 있다. `SIGSTOP`은 다르다. [signal(7)](https://man7.org/linux/man-pages/man7/signal.7.html)은 `SIGKILL`과 `SIGSTOP`은 잡거나, 막거나, 무시할 수 없다고 적는다. 기본 동작은 프로세스 정지이고, `SIGCONT`를 받아야 다시 돈다. 터미널에서 Ctrl+Z로 보내는 `SIGTSTP`과 달리 프로세스가 거부할 방법이 없다.

[ParityPay 10편](/posts/parity-pay-lock-lease/)은 이 성질을 실험에 썼다. `SIGSTOP`으로 프로세스를 400ms씩 35회 멈추자, lease를 주기적으로 연장하는 Watchdog 스레드도 같이 멈췄고 락 소유가 131쌍 겹쳤다. 프로세스 안의 어떤 스레드도 프로세스 전체의 멈춤을 막지 못한다.

## 하이퍼바이저: VM 정지

VM 안의 프로세스에게는 운영체제 전체가 멈추는 경우도 있다. 클라우드는 호스트를 정비할 때 VM을 다른 호스트로 옮기는 라이브 마이그레이션을 한다. Google Cloud 문서는 마지막 단계를 [VM이 어디에서도 실행되지 않는 아주 짧은 순간](https://docs.cloud.google.com/compute/docs/instances/live-migration-process)이라고 설명하고, 그동안 시스템 시계가 최대 5초까지 앞으로 뛰어 보일 수 있다고 적는다. 게스트 커널도 같이 멈췄으므로 VM 안에서는 이 구간을 직접 관찰할 수 없다.

## 멈춘 프로세스는 자기 멈춤을 모른다

다섯 원인의 공통점이 여기 있다. 멈춤은 명령과 명령 사이에 끼어든다. 프로세스 입장에서는 한 줄을 실행했고 바로 다음 줄을 실행했을 뿐이다. 그 사이에 몇 초가 흘렀는지는 다음 줄이 시계를 읽어야만 알 수 있다.

```java
if (lease.isValid()) {      // 이 줄은 참이었다
    // 여기서 GC 정지 3초. 그 사이 lease 만료
    storage.write(data);    // 프로세스는 방금 확인했다고 믿는다
}
```

그래서 쓰기 직전에 lease를 한 번 더 확인해도 해결되지 않는다. 원문은 GC가 실행 중인 스레드를 [어느 지점에서든](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) 멈출 수 있고, 마지막 검사와 쓰기 사이도 예외가 아니라고 적는다. 검사를 몇 번 넣어도 "마지막 검사와 실제 동작 사이"는 항상 남는다. 시계를 읽어도 같은 문제가 남는다. VM 정지에서는 시계까지 뛰므로 경과 시간을 재는 기준도 흔들린다. 시계 종류의 차이는 [시간과 순서](/posts/time-and-ordering/)에 적었다.

이 문제의 답은 멈춤을 없애는 것이 아니라, 멈춘 쪽의 늦은 동작을 받는 쪽이 거부하게 하는 것이다. 저장소가 토큰이나 버전을 검사하는 fencing, 조건부 UPDATE가 그 방식이다. 리뷰 글이 이 대목을 다룬다.

## 정리

- 멈춤은 코드가 아니라 런타임, 커널, 하이퍼바이저가 만든다. GC가 없는 언어에서도 페이지 폴트, CPU 상한, `SIGSTOP`, VM 정지는 그대로 있다.
- `SIGSTOP`은 프로세스가 가로챌 수 없고, 프로세스 안의 스레드는 전부 함께 멈춘다. lease 연장 스레드도 예외가 아니다.
- 멈춘 프로세스는 깨어난 뒤에도 멈춤을 알아채지 못한다. 확인과 동작 사이의 틈은 검사를 더해도 줄지 않는다.
- 그래서 안전은 멈춘 쪽이 아니라 받는 쪽에서 만든다. 늦게 도착한 쓰기를 저장소가 거부해야 한다.

## 참고

- [How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) — Martin Kleppmann, 2016-02-08. 멈춤 원인 목록과 검사-쓰기 틈
- [signal(7) — Linux manual page](https://man7.org/linux/man-pages/man7/signal.7.html) — `SIGSTOP`, `SIGCONT`의 기본 동작
- [Garbage-First (G1) Garbage Collector](https://docs.oracle.com/en/java/javase/21/gctuning/garbage-first-g1-garbage-collector1.html) — JDK 21 GC Tuning Guide
- [Available Collectors](https://docs.oracle.com/en/java/javase/21/gctuning/available-collectors.html) — JDK 21 GC Tuning Guide, ZGC 정지 시간
- [Live migration process](https://docs.cloud.google.com/compute/docs/instances/live-migration-process) — Google Cloud Compute Engine 문서
- [Kleppmann 「How to do distributed locking」 리뷰](/posts/kleppmann-distributed-locking/)
