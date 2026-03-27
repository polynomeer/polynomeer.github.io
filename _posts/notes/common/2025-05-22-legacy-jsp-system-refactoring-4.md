---
title: "JSP 기반 시스템의 구조적 문제를 해결한 아키텍처 전환기: API 명세 없는 레거시 시스템의 신규 시스템 이관 전략"
date: 2025-05-22
categories: [Archive, Common]
tags: [Legacy, Refactoring]
---

API 명세가 없는 레거시 시스템을 새로운 시스템으로 이관하는 것은 많은 기업에서 실제로 겪는 어려운 과제입니다. 이 경우 **소스코드 분석**, **트래픽 리버스 엔지니어링**, **실시간 미러링 테스트**, 그리고 **점진적 이관 전략**을 병행하여야 안정적으로 마이그레이션할 수 있습니다. 아래는 이를 **계획, 분석, 구현, 전환, 운영** 단계로 나눠 상세히 설명한 전략입니다.

## 🧭 API 명세 없는 레거시 시스템의 신규 시스템 이관 전략

## 1. 🧱 사전 준비 단계

### ✅ 목표 설정

* 기존 시스템을 유지하면서 신규 시스템으로 **점진적 전환**
* **데이터/비즈니스 로직 정합성 보장**
* 다운타임 없이 **제로 다운타임 이관** 지향

### ✅ 주요 리스크

* API 명세 부재 → 기능 정의 모호
* 비즈니스 로직이 SQL 또는 JSP에 직접 하드코딩
* 예상치 못한 입력 값/흐름으로 인한 예외 발생

---

## 2. 🔍 레거시 분석 단계

### ✅ 2.1 트래픽 리버스 엔지니어링

#### 방법

* **브라우저 개발자 도구** 또는 **Proxy툴(Fiddler, mitmproxy)** 활용
* HTTP 요청/응답을 캡처하여:

  * URL, Method, 파라미터
  * 헤더 구조
  * 응답 데이터 구조(JSON, HTML, XML 등) 확인

```plaintext
GET /api/user?id=123  
→ 응답: { \"id\": 123, \"name\": \"John\", \"status\": \"ACTIVE\" }
```

#### 자동화 도구

* **OpenReplay / Requestly** 등 트래픽 리플레이 툴
* API Gateway 로그 or WAS Access 로그 활용

---

### ✅ 2.2 소스코드 기반 API 추적

#### MyBatis 기반일 경우

* `mapper.xml` 또는 SQL 구문에서 쿼리 패턴 확인
* `@RequestMapping`, `@ResponseBody` 등 컨트롤러 분석

#### 자동화 도구 활용

* IDE의 **Call Hierarchy / Find Usage**
* **ArchUnit**, **JDepend**, **JArchitect** 등으로 패키지 의존 분석

---

## 3. 🧰 신규 시스템 설계 및 구성

### ✅ DTO / Entity 설계

* 기존 응답/요청 데이터 포맷을 기준으로 **DTO 정의**
* DB 구조를 재사용하면서도 도메인 중심으로 **JPA Entity 설계**

### ✅ Enum / 코드값 전략 수립

* 정합성 안 맞는 enum 대응: `UNKNOWN`, `SafeEnumConverter` 활용
* `code → label` 방식이면 코드테이블 설계 고려

---

## 4. 🔁 병렬 이관 및 검증

### ✅ 4.1 Shadow/Mirroring 테스트

* 실제 유저 요청을 **레거시 시스템에 먼저 전달**, 동시에 **신규 시스템에도 미러링**
* 결과 비교 후 차이점 분석

```text
Client → Legacy API → Response  
              ↘  
               New API → Compare Response
```

도구 예시:

* NGINX dual proxy 설정
* Java/Spring Interceptor 내 미러링 로직 삽입

---

### ✅ 4.2 Canary/Blue-Green 전환 전략

* 특정 트래픽(10%)만 신규 시스템으로 분기
* 점진적으로 전체 전환

```text
- 사용자 IP 해시 기반으로 라우팅
- 또는 회원 등급/테스트 그룹으로 제한
```

---

## 5. 🚦 점진적 전환 및 운영

### ✅ 운영 전략

* 트래픽 로그로 신규 API의 실제 사용 범위 수집
* 신규 시스템 응답 시간 / 실패율 모니터링 → 문제 생기면 자동 롤백

### ✅ 문서화 자동화

* 수집한 API 패턴 기반으로 **자동 Swagger 문서화**

  * 예: Spring REST Docs, Swagger/OpenAPI Generator

---

## ✅ 전환 전략 요약

| 단계        | 설명                   | 도구/기술                       |
| --------- | -------------------- | --------------------------- |
| 사전 준비     | 목표 설정, 리스크 분석        | Notion, Jira                |
| 리버스 엔지니어링 | 트래픽 캡처, 코드 추적        | devtools, mitmproxy, grep   |
| 신규 시스템 설계 | DTO, Entity, Enum 전략 | Spring Boot + JPA           |
| 병렬 운영     | Shadow, Canary 테스트   | NGINX, Spring Interceptor   |
| 전환        | 트래픽 전환, 모니터링         | Prometheus, Grafana, Kibana |

---

## 🧩 팁: 자주 사용하는 패턴들

* `@RequestBody` → DTO 검증 (@Valid, enum 매핑)
* MyBatis SQL → JPQL로 이관 시 조건절 해석 주의
* XML 응답 → Jackson XML Module 활용
* 동작 로직이 쿼리 내부에 있는 경우 → `@QueryProjection`, `nativeQuery`로 이관

---

## 📌 마무리

명세 없는 레거시 시스템은 “**살아있는 문서**인 트래픽”을 분석하는 것이 핵심입니다.
정확한 분석 → 안전한 구조 설계 → 점진적 검증 → 안정적 전환 순으로 진행하면, 예기치 못한 오류 없이 새로운 시스템으로 성공적인 이관이 가능합니다.
