---
title: "Security 필터 체인 - 인증과 인가는 실제로 어디에 꽂히는가"
date: 2026-06-14
categories: [Notes, Spring]
tags: [Spring, Spring Security, Authentication, Authorization, Filter, JWT]
---

Spring Security 설정이 안 먹을 때 디버깅이 어려운 이유는, 무엇이 어떤 순서로 도는지 안 보이기 때문이다. `@PreAuthorize`를 붙였는데 통과하거나, `permitAll()`을 줬는데 401이 나거나, CORS 프리플라이트가 막힌다. 셋 다 **체인의 어디에서 처리되는가**를 알면 설명된다.

## 구조: 서블릿 필터 하나가 스프링 빈들을 호출한다

Spring Security는 서블릿 컨테이너에 **필터 하나**만 등록한다. `DelegatingFilterProxy`다. 이것이 스프링 컨텍스트의 `FilterChainProxy`를 부르고, 그 안에 여러 개의 `SecurityFilterChain`이 있다.

```text
요청 → 서블릿 컨테이너
     → DelegatingFilterProxy
     → FilterChainProxy
       → SecurityFilterChain #1  (matcher가 맞으면 여기서 처리하고 끝)
       → SecurityFilterChain #2
     → DispatcherServlet → 컨트롤러
```

**첫 번째로 매칭되는 체인 하나만 실행된다.** 여러 체인을 정의했는데 뒤의 설정이 안 먹는다면 앞 체인이 먼저 잡은 것이고, `@Order`로 순서를 정해야 한다.

즉 인증과 인가의 대부분은 **DispatcherServlet에 닿기 전에** 끝난다. 컨트롤러가 호출됐다면 이미 체인을 통과한 것이다.

## 체인 안의 순서

필터 순서는 고정돼 있고, 그중 이해에 필요한 것은 몇 개다.

| 순서 | 필터 | 하는 일 |
| --- | --- | --- |
| 앞 | `SecurityContextHolderFilter` | 저장된 인증 정보를 컨텍스트에 올린다 |
| | `CorsFilter` | CORS 프리플라이트 처리 |
| | `CsrfFilter` | CSRF 토큰 검증 |
| | `UsernamePasswordAuthenticationFilter` | 폼 로그인 처리 |
| | (커스텀 JWT 필터가 보통 이 근처) | 토큰 검증 후 컨텍스트에 인증 설정 |
| | `ExceptionTranslationFilter` | 뒤에서 난 인증·인가 예외를 401/403으로 변환 |
| 끝 | `AuthorizationFilter` | URL 기반 인가 판정 |

두 가지가 중요하다.

**`AuthorizationFilter`가 맨 뒤다.** 그 앞의 필터들이 인증 정보를 컨텍스트에 올려 놓아야 판정이 된다. 커스텀 인증 필터를 `AuthorizationFilter` 뒤에 끼우면 인가 시점에 아직 인증이 없어 항상 거부된다.

**`ExceptionTranslationFilter`가 그 앞이다.** 인가 실패 예외를 잡아 401이나 403으로 바꾸는 자리이고, 이 필터보다 앞에서 난 예외는 변환되지 않고 그대로 올라간다. 커스텀 필터에서 던진 예외가 500으로 나오는 이유가 대개 이것이다.

## URL 기반 인가와 메서드 기반 인가

둘은 **다른 층에서 판정된다.**

**URL 기반**(`authorizeHttpRequests`)은 `AuthorizationFilter`에서, 컨트롤러 호출 전에 끝난다.

**메서드 기반**(`@PreAuthorize`, `@PostAuthorize`)은 **AOP 프록시**로 동작한다. 서비스 메서드를 감싸는 프록시가 판정한다. 그래서 [프록시의 한계](/posts/proxy-limits/)가 그대로 적용된다. **같은 클래스 안에서 부르면(self-invocation) `@PreAuthorize`가 무시된다.** 조용히 통과한다.

`@EnableMethodSecurity`를 켜지 않으면 애노테이션 자체가 동작하지 않는다는 것도 흔한 함정이다.

## 자주 만나는 증상과 원인

**`permitAll()`인데 401.** 그 경로가 다른 `SecurityFilterChain`에 잡혔거나, 커스텀 인증 필터가 체인 앞쪽에서 토큰이 없다고 예외를 던진 경우다. `permitAll`은 인가 단계의 설정이라, 그 앞에서 실패하면 도달하지 못한다.

**CORS 프리플라이트가 401.** `OPTIONS` 요청에는 인증 정보가 없다. `CorsFilter`가 인증 필터보다 앞에 있어야 하고, Spring Security의 `cors()` 설정을 쓰면 그 순서가 보장된다. 직접 등록한 CORS 필터를 뒤에 두면 막힌다([CORS와 CSRF](/posts/cors-and-csrf/)).

**POST만 403.** CSRF다. 세션 쿠키 기반이면 토큰을 보내야 하고, `Authorization` 헤더 기반 API면 `csrf().disable()`이 합리적이다. 다만 **쿠키에 토큰을 담는다면 끄면 안 된다.**

**`@PreAuthorize`가 무시됨.** `@EnableMethodSecurity` 누락이거나 self-invocation이다.

**정적 리소스가 느림.** 모든 요청이 체인을 지나므로, 정적 경로는 `permitAll`보다 체인에서 제외하는 편이 낫다.

## 디버깅 순서

1. `logging.level.org.springframework.security=DEBUG`를 켠다. 어떤 체인이 선택됐고 어떤 필터가 돌았는지 나온다.
2. 실패 지점이 **인증인지 인가인지** 가른다. 401은 "누구인지 모름", 403은 "누구인지는 알지만 권한 없음"이다. 이 구분이 원인의 절반을 좁힌다.
3. `SecurityContextHolder.getContext().getAuthentication()`이 컨트롤러 진입 시점에 무엇인지 확인한다.

## 이 설명이 깨지는 곳

- **WebFlux는 구조가 다르다.** `SecurityWebFilterChain`이고 서블릿 필터가 아니다.
- **`SecurityContext`는 기본적으로 ThreadLocal이다.** 비동기로 스레드를 바꾸면 인증 정보가 따라가지 않는다. `DelegatingSecurityContextExecutor` 같은 장치가 필요하고, 가상 스레드에서도 전파 방식을 확인해야 한다.
- **필터 순서를 직접 바꾸면 보호가 사라질 수 있다.** `addFilterBefore`로 끼울 때 어떤 필터 앞인지가 의미를 바꾼다.
- **인가 규칙의 순서가 중요하다.** `authorizeHttpRequests`는 위에서부터 첫 매칭을 쓰므로, 넓은 패턴을 위에 두면 아래 규칙이 죽는다.

## 무엇을 재면 확인되는가

동작 확인이 주이고 측정은 부차적이다.

1. DEBUG 로그로 실제 실행된 필터 목록을 찍어 기대와 비교한다.
2. 정적 리소스를 체인에 두었을 때와 제외했을 때의 지연 차이.
3. 인증 경로의 비용. 비밀번호 해시는 의도적으로 느린 CPU 작업이므로([비밀번호 저장](/posts/password-storage/)), 로그인 폭주가 다른 API를 느리게 만드는지 확인할 가치가 있다. [Tomcat 스레드 고갈](/posts/tomcat-thread-exhaustion/)과 같은 구조의 질문이다.

## 실무와의 접점

[인증](/posts/authentication/)과 [인가](/posts/authorization/) 정리에서 개념을 다뤘는데, 설정이 안 먹을 때 필요한 것은 개념이 아니라 **실행 순서**였다. 프레임워크를 쓸 때 막히는 지점은 대개 "무엇을 하는가"가 아니라 "언제 하는가"이고, Spring Security는 그 순서가 코드에 드러나지 않아 특히 그렇다. DEBUG 로그를 켜는 것이 문서를 읽는 것보다 빠른 경우가 많다.

## 정리

- 서블릿 필터는 하나뿐이고, 그 안에서 여러 `SecurityFilterChain` 중 **첫 매칭 하나만** 실행된다.
- 인증·인가의 대부분은 컨트롤러에 닿기 전에 끝난다.
- `AuthorizationFilter`는 맨 뒤다. 커스텀 인증 필터는 그보다 앞에 있어야 한다.
- URL 기반 인가는 필터에서, 메서드 기반 인가는 AOP 프록시에서 판정된다. 후자는 self-invocation에 뚫린다.
- 401과 403의 구분이 원인의 절반을 좁힌다.
- 막히면 DEBUG 로그로 실제 필터 목록을 보는 것이 가장 빠르다.

## 참고

- [Spring Security: Architecture](https://docs.spring.io/spring-security/reference/servlet/architecture.html)
- [Spring Security: Authorize HttpServletRequests](https://docs.spring.io/spring-security/reference/servlet/authorization/authorize-http-requests.html)
- [인증 정리](/posts/authentication/), [인가 정리](/posts/authorization/)
