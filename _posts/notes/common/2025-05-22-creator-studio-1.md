---
title: "Redis 기반 인증 토큰 관리로 분산 환경의 인증 일관성 확보"
date: 2025-05-22
categories: [Notes, Common]
tags: [Redis, Authentication, Token, Session, Distributed System]
---

분산 서버 환경에서는 사용자 인증 상태를 어느 서버에서든 같은 결과로 판단할 수 있어야 합니다. FLO 서버가 발급한 인증 토큰을 여러 서비스 서버에서 함께 쓰게 되면서, 인증 처리의 일관성을 확보하려고 Redis 기반 토큰 세션 관리 구조를 설계했습니다.

## 기존 문제점

기존 구조에서는 FLO 서버로부터 발급받은 인증 토큰을 단일 서버 메모리 또는 [세션](/posts/session-and-jwt/) 기반으로 관리하고 있었습니다. 이 방식에는 세 가지 문제가 있었습니다.

* 서버 인스턴스 간 세션 공유 불가: 로드밸런싱된 환경에서 토큰이 특정 서버에만 저장되면 다른 서버에서는 인증 상태를 확인할 수 없습니다.
* 토큰 만료 및 갱신 로직의 중복: 각 서버가 별도로 토큰 TTL(Time To Live, 키가 자동 삭제되기까지 남은 시간)을 관리해야 했고, 만료 시 재발급 로직도 중복으로 존재했습니다.
* 로그 및 감사 대응 한계: 인증 이벤트가 흩어져 있어 실시간 감사 로그 수집이 어려웠습니다.

## 개선 방향: Redis를 통한 인증 토큰 중앙화

세 문제의 공통 원인은 토큰 상태가 서버마다 따로 있다는 점이었습니다. 그래서 Redis를 중앙 저장소로 두고 **토큰을 세션처럼 관리**하는 방식을 도입했습니다. 모든 서버가 같은 키를 조회하므로 인증 상태가 공유되고, 만료는 Redis의 [TTL](/posts/redis-lite-java-keyspace/)이 한 곳에서 처리합니다.

### 구조 개요

```plaintext
[FLO 서버]──[서비스 서버]──┬──▶ Redis (Token 저장소)
                           └──▶ 인증 토큰 조회/검증/갱신
```

### 핵심 구현 내용

1. 토큰 발급 시 Redis에 저장

   * 키: `auth:token:{userId}`
   * 값: `{accessToken, refreshToken, issuedAt, expiresAt}`
   * TTL: `expiresAt - issuedAt` 기준으로 설정

2. 서비스 서버는 토큰을 Redis에서 조회하여 인증 상태를 판단

   * 미존재 시 → FLO에 재인증 요청
   * 존재하되 만료 임박 시 → 자동 갱신 수행

3. 토큰 만료 및 자동 갱신 로직을 일원화

   * Redis TTL 만료 → 인증 재요청 유도
   * Refresh Token이 존재할 경우 내부적으로 자동 갱신 시도

4. 보안 로그 및 감사 로깅 연계

   * Redis에서 발생하는 TTL 만료 및 갱신 이벤트를 기반으로 Kafka 로그 발행
   * 외부 감사 및 실시간 모니터링 대응 강화

   만료 이벤트를 감사 로그의 근거로 쓸 때는 시점에 주의해야 합니다. Redis 문서에 따르면 `expired` 이벤트는 TTL이 0이 되는 순간이 아니라 키가 접근되거나 백그라운드 정리에서 발견되어 삭제될 때 발생하고, 문서는 "there are no guarantees that the Redis server will be able to generate the `expired` event at the time the key time to live reaches the value of zero"라고 적고 있습니다(TTL이 0이 되는 시점에 이벤트가 생성된다는 보장은 없다). 또한 keyspace notification은 Pub/Sub 위에서 동작하므로 구독 클라이언트가 끊겨 있던 동안의 이벤트는 유실됩니다([Redis keyspace notifications](https://redis.io/docs/latest/develop/pubsub/keyspace-notifications/)).

## 보안성과 실시간성 향상

Redis 기반 인증 구조를 통해 얻은 효과는 다음과 같습니다.

| 항목       | 개선 전              | 개선 후                    |
| -------- | ----------------- | ----------------------- |
| 인증 상태 공유 | 단일 서버에 국한         | 모든 서버 간 공유 가능 (분산 캐시)   |
| 토큰 갱신 로직 | 서버별 중복 로직 존재      | 중앙 집중화, TTL 기반 자동 갱신 관리 |
| 감사 대응    | 이벤트 수집 어려움        | TTL 및 갱신 로그 실시간 수집 가능   |
| 장애 복원력   | 서버 재시작 시 인증정보 손실  | Redis 복구 시 세션 상태 유지 가능  |
| 확장성      | 인증 정보 분산 문제 발생 가능 | Redis 확장으로 수평 확장 용이     |

## 도입 시 고려사항

* **토큰 저장 키 전략 통일**: 사용자 기준 또는 세션 기준으로 명확한 네이밍 규칙 수립 필요
* **보안 저장**: Redis에는 암호화되지 않은 토큰을 저장하지 않도록 주의 (AES 등으로 암호화 가능)
* **TTL 동기화**: FLO 서버의 토큰 유효기간과 Redis TTL 간 정밀한 동기화 필요

## 마무리하며

Redis에 토큰을 모으면서 인증 상태 공유, 갱신 로직의 일원화, 만료와 갱신 이벤트 기반의 감사 로그 연계를 한 구조 안에서 처리할 수 있게 됐습니다. 대신 Redis가 모든 인증 요청의 경로에 들어오므로, Redis의 가용성과 TTL 동기화가 인증 품질을 좌우하게 됩니다. 이 비용은 아래 "Redis 세션 방식의 한계"에서 다룹니다.

---

## 실전 구현 예시

### 1. Redis에 인증 토큰 저장하기

```java
@Service
@RequiredArgsConstructor
public class AuthTokenService {

    private final RedisTemplate<String, AuthToken> redisTemplate;
    private static final String PREFIX = "auth:token:";

    public void saveToken(Long userId, AuthToken token) {
        String key = PREFIX + userId;
        Duration ttl = Duration.between(LocalDateTime.now(), token.getExpiresAt());
        redisTemplate.opsForValue().set(key, token, ttl);
    }
}
```

### 2. Redis에서 토큰 조회 및 자동 갱신 트리거

```java
public Optional<AuthToken> getValidToken(Long userId) {
    String key = PREFIX + userId;
    AuthToken token = redisTemplate.opsForValue().get(key);

    if (token == null || token.isExpired()) {
        return Optional.empty(); // FLO에 재인증 필요
    }

    // 토큰이 곧 만료될 경우 갱신 트리거
    if (token.isExpiringSoon()) {
        refreshTokenAsync(userId, token.getRefreshToken());
    }

    return Optional.of(token);
}
```

### 3. 토큰 만료 체크 및 갱신 조건

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuthToken implements Serializable {

    private String accessToken;
    private String refreshToken;
    private LocalDateTime issuedAt;
    private LocalDateTime expiresAt;

    public boolean isExpired() {
        return LocalDateTime.now().isAfter(expiresAt);
    }

    public boolean isExpiringSoon() {
        return Duration.between(LocalDateTime.now(), expiresAt).toMinutes() < 5;
    }
}
```

### 4. 토큰 자동 갱신 (비동기 처리)

```java
@Async
public void refreshTokenAsync(Long userId, String refreshToken) {
    try {
        AuthToken newToken = floApiClient.refreshToken(refreshToken);
        saveToken(userId, newToken);
        log.info("[Token Refresh] User {} token refreshed successfully", userId);
    } catch (Exception e) {
        log.error("[Token Refresh] Failed to refresh token for user {}", userId, e);
    }
}
```

---

## Redis TTL 활용 팁

* TTL 조회: Redis 명령어 `TTL auth:token:{userId}` 로 확인 가능
* TTL 만료 이벤트 수신 (옵션):
  Redis `notify-keyspace-events` 기능을 사용하면 토큰 만료 시 이벤트 발생 → Kafka 등과 연동 가능. 설정값의 `E`는 keyevent 채널(`__keyevent@<db>__`)로 발행하라는 뜻이고, `x`는 만료(expired) 이벤트를 고르는 플래그입니다. 앞서 적은 것처럼 이벤트 발생 시점은 실제 삭제 시점이므로, 정확한 만료 시각이 필요하면 저장된 `expiresAt`을 기준으로 삼아야 합니다.

```shell
# redis-cli
CONFIG SET notify-keyspace-events Ex
```

```java
// RedisMessageListener를 활용해 만료 이벤트 처리 가능
```

---

## 마무리 요약

* 토큰은 TTL 기반으로 Redis에 저장해 세션처럼 활용
* 만료 임박 시 자동 갱신을 비동기로 트리거
* 토큰 상태는 모든 서버 인스턴스에서 일관되게 참조 가능
* Redis TTL 및 키 이벤트 기능으로 보안 로그 및 장애 대응력도 강화 (만료 이벤트는 지연·유실될 수 있음)

---

Redis 기반의 세션 방식은 비교적 간단하고 빠르지만, 규모가 커지면 다른 인증 구조도 검토할 필요가 있습니다. 아래는 Redis 방식의 한계와, 그 한계를 다른 방식으로 푸는 대안들입니다.

---

## Redis 세션 방식의 한계

| 항목                | 내용                                                              |
| ----------------- | --------------------------------------------------------------- |
| **스케일 문제**        | Redis는 단일 장애점(SPOF)이 될 수 있음 (Sentinel/Cluster로 완화 가능하지만 복잡성 증가) |
| **Token 재전송 취약성** | AccessToken이 노출되면 세션이 탈취될 수 있음                                  |
| **로그아웃 처리 어려움**   | JWT처럼 자체 만료 기능이 없어서 "강제 만료"를 수동 관리해야 함                          |
| **서버 부하**         | 매 요청마다 Redis를 조회 → 고트래픽 환경에서는 병목 가능                             |

---

## 대안 인증 방식 세 가지

### 1. Stateless JWT + Refresh Token (with Rotation)

> 서버는 토큰을 저장하지 않음. 클라이언트가 모든 상태를 보유

[JWT](/posts/jwt-structure-and-verification/)를 Access Token으로 쓰고, 서버는 인증 상태를 저장하지 않는 [무상태](/posts/stateful-stateless/) 방식입니다.

* **AccessToken**: JWT (short TTL, e.g., 15분)
* **RefreshToken**: Secure storage (cookie with httpOnly/secure)
* **Refresh Rotation**: RefreshToken도 재발급하며, old refresh 사용 시 탈취로 간주

**장점**

* 완전한 무상태(stateless) 인증
* Redis 같은 세션 저장소 불필요
* 수평 확장에 최적화
* `Authorization` 헤더 검증만으로 인증 완료

**단점**

* 로그아웃/강제만료 등 세션 무효화는 `Token blacklist` 등 추가 로직 필요
* RefreshToken 유출 시 리스크 → rotation 및 single-use 보안 강화 필요

**구성도**

```plaintext
[Client] —AccessToken→ [API]
        ↳ RefreshToken (Cookie) → [Auth Server]
```

---

### 2. OAuth2 + OpenID Connect (OIDC) with Authorization Server

> 인증 자체를 외부 전문 인증 서버로 위임

인증은 [OpenID Connect](/posts/openid-connect/)를 지원하는 외부 인증 서버가 맡고, 서비스는 발급된 토큰을 검증하는 역할만 맡습니다.

* Keycloak, Auth0, Firebase Auth, AWS Cognito 등을 사용
* OIDC 프로토콜로 사용자 정보 제공 (`/userinfo`)
* 서버는 토큰 서명만 검증 (JWK 공개키)

**장점**

* 인증 로직 자체를 위임 → 내부 서비스는 오직 토큰 검증만
* 다양한 소셜 로그인 연동 (구글, 애플 등)
* 세션 관리, MFA, 이메일 인증 등 지원

**단점**

* 인증 서버 운영 및 복잡성 증가
* 토큰 서명 검증(JWK fetch) 캐싱 필요

---

### 3. Passkey/FIDO2 기반 비밀번호 없는 인증

> 생체인식 또는 디바이스 기반 인증

* WebAuthn 기반, 사용자 디바이스에 Credential 저장
* 브라우저 또는 OS가 직접 인증 처리

**장점**

* 비밀번호 노출 리스크 없음
* 피싱 공격 거의 불가능
* 점점 보편화 (Apple, Google, Microsoft 채택)

**단점**

* 호환성 제한 (모바일 우선 서비스는 유리)
* 기업 시스템에서는 계정 연동 등 추가 구조 필요

---

## 실무 선택 가이드

| 조건                  | 추천 인증 방식                |
| ------------------- | ----------------------- |
| 단일 시스템, 빠른 구현       | Redis 기반 세션 방식          |
| REST API 기반, 확장성 우선 | **JWT + Refresh Token** |
| SaaS/글로벌 인증 연동      | **OAuth2 + OIDC**       |
| 모바일/보안 민감 서비스       | **Passkey + FIDO2**     |
| 엔터프라이즈 사내 시스템       | SSO (SAML + OIDC 조합)    |

---

## 결론: 인증 방식은 목적과 맥락에 따라 고른다

Redis 방식은 단일 시스템에서 빠르게 구현하기에는 여전히 유효합니다. 다만 매 요청마다 Redis를 조회하는 비용과 Redis 장애의 영향을 줄이고 싶다면, JWT 기반 + Rotation 방식이나 OAuth2 인증 서버 분리를 검토할 수 있습니다. 어느 쪽이든 세션 무효화나 인증 서버 운영처럼 다른 형태의 비용이 따라온다는 점은 위의 단점 항목과 같습니다.

## 참고

- [Redis keyspace notifications](https://redis.io/docs/latest/develop/pubsub/keyspace-notifications/) — 이벤트 플래그, 만료 이벤트의 발생 시점, Pub/Sub 유실

---
