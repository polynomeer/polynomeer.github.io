---
title: "모듈식 모놀리스를 선택한 이유 — MSA의 유혹을 거부하기"
date: 2026-06-02
categories: [Monticker, Architecture]
tags: [monticker, Architecture, Modular Monolith, Spring Boot, Kotlin]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 2
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: published
---

## "그냥 MSA로 가면 안 되나요?"

새 프로젝트를 시작하면 자연스럽게 드는 질문이 있다. "[마이크로서비스](/posts/MicroServiceArchitecture/)로 만들어야 하지 않을까?" 특히 주식 플랫폼처럼 여러 도메인(시세, 뉴스, 알람, 포트폴리오, 체결)이 얽혀 있으면 더욱 그런 생각이 든다.

monticker는 [모듈식 모놀리스(Modular Monolith)](/posts/modular-monolith-boundaries/)를 선택했다. 이 글은 그 결정의 배경을 적는다.

---

## MSA가 실제로 주는 것과 빼앗아 가는 것

MSA의 장점은 분명하다. 서비스별 독립 배포, 언어·프레임워크 자유, 팀별 소유권. 그런데 이 장점들은 팀과 트래픽의 규모가 그것을 필요로 할 때 의미가 있다.

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

Martin Fowler도 [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html)에서 같은 관찰을 적었다. "Almost all the successful microservice stories have started with a monolith that got too big and was broken up." 성공한 마이크로서비스 사례는 거의 모두 너무 커진 모놀리스를 쪼개는 데서 시작했다는 뜻이다.

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

Java 대신 Kotlin을 선택한 결정적 이유는 표현력이다.

```kotlin
// Java: 뻔하고 장황하다
public Optional<User> findUserByEmail(String email) {
    return userRepository.findByEmail(email);
}

// Kotlin: 간결하면서도 null 안전
fun findUserByEmail(email: String): User? =
    userRepository.findByEmail(email)
```

금융 도메인에서 Kotlin의 이점이 더 드러나는 곳은 `data class`와 sealed class(하위 타입을 한 곳에 닫아 두는 클래스)다.

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

Spring Boot 3.x는 GraalVM Native Image를 공식 지원한다. native image는 JVM보다 적은 메모리로 빠르게 기동한다([Spring Boot 문서](https://docs.spring.io/spring-boot/3.5/reference/packaging/native-image/introducing-graalvm-native-images.html)). 그래서 나중에 분리한 서비스를 native로 컴파일해 메모리를 줄이는 출구 전략이 남는다.

```yaml
# application.yml
spring:
  datasource:
    url: ${DB_URL}
  flyway:
    enabled: true
    locations: classpath:db/migration
```

Flyway로 DB 마이그레이션을 코드로 관리하고, 설정은 환경변수로 주입한다. 설정을 환경변수에 두라는 [12 Factor App의 Config 원칙](https://12factor.net/config)을 따른 것이다.

---

## 모듈 간 경계 강제 방법

모듈식 모놀리스는 경계를 지키는 규율에 달려 있다. 코드 리뷰에서 잡지 않으면 금방 무너진다.

monticker에서는 세 가지 방법으로 경계를 강제한다.

### 1. `internal`로 내부 구현 숨기기

각 모듈의 내부 구현체(`*Repository`, 내부 DTO)에 `internal` 키워드를 붙인다.

다만 Kotlin의 `internal`은 패키지 단위가 아니다. `internal`은 같은 모듈, 즉 함께 컴파일되는 Kotlin 파일 묶음(Gradle source set 등) 안에서 모두 보인다([Kotlin 문서](https://kotlinlang.org/docs/visibility-modifiers.html)). 위 구조처럼 모든 패키지가 `backend/api` 한 빌드 모듈에 있으면 `internal`은 패키지 사이의 접근을 막지 못한다. 그래서 컴파일러로 막으려면 Gradle 모듈을 나눠야 하고, 그 전까지는 아래 규칙과 리뷰, [ArchUnit 같은 아키텍처 테스트](/posts/archunit-guardrails-on-legacy/)가 경계를 지킨다.

```kotlin
// 이건 모듈 외부에서 주입받아 사용 가능
@Service
class MatchingOrderBookService(...)

// 이건 모듈 내부에서만 사용
internal class OrderBookRepository(...)
```

### 2. 서비스 레이어를 통한 접근

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

### 3. 이벤트 기반 느슨한 결합

발행하는 쪽이 받는 쪽을 직접 알 필요가 없는 경우 Spring의 ApplicationEvent로 연결한다. 그러면 `matching` 모듈은 `LedgerService`를 의존성으로 갖지 않는다.

```kotlin
// 체결 완료 → 원장 기록 (동기 결합 불필요)
eventPublisher.publishEvent(FillCompletedEvent(fill))

@EventListener
fun onFillCompleted(event: FillCompletedEvent) {
    ledgerService.recordFill(event.fill)
}
```

여기서 느슨해지는 것은 코드 의존이지 실행 시점이 아니다. 리스너는 기본적으로 이벤트를 동기로 받고, `publishEvent()`는 모든 리스너가 끝날 때까지 블록된다([Spring 문서](https://docs.spring.io/spring-framework/reference/core/beans/context-introduction.html)). 원장 기록을 커밋 뒤나 다른 스레드로 미루려면 [`@TransactionalEventListener`](/posts/transactional-event-listener/)나 `@Async`가 따로 필요하다.

---

## 언제 MSA로 전환할 것인가

모놀리스를 선택했다고 MSA를 포기한 게 아니다. 명확한 신호가 보이면 전환한다.

| 신호 | 전환 후보 |
|------|----------|
| Quant 백테스트가 API 응답에 영향을 줌 | Rule Engine 서비스 분리 |
| 시세 처리량이 JVM GC에 걸림 | Go 수집기 → 이미 분리됨 |
| 전략 마켓 팀이 별도로 생김 | Strategy Market 서비스 분리 |
| WebSocket 연결이 수만 개를 넘어섬 | Netty → 이미 분리됨 |

이 글을 쓸 때 Go Market Gateway와 Netty Broadcast Gateway가 이미 분리된 독립 프로세스로 동작했다. "필요할 때 분리"하는 원칙이 실제로 적용된 예였다. 이후 Netty 게이트웨이는 제거되고 WebSocket 경로는 api로 돌아왔다([WebSocket push와 REST polling 비교](/posts/monticker-ws-vs-polling/)).

---

## 정리

- 모놀리스 ≠ 스파게티 코드. 다만 단일 빌드 모듈에서 `internal`은 패키지 경계를 막지 못하므로, 의존 방향 규칙은 리뷰나 아키텍처 테스트로 지켜야 한다.
- MSA의 복잡도는 팀 규모와 트래픽이 그것을 정당화할 때 도입한다.
- Kotlin의 `sealed class`·`data class`·`when` 표현식은 금융 도메인의 상태 머신을 안전하게 표현한다.

다음 편에서는 왜 일반 PostgreSQL이 아닌 [TimescaleDB를 시계열 저장소로 선택했는지](/posts/monticker-timescaledb/) 다룬다.

## 참고

- [Martin Fowler, MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html)
- [Kotlin, Visibility modifiers](https://kotlinlang.org/docs/visibility-modifiers.html)
- [Spring Framework, Standard and Custom Events](https://docs.spring.io/spring-framework/reference/core/beans/context-introduction.html)
- [Spring Boot 3.5, Introducing GraalVM Native Images](https://docs.spring.io/spring-boot/3.5/reference/packaging/native-image/introducing-graalvm-native-images.html)
- [The Twelve-Factor App, Config](https://12factor.net/config)
