---
title: "모듈식 모놀리스를 선택한 이유 — MSA의 유혹을 거부하기"
date: 2026-06-02
categories: [Monticker, Architecture]
tags: [monticker, architecture, modular-monolith, spring-boot, kotlin]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 2
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
---

## "그냥 MSA로 가면 안 되나요?"

새 프로젝트를 시작하면 자연스럽게 드는 질문이 있다. "마이크로서비스로 만들어야 하지 않을까?" 특히 주식 플랫폼처럼 여러 도메인(시세, 뉴스, 알람, 포트폴리오, 체결)이 얽혀 있으면 더욱 그런 생각이 든다.

monticker는 **모듈식 모놀리스(Modular Monolith)** 를 선택했다. 이 결정의 배경을 정리한다.

---

## MSA가 실제로 주는 것과 빼앗아 가는 것

MSA의 장점은 분명하다. 서비스별 독립 배포, 언어·프레임워크 자유, 팀별 소유권. 그런데 이 장점들은 **규모가 될 때** 의미가 있다.

초기 단계에서 MSA를 선택하면 대신 얻게 되는 것들이 있다.

```
모놀리스에서의 함수 호출:
  userService.getUser(userId)   // 1 nanosecond

MSA에서의 RPC/HTTP 호출:
  GET /api/users/{userId}       // 1~50 milliseconds
  + 네트워크 불안정성
  + 직렬화/역직렬화 비용
  + 서비스 디스커버리 설정
  + 인증 전파 (JWT 또는 서비스 토큰)
  + 분산 트랜잭션 처리
  + 로컬 개발 환경 복잡도 (docker-compose 20개 서비스)
```

monticker의 초기 팀 규모와 트래픽을 감안하면, MSA는 해결보다 문제를 더 많이 만들어낸다.

> "MSA는 확장성을 위한 선택이 아니라, 조직 경계를 코드로 표현하기 위한 선택이다." — Sam Newman, *Building Microservices*

---

## 모듈식 모놀리스의 구조

모놀리스라고 해서 스파게티 코드를 말하는 게 아니다. 패키지 경계를 명확히 나누고, 모듈 간 의존 방향을 강제하는 구조다.

```
backend/api/src/main/kotlin/com/monticker/api/
├── auth/          # 인증·인가
├── stock/         # 종목 기본 정보
├── marketdata/    # 시세·캔들·호가창
├── event/         # 이벤트 탐지·타임라인
├── alert/         # 알람 규칙·이력
├── paper/         # 모의투자 주문
├── matching/      # CLOB 체결 엔진
├── risk/          # 리스크 한도 시스템
├── wallet/        # 투자 원장·감정 태그
├── quant/         # Quant Lab 룰·백테스트
├── analytics/     # 포트폴리오 최적화·패턴
├── news/          # 뉴스·공시
└── screener/      # 종목 스크리너
```

각 모듈은 독립적인 패키지 안에 Controller, Service, Repository를 가진다. 다른 모듈의 Repository에 직접 접근하지 않고, 항상 해당 모듈의 Service를 통한다.

---

## Kotlin + Spring Boot 3.5 선택

### Kotlin을 선택한 이유

Java 대신 Kotlin을 선택한 결정적 이유는 **표현력**이다.

```kotlin
// Java: 뻔하고 장황하다
public Optional<User> findUserByEmail(String email) {
    return userRepository.findByEmail(email);
}

// Kotlin: 간결하면서도 null 안전
fun findUserByEmail(email: String): User? =
    userRepository.findByEmail(email)
```

금융 도메인에서 Kotlin이 더 빛나는 경우는 `data class`와 sealed class다.

```kotlin
// 주문 상태 머신을 sealed class로 표현
sealed class OrderStatus {
    object Pending : OrderStatus()
    object Reserved : OrderStatus()
    data class PartiallyFilled(val filledQty: Int) : OrderStatus()
    object Filled : OrderStatus()
    object Cancelled : OrderStatus()
}

// when 표현식으로 모든 케이스를 컴파일 타임에 검증
fun processStatus(status: OrderStatus): String = when (status) {
    is OrderStatus.Pending    -> "주문 접수됨"
    is OrderStatus.Reserved   -> "예약금 차감됨"
    is OrderStatus.PartiallyFilled -> "부분 체결: ${status.filledQty}주"
    is OrderStatus.Filled     -> "전량 체결 완료"
    is OrderStatus.Cancelled  -> "주문 취소됨"
    // else 없이도 컴파일 통과 — 모든 케이스 처리됨
}
```

### Spring Boot 3.5

Spring Boot 3.x는 GraalVM Native Image를 공식 지원한다. 모놀리스에서 시작하더라도 나중에 특정 서비스를 native로 컴파일해 메모리를 줄이는 출구 전략이 생긴다.

```yaml
# application.yml
spring:
  datasource:
    url: ${DB_URL}
  flyway:
    enabled: true
    locations: classpath:db/migration
```

Flyway로 DB 마이그레이션을 코드로 관리하고, 환경변수로 설정을 주입하는 12 Factor App 원칙을 따른다.

---

## 모듈 간 경계 강제 방법

모듈식 모놀리스에서 가장 중요한 것은 **경계를 지키는 규율**이다. 코드 리뷰에서 잡지 않으면 금방 무너진다.

monticker에서는 세 가지 방법으로 경계를 강제한다.

**1. 패키지 private 활용**

각 모듈의 내부 구현체(`*Repository`, 내부 DTO)는 `internal` 키워드로 모듈 밖에서 접근 불가.

```kotlin
// 이건 모듈 외부에서 주입받아 사용 가능
@Service
class MatchingOrderBookService(...)

// 이건 모듈 내부에서만 사용
internal class OrderBookRepository(...)
```

**2. 서비스 레이어를 통한 접근**

다른 모듈의 데이터가 필요하면 Repository가 아닌 Service를 통한다.

```kotlin
// BAD: matching 모듈이 wallet 모듈의 Repository를 직접 접근
class MatchingService(
    private val ledgerRepository: LedgerRepository  // 금지
)

// GOOD: 항상 해당 모듈의 Service를 통한다
class MatchingService(
    private val ledgerService: LedgerService         // 허용
)
```

**3. 이벤트 기반 느슨한 결합**

동기 호출이 불필요한 경우 Spring의 ApplicationEvent로 느슨하게 연결한다.

```kotlin
// 체결 완료 → 원장 기록 (동기 결합 불필요)
eventPublisher.publishEvent(FillCompletedEvent(fill))

@EventListener
fun onFillCompleted(event: FillCompletedEvent) {
    ledgerService.recordFill(event.fill)
}
```

---

## 언제 MSA로 전환할 것인가

모놀리스를 선택했다고 MSA를 포기한 게 아니다. 명확한 신호가 보이면 전환한다.

| 신호 | 전환 후보 |
|------|----------|
| Quant 백테스트가 API 응답에 영향을 줌 | Rule Engine 서비스 분리 |
| 시세 처리량이 JVM GC에 걸림 | Go 수집기 → 이미 분리됨 |
| 전략 마켓 팀이 별도로 생김 | Strategy Market 서비스 분리 |
| WebSocket 연결이 수만 개를 넘어섬 | Netty → 이미 분리됨 |

현재 Go Market Gateway와 Netty Broadcast Gateway가 이미 분리된 독립 프로세스로 동작한다. "필요할 때 분리"하는 원칙이 실제로 적용된 예다.

---

## 정리

- 모놀리스 ≠ 스파게티 코드. 명확한 패키지 경계와 의존 방향 규칙이 있으면 충분히 유지보수 가능하다.
- MSA의 복잡도는 팀 규모와 트래픽이 그것을 정당화할 때 도입한다.
- Kotlin의 `sealed class`·`data class`·`when` 표현식은 금융 도메인의 상태 머신을 안전하게 표현한다.

다음 편에서는 왜 일반 PostgreSQL이 아닌 **TimescaleDB**를 시계열 저장소로 선택했는지 다룬다.
