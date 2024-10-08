---
title: "다이렉트 메모리와 Cleaner - 힙 밖의 버퍼는 누가 언제 해제하는가"
date: 2024-10-08
status: published
categories: [Notes, Java]
tags: [Java, JVM, NIO, Netty, Memory, Memory Leak, Garbage Collection]
---

[NIO와 이벤트 루프](/posts/nio-and-event-loop/)의 마지막 부분에 이런 경고를 적었다. Netty의 `ByteBuf`에서 `release()`를 잊으면 다이렉트 메모리가 새고, 이 누수는 힙 덤프에 안 보인다. 같은 글에서 다이렉트 버퍼는 `Cleaner`에 의존하므로 회수 시점이 불확실하다고도 했다. [카카오뱅크 알림 플랫폼 리뷰](/posts/kakaobank-notification-platform/)에서도 레거시가 OOM으로 이어졌고, 신규 구현은 고정 크기 배열로 GC 압박을 줄였다고 적었다. 메모리가 힙 안에 있는지 밖에 있는지에 따라 이런 문제가 드러나는 방식이 달라진다. 이 글은 그 차이를 풀어 쓴다. 다이렉트 메모리가 어디에 있고, 누가 해제하며, 모자라면 무슨 일이 생기는지다.

## 힙과 다이렉트 메모리

자바 객체는 보통 힙에 있다. 힙은 GC가 관리하는 영역이고, GC는 살아 있는 객체를 다른 위치로 옮기기도 한다. 그런데 소켓에 데이터를 쓰는 것처럼 OS에 메모리 주소를 넘기는 동안에는 그 내용이 움직이면 안 된다. 그래서 JVM은 힙 밖의 네이티브 메모리를 쓰는 버퍼도 제공한다. 이것이 다이렉트 버퍼다.

`ByteBuffer` Javadoc은 다이렉트 버퍼에 대해 JVM이 네이티브 IO를 그 버퍼에 직접 수행하려고 최선을 다한다고 적는다. 즉 중간 버퍼로 복사하는 일을 피하려고 한다. 같은 문단에 대가도 있다. 할당과 해제 비용이 힙 버퍼보다 대체로 높고, 내용이 GC 대상 힙 밖에 있을 수 있어서 애플리케이션의 메모리 사용량에 미치는 영향이 잘 드러나지 않는다([ByteBuffer](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/ByteBuffer.html)).

```java
ByteBuffer heap   = ByteBuffer.allocate(4096);        // 힙 안. GC가 관리한다
ByteBuffer direct = ByteBuffer.allocateDirect(4096);  // 힙 밖 네이티브 메모리
```

두 번째 줄에서 힙에 생기는 것은 작은 `DirectByteBuffer` 객체 하나뿐이다. 실제 4096바이트는 힙 밖에 있다. 힙 덤프에 보이는 것도 그 작은 객체뿐이어서, 다이렉트 메모리가 쌓여도 힙 지표는 평온할 수 있다.

## 해제는 GC가 객체를 치울 때 따라온다

다이렉트 버퍼에는 `free()` 같은 공개 메서드가 없다. 그러면 네이티브 메모리는 언제 돌려주는가. JDK 21의 `DirectByteBuffer` 생성자를 보면 순서가 드러난다([Direct-X-Buffer.java.template, jdk-21.0.4](https://github.com/openjdk/jdk21u/blob/jdk-21.0.4-ga/src/java.base/share/classes/java/nio/Direct-X-Buffer.java.template)).

1. `Bits.reserveMemory(size, cap)`로 사용량 한도 안에서 예약한다.
2. `UNSAFE.allocateMemory(size)`로 네이티브 메모리를 받는다.
3. `Cleaner.create(this, new Deallocator(...))`로 해제 작업을 등록한다. `Deallocator`는 `freeMemory`로 메모리를 돌려주고 예약을 푼다.

여기서 쓰는 `Cleaner`는 내부 클래스 `jdk.internal.ref.Cleaner`다. 공개 API인 `java.lang.ref.Cleaner`도 같은 생각으로 동작한다. 등록한 객체가 phantom reachable이 되면, 즉 GC가 그 객체에 더 이상 강한 참조가 없다고 판단하면 해제 작업이 실행된다([Cleaner](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ref/Cleaner.html)).

문제는 "GC가 판단하면"이다. 작은 `DirectByteBuffer` 객체는 힙을 거의 차지하지 않으므로, 힙이 여유로우면 GC가 한참 돌지 않는다. 그 동안 그 뒤의 네이티브 메모리는 계속 잡혀 있다. 그래서 `Cleaner` Javadoc도 가장 효율적인 사용은 객체를 닫을 때 `clean()`을 명시적으로 부르는 것이라고 권한다.

## 한도와 OOM: Direct buffer memory

다이렉트 버퍼 총량의 상한은 `-XX:MaxDirectMemorySize`로 정한다. 지정하지 않으면 JVM이 자동으로 정한다([java 명령 문서](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html)). JDK 21 소스에서 그 자동 값은 `Runtime.getRuntime().maxMemory()`, 즉 최대 힙 크기와 같다([VM.java, jdk-21.0.4](https://github.com/openjdk/jdk21u/blob/jdk-21.0.4-ga/src/java.base/share/classes/jdk/internal/misc/VM.java)). `-Xmx4g`라면 힙 4GB와 별도로 다이렉트 메모리도 4GB까지 쓸 수 있다는 뜻이고, 컨테이너 메모리 한도를 정할 때 이 몫을 따로 셈해야 한다.

한도에 닿으면 `Bits.reserveMemory`가 바로 실패하지 않는다. 먼저 `System.gc()`를 불러 해제 가능한 버퍼의 `Cleaner`가 돌기를 기대한다. 그 뒤 참조 처리가 끝나기를 기다리거나, 처리할 것이 없으면 1ms부터 두 배씩 늘려 최대 9번 잠들며 다시 예약을 시도한다. 그래도 자리가 없으면 `OutOfMemoryError`를 던진다. 메시지는 다음 형식이다([Bits.java, jdk-21.0.4](https://github.com/openjdk/jdk21u/blob/jdk-21.0.4-ga/src/java.base/share/classes/java/nio/Bits.java)).

```text
Cannot reserve N bytes of direct buffer memory (allocated: X, limit: Y)
```

이 OOM은 힙이 넉넉한 상태에서도 난다. 힙 덤프를 떠도 큰 객체가 보이지 않는 것이 이 오류의 특징이다. 네이티브 메모리를 영역별로 보려면 `-XX:NativeMemoryTracking=summary`로 추적을 켠다(기본은 `off`).

## Netty는 GC를 기다리지 않는다: 참조 카운팅

Netty는 이 불확실성을 받아들이지 않았다. Netty 위키는 GC와 참조 큐가 "더 이상 도달할 수 없음"을 실시간으로 효율적으로 알려 주지 못하기 때문에, 4 버전부터 약간의 불편을 감수하고 참조 카운팅을 쓴다고 설명한다([Reference counted objects](https://netty.io/wiki/reference-counted-objects.html)).

규칙은 이렇다. `ByteBuf`는 카운트 1로 태어나고, `retain()`이 올리고 `release()`가 내린다. 0이 되면 메모리가 풀로 돌아가거나 해제된다. 누가 `release()`를 부르는가에 대해 위키는 참조 카운팅 객체에 마지막으로 접근하는 쪽이 해제 책임도 진다고 정한다. 핸들러가 받은 `ByteBuf`를 다음 핸들러로 넘기면 책임도 함께 넘어가고, 넘기지 않고 끝내면 자기가 해제해야 한다. `slice()`나 `duplicate()`로 만든 파생 버퍼는 원본과 카운트를 공유한다는 점도 실수가 잦은 곳이다.

해제를 빠뜨렸는지는 누수 감지기로 찾는다. 수준은 `DISABLED`, `SIMPLE`(기본, 할당의 약 1%를 표본 추적), `ADVANCED`, `PARANOID`(모든 버퍼) 네 가지이고 `-Dio.netty.leakDetection.level=advanced`처럼 바꾼다. 테스트에서 `PARANOID`로 돌리면 표본에 걸리기를 기다리지 않아도 된다.

## 정리

- 다이렉트 버퍼의 본체는 힙 밖에 있고, 힙에는 작은 핸들 객체만 남는다. 힙 지표와 힙 덤프로는 사용량이 보이지 않는다.
- JDK의 다이렉트 버퍼는 핸들 객체가 GC될 때 `Cleaner`가 해제한다. 힙이 한가하면 그 시점이 늦어진다.
- 상한을 정하지 않으면 최대 힙 크기만큼 더 쓸 수 있으므로, 컨테이너 한도는 힙과 다이렉트 메모리를 합쳐 잡는다.
- Netty는 GC를 기다리지 않고 참조 카운팅으로 즉시 돌려준다. 그 대가로 `release()` 책임이 코드에 생기고, 누수 감지기가 그 실수를 잡는다.

## 참고

- [Java SE 21 API: ByteBuffer](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/ByteBuffer.html), Direct vs. non-direct buffers
- [Java SE 21 API: java.lang.ref.Cleaner](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ref/Cleaner.html)
- [Java SE 21: java 명령](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html), `-XX:MaxDirectMemorySize`, `-XX:NativeMemoryTracking`
- OpenJDK jdk21u 소스: [Direct-X-Buffer.java.template](https://github.com/openjdk/jdk21u/blob/jdk-21.0.4-ga/src/java.base/share/classes/java/nio/Direct-X-Buffer.java.template), [Bits.java](https://github.com/openjdk/jdk21u/blob/jdk-21.0.4-ga/src/java.base/share/classes/java/nio/Bits.java), [VM.java](https://github.com/openjdk/jdk21u/blob/jdk-21.0.4-ga/src/java.base/share/classes/jdk/internal/misc/VM.java)
- [Netty wiki: Reference counted objects](https://netty.io/wiki/reference-counted-objects.html)
- [NIO와 이벤트 루프](/posts/nio-and-event-loop/), [Java의 Garbage Collection](/posts/java-garbage-collection/), [Netty 정리](/posts/netty/)
