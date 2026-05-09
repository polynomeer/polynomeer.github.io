---
title: "RED와 USE - 어디에 무엇을 붙이는가"
date: 2026-05-09
categories: [Notes, Common]
tags: [Observability, Monitoring, Metrics, SRE, Alerting, Performance]
---

대시보드를 만들 때 가장 어려운 것은 그래프를 그리는 일이 아니라 **무엇을 그릴지 정하는 일**이다. 지표를 다 붙이면 화면이 넘치고 아무도 안 보며, 적게 붙이면 장애 때 필요한 것이 없다. RED와 USE는 그 선택을 규칙으로 만든 두 방법이고, 둘이 다른 대상을 본다는 것이 핵심이다.

## USE: 자원을 본다

Brendan Gregg의 방법이고, **자원(CPU, 메모리, 디스크, 네트워크, 풀)** 마다 셋을 본다.

| | 뜻 | 예 |
| --- | --- | --- |
| **U**tilization | 자원이 일하는 시간의 비율 | CPU 사용률, 디스크 busy |
| **S**aturation | 대기가 쌓인 정도 | run queue 길이, 커넥션 풀 대기 수 |
| **E**rrors | 오류 건수 | 디스크 오류, 커넥션 획득 실패 |

핵심은 **Saturation**이다. 사용률은 100%에서 멈추지만 포화는 계속 자란다. CPU 사용률 100%는 "더 못 한다"만 말하고, run queue 20은 "얼마나 밀렸는가"를 말한다. 사용률만 보면 나빠지는 정도를 알 수 없다.

[컨테이너 CPU 상한](/posts/context-switching-and-cgroup/)이 이 차이를 잘 보여준다. 평균 사용률이 20%인데 스로틀링(`nr_throttled`)이 걸리는 상황이 흔하다. 사용률은 평균이고 스로틀링은 순간에 일어나기 때문이다. **`nr_throttled`가 그 자원의 Saturation 지표다.**

## RED: 요청을 본다

Tom Wilkie가 정리한 방법이고, **서비스와 엔드포인트**마다 셋을 본다.

| | 뜻 |
| --- | --- |
| **R**ate | 초당 요청 수 |
| **E**rrors | 실패한 요청 수(율) |
| **D**uration | 지연 분포 |

Google SRE 책의 Four Golden Signals(지연, 트래픽, 오류, 포화)와 거의 같고, 포화를 뺀 것이 RED다. 포화는 USE 쪽에서 본다.

Duration은 **반드시 분포로** 본다. 평균은 꼬리를 숨기고, 여러 인스턴스의 백분위는 평균 낼 수 없다([백분위 통계](/posts/percentile-statistics/)).

## 어디에 무엇을 붙이는가

규칙은 단순하다.

- **요청을 처리하는 것**(HTTP 엔드포인트, gRPC 메서드, 컨슈머, 배치 스텝) → RED
- **한정된 자원**(스레드 풀, 커넥션 풀, 큐, 디스크, CPU) → USE

한 서비스에 둘 다 있다. 그리고 **장애를 설명하는 것은 대개 둘의 조합**이다.

[spring-ops-lab의 S1](/posts/tomcat-thread-exhaustion/)이 그 예다. RED만 보면 "`/api/fast`의 Duration이 튀고 Errors가 66.7%"까지다. 원인은 USE 쪽에 있었다. `tomcat_threads_busy_threads`가 191/200, 즉 스레드 풀의 Utilization이 96%였다. 그리고 세 번째 축이 필요했다. **thread dump**가 200개 전부 `sun.nio.ch.Net.poll`에 있다고 말해 주기 전까지는 "왜 스레드가 다 찼는가"를 알 수 없었다.

즉 RED는 **증상**, USE는 **원인의 후보**, dump와 프로파일러는 **원인**이다. 세 층을 건너뛰면 추측이 된다.

## 경보는 증상에 건다

지표를 다 모아도 경보를 어디에 걸지는 다른 문제다. 원칙은 **사용자가 겪는 증상에 건다**는 것이다.

- CPU 80%는 경보가 아니다. 그 상태로 잘 돌아가는 서비스가 많다.
- "p99가 SLO를 넘음", "오류율이 X% 초과"는 경보다. 사용자가 겪고 있다.
- USE 지표는 경보가 아니라 **조사할 때 보는 값**으로 둔다. 예외는 고갈이 곧 장애인 것들(디스크 가득 참, 커넥션 풀 대기 급증)이다.

자원 지표에 경보를 걸면 **울리지만 아무 일도 없는 경보**가 쌓이고, 그것이 쌓이면 진짜 경보도 무시된다.

## 기술 지표가 정상인데 실패할 때

RED와 USE가 전부 정상인데 업무가 실패하는 경우가 있다. 결제 승인율이 떨어지거나, 특정 기관 호출만 `UNKNOWN`으로 쌓이거나, 배치가 돌았는데 처리 건수가 0인 경우다. HTTP는 200을 돌려주고 있으므로 RED에 안 잡힌다.

그래서 세 번째 축이 필요하다. **업무 지표.** "시간당 승인 건수", "UNKNOWN 상태 거래 수", "대사 불일치 건수" 같은 것들이고, [ParityPay 1편](/posts/parity-pay-invariants/)에서 불변조건 위반 지표를 둔 것이 이 계열이다. 그 글에 적었듯 **불변조건 위반 지표는 평소 0이어야 하고, 0이 아니면 그 자체가 장애**라 임계값을 고민할 필요가 없다.

[spring-ops-lab의 S5](https://github.com/polynomeer/spring-ops-lab)가 이 주제이고 아직 측정 전이다.

## 이 설명이 깨지는 곳

- **RED의 Rate는 정상 범위를 모른다.** 트래픽이 절반으로 준 것이 장애일 수도 있고 새벽일 수도 있다. 절대값 경보보다 전주 대비 비교가 쓸모 있다.
- **USE의 Saturation 지표가 아예 없는 자원이 많다.** 있는 것을 찾아 쓰는 것이 아니라 직접 만들어야 하는 경우가 흔하다.
- **엔드포인트 단위 RED는 카디널리티를 만든다.** 경로를 템플릿화하지 않으면 시계열이 폭발한다([메트릭·로그·트레이스](/posts/metrics-logs-traces/)).
- **없는 지표는 정상으로 보인다.** S1에서 `server.tomcat.mbeanregistry.enabled`가 꺼져 있어 스레드 지표가 통째로 없었다. 빈 그래프는 문제없음처럼 보인다.

## 무엇을 재면 확인되는가

1. 장애를 일부러 만들고(느린 업스트림, 풀 고갈) RED와 USE 중 무엇이 먼저 움직이는지 본다.
2. 각 자원의 Saturation 지표가 존재하는지 목록으로 점검한다. 없으면 만든다.
3. 업무 지표와 RED의 탐지 시각 차이를 잰다. 업무 지표가 몇 분 빠른지가 그 지표의 값이다.

## 실무와의 접점

[Datadog로 병목을 추적](/posts/batch-heap-dump-to-chunk/)했을 때 대시보드에 있던 것은 대부분 USE 계열(CPU, 메모리, GC)이었고, 그것만으로는 "어디가 이상한가"까지였다. 원인은 heap dump가 알려 줬다. 지금 정리하면 그 경험이 이 글의 결론이다. **지표는 좁히는 도구이지 답하는 도구가 아니다.**

## 정리

- USE는 자원을, RED는 요청을 본다. 한 서비스에 둘 다 붙는다.
- Saturation이 USE의 핵심이다. 사용률은 100%에서 멈추지만 포화는 계속 자란다.
- 장애 설명은 RED(증상) → USE(원인 후보) → dump·프로파일러(원인) 순서다.
- 경보는 증상에 건다. 자원 지표에 거는 경보는 무시되는 경보를 만든다.
- 기술 지표가 정상인데 업무가 실패하는 경우가 있고, 그 자리에 업무 지표가 필요하다.
- 없는 지표는 0이 아니라 정상으로 보인다.

## 참고

- Brendan Gregg, [The USE Method](https://www.brendangregg.com/usemethod.html)
- Tom Wilkie, [The RED Method](https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/)
- [Google SRE: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
