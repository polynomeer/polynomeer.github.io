---
title: "JSP 기반 시스템의 구조적 문제를 해결한 아키텍처 전환기: API 명세 없는 레거시 시스템의 신규 시스템 이관 전략"
date: 2025-05-22
categories: [Notes, Common]
tags: [Legacy, Refactoring]
---

API 명세가 없는 레거시 시스템을 이관할 때는 무엇을 옮겨야 하는지부터 알 수 없습니다. 그래서 기능 정의를 소스코드와 실제 트래픽에서 거꾸로 읽어 내고, 그 정의가 맞는지는 미러링 테스트와 점진적 전환으로 확인합니다. 아래는 이 과정을 계획, 분석, 구현, 전환, 운영 단계로 나눈 것입니다. 비슷한 상황은 [외주 시스템 리빌딩 여정](/posts/rebuilding-outsourced-system-1/)에서도 다룹니다.

## API 명세 없는 레거시 시스템의 신규 시스템 이관 전략

## 1. 사전 준비 단계

### 목표 설정

* 기존 시스템을 유지하면서 신규 시스템으로 점진적 전환
* 데이터/비즈니스 로직 정합성 보장
* 다운타임 없는 이관 지향

### 주요 리스크

* API 명세 부재 → 기능 정의 모호
* 비즈니스 로직이 SQL 또는 JSP에 직접 하드코딩
* 예상치 못한 입력 값/흐름으로 인한 예외 발생

---

## 2. 레거시 분석 단계

### 2.1 트래픽 리버스 엔지니어링

#### 방법

* 브라우저 개발자 도구 또는 Proxy 툴(Fiddler, mitmproxy) 활용
* HTTP 요청/응답을 캡처하여:

  * URL, Method, 파라미터
  * 헤더 구조
  * 응답 데이터 구조(JSON, HTML, XML 등) 확인

```plaintext
GET /api/user?id=123  
→ 응답: { \"id\": 123, \"name\": \"John\", \"status\": \"ACTIVE\" }
```

#### 자동화 도구

* OpenReplay / Requestly 등 트래픽 리플레이 툴
* API Gateway 로그 or WAS Access 로그 활용

---

### 2.2 소스코드 기반 API 추적

#### MyBatis 기반일 경우

* `mapper.xml` 또는 SQL 구문에서 쿼리 패턴 확인
* `@RequestMapping`, `@ResponseBody` 등 컨트롤러 분석

#### 자동화 도구 활용

* IDE의 Call Hierarchy / Find Usage
* [ArchUnit](/posts/archunit-guardrails-on-legacy/), JDepend, JArchitect 등으로 패키지 의존 분석

---

## 3. 신규 시스템 설계 및 구성

### DTO / Entity 설계

* 기존 응답/요청 데이터 포맷을 기준으로 DTO 정의
* DB 구조를 재사용하면서도 도메인 중심으로 [JPA](/posts/jpa-architecture/) Entity 설계

### Enum / 코드값 전략 수립

* 정합성 안 맞는 enum 대응: `UNKNOWN`, `SafeEnumConverter` 활용([MyBatis와 JPA 공존 환경의 데이터 정합성 전략](/posts/legacy-jsp-system-refactoring-3/) 참고)
* `code → label` 방식이면 코드테이블 설계 고려

---

## 4. 병렬 이관 및 검증

### 4.1 Shadow/Mirroring 테스트

* 실제 유저 요청을 레거시 시스템에 먼저 전달하고, 같은 요청을 신규 시스템에도 미러링
* 두 응답을 비교해 차이점 분석 ([Shadow Release](/posts/shadow-release-query-migration/) 사례 참고)

```text
Client → Legacy API → Response  
              ↘  
               New API → Compare Response
```

도구 예시:

* NGINX dual proxy 설정
* Java/Spring Interceptor 내 미러링 로직 삽입

다만 NGINX만으로는 비교까지 되지 않습니다. `ngx_http_mirror_module` 문서는 "Responses to mirror subrequests are ignored."라고 적습니다(미러 요청의 응답은 버려진다, [문서](https://nginx.org/en/docs/http/ngx_http_mirror_module.html)). 그래서 신규 시스템의 응답을 기록해 레거시 응답과 맞대어 보는 비교 로직을 따로 두어야 합니다.

---

### 4.2 Canary/Blue-Green 전환 전략

* 특정 트래픽(10%)만 신규 시스템으로 분기
* 점진적으로 전체 전환

두 방식은 옮기는 단위가 다릅니다. Canary는 일부 사용자에게 먼저 내보낸 뒤 전체로 넓히고([Fowler](https://martinfowler.com/bliki/CanaryRelease.html)), Blue-Green은 라우터를 바꿔 요청 전체를 한 번에 넘깁니다([Fowler](https://martinfowler.com/bliki/BlueGreenDeployment.html)). 위의 10% 분기는 Canary에 해당합니다.

```text
- 사용자 IP 해시 기반으로 라우팅
- 또는 회원 등급/테스트 그룹으로 제한
```

---

## 5. 점진적 전환 및 운영

### 운영 전략

* 트래픽 로그로 신규 API의 실제 사용 범위 수집
* 신규 시스템 응답 시간 / 실패율 모니터링 → 문제 생기면 자동 롤백

### 문서화 자동화

* 수집한 API 패턴 기반으로 자동 Swagger 문서화

  * 예: Spring REST Docs, Swagger/OpenAPI Generator

단, Spring REST Docs는 트래픽이 아니라 테스트가 만든 스니펫으로 문서를 만듭니다([공식 문서](https://docs.spring.io/spring-restdocs/docs/current/reference/htmlsingle/)). 수집한 패턴을 먼저 테스트 케이스로 옮겨야 이 도구를 쓸 수 있습니다.

---

## 전환 전략 요약

| 단계        | 설명                   | 도구/기술                       |
| --------- | -------------------- | --------------------------- |
| 사전 준비     | 목표 설정, 리스크 분석        | Notion, Jira                |
| 리버스 엔지니어링 | 트래픽 캡처, 코드 추적        | devtools, mitmproxy, grep   |
| 신규 시스템 설계 | DTO, Entity, Enum 전략 | Spring Boot + JPA           |
| 병렬 운영     | Shadow, Canary 테스트   | NGINX, Spring Interceptor   |
| 전환        | 트래픽 전환, 모니터링         | Prometheus, Grafana, Kibana |

---

## 자주 사용하는 패턴들

* `@RequestBody` → DTO 검증 (@Valid, enum 매핑)
* MyBatis SQL → JPQL로 이관 시 조건절 해석 주의
* XML 응답 → Jackson XML Module 활용
* 동작 로직이 쿼리 내부에 있는 경우 → `@QueryProjection`([Querydsl](/posts/querydsl/)), `nativeQuery`로 이관

---

## 마무리

명세가 없는 레거시 시스템에서는 실제 트래픽이 가장 믿을 만한 명세입니다. 분석, 구조 설계, 미러링과 Canary 검증, 전환 순으로 진행하면 이관 중 생기는 오류를 사용자에게 닿기 전에 잡을 기회가 늘어납니다.

## 참고

- [NGINX — ngx_http_mirror_module](https://nginx.org/en/docs/http/ngx_http_mirror_module.html)
- [Martin Fowler — CanaryRelease](https://martinfowler.com/bliki/CanaryRelease.html)
- [Martin Fowler — BlueGreenDeployment](https://martinfowler.com/bliki/BlueGreenDeployment.html)
- [Spring REST Docs Reference](https://docs.spring.io/spring-restdocs/docs/current/reference/htmlsingle/)
