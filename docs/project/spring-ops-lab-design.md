# spring-ops-lab 저장소 설계 — Track S "운영 가능한 Spring 서버" 실험실

작성일: 2026-09-16
상위 계획: [`content-plan-toss-securities-2026-09.md`](./content-plan-toss-securities-2026-09.md) Track S
관련 저장소: `polynomeer/parity-pay`(실험·보고서 관례의 출처), `polynomeer/sys-drill`(Toxiproxy 구성의 출처)

## 0. 한 문장

Spring Boot 서버가 **어떻게 무너지는지를 재현하고, 무너지는 순간을 thread dump·풀 지표·백분위로 읽고, 고친 뒤 같은 조건으로 다시 재는** 저장소. 제품이 아니라 실험실이고, 산출물은 기능이 아니라 `reports/`의 표다.

## 1. 왜 새 저장소인가

| 후보 | 검토 결과 |
| --- | --- |
| `sys-drill` 재사용 | Toxiproxy 구성(docker-compose, ADR-0015)은 그대로 가져올 가치가 있다. 그러나 sys-drill은 세션·조직·AI 평가·과금 검토까지 있는 **제품**이고 Kotlin이다. 스레드 풀 고갈 실험을 넣으면 실험 코드와 제품 코드가 섞이고, 부하 결과가 제품 기능의 오버헤드와 뒤섞인다 |
| `parity-pay` 재사용 | 결제 도메인이 붙어 있어 "무관한 API가 왜 느려지는가"를 결제 로직과 분리해 설명하기 어렵다. F3(외부기관 장애 격리)과 S5(비즈니스 메트릭 알림)는 parity-pay에서 하고, 순수 JVM·Tomcat·풀 실험은 여기서 한다 |
| `spring-lab`(spring-internals-lab) 재사용 | 20주 로드맵·22개 모듈·217개 테스트로 **Spring 내부 동작**(IoC, 빈 생명주기, AOP 프록시, 트랜잭션 전파, MVC, Boot 자동 설정)을 소스 수준에서 검증한 학습 기록이다. `experiments/` 40여 개는 전부 JVM 안에서 단위 테스트로 확인하는 실험이고, 컨테이너·부하·장애 주입·관측 스택이 없다. 질문이 다르다 — spring-lab은 "Spring이 왜 이렇게 동작하는가", Track S는 "그 서버가 부하 아래에서 어떻게 무너지는가". 겹치는 지점은 S2(b)의 `REQUIRES_NEW`뿐이고, 그것도 spring-lab 14주차가 전파 규칙의 **동작**을, S2가 그 동작이 커넥션 풀에 미치는 **비용**을 다룬다. 글에서 서로 링크한다 |
| `spring-lite` 재사용 | Spring의 축소 재구현(IoC/DI, 프록시 AOP, `@Transactional`, MVC 디스패처). 실험 대상이 아니라 실험 도구를 다시 만든 것이라 Tomcat·HikariCP·실제 부하와 무관하다 |
| 새 저장소 `spring-ops-lab` | 도메인이 없어 실험 변수만 남는다. 재현 조건을 프로필 하나로 바꿀 수 있고, 저장소 자체가 "이 사람은 서버가 무너지는 방식을 안다"의 증거가 된다 |

세 저장소의 관계를 한 줄로 두면 이렇다. **spring-lite는 Spring을 만들어 보고, spring-lab은 Spring을 읽고, spring-ops-lab은 Spring 서버를 무너뜨려 본다.** 이름이 비슷해 채용 담당자가 셋을 같은 것으로 읽을 위험이 있으므로, 새 저장소의 description과 README 첫 문장에서 "runtime failure"를 앞세워 spring-lab과의 차이를 먼저 말한다. 이름을 `spring-failure-lab`으로 두는 선택지도 있다.

Java 21 + Spring Boot로 간다. parity-pay와 같은 스택이라 두 저장소의 실험 하니스와 보고서 형식을 공유할 수 있고, 이력서의 주 언어와 맞다. Kotlin 코루틴 실험(가이드 §6)은 범위 밖이다.

## 2. 범위 — 시나리오 다섯 개

각 시나리오는 **재현 → 관측 → 조치 → 재측정**의 네 단계를 갖고, 글 한 편에 대응한다. 조치 전후를 같은 조건에서 번갈아 재는 것이 규칙이다(parity-pay 2편 "두 빌드를 순차로 재면 기계 상태를 잰다").

| ID | 시나리오 | 재현 조건 | 관측 | 조치 | 판정 |
| --- | --- | --- | --- | --- | --- |
| S1 | Tomcat 스레드 고갈 | 업스트림 1개를 Toxiproxy로 30초 지연. 해당 엔드포인트에 open-model 부하 | `jstack` 3회(10초 간격) → 상태별 스레드 수 표, `tomcat_threads_busy`, 무관한 엔드포인트(`/api/fast`) p95 시계열 | read timeout 설정, 업스트림 호출용 Bulkhead(세마포어) | 무관한 엔드포인트 p95가 부하 중에도 기준선의 2배 이내 |
| S2 | HikariCP 풀 고갈 | (a) `@Transactional` 안에서 업스트림 호출, (b) `REQUIRES_NEW` 중첩으로 한 요청이 커넥션 2개 점유 | `hikaricp_connections_pending/active`, `pg_stat_activity` 대기, 풀 크기 10/20/50에서 p99 | 외부 호출을 트랜잭션 밖으로, 중첩 제거. 풀 크기는 **줄여서** 비교 | 풀을 늘렸을 때 p99가 오히려 나빠지는 구간을 표로 보임 |
| S3 | p99 꼬리와 coordinated omission | 같은 서버를 closed-model(VU 고정)과 open-model(arrival rate 고정)로 측정. `/api/alloc`로 GC pause 주입 | k6 두 실행기 결과의 p50/p99 차이, GC pause 로그와 p99 스파이크의 시각 대조 | 측정 방법 자체가 조치. 부하 도구 설정 규약 확정 | 같은 서버·같은 RPS에서 두 모델의 p99가 갈리는 표 |
| S4 | 무중단 배포 중 요청 유실 | docker compose `--scale app=2`, 롤링 교체 중 open-model 부하. `SIGTERM` 시점의 in-flight 요청과 Kafka consumer 미커밋 오프셋 | 5xx·connection reset 건수, `server.shutdown=graceful` 전후, `terminationGracePeriod`에 해당하는 `stop_grace_period` 값별 | graceful shutdown + readiness 끄기 순서 + consumer 종료 훅 | 교체 중 실패 요청 0건, consumer 중복은 멱등으로 흡수 |
| S5 | 비즈니스 메트릭 알림 | **parity-pay에서 수행.** RED 지표는 정상인데 UNKNOWN 비율만 오르는 장애 | RED vs 업무 지표의 탐지 시각 차이, 알림 본문의 context 유무 | 업무 지표 기반 경보 규칙, 알림에 요청·서버·최근 배포 context | 탐지 지연이 RED 대비 몇 분 줄었는가 |

S1과 S2는 F3(parity-pay 외부기관 장애)와 같은 현상을 다른 각도에서 본다. F3 보고서가 먼저 나오므로 S1은 그 결과를 인용하고 thread dump 해석으로 깊이 들어간다.

## 3. 스택

| 역할 | 선택 | 이유 |
| --- | --- | --- |
| 앱 | Java 21, Spring Boot(Tomcat, JPA + JdbcTemplate) | parity-pay와 동일. 가상 스레드는 **끈 상태가 기본**이고 S1에서 켠 조건을 한 행 추가한다 |
| DB | PostgreSQL 17 | HikariCP 실험 대상. `pg_stat_activity`·`pg_stat_statements` 켬 |
| 업스트림 대역 | 같은 저장소의 작은 Spring 앱 `upstream-stub` (지연·오류를 쿼리 파라미터로 제어) | WireMock도 가능하지만 스레드 모델을 통제하려면 직접 만드는 편이 낫다 |
| 장애 주입 | Toxiproxy 2.9 (sys-drill과 같은 버전) | latency, timeout, reset_peer, bandwidth. 앱 ↔ 업스트림, 앱 ↔ DB 두 경로 모두 프록시 뒤에 둔다 |
| 부하 | k6 | `constant-arrival-rate`(open)와 `constant-vus`(closed) 두 실행기를 같은 스크립트에서 고른다. S3의 핵심 |
| 관측 | Micrometer → Prometheus → Grafana(프로비저닝된 대시보드 1장), `jstack`/`jcmd`, GC 로그(`-Xlog:gc*`), 선택적으로 async-profiler | 대시보드는 저장소에 JSON으로 커밋. 스크린샷이 아니라 쿼리를 남긴다 |
| 실행 | docker compose. 앱 `cpus: 2, mem_limit: 2g`, DB `cpus: 1, mem_limit: 1g` 고정 | 리소스 제한이 없으면 재현이 기계마다 다르다. parity-pay 실험이 "컨테이너 리소스 제한 없음"으로 남긴 빈칸을 여기서는 채운다 |

Kubernetes는 쓰지 않는다. S4의 롤링 교체는 compose 스케일과 `stop_grace_period`로 흉내 내고, 글에서 그 한계를 명시한다.

## 4. 저장소 레이아웃

```text
spring-ops-lab/
  README.md                  무엇을 재현했고 무엇을 쟀는지 한 문단 + 시나리오 표 + 재실행 명령
  CLAUDE.md                  에이전트 규칙: 실험 프로필 분리, 보고서 형식, 금지 사항
  docs/
    00-design.md             이 문서를 옮긴 것
    adr/                     측정 방법·기본값 결정 (예: 001-open-model-load-as-default)
  reports/
    01-scenario-report.md    시나리오별 결과. parity-pay reports/11과 같은 형식
    data/                    원본 결과 JSON (k6 summary, jstack 텍스트, Prometheus 스냅샷)
  app/                       실험 대상 서버
    src/main/java/.../api/   /api/fast, /api/upstream, /api/tx-upstream, /api/nested-tx, /api/alloc
    src/main/resources/
      application.yml                    올바른 기본값
      application-anti-*.yml             안티패턴 프로필 (no-timeout, tx-external, requires-new, sync-log)
  upstream-stub/             지연·오류 제어 가능한 대역 서버
  load-tests/
    common.js                open/closed 실행기 선택, 요약 형식 통일
    s1-thread-exhaustion.js  …시나리오별 스크립트
  scenarios/
    s1/run.sh                compose 프로필 → toxiproxy 설정 → k6 → jstack → 결과 수집까지 한 명령
    s1/collect.py            jstack 파싱(상태별 집계), k6 요약 → 표
  ops/
    docker-compose.yml       app, upstream-stub, postgres, toxiproxy, prometheus, grafana
    grafana/dashboards/      프로비저닝 JSON
    prometheus/prometheus.yml
```

핵심 규칙: **안티패턴은 프로필로만 켠다.** `application.yml`은 항상 올바른 설정이다. `anti-no-timeout` 프로필을 켜야 타임아웃이 사라진다. 저장소를 읽는 사람이 실험용 설정을 권장 설정으로 오해하지 않게 하기 위해서이고, parity-pay F1의 `experiment-kafka` 프로필과 같은 원칙이다.

## 5. 실험 대상 서버의 엔드포인트

도메인이 없으므로 엔드포인트가 곧 실험 변수다.

| 경로 | 하는 일 | 쓰이는 시나리오 |
| --- | --- | --- |
| `GET /api/fast` | DB에서 행 하나 읽고 반환. "무관한 API"의 대표 | S1, S2, S3 |
| `GET /api/upstream` | 업스트림 호출 후 반환. 트랜잭션 없음 | S1 |
| `POST /api/tx-upstream` | `@Transactional` 안에서 업스트림 호출 후 INSERT. 안티패턴 | S2(a) |
| `POST /api/nested-tx` | 바깥 트랜잭션에서 `REQUIRES_NEW` 서비스 호출. 커넥션 2개 점유 | S2(b) |
| `POST /api/alloc?mb=` | 지정 크기의 객체를 할당해 GC pause 유도 | S3 |
| `GET /api/slow-log` | 동기 로깅 N줄 후 반환 | S3 보조 |
| `GET /actuator/health/readiness` | S4에서 교체 순서 확인 | S4 |

업스트림 대역은 `GET /delay/{ms}`, `GET /fail/{rate}`, `GET /hang`(응답 없음) 세 개면 충분하다.

## 6. 실험 규약 — parity-pay에서 옮겨 오는 것

parity-pay `reports/11`에서 이미 검증된 관례를 그대로 쓴다.

1. **실험이 글보다 먼저다.** 결과 표가 `reports/`에 커밋된 뒤 글을 쓴다. 글은 커밋 해시와 재실행 명령을 가리킨다.
2. **재현되지 않은 실행은 "증명하지 못함"이다.** 성공으로 세지 않는다. 표에 그대로 남긴다.
3. **환경을 표 아래에 적는다.** 머신, 컨테이너 리소스 제한, JVM 옵션, 부하 모델(open/closed, RPS 또는 VU), 주입한 지연·타임아웃 값, 반복 횟수, 워밍업 여부.
4. **백분위만 싣는다.** p50·p95·p99. 평균만 있는 표는 없다. 처리량은 중앙값.
5. **전후 비교는 번갈아 돌린다.** A-B-A-B. 순차 비교는 기계 상태를 잰다.
6. **측정 도구의 실수도 기록한다.** k6 스크립트 오류로 요청이 0건인 실행, 판정 창이 타임아웃보다 짧아 없는 유실이 보인 실행 같은 것.
7. **한 시나리오의 산출물은 셋이다.** `reports/01-scenario-report.md`의 섹션, `reports/data/`의 원본, `scenarios/<id>/run.sh`의 재실행 명령.

여기에 이 저장소만의 규약을 둘 더한다.

8. **thread dump는 세 장이다.** 고갈 직전·고갈 중·회복 후. 한 장으로는 "BLOCKED가 많다"까지만 말할 수 있고, 세 장이 있어야 "무엇을 기다리다 쌓였는가"가 나온다. `collect.py`가 상태별·스택 최상위 프레임별로 집계한 표를 만든다.
9. **부하 모델은 기본이 open이다.** closed는 S3의 대조군으로만 쓴다. 이 결정은 ADR-001로 남긴다. 이유: 서버가 느려질 때 closed 모델은 요청을 덜 보내 꼬리를 감추고, 실제 사용자는 그렇게 기다려 주지 않는다.

## 7. 측정 표의 최소 열

시나리오마다 다르지만 어느 표에도 빠지지 않는 열.

| 열 | 뜻 |
| --- | --- |
| 조건 | 프로필·주입값·풀 크기 등 실험 변수 |
| run | 반복 번호 |
| RPS(목표/실제) | open 모델에서 목표와 실제 도달 처리량. 둘이 벌어지면 서버가 따라오지 못한 것 |
| p50 / p95 / p99 | ms |
| 오류율 | 5xx + 타임아웃 |
| 서버 내부 지표 | 시나리오별 하나 이상. `tomcat_threads_busy`, `hikaricp_connections_pending`, GC pause 합계 등 |
| 판정 | 재현됨 / 증명하지 못함 |

## 8. 순서와 일정

상위 계획의 11~20주차에 해당한다. 저장소 신설이 포함된 S1이 가장 길다.

| 순서 | 작업 | 산출 |
| --- | --- | --- |
| 0 | 저장소 생성, compose·프로메테우스·그라파나·Toxiproxy·k6 골격, `/api/fast`와 업스트림 대역, S1 `run.sh`가 끝까지 도는 것 | 결과 표 0개. "골격이 돈다"까지 |
| 1 | S1 재현 → thread dump 3장 → 타임아웃·Bulkhead → 재측정 | 보고서 §S1, 글 S1 |
| 2 | S2 (a)(b) → 풀 크기 10/20/50 격자 | 보고서 §S2, 글 S2 |
| 3 | S3 open vs closed, GC pause 주입 | 보고서 §S3, ADR-001, 글 S3 |
| 4 | S4 compose 롤링 교체 | 보고서 §S4, 글 S4 |
| 5 | S5는 parity-pay에서. 여기서는 대시보드 규약만 공유 | 글 S5 |

각 단계는 2주. 0단계는 1주. S1이 끝난 시점에 저장소 description과 README를 채우고 블로그 About·GitHub 프로필 표에 올린다. 그 전에는 올리지 않는다. 표가 하나도 없는 실험실은 증거가 아니다.

## 9. 하지 않는 것

- Kubernetes, 클라우드 배포, HPA·PDB. S4는 compose로 흉내 내고 한계를 적는다.
- 인증, 프론트엔드, 도메인 모델. 엔드포인트는 실험 변수이지 기능이 아니다.
- 실무 수치 인용. 이 저장소의 모든 숫자는 여기서 잰 것이고, 글에서도 실무 수치와 섞지 않는다(상위 계획 §6).
- 벤치마크 경쟁. "Spring이 얼마나 빠른가"가 아니라 "어떻게 무너지고 무엇이 그것을 막는가"만 다룬다.
- Kotlin 코루틴, WebFlux. 서블릿 스택 하나로 고정한다. 가상 스레드는 S1의 추가 행으로만.

## 10. 표면 연동

| 시점 | 대상 | 변경 |
| --- | --- | --- |
| S1 완료 | 저장소 description | 다른 저장소와 같은 형식: "Reproduces how a Spring Boot server fails — thread pool and connection pool exhaustion, tail latency, rolling restarts — and measures what each fix changes" |
| S1 완료 | GitHub 프로필 README 프로젝트 표, `_data/portfolio.yml` personal | 항목 추가. summary는 표에 있는 수치만 |
| S2 완료 | `_data/capability_map.yml` | `spring-backend` 노드의 대표 글을 S1·S2로. 노드 추가는 하지 않는다 |
| 각 글 완료 | career-hub `facts/side-projects/spring-ops-lab.md` | parity-pay facts와 같은 양식. 수치는 보고서에서만 |
| 각 글 완료 | `content-plan-toss-securities-2026-09.md` | 해당 행에 완료 표시 |

## 11. 0단계 체크리스트

저장소를 만들 때 순서대로 확인한다.

1. `gh repo create polynomeer/spring-ops-lab --public` 후 `~/Projects/spring-ops-lab`에 클론.
2. `CLAUDE.md`에 이 문서 §4 "안티패턴은 프로필로만", §6 규약 1·2·3을 옮긴다. parity-pay의 `CLAUDE.md` 형식을 따른다.
3. `ops/docker-compose.yml`에 리소스 제한을 먼저 적고, 그 다음에 서비스를 채운다. 제한 없이 돌린 결과는 버린다.
4. `/api/fast` 하나와 k6 `s0-smoke.js`로 open 모델 100 RPS·60초가 오류 0으로 도는 것을 확인하고, 그 결과를 `reports/data/s0-smoke-<date>.json`으로 남긴다. 이것이 모든 시나리오의 기준선이다.
5. Toxiproxy에 `upstream` 프록시를 만들고 latency 30초 toxic을 넣었다 뺐다 하는 것을 `scenarios/s1/run.sh`가 스스로 한다. 손으로 하는 단계가 남아 있으면 재실행 명령이 아니다.
6. Grafana 대시보드 한 장: Tomcat busy threads, HikariCP active/pending, p50/p95/p99, GC pause, 오류율. JSON으로 커밋.
7. 첫 커밋 메시지부터 Conventional Commits. 실험 단위로 커밋한다.
