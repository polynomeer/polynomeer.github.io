---
title: Garbage Collection(GC)
date: 2024-09-05
categories: [Notes, Programming]
tags: [Java, JVM, GC]
---

가비지 콜렉션은 메모리 관리 기법 중의 하나로, 프로그램이 동적으로 할당했던 메모리 영역 중에서 필요없게 된 영역을 해제하는 기능이다. 그렇다면 `필요없게 된`이라는 기준은 어떻게 결정할까? 그리고 어떻게 탐지할까?

가비지 콜렉션은 자바 환경(JVM)의 가장 큰 특징 중에 하나인데, 비판하는 입장에서는 언어 수준에서 GC를 제어할 수 없다는 점을 지적한다. 하지만 현대에 와서는 메모리 관리는 프로그래머가 아닌 **컴파일러나 런타임의 영역**이라고 보는 시각이 지배적이다.

가비지 콜렉션의 기본 원리는 모든 객체의 수명을 정확히 몰라도 런타임이 대신 객체를 추적하여 쓸모없는 객체를 알아서 제거하는 것이다. 이렇게 자동 회수한 메모리는 깨끗이 비우고 재활용할 수 있다. 모든 GC 구현체는 다음 두 가지 원칙을 준수해야 한다.

- 알고리즘은 반드시 모든 가비지를 수집해야 한다.
- 살아있는 객체는 절대로 수집해선 안 된다.

두 번째 원칙이 가용성의 측면에서는 더 중요한데, 살아 있는(사용할 가능성이 있는) 객체를 수집했다간 세그먼테이션 폴트가 발생하거나 프로그램 데이터가 조용히 오염된다.

## 필요없게 된 객체를 판단하는 기준

Java GC는 객체가 가비지인지 판단할 때 reachability라는 개념을 쓴다. 객체들은 서로를 참조하며 사슬을 이루는데, 이 사슬의 출발점이 되는 항상 유효한 참조들을 root set이라고 한다. root set에서 시작한 참조 사슬에 속한 객체는 reachable이고, 사슬과 무관한 객체는 unreachable로 GC 대상이다 ([NAVER D2](https://d2.naver.com/helloworld/329631)). 닿지 않는 객체는 프로그램이 다시 사용할 방법이 없으므로 회수해도 안전하다.

```java
void process() {
    byte[] buffer = new byte[1024]; // 지역 변수 buffer가 배열을 참조한다
    use(buffer);
    buffer = null;                  // 이제 이 배열은 어디서도 닿지 않는다
    // 다음 GC에서 회수 대상이 된다
}
```

이 방식은 참조를 끊기만 하면 되므로 프로그래머가 `free`를 호출할 필요가 없다. 대신 서로를 참조하는 객체 묶음도 루트에서 닿지 않으면 함께 회수된다.

## 마크 앤 스위프

Oracle의 GC 튜토리얼은 자동 가비지 콜렉션을 다음 단계로 설명한다 ([Oracle](https://www.oracle.com/webfolder/technetwork/tutorials/obe/java/gc01/index.html)).

1. 마킹(marking): 가비지 컬렉터가 메모리 중 어느 부분이 사용 중이고 어느 부분이 아닌지 식별한다. 이 판단을 위해 모든 객체를 훑기 때문에, 객체가 많으면 시간이 오래 걸린다.
2. 일반 삭제(normal deletion): 참조되지 않는 객체를 제거하고, 참조되는 객체와 빈 공간을 가리키는 포인터를 남긴다. 메모리 할당기는 빈 블록 목록을 들고 있다가 새 객체를 그곳에 할당한다.
3. 압축을 동반한 삭제(deletion with compacting): 남은 객체를 한쪽으로 모아 빈 공간을 연속된 하나의 덩어리로 만든다. 이후의 할당이 더 쉽고 빨라진다.

삭제만 하면 살아 있는 객체 사이에 구멍이 남아 메모리가 조각난다. 압축은 객체를 옮겨야 하므로 비용이 들지만 조각화를 없앤다.

## 세대별 수집

모든 객체를 매번 마킹하고 압축하면 객체가 늘어날수록 GC 시간이 길어진다. 그런데 애플리케이션을 실제로 분석해 보면 대부분의 객체는 짧게 살고 사라진다. HotSpot JVM은 이 관찰을 이용해 힙을 세대로 나눈다.

- Young Generation: 새 객체가 할당되는 곳이다. Eden과 두 개의 Survivor 영역으로 나뉜다. Eden이 차면 Minor GC가 일어나고, 살아남은 객체는 Survivor로 옮겨지며 나이가 늘어난다. 죽은 객체가 대부분이므로 빠르게 끝난다.
- Old Generation: 일정 나이를 넘긴 객체가 옮겨 오는 곳이다. 이 영역을 수집하는 것을 Major GC라고 하며, 살아 있는 객체 전체가 관련되므로 보통 훨씬 느리다.

## 주의할 점

- Stop the World: 튜토리얼 기준으로 Minor GC와 Major GC 모두 수집이 끝날 때까지 애플리케이션 스레드를 멈춘다. 응답 시간이 중요한 서비스라면 Major GC를 줄이는 것이 목표가 되고, 멈춤 시간은 어떤 컬렉터를 쓰는지에 따라 달라진다. 컬렉터별 차이는 [Garbage Collectors](/posts/garbage-collectors/)에 정리했다.
- GC가 있어도 메모리 누수는 생긴다. 다 쓴 객체를 static 컬렉션이나 캐시가 계속 참조하면 루트에서 닿으므로 회수되지 않는다.
- `System.gc()`는 JVM에 회수를 제안할 뿐이다. Javadoc은 이 호출이 특정 양의 객체를 회수하거나 특정 시점에 끝난다는 보장이 없다고 명시한다. GC 시점은 런타임에 맡기는 것이 전제다.

## 참고

- [Java Garbage Collection Basics](https://www.oracle.com/webfolder/technetwork/tutorials/obe/java/gc01/index.html) — Oracle
- [쓰레기 수집 (컴퓨터 과학)](https://ko.wikipedia.org/wiki/%EC%93%B0%EB%A0%88%EA%B8%B0_%EC%88%98%EC%A7%91_(%EC%BB%B4%ED%93%A8%ED%84%B0_%EA%B3%BC%ED%95%99)) — 위키백과
- [Java Garbage Collection](https://d2.naver.com/helloworld/1329) — NAVER D2
- [Java Reference와 GC](https://d2.naver.com/helloworld/329631) — NAVER D2
- [[성능튜닝] 가비지 컬렉터(GC) 이해하기](https://12bme.tistory.com/57) — 12bme.tistory.com
- [자바 메모리 관리 - 가비지 컬렉션](https://yaboong.github.io/java/2018/06/09/java-garbage-collection/) — yaboong.github.io
- [Garbage Collection in Java: Best Practices](https://www.eginnovations.com/blog/what-is-garbage-collection-java/) — eG Innovations
- [JVM Garbage Collectors](https://www.baeldung.com/jvm-garbage-collectors) — Baeldung
- [System (Java SE 21 & JDK 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/System.html#gc()) — Oracle
- [Garbage Collectors](/posts/garbage-collectors/)
