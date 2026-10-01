---
title: "JSP 기반 시스템의 구조적 문제를 해결한 아키텍처 전환기: JavaScript에 과도하게 집중된 로직 분리하기"
date: 2025-05-22
categories: [Notes, Common]
tags: [Legacy, Refactoring]
---

## JavaScript에 얽힌 로직을 백엔드로 분리한 개편기

레거시 JSP 시스템에서 JPA 기반의 백엔드와 프론트엔드 분리 구조로 개편하는 과정에서, 우리는 흔히 다음과 같은 문제를 마주합니다.

> "프론트에 너무 많은 로직이 얽혀 있다."

과거 JavaScript는 UI를 그리는 데 그치지 않고 입력 검증부터 비즈니스 로직 판단까지 떠안고 있는 경우가 많습니다. 이 글은 그 로직을 백엔드(Spring Boot + JPA)로 하나씩 떼어 내고 프론트와 백엔드의 역할을 나눈 과정을 다룹니다.

------

### 레거시 구조의 문제점

JSP 기반의 레거시 시스템은 다음과 같은 특징을 가집니다:

- JavaScript가 과도한 책임을 짐: 입력값 검증, 상태 판단, 버튼 노출 여부까지 담당
- 중복된 검증: 프론트에서 검증했지만 서버에서도 또 검증 (또는 안 하는 경우도 있음)
- 보안 위험: 클라이언트에서 판단한 로직은 조작이 쉬움
- 유지보수 어려움: 정책 변경 시 프론트 코드까지 수정해야 함

보안 위험은 OWASP Input Validation Cheat Sheet가 같은 이유로 경고합니다. 클라이언트 측 JavaScript 검증은 공격자가 JavaScript를 끄거나 웹 프록시를 쓰면 우회되므로, 입력 검증은 데이터를 처리하기 전에 서버에서 해야 한다는 것입니다([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)). 같은 문서는 UX를 위한 클라이언트 검증과 보안을 위한 서버 검증을 함께 두라고 권합니다.

예를 들어, 아래와 같은 JavaScript 코드가 흔했습니다:

```javascript
if (userRole === 'ADMIN' && orderStatus === 'REQUESTED' && orderAmount > 10000) {
  showApproveButton();
}
```

------

### 목표: 역할 분리와 서버 중심 검증

그래서 프론트는 표현(UI)에 집중하고, 백엔드는 판단(로직)을 담당하는 구조로 바꾸고자 했습니다.

| 책임                                       | 담당     |
| ------------------------------------------ | -------- |
| 입력값 포맷 안내, 버튼 비활성화 등 UX      | ✅ 프론트 |
| 입력 유효성 검증, 비즈니스 로직, 상태 판단 | ✅ 백엔드 |

------

### 리팩토링 전략

#### 1. JavaScript 코드 분석 및 분류

| 기능                                | 백엔드 이관 여부                      |
| ----------------------------------- | ------------------------------------- |
| 이메일 형식, 주민번호 유효성        | ✅ Bean Validation                     |
| 날짜 범위 유효성 (start ≤ end)      | ✅ DTO 검증 로직                       |
| 관리자 + 특정 상태 + 금액 조건 판단 | ✅ 비즈니스 서비스 메서드              |
| 단순 입력 포맷 유도                 | ❌ 프론트 유지 (e.g. 하이픈 자동 입력) |
| 실시간 오류 메시지 표시             | ❌ 프론트 유지                         |

------

#### 2. Spring Boot로 로직 이전

##### 요구 사항

- 관리자이면서
- 주문 상태가 REQUESTED이고
- 주문 금액이 10,000원 초과

→ 승인 버튼 표시 가능 여부

##### 구현 흐름

① API 호출 (프론트)

```javascript
const res = await fetch(`/api/orders/123/can-approve`);
const { canApprove } = await res.json();
if (canApprove) showApproveButton();
```

② Controller

```java
@GetMapping("/{id}/can-approve")
public ResponseEntity<Map<String, Boolean>> canApprove(@PathVariable Long id,
    @AuthenticationPrincipal CustomUserDetails user) {
    boolean result = orderService.canApproveOrder(id, user);
    return ResponseEntity.ok(Map.of("canApprove", result));
}
```

③ Service

```java
public boolean canApproveOrder(Long orderId, CustomUserDetails user) {
    Order order = orderRepository.findById(orderId)
        .orElseThrow(() -> new NotFoundException("Order not found"));

    return user.hasRole("ADMIN")
        && order.getStatus() == OrderStatus.REQUESTED
        && order.getAmount().compareTo(BigDecimal.valueOf(10000)) > 0;
}
```

------

#### 3. 입력 검증은 Bean Validation으로 통일

```java
public class OrderRequest {

    @NotNull
    @DecimalMin("0.01")
    private BigDecimal amount;

    @NotBlank
    private String productCode;

    @AssertTrue(message = "시작일은 종료일 이전이어야 합니다")
    public boolean isValidPeriod() {
        return startDate != null && endDate != null && !startDate.isAfter(endDate);
    }

    private LocalDate startDate;
    private LocalDate endDate;
}
```

`@AssertTrue`는 "The annotated element must be true."로 정의된 제약입니다(대상 요소가 true여야 한다, [Jakarta Bean Validation Javadoc](https://jakarta.ee/specifications/bean-validation/3.0/apidocs/jakarta/validation/constraints/asserttrue)). 그래서 `isValidPeriod()`가 false를 돌려주면 날짜 범위 검증이 실패합니다. 프론트의 즉각적 UX는 유지하되, 실제 검증과 정책은 백엔드가 책임집니다.

------

### 정리: 프론트와 백엔드의 책임을 다시 세우다

| 항목           | 개편 전 (JS 중심) | 개편 후 (Spring 중심)              |
| -------------- | ----------------- | ---------------------------------- |
| 상태 판단      | JavaScript 조건문 | Service / Enum 기반 로직           |
| 검증           | 프론트만 수행     | Bean Validation + ControllerAdvice |
| 정책 변경 대응 | JS 코드 수정 필요 | 백엔드 코드만 수정                 |
| 버튼 제어      | 조건문 직접 표시  | API 결과 기반 표시                 |

------

### 마무리하며

프론트에 로직이 얽혀 있던 원인은 개별 코드보다 프론트와 백엔드의 책임이 나뉘지 않은 설계에 있었습니다.

그래서 비즈니스 로직과 검증 책임을 서버로 되돌리는 작업은 코드를 옮기는 일이면서, 어느 쪽이 무엇을 판단하는지 경계를 다시 정하는 일이었습니다.

> 승인 버튼 노출 같은 작은 UI 상태 판단도 도메인 규칙이고, 도메인 규칙은 서버가 지켜야 합니다.

## 참고

- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [Jakarta Bean Validation 3.0 — AssertTrue](https://jakarta.ee/specifications/bean-validation/3.0/apidocs/jakarta/validation/constraints/asserttrue)
