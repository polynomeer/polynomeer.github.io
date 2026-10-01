---
title: "spring-internals-lab로 다시 읽는 Spring 8 - DispatcherServlet과 MVC 요청 흐름"
date: 2026-08-13
status: published
categories: [Notes, Spring]
tags: [Spring MVC, DispatcherServlet, HandlerMapping, HandlerAdapter, Java]
series: spring-internals-lab
series_title: spring-internals-lab로 다시 읽는 Spring
series_order: 8
series_description: spring-internals-lab 프로젝트를 바탕으로 Spring 컨테이너, AOP, 트랜잭션, MVC, Boot 내부 구조를 실제 실험과 축소 구현으로 해설하는 시리즈.
---

[GitHub 저장소](https://github.com/polynomeer/spring-lab)

## 이번 글의 질문

Spring MVC를 처음 배울 때는 `@GetMapping`과 `@RequestBody`부터 보게 된다. 하지만 이 시점에는 아직 가장 중요한 질문이 비어 있다.

- 요청은 어떤 순서로 컨트롤러 메서드에 도달하는가
- `HandlerMapping`과 `HandlerAdapter`는 왜 분리되어 있는가
- 리터럴 경로와 변수 경로가 겹치면 누가 이기는가
- [인터셉터](/posts/filter-interceptor-aop/)는 어디서 실행되고, 예외나 차단 상황에서는 무엇이 생략되는가

이번 글은 `dispatcher-servlet-trace`와 `mini-webmvc`를 바탕으로, MVC를 Front Controller(모든 요청을 한 진입점에서 받는 구조)와 책임 분리 파이프라인으로 읽는다.

## `DispatcherServlet` 자체는 의외로 단순하다

핵심 흐름만 줄이면 거의 이렇게 볼 수 있다.

```java
handler = getHandler(request);
adapter = getHandlerAdapter(handler);
mappedHandler.applyPreHandle(...);
result = adapter.handle(...);
mappedHandler.applyPostHandle(...);
processDispatchResult(...);
```

`DispatcherServlet`은 일을 직접 처리하지 않고, 처리할 객체를 찾아서 위임한다.

```mermaid
flowchart TD
    A["HTTP Request"] --> B["HandlerMapping으로 핸들러 찾기"]
    B --> C["HandlerAdapter로 실제 호출"]
    C --> D["반환값 처리"]
    D --> E["응답 생성"]
```

공식 문서도 같은 구조로 설명한다. `DispatcherServlet`은 "provides a shared algorithm for request processing, while actual work is performed by configurable delegate components"(요청 처리의 공통 알고리즘만 제공하고, 실제 일은 설정 가능한 위임 컴포넌트가 한다)([DispatcherServlet](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet.html)).

## `HandlerMapping`과 `HandlerAdapter`를 왜 굳이 나눌까

| 타입 | 질문 |
| --- | --- |
| `HandlerMapping` | 이 요청에 맞는 핸들러가 무엇인가 |
| `HandlerAdapter` | 그 핸들러를 실제로 어떻게 호출할 것인가 |

이 둘을 분리하지 않으면, 새로운 핸들러 형태가 생길 때마다 라우팅 로직까지 같이 수정해야 한다.

반대로 분리하면 다음이 가능하다.

- 애노테이션 기반 핸들러
- `HttpRequestHandler`
- 레거시 `Controller`

같은 요청 매핑 시스템 안에서 서로 다른 "호출 방식"을 공존시킬 수 있다. 그래서 MVC의 유연성은 애노테이션 문법보다 찾기와 실행을 나눈 설계에서 나온다.

## 실제 관찰에서 드러난 세 가지 포인트

`dispatcher-servlet-trace` 실험에서 확인한 것은 세 가지다.

### 1. 리터럴 경로가 변수 경로보다 우선한다

`/users/me`와 `/users/{id}`가 같이 있으면 등록 순서가 아니라 리터럴 경로가 우선된다.

만약 등록 순서에 의존했다면 컴포넌트 스캔 순서나 설정 구조가 바뀔 때 라우팅 결과도 흔들릴 수 있다.

Spring은 대신 "더 구체적인 패턴이 이긴다"는 고정 규칙을 쓴다. 공식 문서 기준으로 URI 변수와 와일드카드가 적을수록 더 구체적이다([Pattern Comparison](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-requestmapping.html)). `/users/me`는 변수가 0개, `/users/{id}`는 1개이므로 `/users/me`가 앞에 온다.

### 2. 매핑 못 찾으면 404로 끝난다

매칭되는 핸들러가 없으면 곧바로 404다. 컨트롤러 예외 처리까지 가지 않고, 핸들러 탐색 단계에서 끝난다.

### 3. 처리하지 못한 예외는 그대로 전파될 수 있다

컨트롤러가 던진 모든 예외가 자동으로 정돈된 HTTP 응답이 되는 건 아니다. 적절한 `ExceptionResolver`가 처리하지 못하면 예외는 그대로 밖으로 나간다.

공식 문서에 따르면 resolver가 `null`을 돌려주면 다음 resolver가 시도하고, 끝까지 처리되지 않은 예외는 서블릿 컨테이너까지 올라간다([Exceptions](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/exceptionhandlers.html)). 그래서 MVC의 예외 처리는 "무조건 500 응답 생성"보다 변환 시도에 가깝다.

## 인터셉터는 양파 구조지만, 예외가 나면 일부 단계는 생략된다

인터셉터의 핵심 메서드는 세 가지다.

- `preHandle`
- `postHandle`
- `afterCompletion`

하지만 이 셋이 항상 다 호출되는 건 아니다.

| 상황 | 호출 결과 |
| --- | --- |
| 정상 처리 | `preHandle -> postHandle -> afterCompletion` |
| `preHandle=false` | 컨트롤러 미호출, 이미 통과한 인터셉터만 `afterCompletion` |
| 컨트롤러 예외 | `postHandle` 생략, `afterCompletion`은 실행 가능 |

표의 "이미 통과한 인터셉터만"은 Javadoc의 규칙과 같다. `afterCompletion`은 그 인터셉터의 `preHandle`이 `true`를 반환한 경우에만 호출된다([HandlerInterceptor](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/servlet/HandlerInterceptor.html)).

이 구조는 트랜잭션의 `try/finally`와 비슷하다. `postHandle`은 정상 결과를 다듬는 훅이고, `afterCompletion`은 뒷정리 훅에 가깝다. 다만 `@ResponseBody` 메서드는 `HandlerAdapter` 안에서 응답을 이미 커밋하므로, `postHandle`에서 헤더를 바꾸기엔 늦다([Interception](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/handlermapping-interceptor.html)).

```mermaid
flowchart TD
    A["preHandle 1"] --> B["preHandle 2"]
    B --> C{"false 반환?"}
    C -- yes --> D["이미 통과한 인터셉터 afterCompletion"]
    C -- no --> E["컨트롤러 호출"]
    E --> F{"예외 발생?"}
    F -- no --> G["postHandle 역순"]
    G --> H["afterCompletion 역순"]
    F -- yes --> H
```

## JSON 응답도 자동이 아니라 협력 객체 덕분이다

실험에서 실제로 겪은 함정이 있다. Jackson이 없으면 [`@RestController`](/posts/rest-controller-annotation/)가 있다고 해서 JSON 응답이 저절로 만들어지지 않는다.

아래는 모두 별도 협력 객체의 역할이다.

- `@RequestBody` 역직렬화
- 객체를 JSON으로 직렬화
- `ResponseEntity` 처리

그래서 `@RestController`는 그 자체로 기능이라기보다, 여러 메시지 변환기와 반환값 처리기가 함께 동작한 결과에 가깝다.

## mini-webmvc는 구조의 핵심만 남긴다

`mini-webmvc`의 `MiniDispatcherServlet`은 아주 작은 반복문으로 시작한다.

```java
for (HandlerMapping mapping : handlerMappings) {
    HandlerMethod handler = mapping.getHandler(request);
    if (handler != null) return handler;
}
```

이 구현이 보여주는 사실은 단순하다.

- Front Controller 자체는 복잡하지 않다.
- 복잡성은 handler mapping, adapter, argument resolution, return value handling 쪽에 쌓인다.

`DispatcherServlet`은 흐름을 조율하는 coordinator다.

## 정리

Spring MVC는 컨트롤러 메서드를 호출하는 프레임워크라기보다, 라우팅, 호출, 변환, 예외 처리, 인터셉션을 각각 다른 객체에 맡긴 파이프라인이다.

[다음 글](/posts/spring-internals-lab-spring-boot/)에서는 마지막으로 Spring Boot 쪽을 본다. `SpringApplication`, 자동 설정, 조건부 설정이 어떻게 기존 컨테이너 위에 얇게 얹히는지 정리한다.

## 참고

- [DispatcherServlet](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet.html) — Spring Framework Reference
- [Pattern Comparison](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-requestmapping.html) — Spring Framework Reference, Mapping Requests
- [Interception](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/handlermapping-interceptor.html) — Spring Framework Reference
- [HandlerInterceptor](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/servlet/HandlerInterceptor.html) — Spring Framework Javadoc
- [Exceptions](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/exceptionhandlers.html) — Spring Framework Reference, HandlerExceptionResolver 체인
