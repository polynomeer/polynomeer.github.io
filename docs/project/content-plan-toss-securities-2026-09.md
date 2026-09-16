# 콘텐츠 계획 2026-09 (2) — 증권·트레이딩 백엔드 관점 보완

작성일: 2026-09-15
입력: `~/Documents/토스증권_기술블로그_가이드.md`(토스증권 서버 포지션 기준 주제 가이드), `docs/project/content-plan-2026-09.md`(이력서 bullet 기준 계획, 이하 "1차 계획"), `polynomeer/career-hub`의 `interview-prep/toss-securities-2026-08.md`, 공개 저장소 `parity-pay`·`monticker`·`sys-drill`·`quno`, 이 블로그의 공개 글 목록.

1차 계획은 "이력서가 주장하는 것을 블로그가 뒷받침하는가"를 기준으로 삼았다. 이 문서는 반대 방향에서 본다. **타깃 공고가 요구하는 능력 목록을 기준으로, 블로그가 이미 증명한 것·절반만 증명한 것·아직 없는 것을 가르고, 없는 것 중 무엇을 실험으로 만들어 쓸지 정한다.**

## 0. 결론 요약

가이드가 요구하는 증명은 한 문장이다. "대규모 트래픽, 동시성, 데이터 정합성, 실시간 처리, 장애 대응을 직접 실험하고 기술 선택의 근거를 설명할 수 있다." 현재 블로그를 이 기준으로 대조하면:

1. **동시성·정합성·멱등성·unknown outcome은 이미 강하다.** 최우선 12개 중 1·2·8·12번은 실무 글(대량 배치 4·5부, 정산 중 수정 차단, Heap Dump)과 parity-pay 1~4편이 "실패를 재현하는 코드와 수치"까지 갖추고 있다. 이 축에서 새 글을 더 쓰는 것보다 parity-pay 시리즈의 남은 3편(Outbox·원장·대사)을 끝내는 편이 낫다. 원고는 저장소의 ADR과 보고서에 이미 있다.
2. **이벤트 처리(Kafka)와 장애 격리(Resilience)는 "구현은 있으나 실험 글이 없다."** parity-pay는 Transactional Outbox와 멱등 소비자를 Kafka 위에 구현했고 mock PG·mock 은행이 있어 장애 주입이 가능하다. 가이드 3·4·10번은 새 프로젝트 없이 parity-pay 안에서 실험을 추가해 쓸 수 있다.
3. **JVM·Tomcat·커넥션 풀 고갈, p99 기반 병목, 관측성은 비어 있다.** 실무 글 중 Heap Dump 한 편이 유일한 앵커다. 가이드 시리즈 3 "운영 가능한 Spring 서버"에 해당하는 작은 실험 저장소가 필요하다. 이 축은 실무 수치를 인용할 수 없으므로 전부 재현 실험이어야 한다.
4. **실시간 시세(WebSocket·종목별 순서·backpressure)는 자산이 있지만 봉인돼 있다.** monticker의 Kafka·Netty·Go 게이트웨이 글 3편이 `archived`다. career-hub의 2026-08-16 결정("면접에서 방어하기 어려운 세부는 이력서에서 뺀다")과 충돌하므로 되살리지 않는다. 시세 축은 "측정이 붙은 실험 글" 두 편으로 한정하고, 시세팀을 명시적으로 지원할 때만 진행한다.
5. **샤딩·Vitess, Kubernetes 배포, CDC·Debezium, FIX, AI 제품 서버는 쓰지 않는다.** 실무·개인 프로젝트 어디에도 근거가 없고, 개념 요약 글은 가이드가 명시적으로 피하라고 한 유형이다.

우선순위는 **parity-pay 완결(실험 없음) → parity-pay 위 장애 실험(Kafka·격리) → Spring 운영 실험 시리즈 신설 → 시세 실험(조건부)** 순이다.

## 1. 최우선 12개 대조표

가이드 §"최우선 추천 12개"를 현재 자산과 1:1로 대조했다. "상태"는 공개 글 기준이고, `archived`·`draft` 글은 없는 것으로 친다.

| # | 가이드 제목 | 상태 | 이미 있는 것 | 비어 있는 것 | 재료 |
| --- | --- | --- | --- | --- | --- |
| 1 | Redis 분산락만으로 재고·잔고 정합성을 보장할 수 있을까 | 절반 | 대량 배치 4부(락이 있어도 레이스), 5부(배타적 락 + 조건부 해제), parity-pay 2편(조건부 원자 UPDATE vs FOR UPDATE 실측) | 락 lease가 트랜잭션보다 먼저 만료되는 상황의 재현, fencing token으로 만료된 소유자의 쓰기를 막는 실험 | 지분율 시스템의 SETNX + Lock Token 설계(facts), parity-pay 지갑 |
| 2 | 외부 주문 API의 응답을 잃었을 때 성공과 실패를 어떻게 판단할까 | 완료 | parity-pay 3편(UNKNOWN 보존과 수렴), 결제대행 연동 2021 회고 | 대사(reconciliation)로 "기관에 못 물어봄"과 "기관에 기록 없음"을 구분하는 코드 — 1차 계획 B6 | parity-pay `reconciliation/`, `docs/09-consistency-recovery.md` |
| 3 | Kafka에서 중복·유실·순서 역전을 직접 재현하고 해결하기 | 없음 | parity-pay 멱등 소비자(ADR-006), MDS SQS 파이프라인 글(메시지 ID 멱등) | 재현 실험 자체. 특히 순서 역전과 offset commit 실패 | parity-pay Kafka + Testcontainers |
| 4 | 주문 시스템을 Transactional Outbox로 개선하기 | 원고 있음 | parity-pay ADR-005, `api/outbox/` 14개 파일, 4편에서 Outbox 관련 실험 4건 언급 | 글 — 1차 계획 B5 | parity-pay |
| 5 | WebSocket 시세 서버를 구축하고 장애 시 Polling으로 전환하기 | 봉인 | monticker Netty 브로드캐스트 글(archived) | 측정(latency·연결 수·fallback 전환 시간) | monticker `broadcast-gateway`, `ingestion.source` 피처 플래그 |
| 6 | 초당 N만 건 이벤트를 종목별 순서를 지키며 처리하기 | 봉인 | monticker Kafka 파이프라인 글(archived), 종목 202개 goroutine 수집 글(archived) | 파티션 키 설계와 순서 보장의 실측 | monticker `market.ticks` 토픽 |
| 7 | CQRS Read Model의 지연과 데이터 불일치를 검증하는 방법 | 절반 | JSP 전환기 3편(CQRS 도입), Shadow Release 글(MyBatis·QueryDSL 결과 대조) | 지연·불일치를 검증하는 검증기 자체. parity-pay 대사(B6)가 원장 ↔ 스냅샷 관점에서 같은 문제를 다룸 | parity-pay ADR-008(잔고 스냅샷) |
| 8 | Spring Boot 장애를 thread dump와 heap dump로 분석하기 | 절반 | Heap Dump → Chunk 글(실무, MAT) | thread dump 편. Tomcat·HikariCP 고갈을 재현하고 BLOCKED·WAITING을 읽는 글 | 신규 실험 저장소 |
| 9 | p95·p99 latency를 기준으로 API 병목 개선하기 | 절반 | parity-pay 2편(p95 실측, "측정 방법이 결론을 만들 뻔했다") | API 레벨 부하 도구(k6 등)로 p50/p99 분리, coordinated omission | 신규 실험 저장소 또는 parity-pay |
| 10 | Resilience4j로 Rate Limiter와 Circuit Breaker를 설계하기 | 절반 | monticker Circuit Breaker 글, 개념 노트(Circuit Breaker, Bulkhead, Single Flight) | 상태 전이를 직접 실험한 글, Rate Limiter 알고리즘 비교 실측, 외부기관 장애 격리 | parity-pay mock PG에 장애 주입 |
| 11 | Grafana 알림에 장애 원인 context를 포함해 MTTR 줄이기 | 없음 | monticker OpenTelemetry + Jaeger 글 | 알림 설계 경험 전부 | 신규 실험 저장소 |
| 12 | MSA 환경에서 계좌 단위 트랜잭션을 안전하게 처리하기 | 원고 있음 | parity-pay 1편(불변조건), 정산 중 수정 차단 글, 이벤트 소싱 원장 글(archived) | 이중부기 원장을 DB 제약·트리거로 강제하는 글 — 1차 계획 B2 | parity-pay ADR-003·004·008·009, `shared/money` |

가이드는 "이 중 4~6개를 코드·테스트·수치까지 포함해 작성"을 권한다. 지금 그 기준을 충족하는 글은 2번과 1·12번의 절반이다. 아래 계획을 끝내면 1·2·3·4·8·9·10·12번 여덟 개가 기준을 충족한다.

## 2. 이 계획에서 지키는 글의 형태

가이드 §"글 하나의 권장 구성" 10단계를 이 블로그의 Problem → Decision → Result 카드 위에 얹는다. 모든 글에 10단계를 다 쓰지는 않되, **실험 글은 다음 다섯 가지를 빠뜨리지 않는다.**

1. 실패를 재현하는 코드 또는 테스트 — 정상 흐름만 있는 글은 쓰지 않는다.
2. 검토한 대안 2~3개와 고르지 않은 이유.
3. 측정 환경(하드웨어, 데이터 규모, 반복 횟수, 워밍업)과 백분위(p50·p95·p99). 평균만 있는 표는 싣지 않는다.
4. 선택한 방법의 한계와 운영 환경이라면 추가로 필요한 것.
5. 실무 경험과의 관계 한 단락. 개인 프로젝트를 실무로 오해시키지 않는다(1차 계획 §4).

가이드 §"피하는 것이 좋은 글"에 걸리는 글은 시작하지 않는다. 특히 "실제로 실행하지 않은 아키텍처를 구현한 것처럼 표현한 글"은 monticker 봉인 글이 위험한 이유이기도 하다.

## 3. 트랙별 작업 항목

### Track P — parity-pay 완결 (실험 없음, 원고 재편집)

1차 계획 Tier B의 남은 3편이다. 가이드 시리즈 1 "안전한 주문 시스템 만들기" 10단계 중 parity-pay가 이미 통과한 단계를 표시하면:

| 시리즈 1 단계 | parity-pay 대응 | 글 |
| --- | --- | --- |
| 1 상태 머신 설계 | `docs/06-domain-state-design.md`, ADR-007 | 1편·3편 |
| 2 Lost Update 재현 | 8 스레드 × 5 결제 벤치마크 | 2편 |
| 3 분산락 + 낙관적 락 | 조건부 원자 UPDATE(ADR-004) — 분산락은 쓰지 않기로 결정 | 2편 |
| 4 외부 응답 유실과 멱등성 | UNKNOWN 상태(ADR-007), `shared/idempotency` | 3편 |
| 5 Transactional Outbox | ADR-005, `api/outbox/` | **P1** |
| 6 Kafka 중복 소비 방지 | ADR-006 | **P1** |
| 7 대사 배치 | `reconciliation/` | **P2** |
| 8 Rate Limiter·Circuit Breaker | 없음 | Track F |
| 9 장애 주입과 모니터링 | 실험 26종 | 4편 |
| 10 부하 테스트와 한계 | 부분 | Track F·S |

| # | 제목 (가제) | 가이드 대응 | 원고 위치 | 가이드가 요구하는 추가 재료 |
| --- | --- | --- | --- | --- |
| P1 | ParityPay 5 - DB commit과 Kafka 발행 사이: Transactional Outbox와 at-least-once 소비자 | 최우선 4·3, §2 "Kafka 발행 성공·DB commit 실패", §3 "Consumer 처리 성공 후 offset commit 실패" | ADR-005·006, 보고서 §6, 4편의 Outbox 실험 4건 | relay 지연 실측(폴링 주기별 p95), 같은 이벤트가 두 번 소비될 때 멱등 소비자가 막는 테스트 코드 |
| P2 | ParityPay 6 - 대사: "기관에 물어보지 못했다"와 "기관에 기록이 없다"는 다른 상태다 | 최우선 2·7, §2 "일 배치 대사와 실시간 검증기 비교", §5 "원장과 Read Model 불일치 검증기" | `docs/09-consistency-recovery.md`, `reconciliation/` | 불일치 유형 분류표, 각 유형의 자동 수렴 가능 여부 |
| P3 | ParityPay 7 - 애플리케이션 코드를 믿지 않는 원장: 이중부기를 DB 제약과 정정 거래로 강제하기 | 최우선 12, §2 원장 설계 항목 전부(append-only, 잔고 상태 vs 거래 내역, 정정 거래, BigDecimal scale) | ADR-003·008·009, `docs/07-ledger-journal-catalog.md`, `shared/money` | 제약을 우회하려는 테스트가 실제로 실패하는 로그, 스냅샷과 재계산 잔고를 대조하는 코드 |

P3의 "실무 경험과의 관계"는 MDS 경량 락이 애플리케이션 레벨 정합성이었고 race window가 남았다는 1차 계획 B2 문장을 그대로 쓴다.

### Track F — parity-pay 위 장애 실험 (새 실험, 새 저장소 없음)

parity-pay에는 mock PG(`api/mockpg`, `io/parity/mockpg`)와 mock 은행이 있고 Testcontainers로 Kafka·PostgreSQL을 띄운다. 가이드 3·10번은 이 위에 실험을 추가하면 된다. 각 실험은 저장소에 테스트 또는 벤치마크로 먼저 커밋하고, 글은 그 커밋을 가리킨다.

| # | 제목 (가제) | 가이드 대응 | 실험 설계 | 확인할 것 |
| --- | --- | --- | --- | --- |
| F1 | Kafka에서 중복·유실·순서 역전을 직접 만들어 보기 — 결제 이벤트로 재현한 세 가지 | 최우선 3, §3 "순서는 어디까지 보장되는가", "Rebalance 중 메시지 처리", "수동 commit과 자동 commit의 장애 시 차이", "Poison Message" | (a) 처리 후 offset commit 전에 프로세스 kill → 중복, (b) `acks=1`에서 브로커 강제 종료 → 유실, (c) 지갑 ID를 키로 쓰지 않은 producer → 같은 지갑 이벤트 순서 역전. 각 경우 멱등 소비자·outbox가 무엇을 막고 무엇을 못 막는지 표로 | 파티션 수, consumer 수, 반복 횟수 |
| F2 | 락 lease가 트랜잭션보다 먼저 끝나면 정말 정합성이 깨지는가 — SETNX 락과 fencing token 실험 | 최우선 1, §1 분산락 항목 대부분("lease 만료", "Watchdog이 해결하지 못하는 것", "fencing token", "분산락 없는 구조") | parity-pay 지갑에 Redis 락 경로를 실험용으로 추가. TTL을 트랜잭션보다 짧게 두고 GC pause를 흉내 낸 sleep으로 만료 유도 → 두 소유자 동시 쓰기 재현 → 버전(fencing token) 비교로 차단. 마지막에 "조건부 원자 UPDATE만으로 같은 문제가 안 생긴다"를 같은 조건에서 대조 | 지분율 시스템의 Lock Token이 정확히 무엇을 막았고 무엇을 못 막았는지 facts와 대조. Redis는 실험용이며 parity-pay 본 설계에 넣지 않는다는 점을 글에 명시 |
| F3 | 외부기관이 느려질 때 결제 서버를 지키기 — 타임아웃·Circuit Breaker·Rate Limiter를 mock PG 장애로 검증 | 최우선 10, §8 "Timeout 없는 외부 API 호출", "Retry Storm", "jitter", "Bulkhead", "Failover와 Fallback의 차이" | Toxiproxy(sys-drill ADR-0015에서 이미 씀)로 mock PG에 latency·timeout 주입. (a) 타임아웃 없음 → Tomcat 스레드 고갈, (b) 재시도만 → retry storm, (c) Circuit Breaker 상태 전이(CLOSED→OPEN→HALF_OPEN) 로그와 시간, (d) Rate Limiter 알고리즘 2종(token bucket vs sliding window) 비교. UNKNOWN 상태(3편)와 결합해 "OPEN 상태에서 들어온 결제는 무엇이 되는가" | monticker Circuit Breaker 글과 겹치지 않게, 이 글은 "상태 전이의 실측"에 집중 |

F3의 (a)는 Track S의 첫 글과 같은 현상을 다른 각도에서 본다. F3을 먼저 쓰고 S1에서 thread dump로 깊이 들어가는 순서가 자연스럽다.

### Track S — 운영 가능한 Spring 서버 (새 실험 시리즈)

가이드 시리즈 3에 해당한다. 실무 근거는 batch-excel-optimization의 Heap Dump·GC 로그·Thread Dump 분석 한 줄뿐이므로 **전부 재현 실험이어야 하고, 실무 수치를 인용하지 않는다.** 작은 저장소 하나(`spring-ops-lab` 가제: Spring Boot + PostgreSQL + Toxiproxy + k6 + Prometheus/Grafana, docker compose)를 만들고 글마다 시나리오를 하나씩 추가한다. `sys-drill`에 이미 있는 Toxiproxy·real-infra 파일럿(ADR-0013~0018)을 재사용할 수 있으면 별도 저장소를 만들지 않는다.

| # | 제목 (가제) | 가이드 대응 | 실험 |
| --- | --- | --- | --- |
| S1 | CPU는 놀고 있는데 API가 느리다 — Tomcat 스레드 고갈을 thread dump로 읽기 | 최우선 8, §7 "Tomcat Thread Pool 고갈 재현", "요청 latency와 thread 수의 관계", "BLOCKED·WAITING 분석" | 느린 외부 호출 1개가 전체 API를 멈추는 과정. `jstack` 3회 간격 캡처, 상태별 스레드 수 표, 원인 스택 특정 |
| S2 | HikariCP 커넥션 풀 고갈 — pool size를 "늘리면" 왜 더 나빠지는가 | §7 "DB Connection Pool 고갈 원인 분석", "HikariCP pool size를 결정하는 방법", §6 "`REQUIRES_NEW`가 connection pool을 고갈시키는 과정", "외부 API 호출을 DB 트랜잭션 안에서 하면 안 되는 이유" | 트랜잭션 안 외부 호출 + `REQUIRES_NEW` 중첩으로 데드락성 고갈 재현. pool size 10/20/50에서 p99와 DB 측 대기 비교 |
| S3 | p50은 정상인데 p99만 느리다 — 부하 테스트에서 coordinated omission을 피하는 법 | 최우선 9, §7 "p50은 정상인데 p99만 느려지는 원인", "Coordinated Omission", "평균 응답 시간이 성능 지표로 부족한 이유" | 같은 서버를 closed-model(스레드 고정)과 open-model(arrival rate 고정)로 측정해 p99가 갈리는 표. GC pause 주입으로 p99 꼬리 만들기 |
| S4 | 무중단 배포 중 요청이 사라지는 순간 — Spring Boot graceful shutdown과 Kafka consumer 종료 | §10 "Rolling Update 중 요청 유실", "graceful shutdown과 terminationGracePeriodSeconds", "Consumer Pod 종료 시 Rebalance 최소화", §3 "graceful shutdown" | docker compose 스케일로 재현(Kubernetes 없이). SIGTERM 후 in-flight 요청·미커밋 offset의 운명을 시나리오별로 |
| S5 | 기술 지표는 정상인데 결제가 실패한다 — 비즈니스 메트릭과 알림 context 설계 | 최우선 11, §9 "기술 지표는 정상인데 주문이 실패하는 상황 탐지", "알림에 context 포함", "5분 걸리던 장애 탐지를 1분으로" | parity-pay 위에서 진행. RED 지표는 정상인데 UNKNOWN 비율만 오르는 장애를 만들고, 알림 규칙과 알림 본문 설계 비교 |

S5는 Track F와 parity-pay를 공유하므로 F3 뒤에 둔다. S1~S4가 새 저장소를 요구하는 진짜 신규 투자다.

### Track M — 실시간 시세 (조건부, 2편 상한)

가이드 시리즈 2에 해당하고 monticker에 코드가 있다. 그러나 다음 세 가지 때문에 조건부로 둔다.

- career-hub 2026-08-16 결정: Kafka·Go·Netty 세부는 이력서에서 제외. 봉인 글 3편을 되살리면 결정과 충돌한다.
- `toss-securities-2026-08.md` Q4~Q5의 답변 자체가 "실제 트래픽 규모가 요구해서가 아니라 학습·재현 목적"이다. 측정 없는 글은 가이드의 "실행하지 않은 아키텍처" 경고에 걸린다.
- 시세팀이 아닌 서버 포지션이라면 Track P·F가 더 직접적이다.

그래서 **시세팀 포지션을 명시적으로 지원할 때만**, 봉인 글을 되살리는 대신 측정이 붙은 새 글 두 편을 쓴다.

| # | 제목 (가제) | 가이드 대응 | 실험 |
| --- | --- | --- | --- |
| M1 | WebSocket과 Polling의 latency·서버 부하 비교, 그리고 fallback 전환 시간 | 최우선 5 | monticker `ingestion.source` 플래그와 broadcast-gateway로 연결 수 1k/5k/10k에서 p99 push latency, Kafka 중단 시 polling 전환까지 걸린 시간 |
| M2 | 종목별 순서를 지키면서 병렬로 처리하기 — 파티션 키와 consumer 수의 실측 | 최우선 6 | `market.ticks` 파티션 수 × consumer 수 격자에서 처리량과 순서 위반 건수 |

M을 진행하면 봉인된 Kafka·Netty 글은 그대로 두고, 새 글에서 "설계 배경은 저장소 ADR 참고"로만 연결한다.

### 쓰지 않는 것

| 가이드 영역 | 이유 |
| --- | --- |
| §5 샤딩·Vitess | 실무·개인 프로젝트에 근거 없음. 개념 글은 가이드가 피하라는 유형 |
| §5 CDC·Debezium | Outbox polling 방식(P1)에서 "CDC와의 비교" 한 절로 다루는 데서 그친다 |
| §10 Kubernetes | S4에서 docker compose로 대체. HPA·PDB·Topology Spread는 쓰지 않음 |
| §4 FIX·UDP multicast | 근거 없음 |
| §6 Kotlin Coroutine | quno·sys-drill·monticker가 Kotlin이지만 코루틴 실험은 없음. 필요하면 S 시리즈 이후 |
| §12 증권 도메인 모델링 | monticker CLOB·리스크 게이트 글이 archived. 규정 검증이 필요한 영역이라 보류 |
| §13 AI 제품 서버 | sys-drill의 "AI 응답을 고정 필드로만 읽고 서버가 총점 재계산" 하나가 유일한 근거. 지원 포지션이 AI Silo일 때 한 편으로 검토 |

## 4. 우선순위와 일정

**진행 상황 (2026-09-16 갱신)**

| 항목 | 상태 | 산출 |
| --- | --- | --- |
| P1 Outbox·멱등 소비자 | 완료 | `/posts/parity-pay-outbox/` (5편) |
| P2 대사 | 완료 | `/posts/parity-pay-reconciliation/` (6편) |
| P3 이중부기 원장 | 완료 | `/posts/parity-pay-ledger/` (7편) |
| F1 Kafka 중복·유실·순서 역전 | 완료 | parity-pay reports/11 M-015~018, 결함 M 발견·수정. `/posts/parity-pay-kafka-failures/` (8편) |
| F3 외부기관 장애 격리 | 완료 | parity-pay reports/11 M-019~023, 결함 N 발견·수정, ADR-014로 벌크헤드·차단기 기본값 채택. `/posts/parity-pay-external-isolation/` (9편) |
| F2 락 lease 만료·fencing token | 대기 | 다음 위임 대상 |
| Track S | **별도 프로젝트로 분리** | 설계는 `spring-ops-lab-design.md`에 있고, 실행은 이 계획 밖에서 별도 저장소로 진행한다. 이 문서의 11~20주차 일정은 무효 |
| Track M | 조건부 유지 | — |
| 표면 반영 | P1~P3·F1·F3분 완료 | 대표 글, 시리즈 3그룹, 역량 맵 `payment-consistency` 노드, `portfolio.yml`, GitHub README, career-hub `facts/side-projects/parity-pay.md` |


1차 계획 12주가 끝난 뒤(C1·C2·A6·A7까지 완료된 현재 시점) 이어지는 일정이다. 주 1편 상한은 유지한다. Track F·S는 실험이 붙으므로 글 한 편에 2주를 잡는다.

| 주차 | 작업 | 산출 |
| --- | --- | --- |
| 1 | P1 Outbox·멱등 소비자 | 글 1 |
| 2 | P2 대사 | 글 1 |
| 3 | P3 이중부기 원장 | 글 1 — parity-pay 시리즈 7편 완결 |
| 4~5 | F1 Kafka 중복·유실·순서 역전 | 실험 커밋 + 글 1 |
| 6~7 | F3 타임아웃·Circuit Breaker·Rate Limiter | 실험 커밋 + 글 1 |
| 8~9 | F2 락 lease 만료·fencing token | 실험 커밋 + 글 1 |
| 10 | 표면 반영(§5) | 대표 글·역량 맵·README 갱신 |
| 11~12 | S1 Tomcat 고갈·thread dump (저장소 신설 포함) | 저장소 + 글 1 |
| 13~14 | S2 HikariCP 고갈 | 글 1 |
| 15~16 | S3 p99·coordinated omission | 글 1 |
| 17~18 | S4 graceful shutdown | 글 1 |
| 19~20 | S5 비즈니스 메트릭 알림 | 글 1 |
| 조건부 | M1·M2 | 시세팀 지원 확정 시 F 트랙 뒤로 끼워 넣음 |

지원 일정이 앞당겨지면 **1~7주(P1~P3, F1, F3)** 까지만 끝낸다. 이 다섯 편으로 최우선 12개 중 2·3·4·10·12번이 "코드·테스트·수치" 기준을 충족하고, 1·8·9번은 절반 상태로 남는다.

## 5. GitHub·이력서·블로그 표면에 반영할 것

글이 하나 늘 때마다 아래를 같이 갱신한다. 1차 계획 Tier D와 같은 성격이다.

| 시점 | 대상 | 변경 |
| --- | --- | --- |
| P1~P3 완료 | `_series_pages/parity-pay.md` | 7편 구조로 설명 갱신. 3그룹(불변조건·동시성 / 외부 불확실성 / 이중 쓰기·원장·대사) |
| P1~P3 완료 | `_data/representative_posts.yml` | `unknown-state` 대신 Outbox(P1) 또는 대사(P2) 중 한 편. 6개 상한 유지 |
| F1·F3 완료 | `_data/capability_map.yml` | `payment-consistency` 노드 대표 글에 F1, 노드 하나 추가 검토: "장애 격리·복원력"(F3·S1·S5). 노드는 6개를 넘기지 않는다 |
| F 트랙 완료 | `_data/portfolio.yml` parity-pay 항목 | summary에 "Kafka 장애 3종 재현"과 "mock PG 장애 주입" 한 문장. 수치는 글에 실린 것만 |
| S1 저장소 신설 | GitHub README 프로젝트 표, `_data/portfolio.yml` personal | `spring-ops-lab` 추가. sys-drill을 재사용했다면 sys-drill 설명에 "장애 재현 시나리오 N종" 반영 |
| S1 저장소 신설 | 저장소 description | 다른 저장소와 같은 형식: 무엇을 재현하고 무엇을 측정했는지 한 문장 |
| 각 글 완료 | career-hub `interview-prep/toss-securities-2026-08.md` | 해당 질문 답변 끝에 글 URL 연결. 특히 Q4~Q5(Kafka·Netty)는 M 트랙 전까지 "설계 배경은 ADR" 답변 유지 |
| 각 글 완료 | career-hub `facts/side-projects/parity-pay.md` | 현재 없음. F 트랙 실험 결과(수치)를 facts로 먼저 기록하고 글에서 인용하는 순서를 지킨다 |

`facts/side-projects/parity-pay.md`가 없는 것은 지금 바로 고칠 수 있는 항목이다. 1~4편과 보고서에 이미 실린 수치(실험 26종·결함 12건, 31ms 트랜잭션 중 17ms 잠금, 테스트 317건)를 facts로 옮겨 두면 이력서·블로그·면접 답변이 같은 숫자를 가리킨다.

## 6. 글쓰기 규칙 (이 계획 추가분)

1차 계획 §4를 그대로 따르고, 실험 글에 다음을 더한다.

- 실험은 글보다 먼저 저장소에 커밋한다. 글은 커밋 해시 또는 테스트 파일 경로를 가리킨다. 재현 불가능한 수치는 싣지 않는다.
- 측정 표에는 환경(머신, 컨테이너 리소스 제한, 데이터 규모), 반복 횟수, 워밍업, 백분위를 반드시 적는다. parity-pay 2편의 "측정 방법이 결론을 만들 뻔했다"가 기준이다.
- 실험용으로 추가한 코드(F2의 Redis 락 경로 등)는 본 설계와 구분해 표시하고, 실험 뒤 제거하거나 프로파일로 격리한다. 저장소를 읽는 사람이 실험 코드를 설계로 오해하지 않게 한다.
- 실무 수치는 이미 이력서에 공개한 것만 쓴다. Track S는 실무 수치를 한 건도 쓰지 않는다.
- 가이드의 제목 형식("~할 수 있을까", "~하면 정말 ~가"처럼 질문형)을 참고하되, 이 블로그의 제목 규칙(시리즈명 + 번호 + 기술적 요점)을 우선한다.
