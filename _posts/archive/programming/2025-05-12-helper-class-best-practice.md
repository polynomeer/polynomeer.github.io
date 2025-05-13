---
title: 헬퍼 클래스는 안티패턴일까?
date: 2025-05-12
categories: [Archive, Programming]
tags: [Helper Class, Utility Class]
---

실무에서는 도메인 객체가 너무 비대해지는 걸 막기 위해 `Helper` 클래스가 자주 사용된다. 하지만 어느 순간부터 로직이 섞이고, 도메인 책임과 기술 책임이 뒤섞이면서 코드 유지보수가 어려워진다. 객체 지향 프로그래밍의 SOLID 원칙을 기준으로 하면 [헬퍼 클래스는 존재 자체가 안티패턴](https://blog.itkonekt.com/2017/11/22/helper-class-is-evil-2/)이라고도 주장할 수 있으나, 실질적으로 **도메인과 전혀 관련없는 정적인 기능**은 유틸리티 클래스나 헬퍼 클래스로 분리하는게 오히려 깔끔해보이기도 한다.

이번 글에서는 **도메인과 헬퍼 클래스의 책임 경계를 어떻게 나눌지**, 그리고 헬퍼 클래스가 전략 패턴으로 자연스럽게 **확장 가능한 구조**가 되는 과정을 살펴보도록 한다.

## 1. 헬퍼 클래스 vs 유틸리티 클래스

**유틸리티 클래스(Utility Class)**와 **헬퍼 클래스(Helper Class)**는 실제로 많은 경우 혼용되어 사용되지만, 약간의 뉘앙스 차이가 있다. 특히 자바에서는 명확한 문법적 구별기준이 존재한다.

### 유틸리티 클래스 (Utility Class)

📌 정의:

- **재사용 가능한 정적 메서드 모음**을 제공하는 클래스
- 일반적으로 **객체 생성 없이(static)** 사용함

📌 특징:

- 모든 메서드가 `static`
- 상태(state)가 없음 → 순수 함수 중심
- 대표 예: Java의 `java.util.Collections`, `java.lang.Math`, Apache Commons의 `StringUtils`

📌 예시:

```java
public class MathUtils {
    public static int max(int a, int b) {
        return a > b ? a : b;
    }

    public static boolean isEven(int num) {
        return num % 2 == 0;
    }
}
```

### 헬퍼 클래스 (Helper Class)

📌 정의:

- **특정 클래스나 기능을 보조하는 메서드나 기능을 담당**하는 클래스
- 유틸 클래스보다 **특정 목적**에 더 밀접하게 연결됨

📌 특징:

- 정적 메서드일 수도 있고, 객체 지향적으로 인스턴스를 가질 수도 있음
- 특정 도메인이나 기능에 종속적일 수 있음
- 보통 "FooHelper", "BarSupport" 같은 이름

📌 예시:

```java
public class JsonHelper {
    private final ObjectMapper objectMapper = new ObjectMapper();

    public String toJson(Object obj) throws JsonProcessingException {
        return objectMapper.writeValueAsString(obj);
    }

    public <T> T fromJson(String json, Class<T> clazz) throws JsonProcessingException {
        return objectMapper.readValue(json, clazz);
    }
}
```

✅ 차이점 정리

| 항목             | 유틸리티 클래스                      | 헬퍼 클래스                            |
| ---------------- | ------------------------------------ | -------------------------------------- |
| 목적             | 일반적인 공통 기능 제공              | 특정 작업/클래스에 대한 보조 기능 제공 |
| 메서드 형태      | 대부분 static                        | static 또는 인스턴스 메서드 가능       |
| 상태(state) 보유 | 없음 (무상태)                        | 있을 수 있음                           |
| 사용 범위        | 전역적, 범용적                       | 도메인/기능 중심, 국지적               |
| 예시             | `StringUtils`, `Math`, `Collections` | `JsonHelper`, `EmailHelper` 등         |

- **정적 메서드 위주**, 상태 없음 → 유틸리티 클래스
- **기능 지원/보조 목적**, 특정 클래스와 밀접 → 헬퍼 클래스
   → 명확히 구분되기보다는 컨텍스트에 따라 명명되는 경우가 많다.

---

## 2. 헬퍼 클래스와 유틸리티 클래스 선택 기준

> 헬퍼 클래스로 선택하는 명확한 이유가 없다면, **유틸리티 클래스로** 작성하는 것이 좋다.

유틸리티 클래스로 작성한 코드는 함수형 스타일을 적용해서 **부수효과(side effect)를 제거**한 상태로 활용하는 것이 권장된다.

#### 왜 기본적으로 유틸 클래스가 좋은 선택인가?

1. **간단하고 명확한 구조**: 정적 메서드 중심 → 코드 읽기, 이해, 사용이 쉬움
2. **테스트가 용이**: 상태가 없으므로 테스트 시 setup 필요 없음, 순수 함수 → 단위 테스트에 최적
3. **의존성 관리 필요 없음**: DI 없이 바로 사용 가능 → 의존성 주입 지옥 회피
4. **모듈 분리 쉬움**: 범용 기능 → 공통 모듈로 묶기 쉬움 (`commons-utils`)
5. **IDE 자동완성 최적**: `StringUtils.`처럼 자동완성으로 빠르게 탐색 가능

#### 헬퍼 클래스로 넘어가야 하는 경우는 예외적이다

헬퍼 클래스는 다음과 같은 경우에만 써야 한다:

| 이유                                   | 예시                                        |
| -------------------------------------- | ------------------------------------------- |
| 외부 의존성 주입 필요                  | `ObjectMapper`, `Validator`, `RestTemplate` |
| 상태/설정이 필요                       | `charEncoding`, `excelFormat`, `cacheTime`  |
| 도메인 보조 로직에 집중                | `ProductImageHelper`, `OrderCouponHelper`   |
| 테스트에서 목처리가 필요한 의존성 존재 | `EmailSenderHelper`, `SlackNotifier`        |

→ 이 외에는 대부분 유틸로 처리하는 게 더 명료하다.

#### ❌ 유틸을 헬퍼로 잘못 구현하면 생기는 문제

| 문제                       | 설명                                         |
| -------------------------- | -------------------------------------------- |
| 필요 없는 DI 컨테이너 의존 | `@Component` 붙은 무상태 클래스들            |
| 테스트 불편                | mock 주입을 위해 쓸데없는 코드 필요          |
| 코드 흐름 복잡             | 유틸을 헬퍼로 감싸다 보니 오히려 구조가 꼬임 |
| 모듈 분리 어려움           | 공통 기능인데 도메인에 얽혀 버림             |

#### 실무 팁 요약

| 상황                             | 선택          |
| -------------------------------- | ------------- |
| 정적 메서드로 가능하고 상태 없음 | 🔹 유틸 클래스 |
| 외부 객체 사용 (Mapper 등)       | 🔸 헬퍼 클래스 |
| 특정 도메인에 종속된 보조기능    | 🔸 헬퍼 클래스 |
| 공통 기능, 도메인과 무관         | 🔹 유틸 클래스 |

## 3. 헬퍼 클래스는 안티패턴인가?

- 무조건 안티패턴은 아니다.
- 하지만 **도메인 책임이 애매하게 들어오고, 책임 분리가 안 되면 문제**
- `doSomethingHelper()`, `Utils.calculateXYZ()` 같은 **이름부터 역할이 불분명한 클래스**는 코드 냄새의 시그널

### 도메인 객체 vs 헬퍼 클래스의 책임 경계

| 질문                                        | 도메인 객체 | 헬퍼 클래스 |
| ------------------------------------------- | ----------- | ----------- |
| 상태를 변경해야 하는가?                     | ✅           | ❌           |
| 도메인의 정책을 결정하는가?                 | ✅           | ❌           |
| 여러 객체를 묶어 조건을 판단하는가?         | ❌ (복잡)    | ✅           |
| 단순한 조건 확인/계산 보조인가?             | ❌           | ✅           |
| 포맷팅/외부 시스템 연동 등 기술적 책임인가? | ❌           | ✅           |

### 실무 예시: `DeliveryFeeCalculatorHelper`

```java
public static int calculateFee(Order order) {
    if (order.getTotalAmount() >= 50000) return 0;
    if (order.getShippingMethod() == EXPRESS) return 5000;
    return 2500;
}
```

문제점:

- 조건문 증가 → OCP 위반
- 테스트 어려움
- `Order` 객체 내부 책임을 `Helper`가 침범

### 리팩토링: 전략 패턴으로 분리

- `DeliveryFeePolicy` 인터페이스 정의
- `Standard`, `Express` 정책 구현
- `DeliveryFeePolicyResolver`로 전략 선택

```java
public interface DeliveryFeePolicy {
    boolean supports(ShippingMethod method);
    int calculateFee(Order order);
}
@Component
public class DeliveryFeePolicyResolver {
    public int calculate(Order order) {
        return policies.stream()
            .filter(p -> p.supports(order.getShippingMethod()))
            .findFirst()
            .orElseThrow(...)
            .calculateFee(order);
    }
}
```

### 전략 적용의 확장성

- 새로운 배송 정책 (`새벽배송`, `이벤트 무료배송`)을 추가해도 기존 코드는 변경 없음
- 테스트/운영 조건 분리 가능
- 같은 패턴으로 `DiscountPolicy`, `CouponValidationRule`, `PointPolicy` 등 적용 가능

## 4. 마무리

#### Helper는 도메인을 보조하지만, 도메인을 대체하면 안 된다

- 도메인은 "진실과 책임", 헬퍼는 "보조자"
- 헬퍼가 커지면 전략으로 리팩토링할 타이밍
- 전략 패턴 + DI 조합은 실무에서 유연성과 확장성을 동시에 제공

#### 결론

- 도메인 객체는 상태 변경과 정책 판단을 책임진다
- 헬퍼 클래스는 복잡한 조합 조건, 포맷팅, 기술 책임을 보조한다
- 헬퍼가 복잡해지면 전략 패턴으로 리팩토링하자
- Spring + DI + 전략 패턴은 실무에서 가장 강력한 설계 조합이다

---

## 참고 자료

1. [Helper class - Wikipedia](https://en.wikipedia.org/wiki/Helper_class)
2. [Java Helper vs. Utility Classes](https://www.baeldung.com/java-helper-vs-utility-classes)
3. [Helper class is evil](https://blog.itkonekt.com/2017/11/22/helper-class-is-evil-2/)
4. [Helper classes considered bad OO](https://ernestmicklei.com/2006/03/helper-classes-considered-bad-oo/)
5. [How to Avoid Static Helper Classes](https://www.bettercodebytes.com/how-to-avoid-static-helper-classes/)
6. [OOP Alternative to Utility Classes](https://www.yegor256.com/2014/05/05/oop-alternative-to-utility-classes.html)
7. [Utility and helper classes - a code smell?](https://lindbakk.com/blog/utility-and-helper-classes-a-code-smell)
8. [Class Helpers: Good or Bad ?](https://blogs.conceptfirst.com/2006/05/08/class-helpers-good-or-bad.html)
9. [Helper Classes Are Evil](https://saintgimp.org/2009/05/05/helper-classes-are-evil/)
10. [Helper Classes in Android](https://medium.com/@kalpeshdoru/in-android-development-helper-classes-also-known-as-utility-classes-are-a-popular-approach-for-775b2b968a62)
11. [Best Practices for Creating Utility Classes in Software Development](https://medium.com/@salmankhan_27014/best-practices-for-creating-utility-classes-in-software-development-6f9ad1e8d27a)
12. [Helper class usage best practice](https://github.com/microsoft/playwright/issues/18285)
