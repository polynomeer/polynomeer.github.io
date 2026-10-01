---
title: Spring Boot DevTools를 언제 써야 하는가
date: 2025-08-06
categories: [Notes, Spring]
tags: [Spring Boot, DevTools]
---

## DevTools는 무엇을 해결하는가

DevTools는 개발 중 애플리케이션 재시작과 캐시 설정을 더 편하게 만들어주는 도구다. 목적은 코드를 고친 뒤 결과를 보기까지의 시간을 줄이는 것이다.

## 주요 기능

### 1. Automatic Restart

클래스패스에 있는 파일이 바뀌면 애플리케이션을 다시 시작해 준다. 계기는 컴파일 결과의 변경이라 IntelliJ에서는 `Build Project`가 필요하다. 바뀌지 않는 jar는 base [클래스로더](/posts/class-loading-and-startup/)에, 개발 중인 클래스는 restart 클래스로더에 올리고 재시작 때 후자만 새로 만든다. 그래서 콜드 스타트보다 빠르다([Spring Boot: Developer Tools](https://docs.spring.io/spring-boot/reference/using/devtools.html)).

### 2. LiveReload

브라우저 확장과 함께 사용하면 정적 리소스 변경을 빠르게 확인할 수 있다. 공식 문서 기준으로 Spring Boot 4.1.0부터 대체 기능 없이 deprecated다.

### 3. 개발 친화적 기본 설정

- 템플릿 캐시 완화 (`spring.thymeleaf.cache=false` 등)
- 정적 리소스 캐시 완화
- 개발 중 확인에 유리한 설정 제공

## 언제 유용한가

- MVC 기반 프로젝트에서 화면과 API를 함께 확인할 때
- 로컬에서 자주 코드를 수정하고 바로 결과를 확인할 때
- 초기 개발 단계에서 반복 피드백이 많은 팀

## 주의할 점

- 운영 패키지에 섞어 배포하지 말 것. `java -jar` 실행에서는 자동으로 꺼지지만, 의존성은 `optional`이나 `developmentOnly`로 선언한다.
- 재시작이 너무 자주 일어나면 오히려 흐름이 끊길 수 있음
- 대규모 멀티모듈에서는 기대보다 덜 쾌적할 수 있음

## 장점

- 설정이 단순하다.
- 로컬 개발 속도를 체감할 수 있다.
- 화면/리소스 변경 확인이 빠르다.

## 단점

- 프로젝트 구조에 따라 재시작 비용이 여전히 클 수 있다.
- 디버깅 상황에 따라 재시작이 방해가 될 수 있다.
- 팀 환경마다 체감 차이가 크다.

## 정리

DevTools는 필수 도구는 아니지만 로컬 생산성을 올려준다. 다만 프로젝트 크기, 모듈 구조, 팀의 개발 방식에 따라 득실을 판단해야 한다.

## 참고

- [Spring Boot Reference: Developer Tools](https://docs.spring.io/spring-boot/reference/using/devtools.html)
