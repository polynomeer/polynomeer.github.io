---
title: "WebSocket push와 REST polling을 클라이언트 1만 개에서 재다 — 지연과 서버 비용, Kafka 정지 45초, 느린 소비자 25개"
date: 2026-07-08
categories: [Monticker, Experiment]
tags: [monticker, WebSocket, STOMP, Polling, Kafka, Load Testing, k6, Backpressure]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 23
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: published

problem_decision_result:
  problem: "monticker의 실시간 시세 경로는 STOMP push로 설계했지만(ADR-029·038) 그 선택을 수치로 뒷받침한 적이 없었다. 폴링이면 얼마나 비싼지, 한 서버가 몇 연결까지 버티는지, 브로커가 죽으면 사용자가 무엇을 보는지, 읽지 않는 클라이언트가 나머지를 얼마나 끌어내리는지 몰랐다."
  decision: "같은 시세 스트림을 WebSocket push와 REST polling(1s·500ms)으로 클라이언트 1,000·5,000·10,000개에 보내며 tick→client 지연과 서버 자원을 쟀다. Kafka를 30초 죽였다 살렸고, 읽지 않는 WebSocket 연결 1개와 25개를 정상 연결 1,000개 사이에 넣었다. 각 3회, p50/p95/p99."
  result: "같은 클라이언트 수에서 WebSocket은 폴링의 CPU 1/10~1/20이고 항상 더 최신이다. 폴링은 5,300 req/s에서 천장을 쳐 1만 명·0.5초는 요청의 95%를 버렸다. 한 서버의 상한은 Tomcat max-connections 8,192에서 조용히 막혔고 연결당 힙 140KB였다. Kafka 정지는 연결을 끊지 않되 45.7초 침묵과 인지된 유실 1,010건을 만들었다. 느린 연결 25개는 3초 안에 끊기는데도 모든 클라이언트를 p99 19초 멈췄고, 발행 스레드 풀을 50으로 늘리자 196ms가 됐다."
---

[GitHub 저장소](https://github.com/polynomeer/monticker) · 보고서 [reports/M-001.md](https://github.com/polynomeer/monticker/blob/main/reports/M-001.md)

monticker의 시세 경로는 Go `market-gateway`가 틱을 Kafka `market.ticks`에 발행하고, api가 그것을 구독해 100ms conflation 뒤 STOMP `/topic/stocks/{id}`로 push하는 구조다. push를 고른 이유는 [ADR-029](https://github.com/polynomeer/monticker/blob/main/docs/decisions/029-price-broadcast-pipeline.md)에 적혀 있지만, 폴링과 비교해 잰 적은 없었다. 이 글은 그 비교와, 그 구조가 어디서 깨지는지를 잰 기록이다.

먼저 정정할 것이 있다. 이 시리즈의 초기 글과 이 블로그의 실험 계획은 Netty 기반 broadcast-gateway와 Kafka → internal 자동 폴백을 전제했다. **둘 다 지금은 없다.** Netty 게이트웨이는 [ADR-033](https://github.com/polynomeer/monticker/blob/main/docs/decisions/033-remove-netty-broadcast-gateway.md)으로 제거됐고 WebSocket 경로는 api의 Spring STOMP(SimpleBroker) 하나다. `ingestion.source`는 정적 설정이고 internal 경로도 `market.ticks`를 거친다. 브로커는 Redpanda가 아니라 Apache Kafka 3.8.0(KRaft)이다. 실험은 실제 구조를 대상으로 했고, 그래서 "폴백 전환 시간"은 "Kafka가 죽었다 살아날 때 클라이언트가 보는 침묵·유실·재접속"으로 바뀌었다.

**이 저장소는 페이퍼 트레이딩 규모의 개인 프로젝트다.** 숫자는 로컬 한 대(호스트 JVM/Go + k6 + Docker VM 안의 Kafka/Redis/Postgres)에서 잰 것이고 운영 트래픽 검증이 아니다. 절대값보다 조건 간 비교로 읽어야 한다.

## 방법

| 항목 | WebSocket | Polling |
| --- | --- | --- |
| 틱 소스 | Go 게이트웨이, 202종목 × 1 tick/s → Kafka → api 브로드캐스트 | 같음 |
| 클라이언트 | k6 VU N개. STOMP CONNECT 후 관심종목 5개 구독, 60초 유지 | 도착률 모델: 요청률 = N × 5 / 간격. N=1,000·1s면 5,000 req/s. VU 풀 최대 3,000 |
| 지연 | tick→client = 수신 시각 − 틱 시각. **서버의 100ms conflation 포함** | staleness = 응답 수신 시각 − 응답의 틱 시각. 간격/2가 구조적으로 더해진다 |
| 서버 | api `-Xmx2g`, Tomcat 기본값(max-connections 8,192, max-threads 200), Hikari 10 | 같음. IP당 레이트리밋은 벤치 헤더로 우회 |

같은 머신이라 시계가 같다. k6·api·worker·게이트웨이·Kafka가 CPU를 나눠 썼다.

## WebSocket vs polling: 클라이언트 수를 늘리면

| 방식 | N | p50 | p99 | 달성 req/s | 못 보낸 요청 | api CPU (코어) | api 힙 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| WS | 1,000 | 48ms | 139~153ms | — | — | **0.1** | 731MB |
| poll 1s | 1,000 | 544ms | 1,040ms | 4,969 | 1,855 | 2.6 | 734MB |
| poll 500ms | 1,000 | 540ms | 1,041ms | 5,325 | 277,255 | 2.1 | 755MB |
| WS | 5,000 | 129ms | 271~338ms | — | — | **0.4** | 1,337MB |
| poll 1s | 5,000 | 554ms | 1,039ms | 5,473 | 1,168,910 | 2.1 | 1,254MB |
| poll 500ms | 5,000 | 555ms | 1,041ms | 5,387 | 2,673,738 | 2.1 | 1,317MB |
| WS | 10,000 | 229ms | 572~601ms | — | — | **0.4** | 1,759MB |
| poll 1s | 10,000 | 548ms | 1,038ms | 5,342 | 2,676,253 | 2.2 | 1,668MB |
| poll 500ms | 10,000 | 543ms | 1,040ms | 5,331 | **5,677,201** | 2.1 | 1,677MB |

각 3회. WS의 p50/p99는 tick→client, 폴링의 것은 staleness.

**같은 클라이언트 수에서 api CPU는 WS 0.1~0.4코어, 폴링 2.0~2.8코어다.** 10~20배. WS는 서버가 conflation 뒤 종목당 최대 10 msg/s를 밀고, N=10,000에서 초당 8만 9천 메시지를 0.4코어로 냈다. 폴링은 클라이언트가 관심종목 5개를 간격마다 당기므로 N=1,000·1s에 5,000 req/s가 필요하고, **api는 5,300~5,500 req/s에서 천장을 쳤다.** N을 올려도, 간격을 줄여도 달성 req/s는 그대로이고 나머지는 못 보냈다. N=10,000·500ms는 100,000 req/s가 필요한데 5,300만 나갔다. 요청의 95%가 부족했다. 폴링으로 1만 명에게 0.5초 신선도를 주는 것은 이 서버로 불가능하다.

천장의 원인은 CPU가 아니다. CPU는 2.1코어에서 더 오르지 않았고 HTTP p99는 820ms, k6 VU 3,000이 전부 대기에 묶였다. 매 요청이 종목 조회(JPA, 캐시 없음)와 Redis 최신가 조회를 하므로 Hikari 10·Tomcat 200에서 직렬화된다. 폴링을 굳이 쓴다면 종목 캐시와 배치 엔드포인트가 필요한데, 그것은 WS가 이미 하는 일을 재발명하는 것이다.

신선도도 갈린다. WS tick→client p50은 N=1,000 48ms → 10,000 229ms(conflation 100ms 포함)이고, 폴링 staleness p50은 간격과 무관하게 약 540ms다. 간격/2 + 처리다. 1초 폴링이든 WS든 **WS가 항상 최신이고 더 싸다.** 결론은 저장소의 기존 결정을 지지한다. 다만 이 실험 전에는 "지지한다"가 아니라 "그럴 것이다"였다.

## 한 서버의 두 벽: 8,192와 140KB

WS N=10,000에서 연결 실패가 7,248~14,823회(재시도 포함) 났다. `netstat`로 센 ESTABLISHED 소켓이 16,584개, localhost라 양끝이 잡히므로 **8,292 연결**이다. Tomcat `max-connections` 기본값 8,192다. 넘친 클라이언트는 조용히 accept되지 못하고 k6가 재시도했다. 서버 로그에는 아무것도 없다.

`server.tomcat.max-connections=20000`으로 바꾸자 3회 모두 실패 0, 초당 8만 9천 메시지. 그런데 이 값은 공짜가 아니다. **연결당 api 힙 약 140KB**로, N=1,000 730MB → 5,000 1,340MB → 8,200 1,760~1,960MB(`-Xmx2g` 근처)다. 그래서 `-Xmx3g`와 함께 올렸다. `max-connections`는 반드시 힙과 같이 정해야 하고, 진짜 확장은 세로가 아니라 api pod를 늘리는 것이다. 그것은 [ADR-038](https://github.com/polynomeer/monticker/blob/main/docs/decisions/038-broadcast-consumer-partition-assignment.md)이 풀어 둔 문제다(브로드캐스트 컨슈머가 컨슈머 그룹 없이 전 파티션을 받으므로 pod를 늘려도 모든 pod가 모든 틱을 받는다). 이 실험이 못 박은 것은 **한 pod의 현실적 상한이 약 8,000 동시 연결**이라는 숫자다.

## Kafka가 30초 죽으면 사용자는 무엇을 보는가

WS 1,000연결 + 관측 연결 1개. Kafka를 `docker kill`, 30초 뒤 `docker start`. 게이트웨이는 틱마다 종목별 시퀀스를 붙여 worker 쪽에서 gap을 셀 수 있게 했다.

| run | 침묵 (마지막 수신 → 재개) | `docker start` → 재개 | 게이트웨이 발행 실패 | worker 시퀀스 gap | WS 연결 유지 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | **45.7초** | 15.3초 | 1,010 | 1,010 | 100% |
| 2 | **45.7초** | 15.4초 | 1,010 | 1,010 | 100% |
| 3 | **45.7초** | 15.3초 | 1,010 | 1,010 | 100% |

**모든 시세가 45.7초 멈췄다.** 30초는 주입한 정지, 나머지 15초는 `docker start` 뒤 브로커가 healthy가 되고(+22~23초) 컨슈머가 재연결하는 시간이다. WS 연결 자체는 100% 유지됐다. api는 살아 있고 틱만 안 왔다. 사용자는 **"연결은 됐는데 값이 안 변하는" 화면을 45초 본다.** 연결 상태 표시만으로는 이 장애를 알 수 없다.

유실은 1,010건이고 세 숫자가 정확히 일치한다. 게이트웨이의 발행 실패 1,010(connection refused 606·reset 263·EOF 141) = worker의 시퀀스 gap 1,010. 이것이 **인지된 유실**인 이유는 다음 글에서 다룰 결함 D-M2-01을 먼저 고쳤기 때문이다. 게이트웨이의 kafka-go Writer가 `acks=0`이었고, 그 상태였다면 발행 실패를 게이트웨이가 알지 못해 유실이 조용했을 것이다. 지금은 알되 재시도 큐잉이나 로컬 버퍼가 없어 그대로 버린다. 페이퍼 트레이딩·mock 틱에서는 다음 틱이 1초 뒤 오므로 감수하고, 실제 체결가라면 게이트웨이에 버퍼와 복구 후 재발행이 있어야 한다.

자동 복구는 확인됐다. worker의 `@KafkaListener`와 api의 브로드캐스트 컨슈머(10초 재시도 루프) 모두 재기동 없이 스스로 다시 붙었다.

## 읽지 않는 클라이언트 25개가 나머지 1,000개를 멈춘다

정상 WS 1,000연결에, 핸드셰이크 뒤 소켓 읽기를 멈춘 연결 SLOW개(각 202종목 × 5 구독 ≈ 1,000 msg/s)를 15초에 투입했다.

| 느린 연결 | 느린 세션 끊김 | 정상 클라이언트 p50 | 정상 p99 | 정상 최대 침묵 p99 |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 3초 | 119ms | 158~179ms | 1.1초 |
| 25 | 3~4초 | 128ms | **17,239~19,462ms** | **~20초** |

느린 연결 1개는 무해했다. 3초 만에 send 버퍼 한도(512KB)에서 끊기고 정상 클라이언트는 그대로다. 그런데 **25개는 모든 정상 클라이언트를 p99 17~19초 멈췄다.** 3회 모두. 느린 세션은 여전히 3~4초에 끊기는데도.

첫 시도는 실패했다. `sendTimeLimit` 10초 → 2초, 버퍼 512KB → 256KB. 세션은 여전히 3초에 끊겼지만 정상 p99는 그대로 17~19초였다. **한도는 "나쁜 세션을 언제 끊나"를 정할 뿐, 끊기 전까지 발행 스레드가 붙잡히는 것을 막지 못한다.**

원인은 발행 스레드 풀이었다. `PriceBroadcaster` → `clientOutboundChannel`의 기본 풀 크기가 코어 수 10인데 느린 세션이 25개다. 풀이 느린 세션의 send로 다 차면 정상 클라이언트로 갈 메시지가 큐에 쌓인다. `outbound-core-pool-size=50`으로 늘리자 정상 p99 **191~196ms**, 최대 침묵 약 1.1초. 20초에서 0.2초다.

| 상태 | 정상 p99 |
| --- | ---: |
| 기본 (한도 10s/512KB, 풀 10) | 17,239~19,462ms |
| 한도만 2s/256KB | 17,880~19,258ms |
| 한도 + 풀 50 | **191~196ms** |

완전한 격리는 아니다. 풀이 느린 소비자 수보다 크다는 전제 위에 있고, 풀 크기는 "느린 소비자 예산"으로 운영에서 잡아야 한다. 근본 격리는 세션별 send 비동기화와 이미 있는 종목 conflation의 조합이다. [parity-pay 9편](/posts/parity-pay-external-isolation/)의 벌크헤드와 같은 모양의 문제다. 느린 상대 때문에 잃는 것을 일부로 한정하고 나머지를 지키려면, 공유 자원에 상한이 있어야 한다.

## 결함과 기본값 변경

이 실험과 다음 글의 실험이 바꾼 기본값 다섯 개(게이트웨이 acks, worker 세션 타임아웃·어사이너, Tomcat `max-connections`, WS outbound 풀)는 [ADR-050](https://github.com/polynomeer/monticker/blob/main/docs/decisions/050-realtime-pipeline-defaults-from-load-tests.md)로 묶여 있다.

| 번호 | 무엇 | 조치 |
| --- | --- | --- |
| D-M1-01 | 폴링은 이 서버에서 5,300 req/s 천장. 1만 명·0.5초 불가 | 설계 관찰. WS push 유지 |
| D-M1-02 | 한 pod의 동시 WS 연결이 `max-connections` 8,192에서 조용히 막힘 | 설정화(기본 20,000), `-Xmx`와 함께 조정 |
| D-M1-04 | 느린 연결이 발행 풀(코어 수)보다 많으면 전체가 p99 19초 | send 한도 2s/256KB + `outbound-core-pool-size` 설정 |

## 한계

- **같은 머신에서 k6가 부하를 만들었다.** 폴링 조건에서는 k6가 5,000 req/s를 만드느라 CPU를 많이 썼다. 절대값이 아니라 조건 간 비교로 읽어야 한다.
- **api·worker·게이트웨이는 호스트 프로세스라 리소스 상한이 없다.** Kafka·Redis·Postgres만 컨테이너 제한을 걸었다.
- **WS 지연에는 100ms conflation이 포함돼 있다.** 순수 전송 지연이 아니라 "설계된 경로의 지연"이다.
- **단일 pod, SimpleBroker다.** 외부 브로커 릴레이나 다중 pod 구성은 재지 않았다.
- **Kafka 정지 실험의 유실은 게이트웨이 버퍼가 없는 현재 구조의 값이다.** 버퍼를 붙이면 유실 0이 되겠지만, 그 대신 45초치 틱이 한꺼번에 밀려오는 다른 문제가 생긴다.

## 이 실험이 시리즈에 대해 말하는 것

이 시리즈의 [Kafka 파이프라인 글과 Netty 브로드캐스트 글](https://github.com/polynomeer/monticker/blob/main/docs/decisions/005-kafka-go-gateway-netty-broadcast.md)은 지금 공개 목록에 없다. 아키텍처를 설명했을 뿐 측정이 없었고, 그중 일부(Netty 게이트웨이)는 이후 제거됐기 때문이다. 이 글은 그 반대다. 설계 배경은 ADR 링크로만 두고, 실제로 남아 있는 구조에서 잰 숫자만 적었다.

실험 전에 "STOMP push가 맞다"는 것은 상식이었다. 실험 뒤에 알게 된 것은 그 상식 안에 있던 세 개의 빈칸이다. 한 서버의 상한(8,192, 140KB/연결), 브로커 장애 시 사용자가 보는 것(연결은 됐는데 45초 침묵), 그리고 느린 클라이언트가 공유 자원을 통해 전체를 끌어내리는 경로(풀 10 < 느린 연결 25). 셋 다 기본값 하나씩이었고, 셋 다 부하를 걸기 전에는 보이지 않았다.

## 정리

- 같은 클라이언트 수에서 WS는 폴링의 CPU 1/10~1/20이고 항상 더 최신이다. 폴링은 5,300 req/s에서 천장을 치고, 병목은 CPU가 아니라 커넥션 풀·스레드 대기다.
- 한 pod의 WS 상한은 Tomcat `max-connections` 8,192에서 조용히 온다. 연결당 힙 140KB라 `max-connections`는 `-Xmx`와 함께 정해야 하고, 그 위는 pod 증설이다.
- Kafka 정지는 연결을 끊지 않는다. 대신 45.7초 침묵과 인지된 유실 1,010건이다. 연결 상태만으로는 장애를 알 수 없다.
- 읽지 않는 연결 25개가 전체를 p99 19초 멈췄다. 세션을 3초에 끊는 한도로는 못 막고, 발행 스레드 풀이 느린 소비자 수보다 커야 한다. 20초 → 0.2초.
- 세 빈칸이 전부 기본값이었다. 부하를 걸기 전에는 기본값이 결정이라는 것을 모른다.
