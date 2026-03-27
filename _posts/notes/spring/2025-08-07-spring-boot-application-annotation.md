---
title: "@SpringBootApplication은 실제로 무엇을 하는가"
date: 2025-08-07
categories: [Notes, Spring]
tags: [Spring, Spring Boot, "@SpringBootApplication"]
---

## 진입점 애너테이션으로 끝나지 않는다

```java
@SpringBootApplication
public class MyApplication {
    public static void main(String[] args) {
        SpringApplication.run(MyApplication.class, args);
    }
}
```

`@SpringBootApplication`은 단순히 "부트 앱 시작 표시"가 아니라, 설정 클래스 선언, 자동 설정 활성화, 컴포넌트 스캔 시작점을 한 번에 묶은 복합 애너테이션이다.

## 세 가지 역할을 합친다

- `@SpringBootConfiguration`
- `@EnableAutoConfiguration`
- `@ComponentScan`

즉, 이 애너테이션 하나로 "이 클래스는 설정 클래스이고, 여기 패키지를 기준으로 빈을 스캔하고, 클래스패스 상황에 맞는 자동 설정도 켜라"는 의미가 된다.

## 왜 메인 클래스 위치가 중요한가

`@ComponentScan`의 기본 기준점이 이 클래스의 패키지이기 때문이다. 메인 클래스가 너무 하위 패키지에 있으면 필요한 빈을 스캔하지 못할 수 있다.

보통 애플리케이션 루트 패키지 최상단에 두는 이유가 여기에 있다.

## 자동 설정은 어떻게 동작하는가

자동 설정은 클래스패스에 어떤 라이브러리가 있는지, 어떤 프로퍼티가 설정됐는지, 이미 어떤 빈이 등록됐는지를 보고 조건부로 설정 클래스를 적용하는 방식이다.

즉, Spring Boot는 "있으면 알아서 붙여주는" 것이 아니라, 조건이 맞을 때만 설정을 가져온다.

## 자주 하는 오해

- `@SpringBootApplication`만 붙이면 모든 빈이 등록된다고 생각함
- 자동 설정이 마법처럼 무조건 좋은 방향으로 동작한다고 생각함
- 필요한 설정까지 자동 설정에 전부 맡겨버림

실제로는 조건이 맞아야 적용되고, 필요하면 exclude하거나 명시 설정으로 덮어야 한다.

## 정리

`@SpringBootApplication`은 Spring Boot의 편의 기능이 응축된 시작점이다. 이 애너테이션의 내부 구성을 이해하면 "왜 이 빈이 등록됐는지", "왜 스캔이 안 됐는지", "왜 자동 설정이 붙었는지"를 훨씬 쉽게 해석할 수 있다.
