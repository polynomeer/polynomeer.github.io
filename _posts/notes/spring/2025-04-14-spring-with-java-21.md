---
title: Spring에서 Java 21을 도입할 때 체크할 것
date: 2025-04-14
categories: [Notes, Spring]
tags: [Java, Spring, Java 21]
---

## 왜 Java 21을 고려해야 하는가

Java 21은 LTS 버전이고, Spring Boot 3.x 계열과 함께 사용할 때 얻는 이점이 분명하다. 판단 기준은 최신 문법을 얼마나 쓰느냐보다 운영과 개발 생산성에 어떤 이점이 생기느냐다.

## 가장 먼저 볼 것

- 현재 런타임과 라이브러리가 Java 21을 공식 지원하는가
- Spring Boot 버전이 충분히 최신인가
- 운영 환경의 GC, 메모리, 모니터링 도구가 맞춰져 있는가
- 팀이 Java 21 기능을 어디까지 사용할지 기준이 있는가

그래서 이 작업은 버전 숫자를 바꾸는 데서 끝나지 않고, 애플리케이션과 운영 환경의 호환성을 함께 보는 작업이 된다.

## 실무적으로 체감되는 포인트

### 1. Virtual Threads

요청 수가 많고 I/O 대기가 긴 애플리케이션에서는 [가상 스레드](/posts/virtual-threads-internals/)가 매력적이다. Spring Boot에서는 `spring.threads.virtual.enabled=true`로 켠다([Spring Boot 문서](https://docs.spring.io/spring-boot/reference/features/task-execution-and-scheduling.html)). 다만 다음을 같이 봐야 한다.

- [DB 커넥션 풀](/posts/connection-pool/)이 병목이면 효과가 제한적이다.
- synchronized, ThreadLocal 사용 패턴을 다시 봐야 한다. JEP 444에 따르면 `synchronized` 안에서는 가상 스레드가 캐리어에 고정(pinning)되고, ThreadLocal로 비싼 자원을 풀링하면 가상 스레드마다 자원이 하나씩 생길 수 있다([JEP 444](https://openjdk.org/jeps/444), [핀닝 실험](/posts/virtual-thread-pinning-experiment/)).
- 외부 연동이 느리면 스레드 비용만 줄어들 뿐 전체 처리량은 그대로일 수 있다.

JEP 444도 "They exist to provide scale (higher throughput), not speed (lower latency)."라고 적는다. 가상 스레드는 코드를 빨리 돌리지 않고, 동시 요청 처리의 비용 구조를 바꾼다.

### 2. Record

DTO, 응답 모델, 설정 객체에서 record는 꽤 유용하다. 필드가 `final`인 불변성([JEP 395](https://openjdk.org/jeps/395))과 간결함 덕분에 코드 양이 줄고 의도가 명확해진다.

다만 JPA 엔티티처럼 프레임워크 제약이 많은 곳에는 그대로 가져가기 어렵다. record는 주로 "읽기 모델" 쪽에서 생각하는 편이 낫다.

### 3. Pattern Matching과 switch 개선

분기 로직이 많은 서비스에서는 가독성이 좋아진다. 단, 문법이 좋아졌다고 분기 자체가 좋은 설계가 되는 것은 아니다. 복잡한 도메인 분기는 여전히 객체 책임 분리가 우선이다.

## 도입 체크리스트

- 빌드 서버와 운영 서버 JDK 버전 통일
- Docker base image 교체
- APM/모니터링 에이전트 호환성 점검
- 테스트 코드와 reflection 기반 라이브러리 점검
- Spring Boot 버전 업그레이드 동반 여부 확인

## 정리

Java 21은 Spring 프로젝트에 도입할 가치가 있다. 다만 가상 스레드는 커넥션 풀이나 외부 연동처럼 실제 병목이 어디인지 먼저 확인한 뒤 켜야 효과를 볼 수 있다.

## 참고

- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [JEP 395: Records](https://openjdk.org/jeps/395)
- [Spring Boot: Task Execution and Scheduling](https://docs.spring.io/spring-boot/reference/features/task-execution-and-scheduling.html)
