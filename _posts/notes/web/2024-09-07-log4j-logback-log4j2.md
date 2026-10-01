---
title: Log4j vs Logback vs Log4j2
date: 2024-09-07
categories: [Notes, Web]
tags: [Logging, Log4j, Logback]
---

## 세 프레임워크의 관계

Java 로깅 생태계에서는 API와 구현체를 구분해서 본다. 보통 애플리케이션 코드는 `SLF4J` 같은 로깅 API를 호출하고, 실제 출력은 Logback이나 Log4j2 같은 구현체가 담당한다. SLF4J는 구현체를 배포 시점에 끼우는 파사드(추상화 계층)다([SLF4J 매뉴얼](https://www.slf4j.org/manual.html)).

- `Log4j`: 오래된 Apache 로깅 프레임워크
- `Logback`: Log4j 1.x를 만든 개발자가 시작한 후속 프로젝트([Logback 문서](https://logback.qos.ch/reasonsToSwitch.html))
- `Log4j2`: Log4j의 후속 세대 구현체

Log4j 1.x는 레거시다. Apache Logging Services PMC는 2015년 8월 5일에 Log4j 1.x의 지원 종료(end of life)를 발표했다([Log4j 1.x 페이지](https://logging.apache.org/log4j/1.x/)).

## Log4j 1.x

과거에는 널리 쓰였지만 지금은 유지보수 관점에서 추천하기 어렵다.

- 오래된 설정 방식
- 성능과 확장성 한계
- 보안 및 유지보수 이슈

같은 페이지는 Log4j 1의 취약점이 더 이상 고쳐지지 않는다고 밝힌다. 그래서 신규 프로젝트에서 선택할 이유는 거의 없다([Log4j Vulnerability](/posts/log4j-vulnerability/) 참고).

## Logback

Spring Boot 스타터를 쓰면 기본 로깅 구현체가 Logback이다([Spring Boot Logging 문서](https://docs.spring.io/spring-boot/reference/features/logging.html)). 설정이 비교적 단순하고, SLF4J와의 궁합이 좋다.

장점:

- Spring 생태계와 친숙함
- 설정이 비교적 단순함
- 일반적인 웹 애플리케이션에는 충분함

## Log4j2

고성능과 비동기 로깅을 앞세운 구현체다. 비동기 로거는 I/O를 별도 스레드에서 처리하고, 큐 대신 lock-free 라이브러리인 LMAX Disruptor를 쓴다([Log4j 2 문서](https://logging.apache.org/log4j/2.x/manual/async.html)).

장점:

- 비동기 로깅 지원이 강함
- 확장성과 플러그인 구조가 좋음
- 고성능 로그 처리에 유리

고트래픽 환경이나 로깅 처리량이 중요한 시스템에서 더 자주 검토된다.

## 무엇을 선택할까

일반적인 Spring 서비스:

- 기본 요구사항이면 `SLF4J + Logback`

로그 처리량이 많고 비동기 로깅이 중요한 경우:

- `SLF4J + Log4j2`

어느 쪽이든 코드는 로깅 API에만 의존하게 두고, 구현체는 교체 가능하게 둔다. 그러면 구현체를 바꿔도 애플리케이션 코드는 그대로다. 선택 기준은 생태계 호환성, 운영 성능, 설정 복잡도다.

## 참고

- [SLF4J. *SLF4J user manual*](https://www.slf4j.org/manual.html)
- [Logback. *Reasons to prefer logback over log4j 1.x*](https://logback.qos.ch/reasonsToSwitch.html)
- [Apache Log4j. *Apache Log4j 1.x*](https://logging.apache.org/log4j/1.x/)
- [Apache Log4j. *Asynchronous loggers*](https://logging.apache.org/log4j/2.x/manual/async.html)
- [Spring Boot Reference. *Logging*](https://docs.spring.io/spring-boot/reference/features/logging.html)
