---
title: OpenID Connect
date: 2024-09-07
categories: [Notes, Web]
tags: [Authentication, OIDC, OAuth]
---

## OpenID Connect란

OpenID Connect, 줄여서 `OIDC`는 OAuth 2.0 위에 사용자 인증 계층을 올린 규격이다. OAuth 2.0이 "권한 위임"에 집중한다면, OIDC는 "이 사용자가 누구인가"를 표준 방식으로 전달한다.

즉 OIDC는 로그인 문제를 다룬다.

## OAuth 2.0만으로는 부족한 이유

OAuth 2.0 토큰만으로는 리소스 접근 권한 위임은 가능하지만, 그 토큰이 누구를 의미하는지 애플리케이션이 일관된 방식으로 해석하기 어렵다.

OIDC는 이를 위해 다음을 표준화했다.

- `ID Token`
- `UserInfo Endpoint`
- 인증 요청 파라미터와 응답 규약

## 핵심 요소

### ID Token

사용자 식별 정보를 담는 토큰이다. 보통 JWT 형식으로 전달되며, `sub`, `iss`, `aud`, `exp` 같은 클레임을 포함한다.

### UserInfo Endpoint

필요하면 별도 API 호출로 사용자 프로필 정보를 가져올 수 있다.

### Scope

`openid` 스코프가 반드시 포함돼야 OIDC 흐름으로 간주된다. 추가로 `profile`, `email` 같은 스코프를 통해 필요한 사용자 정보를 요청할 수 있다.

## 어디에 쓰이나

- 소셜 로그인
- 기업 SSO
- 사내 통합 로그인
- 여러 서비스 간 공통 로그인

즉 인증 서버와 애플리케이션을 분리하는 구조에서 자주 등장한다.

## 정리

OIDC는 OAuth 2.0을 대체하는 규격이 아니라, 그 위에 인증 정보를 얹는 표준이다. 외부 로그인이나 통합 인증을 붙일 때는 OAuth와 OIDC를 구분해서 이해해야 한다.
