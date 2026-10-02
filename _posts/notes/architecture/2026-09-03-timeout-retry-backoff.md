---
title: "타임아웃, 재시도, 백오프 - 증폭과 지터, 그리고 데드라인 전파"
date: 2026-09-03
categories: [Notes, Architecture]
tags: [Resilience, Retry, Timeout, Backoff, Circuit Breaker, Distributed System]
---

세 가지는 항상 같이 나오지만 역할이 다르다. 타임아웃은 포기 시점을, 재시도는 다시 시도할지를, 백오프는 언제 다시 할지를 정한다. 셋을 따로 정하지 않으면 서로를 망친다. 타임아웃 없는 재시도는 영원히 기다리고, 백오프 없는 재시도는 이미 아픈 상대를 더 때린다.

## 타임아웃: 값이 없으면 무한이다

가장 흔한 사고는 타임아웃을 안 거는 것이다. 라이브러리 기본값이 무한인 경우가 많고, 그러면 상대가 답하지 않을 때 **우리 쪽 자원이 무한히 묶인다.** gRPC 문서도 기본으로는 deadline을 설정하지 않아 클라이언트가 사실상 영원히 기다릴 수 있다고 적는다([gRPC: Deadlines](https://grpc.io/docs/guides/deadlines/)).

[Tomcat 스레드 고갈 실험](/posts/tomcat-thread-exhaustion/)에서 잰 것이 그 결과다. 읽기 타임아웃을 0(무한)으로 두자 요청 스레드 200개 전부가 소켓 읽기에 묶였고, 업스트림을 호출하지도 않는 엔드포인트의 실패율이 66.7%가 됐다. 더 나쁜 것은 부하가 끝나고 5초 뒤에도 dump가 똑같았다는 점이다. 타임아웃이 없으면 회복 시간을 서버가 정하지 못한다.

타임아웃은 여러 층에 있고 전부 확인해야 한다.

| 층 | 예 |
| --- | --- |
| 연결 | connect timeout |
| 읽기 | read/socket timeout |
| 요청 전체 | request timeout |
| 풀 획득 | 커넥션·permit 획득 대기 |
| 트랜잭션 | `@Transactional(timeout)` |
| 쿼리 | `statement_timeout`, `lock_timeout` |

값을 정하는 기준은 상대의 지연 분포다. p99가 300ms인 상대에 타임아웃 200ms를 걸면 정상 요청의 상당수를 죽인다. 반대로 30초를 걸면 장애 시 자원을 30초씩 묶는다. 그래서 p99의 2~3배 근처에서 시작해 실제 분포로 조정하는 것을 출발점으로 쓴다.

## 재시도: 증폭을 먼저 계산한다

재시도는 **상대에게 보내는 요청 수를 곱한다.** 3회 재시도는 3배다.

[ParityPay 9편](/posts/parity-pay-external-isolation/)에서 타임아웃 3초에 재시도 3회를 붙이자 기관이 받은 요청이 정확히 3.00배가 됐다. 초당 11건이던 부하가 33건이 됐는데, 그 기관은 이미 느려서 타임아웃이 나던 중이었다.

이 증폭은 계층마다 다시 곱해진다. 클라이언트 3회 × 게이트웨이 3회 × 서비스 3회면 가장 안쪽 서비스가 보는 부하는 27배다. Google SRE 책은 같은 계산을 "세 번 재시도"(층마다 시도 4회) 기준으로 해서, 사용자 동작 하나가 데이터베이스에 64회의 시도를 만든다고 적는다([Google SRE: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)). 대규모 장애에서 "복구했는데 다시 죽는" 경우의 흔한 원인이다.

그래서 재시도에는 세 가지 제약이 붙어야 한다.

1. 멱등한 요청에만. 아니면 중복 실행이다([멱등한 API 설계](/posts/idempotent-api-design/)).
2. 재시도 가능한 오류에만. 5xx·타임아웃은 가능, 4xx 검증 오류는 불가. gRPC도 재시도할 상태 코드를 `retryableStatusCodes`로 명시하게 한다([gRPC: Retry](https://grpc.io/docs/guides/retry/)). 분류를 틀리면 양쪽으로 사고가 난다.
3. 한 계층에서만. 여러 층에 걸면 곱해진다. 어느 층이 재시도할지 정하고 나머지는 안 한다. SRE 책의 예에서도 DB 바로 위 백엔드만 재시도하고 그 위 층은 다시 재시도하지 않는다.

그 위의 장치가 재시도 예산(retry budget)이다. 전체 요청 대비 재시도 비율에 상한(예: 10%)을 두고, 넘으면 재시도를 멈춘다. Google의 클라이언트는 재시도 비율이 10% 미만일 때만 재시도한다([Google SRE: Handling Overload](https://sre.google/sre-book/handling-overload/)). gRPC의 `retryThrottling`도 같은 계열이다([gRPC: Retry](https://grpc.io/docs/guides/retry/)). 고정 횟수만 두는 것보다 안전하다.

## 백오프와 지터

즉시 재시도하면 상대가 회복할 틈이 없다. 지수 백오프는 간격을 두 배씩 늘린다(100ms, 200ms, 400ms…). 상한(`max delay`)도 함께 둔다.

지터는 그 간격에 무작위성을 준다. 목적은 동기화된 폭주를 흩는 것이다. 장애가 복구되는 순간 수천 클라이언트가 동시에 재시도하면 그 자체가 새 장애다(thundering herd). Marc Brooker의 시뮬레이션에서는 백오프만 둔 재시도가 여전히 같은 시각에 뭉쳤다.

{% citation brooker-backoff-and-jitter %}
"The solution isn't to remove backoff. It's to add jitter."
{% endcitation %}

백오프를 없애는 것이 아니라 지터를 더하는 것이 답이라는 뜻이다.

다만 **지터가 값을 하려면 동기화된 폭주가 있어야 한다.** ParityPay 9편에서 지수 백오프와 지터를 붙였을 때 총량은 그대로 3.00배였고, 초당 최대가 33에서 38~41로 오히려 높았다. 부하가 초당 10건씩 고르게 도착하는 조건이라 펼칠 봉우리가 없었다.

그래서 지터는 재시도 정책의 필수 요소이지만 재시도 자체를 정당화하지 않는다. 상대가 계속 느려서 매 시도가 타임아웃되는 조건에서는 총 부하가 줄지 않는다. 경합 때문에 실패하는 경우는 다르다. Brooker의 시뮬레이션처럼 충돌이 재시도를 부르는 상황에서는 지터가 충돌을 줄여, 클라이언트 100개 기준 호출 수가 절반 넘게 줄었다.

## 데드라인 전파

여러 서비스를 거치는 호출에서, 각 층이 독립적으로 타임아웃을 갖고 있으면 합이 맞지 않는다.

```text
클라이언트 타임아웃 3초
  → A 서비스 타임아웃 5초
     → B 서비스 타임아웃 5초
```

클라이언트는 3초에 포기하는데 A와 B는 그 뒤로도 5초씩 일한다. **아무도 기다리지 않는 작업에 자원을 쓴다.**

데드라인 전파가 이 문제를 푼다. "언제까지"라는 기한을 호출에 실어 보내고, 각 층은 남은 시간만큼만 기다린다. SRE 책의 표현은 이렇다.

{% citation google-sre-book at="Addressing Cascading Failures" %}
"Servers should check the deadline left at each stage before attempting to perform any more work on the request."
{% endcitation %}

단계마다 남은 기한을 확인한 뒤에 다음 작업을 하라는 것이다. 남은 시간이 0이면 호출을 아예 시작하지 않는다. gRPC의 deadline이 이 모델이다. 개념상 기한은 절대 시각이지만, gRPC는 서버 간 시계 차이를 피하려고 전파할 때 경과 시간을 뺀 남은 시간(timeout)으로 바꿔 보낸다([gRPC: Deadlines](https://grpc.io/docs/guides/deadlines/)). HTTP에서는 헤더로 직접 구현한다.

같은 원리가 재시도에도 적용된다. 남은 데드라인을 넘는 재시도는 하지 않는다. 결과를 받을 사람이 없기 때문이다. gRPC의 재시도도 호출 전체의 deadline을 넘겨 시도하지 않는다([gRPC: Retry](https://grpc.io/docs/guides/retry/)).

## 타임아웃만으로 부족할 때

재시도를 제약해도 상대가 완전히 죽어 있으면 매 요청이 타임아웃까지 기다린다. 그 대기가 우리 자원을 먹는다.

차단기(circuit breaker)가 이 대기를 줄인다. 실패율이 임계를 넘으면 회로를 열어 즉시 실패시키고, 주기적으로 프로브를 보내 회복을 확인한다. ParityPay 9편에서 죽은 기관에 보내는 요청이 370건에서 46건이 됐고, 대가는 복귀 지연 3.8초였다.

벌크헤드는 또 다른 축이다. 상대별로 동시 호출 수를 제한해 한쪽의 장애가 전체 자원을 먹지 못하게 한다. [스레드 고갈 실험](/posts/tomcat-thread-exhaustion/)에서 벌크헤드 permit 20개가 thread dump에 정확히 20개로 보였다.

세 장치가 제한하는 대상이 다르다. **타임아웃은 한 번의 대기를, 차단기는 반복되는 실패를, 벌크헤드는 동시 점유량을 제한한다.** 그래서 하나로 다른 둘을 대신할 수 없다.

## 이 설명이 깨지는 곳

- 타임아웃은 실패가 아니다. 상대가 처리했는데 응답만 유실됐을 수 있다. 결과를 모르는 상태이고, 재시도가 아니라 조회가 먼저다([ParityPay 3편](/posts/parity-pay-unknown-state/)).
- 파라미터에 근거가 있어야 한다. ParityPay 9편의 한계에 "벌크헤드 50과 차단기 값은 근거 있는 값이 아니다"를 적었다. [큐잉 이론](/posts/queueing-theory-for-servers/)이 그 근거를 세우는 출발점이다.
- 차단기가 열려 있는 동안의 요청도 상태를 갖는다. 기관에 도달하지 않았으므로 `UNKNOWN`이 아니라 `FAILED`다. 이 구분이 없으면 격리 장치가 복구 작업의 부하가 된다.
- 재시도가 없으면 리더 교체 같은 정상 동작이 장애로 보인다. 재시도를 없애는 것이 답은 아니다([합의 알고리즘](/posts/consensus-raft/)).

## 무엇을 재면 확인되는가

1. 재시도 전후로 상대가 받는 요청 수를 센다. 증폭 배수가 그대로 나온다.
2. 지터가 봉우리를 낮추는지 확인하려면 동기화된 폭주 조건을 만들어야 한다. 고른 도착에서는 차이가 없다.
3. 데드라인 전파를 켜고, 클라이언트가 포기한 뒤에도 하위 서비스가 계속 일하는지 본다.
4. 차단기 파라미터별로 복귀 시간과 거절 건수를 함께 잰다.

## 정리

- 타임아웃이 없으면 자원이 무한히 묶이고, 부하가 끝나도 회복되지 않는다.
- 재시도 증폭은 계층마다 곱해지므로 한 계층에서만 재시도하고, 횟수 대신 비율로 상한을 둔다.
- 지터는 동기화된 폭주를 흩는다. 상대가 계속 느린 조건에서는 총 부하를 줄이지 않는다.
- 데드라인을 전파하지 않으면 아무도 기다리지 않는 작업에 자원을 쓴다.

## 참고

- [AWS Builders' Library: Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [Marc Brooker, Exponential Backoff And Jitter (AWS Architecture Blog, 2015)](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Google SRE Book, Chapter 21: Handling Overload](https://sre.google/sre-book/handling-overload/)
- [Google SRE Book, Chapter 22: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [gRPC: Deadlines](https://grpc.io/docs/guides/deadlines/)
- [gRPC: Retry](https://grpc.io/docs/guides/retry/)
- [ParityPay 9편 - 외부기관 장애 격리](/posts/parity-pay-external-isolation/)
- [서킷 브레이커 정리](/posts/circuit-braker/)
