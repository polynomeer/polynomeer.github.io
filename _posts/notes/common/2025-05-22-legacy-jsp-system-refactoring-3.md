---
title: "JSP 기반 시스템의 구조적 문제를 해결한 아키텍처 전환기: MyBatis와 JPA 공존 환경의 데이터 정합성 전략"
date: 2025-05-22
categories: [Notes, Common]
tags: [MyBatis, JPA, Legacy, Data Integrity, Refactoring]
---

# 레거시(MyBatis)와 JPA 시스템의 공존 시 데이터 정합성 전략

새로운 시스템을 도입하면서 기존 레거시 시스템을 완전히 폐기하기는 현실적으로 어렵습니다. 이로 인해 두 시스템이 **동시에 운영**되거나 **점진적 전환**이 필요할 때, 데이터 정합성 문제는 필연적으로 발생합니다.

이번 글에서는 **MyBatis 기반 레거시 시스템**과 **JPA 기반 신규 시스템**이 병행 운영되는 과정에서 마주친 **데이터 정합성 문제 상황과 해결 전략**을 중심으로 공유합니다.

---

## 시스템 구성

| 구분     | 레거시 시스템              | 신규 시스템                      |
| ------ | -------------------- | --------------------------- |
| 기술 스택  | Spring MVC + MyBatis | Spring Boot + JPA/Hibernate |
| DB 스키마 | 동일한 테이블을 공유          | 동일                          |
| 주요 차이  | SQL 직접 작성            | ORM 매핑 기반                   |
| 운영 방식  | 점진적 전환 (Dual Run)    | 신규 기능부터 점진 이관               |

---

## 문제 상황들

### 1-1. Enum 매핑 불일치 문제

* **문제**: MyBatis에서는 `String`으로 저장된 열거형 값이 있었으나, JPA에서는 `@Enumerated(EnumType.STRING)`을 사용함.
* **결과**: enum에 정의되지 않은 값이 DB에 존재할 경우, JPA에서 `IllegalArgumentException` 발생 → 조회 실패.

**예시**

```sql
-- DB에는 "DEPRECATED" 값이 존재
-- 하지만 JPA enum에는 ACTIVE, INACTIVE만 정의되어 있음
```

---

### 1-2. 날짜/타임스탬프 정렬 및 기본값 차이

* MyBatis에서는 SQL에서 `SYSDATE`, `NOW()` 등을 직접 사용하던 필드들이 JPA에서는 `@CreationTimestamp` 등으로 처리됨.
* 이로 인해 **초 단위 차이, 정렬 순서 역전**, 또는 **NULL 처리 방식의 불일치**가 발생.

---

### 1-3. Null / Default 값 처리 불일치

* MyBatis는 `null`이 DB에 저장되더라도 application 레벨에서 이를 방어하는 로직이 있는 반면,
* JPA는 `@NotNull`, `nullable = false` 등 제약 조건이 강하게 설정됨.
* 이 경우, **DB에는 null이 존재하지만 JPA는 이를 허용하지 않아** Entity 로딩 시 오류 발생 가능.

---

### 1-4. 중복된 비즈니스 로직의 불일치

* 레거시 시스템에서 이미 보정된 데이터가 신규 시스템에서는 다른 기준으로 처리되는 경우.
* 예: 특정 상태값 계산, 포맷팅, 수동 조작 이력 반영 로직 등이 **MyBatis에는 SQL로 박혀 있고**, JPA에는 누락됨.

---

## 🛡 2. 해결 전략 및 실무 적용 예시

### 전략 1. Enum 매핑 안전화

#### 방법

* `@Enumerated` 대신 `@Convert(converter = SafeEnumConverter.class)` 사용
* enum에 `UNKNOWN`, `DEPRECATED` 등 안전한 기본값 추가

```java
public enum Status {
    ACTIVE, INACTIVE, DEPRECATED, UNKNOWN;

    public static Status from(String value) {
        try {
            return Status.valueOf(value.toUpperCase());
        } catch (Exception e) {
            return UNKNOWN;
        }
    }
}
```

---

### 전략 2. 데이터 보정 스크립트 + 릴리즈 체크리스트화

#### 상황

* 신규 시스템 배포 직전, 데이터 정합성 문제가 있는 상태를 자동으로 탐지하거나 사전에 보정

#### 접근

* **SQL 스크립트** 작성: enum 범위, null 값, 중복 키, 날짜 역전 현상 등 사전 진단
* **배포 전후 SQL** 예시:

```sql
-- 상태값 중 enum에 없는 값 목록 추출
SELECT DISTINCT status FROM user WHERE status NOT IN ('ACTIVE', 'INACTIVE');

-- 잘못된 날짜 정렬 수정
UPDATE content SET created_at = updated_at WHERE created_at IS NULL;
```

* 운영 중에도 배치 프로세스 또는 알림을 통해 자동 감지 및 롤백 시나리오 준비

---

### 전략 3. 공통 DTO 및 Adapter Layer 도입

* 데이터 변환을 위한 어댑터 혹은 DTO를 두 시스템에서 동일하게 사용하도록 정의
* 특히 **enum ↔ String**, **LocalDate ↔ Timestamp**, **NULL ↔ Default값** 매핑 규칙을 일관되게 유지

```java
// DTO 변환 예시
public UserDto toDto(User entity) {
    return new UserDto(
        entity.getId(),
        Optional.ofNullable(entity.getStatus()).orElse(Status.UNKNOWN).name()
    );
}
```

---

### 전략 4. 읽기/쓰기 분리 운영

* 초기에는 **읽기는 JPA**, **쓰기는 MyBatis**처럼 역할을 분리
* 점진적으로 JPA 쓰기 로직을 도입하면서 보정 및 검증을 진행

> 💬 이중 쓰기 방지 및 동시성 이슈에 대한 관리도 병행 필요 (ex: 분산락, last\_updated 기준 우선순위)

---

### 전략 5. 운영 중 정합성 모니터링 지표화

* 잘못된 enum 값 수, null 비율, 마이그레이션 비율 등을 **지표화**
* ex: Grafana + Custom Query, Prometheus Exporter, Kibana에서 쿼리 저장 등

```sql
SELECT status, COUNT(*) FROM user GROUP BY status;
```

---

## 결론 및 권장 프로세스

| 단계  | 작업 내용                                  |
| --- | -------------------------------------- |
| 1단계 | 기존 데이터 정합성 점검 (SQL 기반 진단 스크립트)         |
| 2단계 | 신규 enum/DTO 등 매핑 구조 정의 및 어댑터 작성        |
| 3단계 | 신규 시스템 배포 전, 데이터 보정 및 검증 작업 수행         |
| 4단계 | 신규 시스템과 레거시 시스템의 공존 전략 수립 (읽기/쓰기 분리 등) |
| 5단계 | 운영 중 모니터링 및 이상 징후 자동 알림 설정             |
| 6단계 | 완전한 전환 전까지는 매 릴리즈마다 보정 체크리스트 수행        |

---

## 마무리하며

레거시 시스템과 신규 시스템이 병행 운영될 때 \*\*가장 위험한 부분은 “묵인된 정합성 오류”\*\*입니다.
\*\*“JPA는 믿지 말고, 확인하라.”\*\*는 말이 있듯이, 보이지 않는 데이터 오류는 서비스 장애의 씨앗이 됩니다.

JPA의 엄격함을 이점으로 바꾸기 위해선, 사전에 정합성을 진단하고, 우회할 구조를 설계하는 것이 필수입니다.
**정합성 점검 → 전략적 우회 처리 → 점진적 전환**의 흐름을 항상 염두에 두어야 합니다.

---

또는 `Enum 대응 공통 컴포넌트`, `SQL 진단 템플릿`, `배포 전 체크리스트` 문서로 분리해드릴 수도 있습니다.
