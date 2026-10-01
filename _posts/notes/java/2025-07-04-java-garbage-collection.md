---
title: "Java의 Garbage Collection을 어떻게 이해해야 할까"
date: 2025-07-04
categories: [Notes, Java]
tags: [Java, Garbage Collection, JVM, GC]
---

Java의 Garbage Collection은 흔히 "사용하지 않는 객체를 자동으로 지워주는 기능" 정도로 설명된다. 이 설명 자체는 틀리지 않지만, 실무에서 중요한 것은 GC가 있다는 사실보다 GC가 언제 비용이 되고, 어떤 기준으로 동작하며, 왜 튜닝이 필요한지를 이해하는 것이다.

## GC의 기본 역할

GC의 목적은 더 이상 사용되지 않는 객체가 차지하고 있는 힙 메모리를 회수하는 것이다.

개발자가 직접 `free()`를 호출하지 않아도 되기 때문에 메모리 해제를 빠뜨리는 문제는 줄어든다. 대신 어떤 객체를 언제 회수할지는 JVM이 결정한다.

Java는 수동 메모리 해제를 없애는 대신 자동 관리 비용을 받아들인 셈이다.

## 어떤 객체가 "사용되지 않는다"고 판단하나

Java GC는 보통 도달 가능성(reachability) 기준으로 객체 생존 여부를 판단한다. GC Root에서 시작해 참조 그래프를 따라가고, 닿는 객체만 살아 있다고 본다.

GC Root의 예:

- 현재 실행 중인 스레드의 스택 변수
- static 필드
- JNI 참조

이 루트들로부터 도달할 수 없는 객체는 더 이상 사용되지 않는다고 보고 회수 대상이 된다.

그래서 "변수가 null이 되었다"는 사실 자체보다 루트에서 더 이상 닿을 수 없는가가 기준이 된다.

## 왜 세대별로 나누나

세대 구분은 대부분의 객체가 오래 살아남지 않는다는 관찰에서 나온다. HotSpot 문서는 이것을 약한 세대 가설(weak generational hypothesis)이라 부르고, 객체 대부분이 짧은 기간만 살아남는다고 설명한다([Oracle GC Tuning Guide: Generations](https://docs.oracle.com/en/java/javase/17/gctuning/garbage-collector-implementation.html)).

예:

- 요청 처리 중 잠깐 생성되는 DTO
- 문자열 조합 과정에서 생기는 임시 객체
- 컬렉션 내부의 짧은 생명 객체

그래서 JVM은 힙을 보통 다음처럼 나눈다.

- Young Generation
- Old Generation

새로 생성된 객체는 Young에 들어가고, 여러 번 살아남은 객체만 Old로 이동한다. Young 수집의 비용은 대체로 살아 있는 객체 수에 비례하므로, 죽은 객체로 가득 찬 Young 영역은 빠르게 수집된다. 자주 죽는 객체를 이렇게 싸게 치우는 것이 세대 구분의 목적이다.

## Minor GC와 Full GC를 구분해서 봐야 한다

Young 영역이 차면 Young만 수집하는데, 이를 Minor GC라고 부른다. 이 작업은 상대적으로 짧고 빈번할 수 있다.

Old 영역도 결국 차면 힙 전체를 수집해야 한다. HotSpot 문서는 이를 major collection이라 부르고, 관련된 객체가 훨씬 많아서 보통 minor collection보다 오래 걸린다고 적는다([Oracle GC Tuning Guide: Generations](https://docs.oracle.com/en/java/javase/17/gctuning/garbage-collector-implementation.html)). 흔히 Full GC라고 부르는 이 상황이 잦아지면 응답 지연과 처리량 저하가 눈에 띄게 커진다.

실무에서는 단순히 "GC가 발생했다"보다, 다음을 구분해 보는 것이 중요하다.

- Minor GC가 잦은가
- Old 영역 점유율이 빠르게 오르는가
- Full GC 또는 장시간 pause가 발생하는가

## Stop-the-World가 왜 중요한가

GC는 내부적으로 객체 그래프를 안전하게 보기 위해 애플리케이션 스레드를 멈추는 구간을 가진다. 이를 흔히 Stop-the-World라고 부른다.

이 시간이 길어지면:

- API 응답 지연
- 배치 처리량 저하
- 지연 시간 분포의 tail(p99처럼 느린 쪽 끝) 증가

같은 문제가 발생한다.

그래서 GC 알고리즘의 차이는 결국 다음 질문으로 귀결된다.

> 처리량을 더 중시할 것인가, pause 시간을 더 줄일 것인가

## 대표적인 GC를 어떤 관점으로 봐야 하나

### Parallel GC

처리량을 중시하는 쪽에 가깝다. Oracle 문서도 이 수집기를 throughput collector라고 부르고, 최고 성능이 우선이고 pause 요구가 없거나 1초 이상의 pause를 허용할 수 있을 때 고르라고 안내한다([Available Collectors](https://docs.oracle.com/en/java/javase/21/gctuning/available-collectors.html)). 배치성 작업처럼 pause가 어느 정도 허용되는 환경에서는 여전히 유효할 수 있다.

### G1 GC

대부분의 범용 서버 환경에서 무난한 선택이다. 힙을 region 단위로 나누고, 비교적 예측 가능한 pause time을 목표로 한다. JDK 9부터 서버 구성의 기본 GC다([JEP 248](https://openjdk.org/jeps/248)).

### ZGC, Shenandoah

매우 짧은 pause time이 중요한 환경에서 고려할 수 있다. Oracle 문서는 ZGC가 1ms 미만의 최대 pause를 주는 대신 처리량을 어느 정도 내준다고 설명한다. 그래서 메모리 사용 패턴과 JVM 버전, 운영 환경을 함께 봐야 한다.

특정 GC가 항상 더 좋다고 볼 수는 없다. 시스템 요구사항이 다르기 때문이다. 세 알고리즘이 각각 무엇을 포기하는지는 [GC 알고리즘 비교](/posts/gc-algorithms-compared/)에서, 같은 부하에서 G1과 ZGC의 꼬리 지연을 잰 결과는 [G1과 ZGC가 p99에 남기는 차이](/posts/g1-vs-zgc-tail-latency/)에서 다룬다.

## GC를 볼 때 흔히 놓치는 것

GC 문제는 종종 GC 알고리즘 자체보다 객체 생성 패턴에서 시작된다.

예:

- 불필요한 객체를 과도하게 생성
- 큰 컬렉션을 장시간 유지
- 캐시가 과하게 커짐
- 문자열과 버퍼를 계속 새로 만듦

이 경우 GC를 바꾸기 전에 애플리케이션이 어떤 객체를 얼마나 오래 잡고 있는지부터 봐야 한다. GC 튜닝은 JVM 옵션만의 문제가 아니라 코드 구조 문제이기도 하다. 배치의 메모리 문제를 GC 옵션이 아니라 처리 구조로 푼 사례는 [Heap Dump가 가리킨 곳](/posts/batch-heap-dump-to-chunk/)에 있다.

## 로그에서 먼저 봐야 할 것

GC 로그를 본다면 처음부터 모든 수치를 다 보려고 하기보다 다음을 먼저 보는 편이 낫다.

- pause 시간이 얼마나 긴가
- Young 수집이 얼마나 자주 발생하는가
- Old 영역 점유율이 계속 증가하는가
- Full GC가 발생하는가

이 네 가지를 보면 대부분의 방향이 나온다.

## 정리

GC를 이해한다는 것은 알고리즘 이름을 외우는 것보다 내 애플리케이션의 객체 생명주기와 pause 비용을 함께 보는 것에 가깝다.

실무에서는 GC 자체보다 먼저 이런 질문이 유효하다.

- 객체를 너무 많이 만들고 있지 않은가
- 오래 살아남는 객체가 무엇인가
- pause 시간 목표가 무엇인가

이 질문에 답할 수 있어야 GC 로그도 읽히고, 튜닝도 의미가 생긴다.

## 참고

- [Oracle Java SE 17 GC Tuning Guide: Garbage Collector Implementation](https://docs.oracle.com/en/java/javase/17/gctuning/garbage-collector-implementation.html)
- [Oracle Java SE 21 GC Tuning Guide: Available Collectors](https://docs.oracle.com/en/java/javase/21/gctuning/available-collectors.html)
- [JEP 248: Make G1 the Default Garbage Collector](https://openjdk.org/jeps/248)
