---
title: "Spring Boot Startup Explained: The Role of @SpringBootApplication"
date: 2025-06-30
categories: [Archive, Spring]
tags: [Spring, Spring Boot, "@SpringBootApplication"]
---

## @SpringBootApplication

```java
@SpringBootApplication
public class MyApplication {
    public static void main(String[] args) {
        SpringApplication.run(MyApplication.class, args);
    }
}
```

위 코드에서 @SpringBootApplication이 어떤 역할을 하는가? 이 어노테이션은 스프링 부트에서 핵심적인 어노테이션이다. 동작 원리를 알아보기 전에 스프링 부트의 핵심 목표를 확실히 알면 이해가 쉽다.

스프링 부트는 기존 스프링 프레임워크의 복잡한 설정문제를 해결하고, 개발 생산성과 간결함을 추구하기 위해 탄생했다. 따라서 핵심 가치는 간편함, 자동화, 빠른 개발 속도, 확장성, 프로덕션 준비이다.

## @SpringBootApplication = @Configuration + @EnableAutoConfiguration + @ComponentScan

`@SpringBootApplication` 어노테이션은 Spring Boot 애플리케이션의 진입점을 정의할 때 사용하는 핵심 어노테이션이다. 이 어노테이션은 다음 세 가지 어노테이션을 **조합한 복합 어노테이션**이다. @SpringBootConfiguration, @EnableAutoConfiguration, @ComponentScan

```java
@Target({ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@SpringBootConfiguration
@EnableAutoConfiguration
@ComponentScan(
    excludeFilters = {@Filter(
    type = FilterType.CUSTOM,
    classes = {TypeExcludeFilter.class}
), @Filter(
    type = FilterType.CUSTOM,
    classes = {AutoConfigurationExcludeFilter.class}
)}
)
public @interface SpringBootApplication {
```

`@SpringBootApplication`의 선언부를 따라가보면 위와 같은 내용을 확인할 수 있다. (Spring Boot 3.4.8 기준) 나머지 기본정보를 제외하고는 크게 세 가지 어노테이션이 합쳐진 구조이다.

- `@SpringBootConfiguration`: 해당 클래스가 **스프링 설정 클래스**임을 의미. 빈(Bean)을 정의할 수 있음
- `@EnableAutoConfiguration`: **Spring Boot의 자동 설정**을 활성화. 클래스패스에 있는 라이브러리와 설정을 기반으로 자동 설정을 수행
- `@ComponentScan`: 현재 패키지를 포함한 하위 패키지를 **스캔**하여 `@Component`, `@Service`, `@Repository`, `@Controller` 등이 붙은 클래스를 **자동으로 빈으로 등록** -> Spring Framework의 기본 어노테이션이므로 이 글에서는 상세한 설명을 생략한다.

### @SpringBootApplication

```java
@Target({ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Configuration
@Indexed
public @interface SpringBootConfiguration {
    @AliasFor(
        annotation = Configuration.class
    )
    boolean proxyBeanMethods() default true;
}
```

`@Retention(RetentionPolicy.RUNTIME)`을 보면 런타임까지 유지되므로 리플렉션으로 읽을 수 있다는 것을 알 수 있다.

`@Configuration`이 있다는 것은 Spring 설정 클래스임을 나타낸다.

`@Configuration(proxyBeanMethods = true)`은 Spring이 `@Bean` 메서드를 호출할 때 **CGLIB 프록시를 사용해 싱글턴 보장**을 하도록 한다. 이 옵션을 여기에서 정의한 이유는 @Configuration을 감싸는 구조이므로 proxyBeanMethods 속성을 같이 설정할 수 있도록 @SpringBootConfiguration이 일종의 프록시 역할을 해주는 것이다.

@Indexed는 spring-context-indexer 도구를 통해 컴파일 시 스캔되는 클래스 정보를 META-INF/spring.components에 저장한다. 애플리케이션 시작 시, 클래스패스 스캐닝 성능을 향상시키기 위해 사용된다. 예를 들어, 수천 개의 컴포넌트가 있을 때, 상대적으로 성능이 느린 리플렉션 대신 인덱스 파일을 참조해 빠르게 찾는다.

### @EnableAutoConfiguration

```java
@Target({ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@AutoConfigurationPackage
@Import({AutoConfigurationImportSelector.class})
public @interface EnableAutoConfiguration {
    String ENABLED_OVERRIDE_PROPERTY = "spring.boot.enableautoconfiguration";

    Class<?>[] exclude() default {};

    String[] excludeName() default {};
}
```

`@AutoConfigurationPackage`는 현재 패키지를 기준으로 하위 패키지들을 자동 구성 패키지로 설정한다.

`@Import(AutoConfigurationImportSelector.class)`는 자동 설정 클래스들을 **동적으로 로딩**해주는 핵심 클래스이다. 즉, 현재 어노테이션이 붙은 클래스의 패키지를 기준으로 하위 패키지를 자동으로 등록한다. `@SpringBootApplication` 클래스가 `com.example.demo`에 있으면, `com.example.demo` 및 하위 패키지를 자동으로 등록해서 `@Component`, `@Service`, `@Repository` 등을 탐색할 수 있게 해준다. 그래서 Spring Boot 모듈을 구성할 때 @SpringBootApplication이 붙은 메인 클래스가 패키지 최상단에 위치해야 정상동작 하는것이다.

내부적으로 이 클래스는 `spring.factories` 또는 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`에 정의된 자동 설정 클래스를 읽고 조건에 따라 import한다.

AutoConfigurationImportSelector는 다음의 역할을 한다.

- 클래스패스에 존재하는 자동 설정 목록을 로드
- 조건을 체크 (`@ConditionalOnClass`, `@ConditionalOnMissingBean` 등)
- 조건에 맞는 자동 구성 클래스만 컨텍스트에 등록

exclude() 속성은 자동 설정 대상에서 특정 클래스를 **제외할 때** 사용한다. 사용 예시: `@EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class})`

excludeName() 속성은 클래스 이름을 문자열로 제외할 때 사용한다. 클래스가 없거나 런타임에 동적으로 지정할 때 유용하다. 사용 예시: `@EnableAutoConfiguration(excludeName = {"org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration"})`

### AutoConfigurationImportSelector

이제 `@EnableAutoConfiguration`의 핵심 구현체인 **`AutoConfigurationImportSelector`**의 내부 동작을 코드 기반으로 하나하나 추적해 보자. 이 메서드는 핵심 부분이므로 Spring Boot의 자동 설정이 어떻게 동작하는지 이해하는데 큰 도움이 된다. 해당 클래스의 위치는 다음과 같다.

```properties
org.springframework.boot.autoconfigure.AutoConfigurationImportSelector
```

이 클래스는 `@Import(AutoConfigurationImportSelector.class)`로 스프링 컨텍스트에 등록되고, 자동 설정 클래스를 선택하여 import하는 역할을 한다.

#### `selectImports(...)`

```java
@Override
public String[] selectImports(AnnotationMetadata annotationMetadata) {
    AutoConfigurationEntry entry = getAutoConfigurationEntry(annotationMetadata);
    return StringUtils.toStringArray(entry.getConfigurations());
}
```

- `annotationMetadata`: `@EnableAutoConfiguration`이 붙은 클래스의 메타데이터
- 반환값: **적용 가능한 자동 구성 클래스들의 이름 목록**

#### `getAutoConfigurationEntry(...)`

```java
protected AutoConfigurationEntry getAutoConfigurationEntry(AnnotationMetadata annotationMetadata) {
    if (!isEnabled(annotationMetadata)) {
        return EMPTY_ENTRY;
    }

    AnnotationAttributes attributes = getAttributes(annotationMetadata);
    
    List<String> configurations = getCandidateConfigurations(annotationMetadata, attributes);
    configurations = removeDuplicates(configurations);

    Set<String> exclusions = getExclusions(annotationMetadata, attributes);
    checkExcludedClasses(configurations, exclusions);
    configurations.removeAll(exclusions);

    configurations = filter(configurations, annotationMetadata);
    return new AutoConfigurationEntry(configurations);
}
```

- `isEnabled()`: `spring.boot.enableautoconfiguration` 값 체크 (전역 비활성화 여부)
- `getAttributes()`: `@EnableAutoConfiguration`의 `exclude`, `excludeName` 등을 읽음
- `getCandidateConfigurations()`: 자동 설정 클래스 후보를 로드
- `removeDuplicates()`: 중복 제거
- `getExclusions()`: 제외 대상 클래스 로딩
- `checkExcludedClasses()`: 제외 대상이 실제 존재하는지 검증
- `filter()`: `@Conditional` 관련 조건 검사로 최종 필터링

#### `getCandidateConfigurations(...)`

```java
protected List<String> getCandidateConfigurations(AnnotationMetadata metadata, AnnotationAttributes attributes) {
    List<String> configurations = SpringFactoriesLoader.loadFactoryNames(
        getSpringFactoriesLoaderFactoryClass(), getBeanClassLoader());
    return configurations;
}
```

- `SpringFactoriesLoader`를 사용해서
- `META-INF/spring.factories` 또는 `.imports` 파일에서
- `EnableAutoConfiguration`에 등록된 클래스들을 로드합니다.

예시: `spring.factories`

```properties
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,\
org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration,\
org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration
```

이 항목들이 `getCandidateConfigurations()`를 통해 모두 읽혀진다.

#### 조건 필터링 로직: `filter(...)`

```java
protected List<String> filter(List<String> configurations, AnnotationMetadata metadata) {
    AutoConfigurationMetadata autoConfigurationMetadata = AutoConfigurationMetadataLoader.loadMetadata(classLoader);
    
    List<AutoConfigurationImportFilter> filters = getAutoConfigurationImportFilters();
    for (AutoConfigurationImportFilter filter : filters) {
        boolean[] match = filter.match(configurations.toArray(new String[0]), autoConfigurationMetadata);
        // false인 항목 제거
    }
    return filteredConfigurations;
}
```

- 각 자동 구성 클래스에 붙은 `@ConditionalOnClass`, `@ConditionalOnBean`, `@ConditionalOnProperty` 등의 조건을 체크한다.
- 조건을 만족하지 않으면 제외한다.

### @EnableAutoConfiguration 전체 흐름

```
@EnableAutoConfiguration
       ↓
@Import(AutoConfigurationImportSelector)
       ↓
AutoConfigurationImportSelector.selectImports()
       ↓
getAutoConfigurationEntry()
       ├─> getCandidateConfigurations()   ← spring.factories 로딩
       ├─> getExclusions()                ← exclude/excludeName 처리
       ├─> filter()                       ← 조건에 따라 필터링 (@Conditional)
       ↓
리턴: List<String> of @Configuration classes
       ↓
Spring 컨텍스트에 @Import 처리됨 (빈 등록)
```

