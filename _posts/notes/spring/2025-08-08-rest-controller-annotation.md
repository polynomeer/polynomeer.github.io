---
title: @RestController는 무엇을 의미하는가
date: 2025-08-08
categories: [Notes, Spring]
tags: [Spring, Spring MVC, REST, "@RestController"]
---

## @RestController의 의미

`@RestController`는 Spring MVC에서 REST API를 만들 때 사용하는 대표 애너테이션이다. 핵심은 "뷰 이름을 반환하는 컨트롤러"가 아니라 "응답 본문 자체를 반환하는 컨트롤러"라는 점이다.

사실상 다음 두 개를 합친 의미다.

```java
@RestController = @Controller + @ResponseBody
```

## 그래서 어떤 차이가 생기나

`@Controller`는 보통 뷰 이름을 반환한다. 반면 `@RestController`는 메서드 반환값을 HTTP response body에 직접 담는다.

즉:

- 문자열을 반환하면 본문 문자열로 응답
- 객체를 반환하면 JSON 등으로 직렬화
- 별도 `@ResponseBody`를 매번 붙일 필요 없음

## 왜 REST API에 적합한가

요즘 백엔드 애플리케이션은 서버 렌더링보다 JSON API를 중심으로 동작하는 경우가 많다. 이때 `@RestController`는 의도를 가장 직접적으로 드러낸다.

## 내부적으로는 무엇이 동작하나

반환값은 `HttpMessageConverter`가 직렬화한다. 보통 Spring Boot에서는 Jackson이 기본으로 연결되어 있어 객체를 JSON으로 변환해준다.

즉, `@RestController`는 단순히 표시용 애너테이션이 아니라, "이 컨트롤러의 반환값은 응답 본문으로 처리하라"는 MVC 규칙을 활성화하는 장치다.

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

- `@Controller`에 `@ResponseBody`를 붙여도 비슷하게 동작한다.
- 파일 다운로드, 스트리밍, 커스텀 헤더처럼 응답 제어가 필요하면 `ResponseEntity`가 더 적합할 수 있다.
- 단순히 `@RestController`를 붙였다고 REST 설계가 좋은 것은 아니다.

## 정리

`@RestController`는 "API 응답을 위한 컨트롤러"라는 의도를 가장 간결하게 표현하는 애너테이션이다. 실제 업무에서는 이 애너테이션 자체보다, 어떤 상태 코드와 어떤 응답 포맷으로 계약을 만들 것인지가 더 중요하다.
