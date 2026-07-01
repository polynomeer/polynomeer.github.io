---
title: "전략 지문(SHA-256)으로 룰셋 보호하기 — 서버 사이드 실행과 역공학 방어"
date: 2026-06-18
categories: [Monticker, QuantLab]
tags: [monticker, strategy, sha256, security, server-side, quant]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 14
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
---

## 전략 보호가 필요한 이유

Quant Lab에는 전략 마켓이 있다. 사용자 A가 만든 전략을 B가 구독하면 A는 수익을 얻는다.

그런데 전략의 조건식이 클라이언트에 노출되면 문제가 생긴다.

1. B가 조건식을 복사해서 자기 전략으로 등록한다.
2. B가 조건식을 분석해서 유사한 전략을 만든다.
3. C가 많은 구독으로 인기 전략의 조건식을 역공학으로 분석한다.

전략 판매자의 지적재산권이 보호되지 않으면 전략 마켓이 존재하기 어렵다.

---

## 설계 원칙

```
전략 조건식(rule_definition)은 절대 클라이언트에 반환하지 않는다.
서버가 조건식을 평가하고, 결과(신호)만 반환한다.
```

```
클라이언트 ─────────────────────────────────────────────► API 서버
              GET /api/strategies/42/signal

API 서버 ─────────────────────────────────────────────────────────
              rule_definition 로드 (DB에서)
              IndicatorEngine.compute()
              RuleEvaluator.evaluate()
                                ◄─────────────────────────────
              {
                "hasSignal": true,
                "direction": "BUY",
                "stockCount": 3,
                "triggeredAt": "2025-07-14T10:00:00Z"
              }
                                ← rule_definition 없음
```

---

## rule_sets 테이블 설계

```sql
CREATE TABLE rule_sets (
    id                          BIGSERIAL    PRIMARY KEY,
    user_id                     BIGINT       NOT NULL REFERENCES users(id),
    name                        VARCHAR(100) NOT NULL,
    rule_definition             JSONB        NOT NULL,          -- 조건식 원문
    rule_definition_encrypted   BYTEA,                          -- AES-256 암호화본 (향후)
    rule_set_fingerprint        CHAR(64)     NOT NULL UNIQUE,   -- SHA-256 해시
    version                     INTEGER      NOT NULL DEFAULT 1,
    status                      VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',
    is_public                   BOOLEAN      NOT NULL DEFAULT false,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

### rule_set_fingerprint

조건식의 SHA-256 해시다. 두 가지 목적이 있다.

1. **무결성 검증**: 저장 후 조건식이 변조되었는지 확인
2. **중복 탐지**: 같은 전략이 다른 이름으로 재등록되는 것을 방지

```kotlin
fun generateFingerprint(ruleDefinition: JsonNode): String {
    // 정규화: 키 순서 정렬, 공백 제거 → 같은 조건식은 항상 같은 해시
    val normalized = objectMapper.writeValueAsString(
        sortedKeys(ruleDefinition)
    )
    return MessageDigest.getInstance("SHA-256")
        .digest(normalized.toByteArray())
        .joinToString("") { "%02x".format(it) }
}

private fun sortedKeys(node: JsonNode): Any = when {
    node.isObject -> TreeMap<String, Any>().also { map ->
        node.fields().forEach { (key, value) ->
            map[key] = sortedKeys(value)
        }
    }
    node.isArray  -> node.map { sortedKeys(it) }
    else          -> node
}
```

정규화 과정에서 키를 알파벳 순으로 정렬해야 한다. `{"a":1,"b":2}`와 `{"b":2,"a":1}`은 같은 조건식이지만 단순 직렬화하면 다른 문자열이 된다.

---

## 신호 서비스 — rate limiting

구독자가 신호 API를 너무 자주 호출하면 응답 패턴 분석으로 조건식을 역공학할 수 있다. 예를 들어 특정 조건에서만 신호가 발생한다는 것을 반복 호출로 파악할 수 있다.

```kotlin
@Service
class StrategySignalService(
    private val ruleSetRepository: RuleSetRepository,
    private val ruleEvaluator: RuleEvaluator,
    private val redisTemplate: StringRedisTemplate,
) {
    private val rateLimitWindow = Duration.ofHours(1)
    private val maxCallsPerHour = 60

    fun getSignal(userId: Long, strategyId: Long): StrategySignal {
        // Rate limit 체크
        val rateLimitKey = "signal:ratelimit:$userId:$strategyId"
        val calls = redisTemplate.opsForValue().increment(rateLimitKey) ?: 1L
        if (calls == 1L) redisTemplate.expire(rateLimitKey, rateLimitWindow)
        if (calls > maxCallsPerHour) {
            throw RateLimitException("신호 조회가 너무 잦습니다 (한도: ${maxCallsPerHour}회/시간)")
        }

        // 구독 확인
        val subscription = subscriptionRepository.findActive(userId, strategyId)
            ?: throw ForbiddenException("구독하지 않은 전략입니다")

        // 전략 로드 및 평가 (rule_definition 은 서버에서만 사용)
        val ruleSet = ruleSetRepository.findById(strategyId)
        val signals = evaluateForUniverse(ruleSet)

        // 반환: 신호만 포함, 조건식 내용 없음
        return StrategySignal(
            strategyId  = strategyId,
            hasSignal   = signals.isNotEmpty(),
            direction   = signals.firstOrNull()?.direction,
            stockCount  = signals.size,
            stocks      = signals.map { it.symbol },  // 종목명만, 조건 내용 없음
            triggeredAt = Instant.now(),
        )
    }
}
```

---

## API 응답에서 rule_definition 제거

Spring에서 JSON 응답에서 특정 필드를 제외하는 방법이다.

```kotlin
data class RuleSetResponse(
    val id          : Long,
    val name        : String,
    val status      : String,
    val version     : Int,
    val fingerprint : String,
    val isPublic    : Boolean,
    // rule_definition 없음 — 응답 DTO에 아예 포함하지 않는다
)
```

엔티티와 응답 DTO를 분리하는 것이 가장 단순하고 확실한 방법이다. `@JsonIgnore`를 쓰는 방법보다 명시적이다.

---

## 전략 버전 관리

전략을 수정하면 새 버전이 생성된다. 과거 버전의 신호와 현재 버전의 신호를 비교할 수 있다.

```kotlin
fun updateRuleSet(userId: Long, id: Long, newDefinition: JsonNode): RuleSet {
    val existing = ruleSetRepository.findByIdAndUserId(id, userId)
    val newFingerprint = generateFingerprint(newDefinition)

    // 조건식이 실제로 변경됐는지 확인
    if (existing.ruleSetFingerprint == newFingerprint) {
        return existing  // 변경 없음
    }

    // 새 버전 생성 (기존 버전은 보존)
    return ruleSetRepository.save(existing.copy(
        ruleDefinition   = newDefinition,
        ruleSetFingerprint = newFingerprint,
        version          = existing.version + 1,
        updatedAt        = Instant.now(),
    ))
}
```

버전 카운트가 많으면 신뢰도 점수가 낮아진다. 파라미터를 과도하게 조정한(과최적화) 흔적이기 때문이다.

---

## 정리

- 조건식(rule_definition)은 서버에서만 실행되고 클라이언트에 반환되지 않는다.
- SHA-256 지문으로 무결성 검증과 중복 탐지를 동시에 해결한다.
- 신호 API에 rate limiting을 적용해 패턴 분석을 통한 역공학을 방지한다.
- 응답 DTO에 `rule_definition` 필드 자체를 포함하지 않는 것이 `@JsonIgnore`보다 안전하다.

다음 시리즈(Series 6)에서는 보유 포트폴리오를 수학적으로 최적화하는 **Markowitz 포트폴리오 최적화**를 다룬다.
