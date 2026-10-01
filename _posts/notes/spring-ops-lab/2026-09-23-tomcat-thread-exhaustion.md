---
title: "무너지는 Spring 서버 1 - CPU는 놀고 있는데 API가 느리다: 업스트림 하나가 무관한 엔드포인트를 죽이는 과정을 thread dump 세 장으로 읽기"
date: 2026-09-23
categories: [Notes, SpringOpsLab]
tags: [Spring Boot, Tomcat, Thread Pool, Bulkhead, Timeout, Toxiproxy, k6, Load Testing, Observability]
series: spring-ops-lab
series_title: 무너지는 Spring 서버를 재현하고 고치기
series_order: 1
series_description: spring-ops-lab 저장소에서 Spring Boot 서버가 스레드 고갈, 커넥션 풀 고갈, 꼬리 지연, 무중단 배포 중 요청 유실로 무너지는 순간을 재현하고, thread dump와 풀 지표와 백분위로 읽고, 고친 뒤 같은 조건에서 다시 잰 기록.
status: published

problem_decision_result:
  problem: "업스트림 하나가 느려지면 그것을 호출하는 엔드포인트만 느려질 것 같지만, 실제로는 그 업스트림을 건드리지도 않는 엔드포인트가 같이 죽는다. CPU는 놀고 있어서 지표만 보면 서버는 한가해 보인다. 이 현상을 재현하고, 무엇이 자원을 쥐고 있는지를 추측이 아니라 thread dump로 확인하고 싶었다."
  decision: "spring-ops-lab 저장소를 만들어 Toxiproxy로 업스트림에 30초 지연을 주입하고, 업스트림을 호출하는 엔드포인트와 DB 한 행만 읽는 엔드포인트를 각각 초당 20건씩 open 모델로 걸었다. 안티패턴(읽기 타임아웃 없음, 벌크헤드 없음)은 프로필로만 켜고, 조치(2초 타임아웃 + 벌크헤드 20)와 번갈아 3회씩 재며 매 실행마다 thread dump를 세 장씩 떴다."
  result: "업스트림을 호출하지 않는 `/api/fast`의 p50이 2.9ms에서 30초(클라이언트 타임아웃)로 갔고 66.7%가 응답을 못 받았다. 그 순간 요청 스레드 200개 전부가 `sun.nio.ch.Net.poll`, 소켓 읽기에 멈춰 있었다. 조치 후 같은 조건에서 p50 2.9ms·실패 0%로 돌아왔고 요청 스레드는 24개를 넘지 않았다. 부수적으로 셋을 배웠다. 타임아웃이 없으면 부하가 끝난 뒤에도 회복되지 않고, 벌크헤드 permit 수가 thread dump에 그대로 보이며, 측정 도구의 기본값 세 가지가 조용히 결과를 왜곡했다."
---

[계획](/posts/parity-pay-external-isolation/)에만 있고 안 쓴 실험이 다섯 개 있었다. 그중 첫 번째다. ParityPay [9편](/posts/parity-pay-external-isolation/)에서 타임아웃 없는 외부 호출이 Tomcat 스레드 200개를 24초에 고갈시킨다는 것을 산술로 보였는데, 그 글의 한계에 "컨테이너 리소스 제한이 없다"와 "thread dump로 확인하지 않았다"가 남아 있었다. 이번에는 리소스 제한을 걸고 dump를 떴다.

저장소는 [spring-ops-lab](https://github.com/polynomeer/spring-ops-lab)이고, 이 글의 모든 숫자는 거기서 잰 것이다. 재실행은 `./scenarios/s1/run.sh anti 1` 한 줄이다.

## 재현하려는 것

서버에 엔드포인트가 둘 있다.

| 경로 | 하는 일 |
| --- | --- |
| `GET /api/upstream` | 업스트림을 호출하고 결과를 돌려준다 |
| `GET /api/fast` | PostgreSQL에서 행 하나를 읽고 돌려준다. 업스트림을 모른다 |

업스트림이 느려진다. 상식적으로는 `/api/upstream`만 느려져야 한다. `/api/fast`는 그 업스트림을 호출하지 않으므로 영향이 없어야 한다.

그런데 둘은 같은 것을 공유한다. **Tomcat의 요청 스레드 풀**이다. Tomcat 문서는 커넥터의 `maxThreads`가 동시에 처리할 수 있는 요청 수의 상한을 정하고, 지정하지 않으면 200이라고 적는다([Tomcat HTTP Connector](https://tomcat.apache.org/tomcat-10.1-doc/config/http.html)). 서블릿 스택에서 요청 하나는 처리가 끝날 때까지 스레드 하나를 쥐고, 업스트림을 기다리는 동안에도 놓지 않는다. 스레드는 하는 일 없이 묶여 있으니 CPU 사용률은 낮게 나오고, 새 요청은 스레드를 얻지 못해 느려진다.

## 실험 조건

```text
k6 (open model)                   app (Tomcat 200 threads)        toxiproxy      upstream-stub
  /api/upstream  20 rps  ───────▶ ├── 업스트림 호출 ──────────────▶ +30,000ms ───▶ 즉시 200
  /api/fast      20 rps  ───────▶ └── PostgreSQL SELECT 1행
```

- 컨테이너 리소스 제한을 먼저 고정했다. app `cpus: 2, mem_limit: 2g`, DB `1 / 1g`. 제한 없이 잰 수치는 다른 기계에서 재현되지 않는다.
- 부하는 open 모델이다. 도착률을 고정하고 응답이 오든 말든 같은 속도로 보낸다. closed 모델은 서버가 느려지면 요청을 덜 보내 꼬리를 감춘다([ADR-001](https://github.com/polynomeer/spring-ops-lab/blob/main/docs/adr/001-open-model-load-as-default.md)).
- 지연은 Toxiproxy의 `latency` toxic 30초다. 이 toxic은 프록시를 지나는 모든 데이터에 지연을 더한다([Toxiproxy](https://github.com/Shopify/toxiproxy)). 연결은 살아 있고 데이터만 늦게 온다. "죽은 업스트림"이 아니라 "느린 업스트림"이다.
- 안티패턴은 프로필로만 켠다. `application.yml`은 항상 올바른 설정이고, `application-anti-no-timeout.yml`이 읽기 타임아웃을 0(무한)으로 만들고 벌크헤드를 끈다. 저장소를 읽는 사람이 실험용 설정을 권장 설정으로 읽지 않게 하려는 것이다.
- 번갈아 잰다. anti → fixed → anti → fixed → anti → fixed. 순차로 몰아 재면 기계 상태를 잰다.

## 재현: 무관한 엔드포인트가 먼저 죽는다

3회 중앙값이다.

| 조건 | 엔드포인트 | 요청 | p50 | p95 | p99 | 실패 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| anti | **fast** | 1,200 | **30,000.0 ms** | 30,001.2 ms | 30,005.8 ms | **66.7%** |
| anti | upstream | 600 | 50,016.8 ms | 60,001.0 ms | 60,004.6 ms | 33.3% |

`/api/fast`의 p50이 30,000ms다. 이 값은 서버가 30초 걸렸다는 뜻이 아니라 **클라이언트가 30초를 기다리다 포기한 값**이다. 행 하나를 읽는 엔드포인트의 요청 3분의 2가 아예 답을 못 받았다.

처리량 숫자는 따로 조심해서 읽어야 한다. k6가 보고하는 achieved rps는 요청 수를 전체 경과 시간으로 나눈 값이고, 경과 시간에는 부하 창이 닫힌 뒤의 배수 구간이 포함된다. 두 조건 모두 `/api/fast`에 정확히 1,200건을 보냈다. anti는 그것이 빠져나가는 데 90초가 걸렸고 fixed는 61초가 걸렸다. 그러니 "처리량이 13 rps로 떨어졌다"보다 "같은 요청이 29초 더 걸려 빠져나갔고 3분의 2는 답을 못 받았다"가 정확한 문장이다.

## 왜 세 장인가

dump 한 장으로는 "스레드가 많이 기다린다"까지만 말할 수 있다. 세 장이 있어야 무엇을 기다리다 쌓였는지, 그리고 풀이 회복됐는지가 나온다.

| 조건 | 부하 전 | 부하 중 (t+15s) | 부하 중 (t+40s) | 부하 종료 +5s |
| --- | ---: | ---: | ---: | ---: |
| anti | 12 | **202** | **202** | **202** |
| fixed | 12 | 27 | 27 | 59 |

요청 스레드의 최상위 프레임:

| 조건 | 부하 전 | 부하 중 | 종료 후 |
| --- | --- | --- | --- |
| anti | `Unsafe.park` 10 | **`sun.nio.ch.Net.poll` 200** | **`sun.nio.ch.Net.poll` 200** |
| fixed | `Unsafe.park` 10 | **`sun.nio.ch.Net.poll` 20**, `Unsafe.park` 5 | `Unsafe.park` 57 |

`sun.nio.ch.Net.poll`은 소켓에서 읽기를 기다리는 자리다. anti 조건에서 요청 스레드 200개 전부가 거기 있다. 이 스레드들은 CPU를 쓰지 않으므로 지표로는 한가한 서버로 보이지만, 새 요청을 받을 스레드는 하나도 남아 있지 않다. `/api/fast`가 업스트림을 호출하지 않는데도 죽은 이유가 이것으로 설명된다.

**종료 후 dump가 부하 중 dump와 같다.** 부하가 끝나고 5초가 지났는데 200개가 그대로 `Net.poll`에 있다. 읽기 타임아웃이 없으면 회복 시간은 가장 느린 업스트림 호출이 정하고, 서버 안에는 그 상한을 정하는 것이 없다. 그래서 부하를 멈춰도 서버가 돌아오지 않는다.

서버 쪽 지표도 같은 말을 한다.

| 조건 | `tomcat_threads_busy_threads` 최대 |
| --- | ---: |
| anti | **191 / 200** (191, 190, 199) |
| fixed | **24 / 200** (25, 23, 24) |

## 조치: 상한을 두 군데 둔다

dump가 보여준 것은 스레드가 업스트림 읽기에 묶인다는 것, 그리고 묶이는 데 상한이 없다는 것이다. 상한은 두 가지가 빠져 있다. 묶이는 시간과 묶이는 개수다.

- 읽기 타임아웃 2초. 업스트림이 2초 안에 답하지 않으면 포기한다. 이것이 없으면 스레드 하나가 묶이는 시간에 상한이 없다.
- 벌크헤드 permit 20. 업스트림 호출 안에 동시에 들어갈 수 있는 요청 스레드 수를 세마포어로 제한한다. permit을 100ms 안에 못 얻으면 즉시 503으로 거절한다.

타임아웃 하나로는 부족하다. 시간은 제한되지만 개수는 제한되지 않는다. 2초 × 20 rps면 평균 40개가 항상 안에 있고, 업스트림이 더 느려지거나 부하가 더 오면 그 수는 계속 는다. 그래서 둘을 같이 둔다.

같은 조건, 같은 toxic으로 다시 쟀다.

| 조건 | 엔드포인트 | 요청 | p50 | p95 | p99 | 실패 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixed | **fast** | 1,201 | **2.9 ms** | 11.8 ms | 27.3 ms | **0.0%** |
| fixed | upstream | 1,201 | 253.2 ms | 2,074.9 ms | 2,104.9 ms | 100.0% |

`/api/fast`는 장애가 없을 때의 기준선(부하 전 100 rps에서 p50 1.73ms, p95 6.04ms)에 가깝게 돌아왔다. 업스트림은 100% 실패다. 업스트림이 30초 동안 답하지 않으므로 어차피 성공할 수 없다. 조치 전에도 성공하지 못한 것은 같다. 달라진 것은 그 실패를 2초 남짓(벌크헤드에서 거절되면 100ms) 안에 돌려준다는 것과, 실패를 알아내는 데 쓰는 스레드가 200개에서 20여 개로 줄었다는 것이다.

## 벌크헤드 permit 수가 dump에 그대로 보인다

fixed 조건의 dump에서 `Net.poll`에 있는 스레드가 정확히 20개다. 벌크헤드 permit 수와 같은데, permit이 정하는 것이 바로 업스트림 호출 안에 동시에 들어갈 수 있는 스레드 수이기 때문이다. 나머지는 세마포어 앞에서 `Unsafe.park`으로 기다리다 100ms 뒤에 거절된다(dump의 `Unsafe.park` 5~6개가 그 순간에 잡힌 스레드들이다).

거절과 타임아웃의 비율도 설계와 맞는다.

| 상태 코드 | 건수 (fixed run 4) | 뜻 |
| --- | ---: | --- |
| 503 | 601 | 벌크헤드가 가득 차 100ms 뒤 거절 |
| 504 | 600 | 들어갔고 2초 읽기 타임아웃이 발동 |

permit 20개를 각각 2초씩 쥐면 초당 10건이 통과한다. 도착은 초당 20건이다. 그래서 절반이 들어가고 절반이 거절된다. 실측은 601 대 600이다. 산술과 실측이 맞으므로 벌크헤드가 설계대로 동작했다고 볼 수 있다.

## 측정 도구가 조용히 틀리게 만든 것 셋

이 실험에서 제일 오래 걸린 것은 서버를 고치는 일이 아니라 측정이 거짓말하지 않게 만드는 일이었다. 셋 다 기본값에서 왔고, 틀린 방향이 모두 "정상으로 보이는" 쪽이었다.

1. Tomcat 스레드 지표가 아예 없었다. `/actuator/prometheus`에 `tomcat_threads_busy_threads`가 없다. Micrometer의 Tomcat 바인더는 MBean을 읽는데, `server.tomcat.mbeanregistry.enabled: true`가 없으면 MBean이 등록되지 않는다. Spring Boot 문서도 MBean 레지스트리가 기본으로 꺼져 있고, 켜져 있을 때만 Tomcat 계측이 자동 구성된다고 적는다([Spring Boot Metrics](https://docs.spring.io/spring-boot/reference/actuator/metrics.html)). 지표가 0으로 나오는 것이 아니라 시계열 자체가 없다. 그래프를 보면 빈 패널이고, 빈 패널은 "문제 없음"처럼 보인다.

2. 첫 실행에서 k6가 요청 1,889건을 버렸다. `dropped_iterations: 1889`. open 모델은 도착률을 지키려고 VU를 쓰는데, 요청이 30초씩 멈춰 있으면 VU가 그만큼 묶인다. VU를 미리 할당하지 않으면 k6가 풀을 키우는 동안 도착 예정이던 요청을 그냥 버린다. k6 문서도 arrival-rate executor는 비어 있는 VU가 없을 때 반복을 버린다고 적는다([k6 Dropped iterations](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/dropped-iterations/)). 그 순간 open 모델은 조용히 closed 모델이 된다. 서버가 받지도 않은 요청이 통계에서 사라지므로 꼬리가 실제보다 짧게 나온다. VU를 `도착률 × 클라이언트 타임아웃`만큼 미리 할당하고, `dropped_iterations: ['count==0']`을 임계값으로 걸었다. 이 조건을 못 지킨 실행은 폐기한다.

3. 엔드포인트별로 나눌 수가 없었다. k6의 `--summary-export`는 태그로 나뉜 하위 지표를 내보내지 않는다. 태그를 붙여도 요약 파일에는 전체 합계만 남는다. 피해자와 가해자를 구분하는 것이 이 실험의 전부인데 그 구분이 파일에 없었다. 엔드포인트별 임계값을 선언해 하위 지표가 생기도록 강제했다.

1번 실행은 폐기했지만 지우지는 않았다. thread dump는 유효하고 같은 고갈을 보여주므로 저장소에 남겼고, 보고서에 "client-side 표는 무효"라고 적었다. [ParityPay 4편](/posts/parity-pay-experiments-and-defects/)에서 "측정 방법이 결론을 만들 뻔했다"고 쓴 것과 같은 종류다. 다른 점은 그때는 한 번 겪고 알았고, 이번에는 세 개가 한꺼번에 나왔다는 것이다.

## 남는 질문

- permit 20과 타임아웃 2초는 근거 있는 값이 아니다. 기구를 보여주려고 고른 둥근 수다. 업스트림의 지연 분포에서 이 값을 유도하는 절차는 별도 실험이 필요하고, ParityPay 9편이 "벌크헤드 50과 차단기 파라미터의 산정은 남았다"고 적은 것과 같은 빈칸이다.
- `accept-count: 100`을 바꿔 보지 않았다. Tomcat 문서상 OS의 accept 큐(`acceptCount`)는 연결 수가 `maxConnections`(기본 8192)에 닿은 뒤에 쓰이고, 그 전까지 연결은 Tomcat 안에서 스레드를 기다린다([Tomcat HTTP Connector](https://tomcat.apache.org/tomcat-10.1-doc/config/http.html)). 피해자의 지연 중 얼마가 어느 큐에서 기다린 것인지는 이 실험으로 나뉘지 않는다.
- 가상 스레드를 켜면 어떻게 되는가. 9편에서 "붕괴는 막지만 진행 중 호출을 상한 없이 쌓는다"고 적었는데, 그것을 이 하니스에서 dump로 확인하지 않았다. 설계 문서에 S1의 추가 행으로 남겨 뒀다.
- 느린 업스트림만 다뤘다. 연결 거부, 패킷 손실, TLS 단계의 실패는 스레드를 같은 방식으로 묶지 않을 수 있다.
- 인스턴스가 하나다. 로드 밸런서 뒤에서 이 고갈이 어떻게 번지거나 갇히는지는 여기서 말할 수 없다.

## 정리

- 업스트림 하나가 느려지면 그것을 호출하지 않는 엔드포인트가 먼저 죽는다. 공유하는 것은 업스트림이 아니라 요청 스레드 풀이다.
- CPU 사용률은 이 상황을 보여주지 않는다. 스레드 200개가 소켓 읽기에 멈춰 있으면 CPU는 한가하다. 봐야 할 것은 `tomcat_threads_busy_threads`와 thread dump다.
- 타임아웃이 없으면 부하가 끝나도 회복되지 않는다. 종료 후 dump가 부하 중 dump와 같았다. 이것은 dump를 시점별로 떠야 보인다.
- 타임아웃은 묶이는 시간만 제한하고 개수는 제한하지 않는다. 개수의 상한은 벌크헤드가 따로 둬야 하고, 대가로 업스트림 요청 절반이 100ms 만에 503을 받는다.
- 이번에 만난 측정 도구의 기본값 세 가지는 모두 "정상으로 보이는" 방향으로 틀렸다. 빈 지표 패널, 버려진 요청, 태그를 잃은 요약 파일 모두 그래프를 깨끗하게 만들었다.

## 참고

- [spring-ops-lab](https://github.com/polynomeer/spring-ops-lab) — 이 글의 실험 저장소. 결과 원본은 `reports/data/`, 표는 `reports/01-scenario-report.md`
- [ADR-001: 부하 모델의 기본은 open model](https://github.com/polynomeer/spring-ops-lab/blob/main/docs/adr/001-open-model-load-as-default.md)
- [ParityPay 9편 - 느린 기관 앞에서 결제 서버를 지키기](/posts/parity-pay-external-isolation/) — 같은 현상을 결제 도메인에서 본 글
- [ParityPay 2편 - 잠금을 필요 이상으로 오래 쥐고 있었다](/posts/parity-pay-lock-hold-time/) — 자원을 쥔 시간을 재는 같은 방법
- [Apache Tomcat 10.1 HTTP Connector](https://tomcat.apache.org/tomcat-10.1-doc/config/http.html) — `maxThreads`, `maxConnections`, `acceptCount`
- [Spring Boot Reference - Metrics](https://docs.spring.io/spring-boot/reference/actuator/metrics.html) — Tomcat 계측과 `server.tomcat.mbeanregistry.enabled`
- [k6 - Dropped iterations](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/dropped-iterations/)
- [Toxiproxy](https://github.com/Shopify/toxiproxy) — `latency` toxic
