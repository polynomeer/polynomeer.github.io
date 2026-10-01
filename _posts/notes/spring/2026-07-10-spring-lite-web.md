---
title: spring-lite로 이해하는 Spring 구현 4 - DispatcherServlet과 MVC 요청 처리 파이프라인
date: 2026-07-06
status: published
categories: [Notes, Spring]
tags: [Spring, MVC, DispatcherServlet, Web, Java]
series: spring-lite
series_title: spring-lite로 이해하는 Spring 구현
series_order: 4
series_description: spring-lite 프로젝트를 바탕으로 IoC 컨테이너, AOP, MVC, 트랜잭션, 부트스트랩을 구현 관점에서 해설하는 시리즈.
---

[GitHub 저장소](https://github.com/polynomeer/spring-lite)

## 웹 프레임워크를 다시 보니 결국 디스패치 문제였다

Spring MVC를 쓸 때는 `@RestController`, `@GetMapping`, `@RequestBody`가 먼저 눈에 들어온다. 그런데 `spring-lite-web`을 구현하고 따라가다 보면 시선이 조금 바뀐다. 핵심은 문법보다 먼저 디스패치였다.

- 어떤 요청이 왔는가
- 어떤 핸들러가 처리할 것인가
- 메서드 인자를 어떻게 만들 것인가
- 반환값을 HTTP 응답으로 어떻게 바꿀 것인가
- 예외는 어떻게 응답으로 바꿀 것인가

이 흐름의 중심에 `DispatcherServlet`이 있다. 같은 클래스를 실제 Spring 쪽에서 따라간 기록은 [spring-internals-lab 8편](/posts/spring-internals-lab-dispatcher-servlet/)에 있다.

## `DispatcherServlet`은 생각보다 얇다

생성자에서 먼저 필요한 협력 객체를 조립한다.

- `RequestMappingHandlerMapping`
- `RequestMappingHandlerAdapter`
- `JsonReturnValueHandler`
- `DefaultExceptionResolver`

이걸 보고 나면 `DispatcherServlet` 자체가 모든 일을 다 하는 클래스는 아니라는 게 보인다. 오히려 필요한 전략들을 묶고 실행 순서를 제어하는 조립자에 가깝다. 실제 Spring MVC 문서도 같은 구조로 설명한다. "The `DispatcherServlet` delegates to special beans to process requests and render the appropriate responses."([Spring Framework: Special Bean Types](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/special-bean-types.html)) `DispatcherServlet`은 요청 처리와 응답 렌더링을 특수 Bean들에 위임한다는 뜻이다.

`handle()` 흐름도 매우 직선적이다.

1. `handlerMapping.getHandler(exchange)`
2. 없으면 404 반환
3. 있으면 `handlerAdapter.handle(...)`
4. 반환값은 `returnValueHandler.handleReturnValue(...)`
5. 예외가 나면 `exceptionResolver.resolve(...)`
6. 마지막에 `exchange.close()`

그래서 MVC는 별도 마법이라기보다 핸들러 탐색, 인자 해석, 반환값 직렬화, 예외 변환으로 이어지는 파이프라인에 더 가깝다.

## `HandlerMapping`이 먼저 보이기 시작했다

`RequestMappingHandlerMapping`은 `ApplicationContext`에서 `@RestController` Bean을 가져와서 메서드 수준의 `@GetMapping`, `@PostMapping`을 확인한다.

이 부분에서 좋았던 건, 웹 계층도 [IoC 컨테이너](/posts/ioc-di/)가 만든 Bean 위에 올라간다는 점이 자연스럽게 드러난다는 것이다. 라우팅 테이블이 따로 있는 게 아니라, 컨트롤러 Bean을 기준으로 만들어진다.

핸들러 탐색은 대략 이렇게 간다.

- 클래스 레벨 `@RequestMapping` path 읽기
- 메서드 레벨 `@GetMapping` / `@PostMapping` path 결합
- `HandlerMethod` 생성
- path variable 개수와 path 길이 기준으로 정렬

마지막 정렬은 변수 path가 적고 더 구체적인 route가 먼저 오게 만든다. `"/orders/{id}"`와 `"/orders/search"`가 함께 있으면 `/orders/search` 요청은 두 패턴에 모두 맞는다. 변수 route가 먼저 검사되면 `search`가 `{id}` 값으로 잡히므로, 구체적인 route를 앞에 두는 규칙이 필요하다.

## path matching도 결국 문자열 문제로 내려온다

`RequestMappingHandlerMapping`은 template path를 정규식으로 바꿔서 매칭한다.

- `/orders/{id}` 같은 경로를 regex로 변환
- match 성공 시 `{id}` 값을 path variable map에 저장

실제 Spring MVC는 더 복잡한 path pattern parser를 쓰지만, 여기서는 핵심만 남아 있다. route matching은 문자열 패턴을 요청 path에 대응시키는 문제로 내려온다.

## `HandlerAdapter`를 따로 두는 이유가 확실히 보였다

핸들러를 찾았다고 바로 메서드를 호출할 수 있는 건 아니다. 파라미터를 채우고, 호출 규칙을 적용해야 한다. 이 역할을 `RequestMappingHandlerAdapter`가 맡는다.

이 분리가 중요한 이유는 구현을 따라가다 보면 바로 체감된다.

- `HandlerMapping`: 무엇을 호출할지 결정
- `HandlerAdapter`: 어떻게 호출할지 결정

처음엔 약간 과한 추상화처럼 보였다. 그런데 매핑 방식과 호출 방식은 생각보다 독립적으로 바뀐다. 그래서 웹 프레임워크가 유연해지려면 여기서 역할이 갈라져야 한다. Spring 문서도 `HandlerAdapter`의 목적을 핸들러 호출 방식의 세부(예: 애노테이션 해석)로부터 `DispatcherServlet`을 가려 주는 것이라고 설명한다([Special Bean Types](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/special-bean-types.html)).

## argument resolver 체인이 꽤 마음에 들었다

`spring-lite`는 네 가지 resolver를 둔다.

- `PathVariableArgumentResolver`
- `RequestParamArgumentResolver`
- `RequestBodyArgumentResolver`
- `HttpExchangeArgumentResolver`

메서드 파라미터를 한 번에 처리하지 않고, 파라미터 종류별 전략 체인으로 나눈다.

이 구조는 실제로 구현을 따라가는 입장에서도 장점이 컸다.

- 새 파라미터 모델을 추가하기 쉽고
- 웹 규칙이 한 클래스에 몰리지 않고
- 각 인자 해석 로직을 따로 테스트하기 쉽다

Spring MVC의 `HandlerMethodArgumentResolver`를 공부할 때도 이 작은 구현을 먼저 보고 가면 덜 부담스럽다.

## `@RequestBody`가 왜 별도 resolver인지도 이해가 갔다

`RequestBodyArgumentResolver`는 그냥 문자열 읽기가 아니다.

- request body 읽기
- `JsonMapper`로 역직렬화
- 필요한 타입으로 변환

이걸 보고 나면 웹 요청이 결국 문자열/바이트에서 시작하지만, 컨트롤러는 도메인 타입을 받고 싶어 한다는 사실이 더 선명해진다. 그래서 message conversion이 왜 중요한지도 같이 연결된다.

## 반환값도 따로 다루는 게 맞았다

`JsonReturnValueHandler`는 컨트롤러 반환값을 JSON 응답으로 바꾼다.

처음엔 이것도 adapter 안에 같이 넣어도 되지 않나 싶었다. 그런데 메서드를 어떻게 호출할지와 호출 결과를 HTTP 응답으로 어떻게 표현할지는 서로 다른 문제라서 따로 분리되어 있다.

현재 `spring-lite`는 JSON API 중심이라 뷰 렌더링이 섞이지 않는다. 그래서 파이프라인이 더 선명하게 보인다.

## 예외 처리도 결국 별도 전략이다

`DispatcherServlet`은 예외가 나면 직접 JSON을 쓰지 않는다. `DefaultExceptionResolver`에 넘겨서 결과를 받고, 그것을 다시 return value handler 쪽 흐름과 연결한다.

예외 처리도 또 하나의 전략 계층이라는 뜻이다. 실제 Spring의 `@ExceptionHandler`, [`@ControllerAdvice`](/posts/controller-advice/)도 같은 문제를 더 풍부하게 푸는 구조다. Spring 문서는 이 계층을 `HandlerExceptionResolver`라는 예외 해석 전략으로 둔다([Special Bean Types](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/special-bean-types.html)).

## 이 구현으로 다시 보면 MVC는 꽤 단순하다

`spring-lite-web`을 보고 난 뒤 내가 다시 요약한 MVC는 대략 이렇다.

1. 컨테이너에서 컨트롤러 Bean을 찾는다.
2. route와 메서드를 매핑한다.
3. 요청마다 적절한 핸들러를 고른다.
4. argument resolver 체인으로 파라미터를 만든다.
5. 메서드를 실행한다.
6. 반환값을 HTTP 응답으로 직렬화한다.
7. 예외는 별도 resolver로 응답 모델로 바꾼다.

그래서 MVC는 애노테이션 문법 모음이라기보다, **HTTP 요청을 애플리케이션 메서드 호출로 번역하는 파이프라인**이라고 보는 편이 더 잘 맞았다.

## 정리

`spring-lite`의 웹 계층은 작지만, Spring MVC가 왜 지금 같은 구조를 갖는지 이해하기에는 충분했다.

- `DispatcherServlet`은 흐름 제어자이고
- `HandlerMapping`은 라우팅을 맡고
- `HandlerAdapter`는 호출을 맡고
- argument resolver는 파라미터 바인딩을 맡고
- return value handler는 응답 직렬화를 맡고
- exception resolver는 오류 응답을 맡는다

다음 글에서는 이 모든 것을 실제 애플리케이션으로 묶는 [`MiniSpringApplication`과 자동 설정 흐름](/posts/spring-lite-boot/)을 본다.

## 참고

- [Spring Framework Reference: Special Bean Types](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/special-bean-types.html)
