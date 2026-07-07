---
title: spring-lite로 이해하는 Spring 구현 4 - DispatcherServlet과 MVC 요청 처리 파이프라인
date: 2026-07-06
categories: [Notes, Spring]
tags: [Spring, MVC, DispatcherServlet, Web, Java]
series: spring-lite
series_title: spring-lite로 이해하는 Spring 구현
series_order: 4
series_description: spring-lite 프로젝트를 바탕으로 IoC 컨테이너, AOP, MVC, 트랜잭션, 부트스트랩을 구현 관점에서 해설하는 시리즈.
---

## 웹 프레임워크는 결국 디스패치 문제다

Spring MVC를 사용할 때는 `@RestController`, `@GetMapping`, `@RequestBody`가 익숙하다. 하지만 내부적으로 보면 핵심은 훨씬 단순하다.

- 어떤 요청이 왔는가
- 어떤 핸들러가 처리할 것인가
- 메서드 인자를 어떻게 만들 것인가
- 반환값을 HTTP 응답으로 어떻게 바꿀 것인가
- 예외는 어떻게 응답으로 바꿀 것인가

`spring-lite-web`은 이 흐름을 아주 정직하게 드러낸다. 중심은 역시 `DispatcherServlet`이다.

## DispatcherServlet은 얇고 선명하다

생성자에서 먼저 필요한 협력 객체를 조립한다.

- `RequestMappingHandlerMapping`
- `RequestMappingHandlerAdapter`
- `JsonReturnValueHandler`
- `DefaultExceptionResolver`

즉, DispatcherServlet 자체가 모든 일을 다 하지 않는다. 요청 파이프라인을 조립하고, 실행 순서를 제어하는 orchestration 레이어에 가깝다. 이 감각은 실제 Spring MVC와도 같다.

`handle()` 메서드의 순서는 매우 직선적이다.

1. `handlerMapping.getHandler(exchange)`
2. 핸들러가 없으면 404 JSON 반환
3. 있으면 `handlerAdapter.handle(...)`
4. 반환값을 `returnValueHandler.handleReturnValue(...)`
5. 예외 발생 시 `exceptionResolver.resolve(...)`
6. 마지막에 `exchange.close()`

이 흐름을 보면 MVC가 특별한 마법이 아니라 **핸들러 탐색 + 인자 해석 + 반환값 직렬화 + 예외 변환**의 파이프라인이라는 점이 보인다.

## HandlerMapping은 어떤 메서드가 요청을 처리할지 찾는다

`RequestMappingHandlerMapping`은 `ApplicationContext`에서 `@RestController` Bean들을 가져와서, 메서드 수준의 `@GetMapping`, `@PostMapping`을 읽는다.

중요한 점은 스캔 대상이 단순 클래스패스가 아니라 **이미 컨테이너가 만든 Bean**이라는 점이다. 즉, 웹 계층도 결국 컨테이너 위에 올라간다.

핸들러 탐색 과정은 다음과 같다.

- 클래스 레벨 `@RequestMapping` path 읽기
- 메서드 레벨 `@GetMapping` / `@PostMapping` path 결합
- `HandlerMethod` 생성
- path variable 개수와 path 길이 기준으로 정렬

마지막 정렬 로직이 흥미롭다. 변수 path가 적은 핸들러를 우선하고, 그다음 더 긴 path를 우선한다. 이건 `"/orders/{id}"`와 `"/orders/search"`가 섞일 때 더 구체적인 route를 먼저 매칭하기 위한 최소 전략으로 읽을 수 있다.

## Path matching은 생각보다 단순하다

`RequestMappingHandlerMapping`은 template path를 정규식으로 바꿔서 매칭한다.

- `/orders/{id}` -> named capturing group regex
- match 성공 시 `{id}` 값을 꺼내서 path variable map 구성

이 방식이 단순해서 좋은 점은, Spring MVC의 route matching이 결국 "문자열 패턴을 요청 path에 대응시키는 문제"라는 본질을 그대로 보여준다는 것이다.

물론 실제 Spring은 더 복잡한 path pattern parser와 조건 조합을 가지지만, 핵심 개념은 비슷하다.

## HandlerAdapter는 메서드 호출을 수행한다

핸들러를 찾았다고 끝이 아니다. 그 메서드의 파라미터를 실제 값으로 채워야 한다. 이 역할을 `RequestMappingHandlerAdapter`가 맡는다.

이 구조가 중요한 이유는, 매핑과 실행을 분리해야 웹 프레임워크가 확장 가능해지기 때문이다.

- HandlerMapping: 무엇을 호출할지 결정
- HandlerAdapter: 어떻게 호출할지 결정

이 분리는 Spring MVC를 읽을 때도 매우 중요한 축이다.

## ArgumentResolver 체인이 MVC를 훨씬 유연하게 만든다

`spring-lite`는 네 가지 resolver를 등록한다.

- `PathVariableArgumentResolver`
- `RequestParamArgumentResolver`
- `RequestBodyArgumentResolver`
- `HttpExchangeArgumentResolver`

즉, 메서드 파라미터를 한 번에 해석하는 것이 아니라, **파라미터 종류별 전략 체인**으로 나눈다.

이 설계의 장점은 명확하다.

- 새 파라미터 모델을 추가하기 쉽다.
- 웹 계층 규칙이 클래스 하나에 몰리지 않는다.
- 각 인자 해석 로직을 독립적으로 테스트할 수 있다.

실제 Spring도 `HandlerMethodArgumentResolver`를 많이 쓴다. 그래서 `@RequestBody`, `@RequestParam`, `@PathVariable`이 독립된 감각으로 동작하는 이유를 이해할 수 있다.

## RequestBody는 JSON과 타입 변환을 같이 필요로 한다

`RequestBodyArgumentResolver`는 단순 문자열 읽기보다 조금 더 복합적이다.

- request body 읽기
- `JsonMapper`로 역직렬화
- 필요한 타입으로 변환

이 구조는 Spring MVC에서 왜 message converter와 type conversion이 중요한지 떠올리게 한다. 결국 웹 요청은 문자열/바이트로 오지만, 컨트롤러는 도메인 타입을 받고 싶어하기 때문이다.

## ReturnValueHandler는 메서드 결과를 HTTP 응답으로 바꾼다

`JsonReturnValueHandler`는 컨트롤러 메서드의 반환값을 JSON 응답으로 쓴다. 이 계층 분리가 중요한 이유는, "메서드 실행 결과"와 "HTTP 응답 표현"을 분리해야 나중에 확장할 수 있기 때문이다.

즉, MVC는 메서드 호출 프레임워크인 동시에 **HTTP 표현 변환 프레임워크**다.

현재 `spring-lite`는 JSON API 중심이다. 이 제한은 오히려 장점이 있는데, 복잡한 view rendering 없이 MVC 파이프라인의 핵심만 볼 수 있기 때문이다.

## 예외도 별도 resolver를 거친다

`DispatcherServlet`은 예외를 직접 JSON으로 쓰지 않는다. `DefaultExceptionResolver`에 넘겨서 `ExceptionHandlingResult`를 받고, 그것을 다시 return value handler에 넘긴다.

이 구조가 중요한 이유는 웹 프레임워크에서 예외 처리 역시 routing, argument resolution처럼 **별도 전략 계층**으로 볼 수 있어야 하기 때문이다.

실제 Spring의 `@ExceptionHandler`, `@ControllerAdvice`도 결국 같은 문제를 조금 더 일반화한 모델이다.

## 이 구현이 보여주는 MVC의 본질

`spring-lite-web`을 읽고 나면 Spring MVC는 대략 이렇게 요약된다.

1. 컨테이너에서 컨트롤러 Bean을 찾는다.
2. route와 메서드를 매핑한다.
3. 요청마다 적절한 핸들러를 고른다.
4. 인자 resolver 체인으로 메서드 파라미터를 만든다.
5. 메서드를 실행한다.
6. 반환값을 HTTP 응답으로 직렬화한다.
7. 예외는 별도 resolver로 응답 모델로 바꾼다.

즉, MVC는 템플릿 엔진이나 애노테이션 문법보다 먼저 **요청을 애플리케이션 메서드 호출로 바꾸는 번역기**다.

## 정리

`spring-lite`의 웹 계층은 작지만 Spring MVC가 왜 그런 구조를 갖는지 설명하기에 충분하다.

- `DispatcherServlet`은 흐름 제어자이고
- `HandlerMapping`은 라우팅을 맡고
- `HandlerAdapter`는 메서드 호출을 맡고
- argument resolver는 파라미터 바인딩을 맡고
- return value handler는 응답 직렬화를 맡고
- exception resolver는 오류 응답을 맡는다

즉, 웹 프레임워크는 거대한 하나의 클래스가 아니라 **요청 처리 책임을 여러 전략으로 분해한 조립형 파이프라인**이다.

다음 글에서는 이 모든 것을 실제 애플리케이션으로 묶는 `MiniSpringApplication`, 자동 설정, 내장 서버 시작 흐름을 본다.
