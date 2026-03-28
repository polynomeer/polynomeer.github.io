---
title: "백엔드 시스템 로깅 베스트 프랙티스"
date: 2025-05-22
categories: [Notes, Common]
tags: [Logging, Observability, Monitoring, Spring Boot]
---

로깅(logging)은 시스템의 상태를 추적하고 문제를 진단하며, 보안 및 감사 대응에 필수적인 요소입니다. 아래는 **백엔드 시스템, 특히 Spring Boot 기반 서비스**를 중심으로 정리한 로깅 베스트 프랙티스입니다.

---

## 1. 로깅 설계 원칙

| 항목         | 설명                                     |
| ---------- | -------------------------------------- |
| 📌 목적 정의   | 디버깅, 모니터링, 보안 감사, 성능 분석 등 목적별 로그 항목 구분 |
| 🧱 구조화된 로그 | JSON 기반의 키-값 로그 형식 → 로그 파싱 및 검색 용이     |
| 🧩 일관성 유지  | 서비스 전반에 걸쳐 로깅 패턴, 레벨, 포맷을 통일           |
| 🧼 민감정보 배제 | 주민번호, 비밀번호, 토큰 등 개인정보/인증정보는 절대 출력하지 않음 |

---

## 2. 로깅 레벨 사용 가이드

| 레벨      | 사용 예시                               |
| ------- | ----------------------------------- |
| `ERROR` | 시스템 오류, 트랜잭션 실패, 복구 불가 상황           |
| `WARN`  | 잠재적 문제, 재시도 가능한 오류 (ex. 외부 API 실패)  |
| `INFO`  | 주요 흐름 및 상태 정보 (ex. 서비스 시작, 처리 완료)   |
| `DEBUG` | 상세 흐름, 디버깅용 데이터 (개발/스테이지 환경에서만 활성화) |
| `TRACE` | 디버깅보다 더 정밀한 트레이스용 로그 (대개 비활성화)      |

🔒 운영 환경에서는 `INFO`, `WARN`, `ERROR`까지만 사용하고 `DEBUG`, `TRACE`는 비활성화할 것.

---

## 3. 기술 적용 예시 (Spring Boot + Logback)

### MDC (Mapped Diagnostic Context) 활용

```java
MDC.put("userId", user.getId());
MDC.put("requestId", UUID.randomUUID().toString());
// 로그 출력 후 반드시 해제
MDC.clear();
```

→ 사용자 추적 및 요청 단위 구분 용이

### JSON 로그 포맷 예시 (logback-spring.xml)

```xml
<encoder class="net.logstash.logback.encoder.LoggingEventCompositeJsonEncoder">
  <providers>
    <timestamp>
      <fieldName>timestamp</fieldName>
    </timestamp>
    <loggerName />
    <message />
    <mdc />
    <stackTrace />
  </providers>
</encoder>
```

---

## 4. 로그 수집 및 조회 체계

| 항목  | 추천 도구             | 목적            |
| --- | ----------------- | ------------- |
| 수집  | Filebeat, Fluentd | 로그 수집기        |
| 저장  | Elasticsearch     | 검색 가능한 로그 저장소 |
| 시각화 | Kibana, Grafana   | 대시보드 및 필터링    |
| 분석  | Datadog, Sentry   | 오류 알림, 성능 분석  |

---

## 🧪 5. **운영 환경을 위한 팁**

* ✅ 로그 샘플링 적용 (대용량 시스템에서 유용)
* ✅ 파일 회전(log rotation) 및 보관 주기 설정
* ✅ 모듈/도메인별 Logger 사용 (`LoggerFactory.getLogger(Class)` 활용)
* ✅ 비정상 종료나 예외 발생 시 **stack trace 포함 로그 필수**
* ✅ 비즈니스 이벤트/감사 로깅은 **DB 또는 별도 감사 시스템과 연계 고려**

---

## 🚫 6. **피해야 할 안티 패턴**

| ❌ 항목                          | 이유                     |
| ----------------------------- | ---------------------- |
| `System.out.println` 사용       | 성능 저하, 로깅 제어 불가        |
| 로그에 비밀번호 출력                   | 보안 위반, ISMS/PIMS 감사 실패 |
| 무조건 `INFO`만 사용                | 문제 진단 어려움, 로그 의미 퇴색    |
| 예외 잡고 아무 로그 없이 무시             | 문제 은폐 및 추적 불가          |
| 모든 요청 로그 남기기 (특히 GET 쿼리 파라미터) | 과도한 로그, 개인정보 유출 가능성    |

---

## 🏁 정리

> 좋은 로그는 **사고를 빠르게 진단할 수 있게 해주는 힌트**이자, **운영과 보안을 위한 유일한 단서**입니다.

**요약 체크리스트 ✅**

* [ ] JSON 구조화된 로그 포맷 사용
* [ ] 로깅 레벨 체계 정의 및 일관성 유지
* [ ] MDC로 요청 단위 식별자 포함
* [ ] 민감정보 로그 출력 금지
* [ ] 로그 수집/조회 체계 구성 (ELK, Datadog 등)
* [ ] 배포 전 로깅 레벨 환경별 분리 설정

---

필요하다면 **ISMS 감사 대응을 위한 로깅 체계 설계 사례**도 공유드릴 수 있어요.


아주 좋은 요청입니다. 로깅은 **어떤 시점에, 어떤 정보를, 어떤 목적에 따라 기록하는가**에 따라 그 가치가 완전히 달라집니다. 아래는 **Java (특히 Spring Boot)** 기반 애플리케이션에서의 \*\*일반적인 로깅 대상 및 목적별 로깅 포인트(시점)\*\*을 예제 코드와 함께 설명한 정리입니다.

---

## 로깅의 일반적 대상 분류

| 대상            | 예시                    | 주 목적             |
| ------------- | --------------------- | ---------------- |
| **요청/응답**     | API 호출, 파라미터, 결과      | 트레이싱, 성능 측정      |
| **비즈니스 이벤트**  | 주문 생성, 결제 성공, 엑셀 다운로드 | 사용자 행동 분석, 감사 로그 |
| **예외/오류**     | Exception, HTTP 오류    | 문제 원인 파악, 경고 알림  |
| **외부 시스템 연동** | API 요청/응답, 메시지 큐 송수신  | 장애 대응, 연동 실패 대응  |
| **보안 관련 이벤트** | 로그인/로그아웃, 권한 변경       | 감사 추적, 경보 설정     |
| **성능 모니터링**   | 처리 시간, 대기 시간, 자원 사용량  | 병목 구간 진단         |

---

## 🔍 2. 주요 로깅 시점별 예시 (Java 코드 기반)

### 🌐 A. **Controller 진입 시점 (요청 정보)**

```java
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final Logger log = LoggerFactory.getLogger(getClass());

    @PostMapping
    public ResponseEntity<?> createOrder(@RequestBody OrderRequest request, HttpServletRequest http) {
        log.info("[ORDER] Create request from IP={}, userAgent={}, body={}",
                 http.getRemoteAddr(), http.getHeader("User-Agent"), request);

        // Service 호출 ...
        return ResponseEntity.ok("Created");
    }
}
```

* **목적**: 요청 파라미터, 사용자 추적, 이상 요청 모니터링
* **Tip**: request는 `toString()` 구현된 DTO만 출력 (민감정보 주의)

---

### 🧠 B. **Service 내 핵심 로직 수행 시점**

```java
@Service
public class OrderService {
    private final Logger log = LoggerFactory.getLogger(getClass());

    public void processOrder(Order order) {
        log.info("Processing order: {}", order.getId());

        // 결제 로직
        // 재고 확인

        log.info("Order processed: {}", order.getId());
    }
}
```

* **목적**: **비즈니스 흐름 추적**, 상태 변화 기록
* 주문 접수 → 처리 완료까지 주요 단계를 로그로 남겨 **플로우 리플레이** 가능하게

---

### ⚠️ C. **예외 발생 시점 (try-catch)**

```java
try {
    paymentService.charge(cardInfo);
} catch (PaymentException ex) {
    log.error("[PAYMENT] 결제 실패. 사용자: {}, 사유: {}", userId, ex.getMessage(), ex);
    throw new BusinessException("결제 실패", ex);
}
```

* **목적**: 원인 기록 및 스택트레이스 포함
* **Tip**: `log.error(..., ex)` 형식으로 스택 포함

---

### 🌍 D. **외부 시스템 연동 전후**

```java
public String fetchDataFromExternalApi(String param) {
    log.info("Calling external API with param: {}", param);

    try {
        String response = restTemplate.getForObject("http://api.example.com/data?param=" + param, String.class);
        log.info("External API response: {}", response);
        return response;
    } catch (RestClientException e) {
        log.error("External API 호출 실패: {}", e.getMessage(), e);
        throw e;
    }
}
```

* **목적**: 장애 발생 시 원인 추적, 외부 시스템과의 통신 이력 확보

---

### 🔐 E. **보안 이벤트 (로그인/권한 변경 등)**

```java
public void login(String username) {
    if (isValidUser(username)) {
        log.info("[AUTH] 로그인 성공 - 사용자: {}", username);
    } else {
        log.warn("[AUTH] 로그인 실패 - 사용자: {}", username);
    }
}
```

* **목적**: **ISMS 인증** 대응, 이상 로그인 탐지
* 로그인, 로그아웃, 권한 변경은 반드시 로깅해야 하는 이벤트

---

### 🧪 F. **성능 측정 (Timer 기반)**

```java
long start = System.currentTimeMillis();

// 처리 로직 수행
orderService.process(order);

long end = System.currentTimeMillis();
log.info("[PERF] 주문 처리 소요 시간 = {}ms", (end - start));
```

* **목적**: 병목 지점 파악, SLA 초과 여부 확인

---

### 🧬 G. **배치 Job, Scheduler 실행 로그**

```java
@Slf4j
@Component
public class DailyReportJob {

    @Scheduled(cron = "0 0 1 * * *")
    public void executeDailyReport() {
        log.info("[BATCH] Daily report 시작");

        try {
            reportService.generate();
            log.info("[BATCH] Daily report 완료");
        } catch (Exception e) {
            log.error("[BATCH] Daily report 실패", e);
        }
    }
}
```

* **목적**: 정기 작업의 정상 수행 여부 확인 및 오류 감지

---

## 목적별 로깅 전략 요약

| 목적     | 시점                | 포맷               |
| ------ | ----------------- | ---------------- |
| 감사/보안  | 로그인, 권한 변경, 계정 삭제 | `[AUTH] ...`     |
| 트러블슈팅  | 예외 발생 catch       | `log.error(...)` |
| 성능 측정  | 작업 전후 소요 시간 계산    | `[PERF] ...`     |
| 이벤트 추적 | 도메인 이벤트 발생 시      | `[EVENT] ...`    |
| 외부 연동  | 호출 전후             | `[EXT] ...`      |

---

## 마무리 체크리스트

* [ ] 로그는 **도메인 중심의 의미 있는 메시지**로 작성
* [ ] 민감정보는 절대 출력하지 않음
* [ ] `Exception`은 반드시 스택트레이스까지 포함
* [ ] MDC나 `requestId`를 통해 요청 단위 트레이싱 가능하게 설계
* [ ] 환경별 레벨 필터링 적용 (`dev=DEBUG`, `prod=INFO` 이상)

---
