---
title: "백엔드 시스템 로깅 베스트 프랙티스"
date: 2025-05-22
categories: [Notes, Common]
tags: [Logging, Observability, Monitoring, Spring Boot]
---

로깅(logging)은 시스템의 상태를 추적하고 문제를 진단하는 수단이고, 보안 감사에 대응할 때 근거가 된다. 이 글은 Spring Boot 기반 백엔드 서비스를 기준으로 로깅 설계 원칙, 레벨, 수집 체계, 그리고 코드의 어느 시점에 무엇을 남기는지를 다룬다. 로그를 메트릭, 트레이스와 어떻게 나눠 쓰는지는 [메트릭, 로그, 트레이스](/posts/metrics-logs-traces/)에서 따로 다뤘다.

---

## 1. 로깅 설계 원칙

| 항목         | 설명                                     |
| ---------- | -------------------------------------- |
| 목적 정의   | 디버깅, 모니터링, 보안 감사, 성능 분석 등 목적별 로그 항목 구분 |
| 구조화된 로그 | JSON 기반의 키-값 로그 형식 → 로그 파싱 및 검색 용이     |
| 일관성 유지  | 서비스 전반에 걸쳐 로깅 패턴, 레벨, 포맷을 통일           |
| 민감정보 배제 | 주민번호, 비밀번호, 토큰 등 개인정보/인증정보는 절대 출력하지 않음 |

---

## 2. 로깅 레벨 사용 가이드

레벨별 의미와 필터링 방식은 [Log Level](/posts/log-level/)에 정리했다. 이 글에서는 레벨마다 어떤 상황을 남기는지만 구분한다.

| 레벨      | 사용 예시                               |
| ------- | ----------------------------------- |
| `ERROR` | 시스템 오류, 트랜잭션 실패, 복구 불가 상황           |
| `WARN`  | 잠재적 문제, 재시도 가능한 오류 (ex. 외부 API 실패)  |
| `INFO`  | 주요 흐름 및 상태 정보 (ex. 서비스 시작, 처리 완료)   |
| `DEBUG` | 상세 흐름, 디버깅용 데이터 (개발/스테이지 환경에서만 활성화) |
| `TRACE` | 디버깅보다 더 정밀한 트레이스용 로그 (대개 비활성화)      |

운영 환경에서는 `INFO`, `WARN`, `ERROR`까지만 남기고 `DEBUG`, `TRACE`는 비활성화한다.

---

## 3. 기술 적용 예시 (Spring Boot + Logback)

Logback과 다른 로깅 구현체의 차이는 [Log4j vs Logback vs Log4j2](/posts/log4j-logback-log4j2/)에서 비교했다.

### MDC (Mapped Diagnostic Context) 활용

MDC는 로그 한 줄마다 붙일 키-값을 스레드 단위로 보관하는 저장소다. [Logback 매뉴얼](https://logback.qos.ch/manual/mdc.html)은 이를 "The `MDC` manages contextual information on a _per thread basis_."라고 설명한다(MDC는 문맥 정보를 스레드별로 관리한다). 요청을 처리하는 스레드에 `userId`, `requestId`를 넣어 두면 그 스레드가 남기는 로그에 같은 값이 함께 찍힌다.

```java
MDC.put("userId", user.getId());
MDC.put("requestId", UUID.randomUUID().toString());
// 로그 출력 후 반드시 해제
MDC.clear();
```

그 결과 사용자별 추적과 요청 단위 구분이 쉬워진다. 단, 값은 스레드에 묶여 있으므로 처리가 끝나면 지워야 한다. 또 같은 매뉴얼에 따르면 자식 스레드는 부모의 MDC를 자동으로 물려받지 않고, `java.util.concurrent.Executors`로 작업을 넘길 때는 제출 전에 원래 스레드에서 `MDC.getCopyOfContextMap()`으로 복사본을 만들어 두는 방법을 권한다.

### JSON 로그 포맷 예시 (logback-spring.xml)

아래 설정은 [logstash-logback-encoder](https://github.com/logfellow/logstash-logback-encoder)의 composite 인코더를 쓴다. 이 인코더는 `timestamp`, `loggerName`, `message`, `mdc`, `stackTrace` 같은 provider를 조합해 JSON 필드를 구성하고, `mdc` provider가 앞에서 넣은 MDC 값을 필드로 출력한다.

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

## 5. 운영 환경을 위한 팁

* 로그 샘플링 적용 (대용량 시스템에서 유용)
* 파일 회전(log rotation) 및 보관 주기 설정
* 모듈/도메인별 Logger 사용 (`LoggerFactory.getLogger(Class)` 활용)
* 비정상 종료나 예외 발생 시 stack trace 포함
* 비즈니스 이벤트/감사 로깅은 DB 또는 별도 감사 시스템과 연계 고려

---

## 6. 피해야 할 안티 패턴

| 항목                          | 이유                     |
| ----------------------------- | ---------------------- |
| `System.out.println` 사용       | 성능 저하, 로깅 제어 불가        |
| 로그에 비밀번호 출력                   | 보안 위반, ISMS/PIMS 감사 실패 |
| 무조건 `INFO`만 사용                | 문제 진단 어려움, 로그 의미 퇴색    |
| 예외 잡고 아무 로그 없이 무시             | 문제 은폐 및 추적 불가          |
| 모든 요청 로그 남기기 (특히 GET 쿼리 파라미터) | 과도한 로그, 개인정보 유출 가능성    |

---

표의 ISMS는 정보보호 관리체계 인증이다. 이 인증에 맞춰 로그 수집 체계를 바꾼 사례는 [ISMS 대응을 위한 로그 수집 체계 개선](/posts/logsystem/)에 따로 적었다.

---

## 7. 무엇을 언제 남기는가

로그의 가치는 어떤 시점에, 어떤 정보를, 어떤 목적으로 남기느냐에 따라 달라진다. 여기서는 로깅 대상을 먼저 분류하고, Spring Boot 코드에서 각 대상을 남기는 시점을 예제로 본다.

### 로깅의 일반적 대상 분류

| 대상            | 예시                    | 주 목적             |
| ------------- | --------------------- | ---------------- |
| 요청/응답         | API 호출, 파라미터, 결과      | 트레이싱, 성능 측정      |
| 비즈니스 이벤트      | 주문 생성, 결제 성공, 엑셀 다운로드 | 사용자 행동 분석, 감사 로그 |
| 예외/오류         | Exception, HTTP 오류    | 문제 원인 파악, 경고 알림  |
| 외부 시스템 연동     | API 요청/응답, 메시지 큐 송수신  | 장애 대응, 연동 실패 대응  |
| 보안 관련 이벤트     | 로그인/로그아웃, 권한 변경       | 감사 추적, 경보 설정     |
| 성능 모니터링       | 처리 시간, 대기 시간, 자원 사용량  | 병목 구간 진단         |

---

## 8. 주요 로깅 시점별 예시

### A. Controller 진입 시점 (요청 정보)

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

* 목적: 요청 파라미터, 사용자 추적, 이상 요청 모니터링
* request는 `toString()`이 구현된 DTO만 출력한다. `toString()`에 민감정보가 섞이지 않는지 함께 확인한다.

---

### B. Service 내 핵심 로직 수행 시점

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

* 목적: 비즈니스 흐름 추적, 상태 변화 기록
* 주문 접수부터 처리 완료까지 주요 단계를 남겨 두면, 장애 후 로그만으로 처리 흐름을 다시 따라갈 수 있다.

---

### C. 예외 발생 시점 (try-catch)

```java
try {
    paymentService.charge(cardInfo);
} catch (PaymentException ex) {
    log.error("[PAYMENT] 결제 실패. 사용자: {}, 사유: {}", userId, ex.getMessage(), ex);
    throw new BusinessException("결제 실패", ex);
}
```

* 목적: 원인 기록 및 스택트레이스 포함
* 예외 객체를 마지막 인자로 넘기면(`log.error(..., ex)`) 메시지의 `{}` 치환과 별개로 스택트레이스가 함께 출력된다. [SLF4J FAQ](https://www.slf4j.org/faq.html)는 1.6.0부터 예외가 마지막 인자일 때 이 형식을 지원한다고 설명한다.

---

### D. 외부 시스템 연동 전후

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

* 목적: 장애 발생 시 원인 추적, 외부 시스템과의 통신 이력 확보

---

### E. 보안 이벤트 (로그인/권한 변경 등)

```java
public void login(String username) {
    if (isValidUser(username)) {
        log.info("[AUTH] 로그인 성공 - 사용자: {}", username);
    } else {
        log.warn("[AUTH] 로그인 실패 - 사용자: {}", username);
    }
}
```

* 목적: ISMS 인증 대응, 이상 로그인 탐지
* 로그인, 로그아웃, 권한 변경은 반드시 로깅해야 하는 이벤트

---

### F. 성능 측정 (Timer 기반)

```java
long start = System.currentTimeMillis();

// 처리 로직 수행
orderService.process(order);

long end = System.currentTimeMillis();
log.info("[PERF] 주문 처리 소요 시간 = {}ms", (end - start));
```

* 목적: 병목 지점 파악, SLA(서비스 수준 약정) 초과 여부 확인

---

### G. 배치 Job, Scheduler 실행 로그

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

* 목적: 정기 작업의 정상 수행 여부 확인 및 오류 감지

---

## 9. 목적별 로깅 전략 요약

| 목적     | 시점                | 포맷               |
| ------ | ----------------- | ---------------- |
| 감사/보안  | 로그인, 권한 변경, 계정 삭제 | `[AUTH] ...`     |
| 트러블슈팅  | 예외 발생 catch       | `log.error(...)` |
| 성능 측정  | 작업 전후 소요 시간 계산    | `[PERF] ...`     |
| 이벤트 추적 | 도메인 이벤트 발생 시      | `[EVENT] ...`    |
| 외부 연동  | 호출 전후             | `[EXT] ...`      |

---

## 점검 항목

* [ ] JSON 구조화된 로그 포맷 사용
* [ ] 로깅 레벨 체계 정의 및 일관성 유지, 환경별 레벨 분리 (`dev=DEBUG`, `prod=INFO` 이상)
* [ ] 로그는 도메인 중심의 의미 있는 메시지로 작성
* [ ] 민감정보는 출력하지 않음
* [ ] `Exception`은 스택트레이스까지 포함
* [ ] MDC나 `requestId`를 통해 요청 단위 트레이싱 가능하게 설계
* [ ] 로그 수집/조회 체계 구성 (ELK, Datadog 등)

## 참고

* [Logback Manual, Chapter 8: Mapped Diagnostic Context](https://logback.qos.ch/manual/mdc.html)
* [SLF4J FAQ](https://www.slf4j.org/faq.html)
* [logstash-logback-encoder](https://github.com/logfellow/logstash-logback-encoder)

---
