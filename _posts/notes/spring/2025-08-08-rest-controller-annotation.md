---
title: "@RestController는 무엇을 의미하는가"
date: 2025-08-08
categories: [Notes, Spring]
tags: [Spring, Spring MVC, REST, "@RestController"]
---

## @RestController의 의미

`@RestController`는 Spring MVC에서 REST API를 만들 때 사용하는 대표 애너테이션이다. 뷰 이름 대신 응답 본문 자체를 반환하는 컨트롤러를 표시한다.

스프링 문서는 이를 "nothing more than a meta-annotation marked with `@Controller` and `@ResponseBody`"라고 설명한다([Spring MVC: @ResponseBody](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/responsebody.html)). `@Controller`와 `@ResponseBody`를 붙인 메타 애너테이션일 뿐이라는 뜻이다.

```java
@RestController = @Controller + @ResponseBody
```

## 그래서 어떤 차이가 생기나

`@Controller`는 보통 뷰 이름을 반환한다. 반면 `@RestController`는 메서드 반환값을 HTTP response body에 직접 담는다. 그 결과는 다음과 같다.

- 문자열을 반환하면 본문 문자열로 응답
- 객체를 반환하면 JSON 등으로 직렬화
- 별도 `@ResponseBody`를 매번 붙일 필요 없음

## 왜 REST API에 적합한가

요즘 백엔드 애플리케이션은 서버 렌더링보다 JSON API를 중심으로 동작하는 경우가 많다. 이때 `@RestController`는 의도를 가장 직접적으로 드러낸다.

## 내부적으로는 무엇이 동작하나

반환값은 `HttpMessageConverter`가 직렬화한다. 보통 Spring Boot에서는 Jackson이 기본으로 연결되어 있어 객체를 JSON으로 변환해준다.

`@ResponseBody`는 클래스 레벨에 붙으면 모든 컨트롤러 메서드가 이를 상속한다. 그래서 `@RestController`를 붙인 클래스의 모든 메서드 반환값은 뷰 이름이 아니라 응답 본문으로 처리된다. 요청이 컨트롤러에 도달하고 반환값이 처리되는 전체 흐름은 [DispatcherServlet과 MVC 요청 흐름](/posts/spring-internals-lab-dispatcher-servlet/)에 정리했다.

## 예시

```java
@RestController
public class HelloController {

    @GetMapping("/hello")
    public Map<String, String> hello() {
        return Map.of("message", "hello");
    }
}
```

이 경우 뷰를 찾지 않고 JSON 응답을 생성한다.

## 자주 헷갈리는 지점

- `@Controller`에 `@ResponseBody`를 붙여도 같은 규칙이 적용된다.
- 파일 다운로드, 스트리밍, 커스텀 헤더처럼 응답 제어가 필요하면 `ResponseEntity`가 더 적합할 수 있다.
- 단순히 `@RestController`를 붙였다고 REST 설계가 좋은 것은 아니다.

## 정리

`@RestController`는 API 응답을 위한 컨트롤러라는 의도를 간결하게 표현한다. 실제 업무에서는 이 애너테이션보다 어떤 상태 코드와 응답 포맷으로 계약을 만들지가 더 중요하다. 예외를 응답으로 바꾸는 쪽은 [@RestControllerAdvice](/posts/controller-advice/)가 맡는다.

## 참고

- [Spring Framework: @ResponseBody](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/responsebody.html)
