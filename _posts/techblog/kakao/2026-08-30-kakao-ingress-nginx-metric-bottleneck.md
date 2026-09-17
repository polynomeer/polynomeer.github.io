---
title: "카카오 「Ingress Nginx Controller의 Prometheus Metric 병목 현상」(1·2부) 리뷰 — 메트릭이 사라진 이유는 Nginx가 아니라 summary 타입의 뮤텍스였다"
date: 2026-08-30
categories: [TechBlog, Kakao]
tags: [Tech Blog Review, Kakao, Kubernetes, Ingress Nginx, Prometheus, Go, pprof, Troubleshooting, Mutex]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 54
source_url: https://tech.kakao.com/posts/683
---

원문(2부, 모두 2025-01-17 kakao tech, 광고추천팀):
[1부 원인 분석](https://tech.kakao.com/posts/683)(pooh.duck) · [2부 해결](https://tech.kakao.com/posts/684)(aiden.song)

## 한 줄 요약

피크 16만 req/s를 받는 광고 API 앞의 Ingress Nginx Controller에서 어느 날 request volume 메트릭이 **No Data**가 됐다. 서버는 멀쩡히 요청을 처리하고 있었고 CPU도 여유가 있었다. 메모리와 열린 파일 디스크립터만 치솟았다. 추적하니 Nginx가 1초마다 Lua로 보내는 메트릭을 컨트롤러(Go)가 고루틴으로 처리하는데, 그중 `upstreamLatency`를 Prometheus **summary** 타입에 기록하는 `Observe()`의 뮤텍스에서 4,309개 고루틴이 잠들어 있었다. 그리고 Prometheus가 `/metrics`를 긁을 때도 같은 뮤텍스를 잡아야 해서 타임아웃이 나 No Data가 됐다. 해법 후보는 노드 증설 또는 해당 메트릭 제외였고, 전사 공용 Helm 차트를 건드리지 않으려 증설을 택했다.

## 배경

두 리전에 여러 Ingress Nginx Controller를 두고 Kubernetes 위의 API 파드로 라우팅한다. Prometheus + Grafana로 모니터링하는데, 모든 Nginx의 request volume이 No Data라는 알람이 왔다. 간헐적으로 찍히는 값도 정상보다 훨씬 낮았다. 트래픽이 일정 기준을 넘으면 재현되고, 트래픽이 줄면 복구됐다.

## 1부: 원인을 좁히는 과정

이 편은 트러블슈팅의 논리 전개가 깔끔하다. 세 가지 근거로 "Nginx 문제가 아니라 메트릭 처리 문제"라고 판단한다.

1. 서버는 요청을 정상 처리하고 있다. Nginx가 죽었다면 불가능하다.
2. 메트릭이 0이 아니라 **No Data**다.
3. Nginx CPU에 특이점이 없다.

CPU와 달리 **메모리**는 비정상적으로 올랐다. Ingress Nginx Controller 파드는 실제 트래픽을 처리하는 Nginx와 메트릭 수집 같은 부가 기능을 맡는 컨트롤러(Go), 두 프로세스로 이뤄져 있고 Nginx는 Lua 스크립트로 `/tmp/prometheus-nginx.socket`을 통해 컨트롤러에 메트릭을 보낸다. 리눅스에서는 소켓도 파일이므로 열린 파일 디스크립터(`open_fds`)를 봤더니 메모리와 같은 모양으로 치솟았고, 노드에서 확인하니 그 소켓이 **3,000개 넘게** 쌓여 있었다.

소스를 봤다. Nginx 쪽 `monitor.lua`는 `FLUSH_INTERVAL`(1초)마다 최대 `MAX_BATCH_SIZE`(10,000)개를 보내고, 넘치면 **버리고 경고 로그만** 남긴다. 즉 보내는 쪽은 트래픽과 무관하게 상한이 있어 병목이 되기 어렵다. 받는 쪽 컨트롤러의 `SocketCollector.Start()`는 연결 요청마다 소켓을 열고 고루틴을 띄워 `handleMessages()`를 실행한다. 그렇다면 트래픽이 늘수록 `handleMessages()`가 느려져 고루틴이 쌓이고 메모리가 오르는 것이라 추측할 수 있다. 실제로 Grafana의 고루틴 수가 메모리와 같은 모양이었다. 병렬 메트릭 처리에는 임계 구역이 있을 테니 뮤텍스가 원인일 것이라는 가설로 1부가 끝난다.

## 2부: 프로파일로 확인하고, 두 증상을 각각 설명하기

컨트롤러 파드 안에는 IC, Nginx master, Nginx worker 세 종류의 프로세스가 파드 자원을 공유한다. IC의 역할은 Nginx 프로세스 관리, Kubernetes 리소스와 Nginx 설정 동기화, 설정 제어와 메트릭 수집이다.

**고루틴 프로파일.** `goroutine profile: total 4309`, 대부분이 `sync.runtime_SemacquireMutex` ← `collectors.handleMessages` (socket.go:520)에서 잠든 상태. 가설이 맞았다. 버전은 v1.5.1.

**왜 그 뮤텍스인가.** `handleMessages()`는 JSON 바이트를 `socketData` 배열로 풀고, 항목마다 Prometheus 메트릭에 기록한다. 막힌 곳은 `latencyMetric.Observe(stats.Latency)`, 즉 summary 타입이다. `Observe()`는 I/O를 줄이려 버퍼(`hotBuf`)에 append하는데, Go의 `append`는 스레드 안전하지 않으니 `s.bufMtx.Lock()`으로 보호한다. 그런데 summary는 히스토그램과 달리 **저장이 느리고 조회가 빠른** 구조(분위수 계산용)라, 다른 counter·histogram 메트릭보다 `upstreamLatency` 기록에 연산이 많이 들어 락 보유 시간이 길어지고 경합이 심해진다.

정리하면 Nginx가 1초마다 메트릭을 모아 보내고, IC는 summary 기록 지연으로 1초 안에 처리를 못 끝내며, 고루틴과 미처리 `socketData`가 쌓여 메모리가 는다.

**그런데 왜 No Data인가.** 이것이 2부의 좋은 부분이다. 메모리 증가는 설명됐지만 No Data는 별개다. Prometheus는 pull 방식이고 대상 애플리케이션은 시간축 없이 **최신 값만** 들고 있다가 `/metrics` 호출에 응답한다. 그러니 IC가 새 메트릭 처리에 밀리더라도 직전까지 집계한 값은 줄 수 있어야 하고, 그러면 No Data가 아니라 낮은 값이어야 한다. No Data는 Prometheus 서버가 **타임아웃 등으로 긁기에 실패**해 null을 저장한 것이다. 원인은 `/metrics` 응답을 만들 때 summary가 최신 값을 반영하려고 버퍼를 flush하며 **같은 `bufMtx`를 잡는다**는 점이다. 이미 수천 고루틴이 그 락을 기다리고 있으니 응답 생성이 오래 막히고, Prometheus는 타임아웃으로 실패한다.

| 증상 | 원인 |
| --- | --- |
| FD·메모리 증가 | summary `Observe()` 락 경합으로 수집이 지연돼 소켓·고루틴·메트릭 객체가 쌓임 |
| 메트릭 No Data | `/metrics` 응답 생성 시 같은 락 경합으로 Prometheus 스크레이프가 타임아웃 |

## 해결: 두 선택지와 결정

**방법 1: 증설.** 운영 이력상 Nginx 한 대당 7~8K req/s까지는 괜찮았고 10K 근처부터 문제가 났다. IC 하나가 처리할 메트릭 양을 줄이면 되니 Nginx를 늘리는 것이 가장 단순하지만 비싼 방법이다.

**방법 2: 병목 메트릭 제외.** 수집 코드에 `sc.upstreamLatency != nil` 체크가 있고, `summaryMetric()`은 `excludedMetrics`에 `ingress_upstream_latency_seconds`가 있으면 nil을 반환한다. 실행 인자 `--exclude-socket-metrics`에 그 이름을 넣으면 된다.

결정은 **증설**이었다. 이유가 실무적이다. 첫째, Nginx가 애초에 초당 1만 개 이상은 버리므로 병목을 없애도 그 이상의 트래픽에서는 누락이 여전히 생긴다. 둘째, 실행 인자를 바꾸려면 Ingress-Nginx Helm 차트를 고쳐야 하는데, 전사 공용 차트를 고치면 upstream latency를 보고 있는 다른 서비스에 영향을 주고, 광고추천 조직만 별도 차트로 운영하는 것은 장기 운영 리스크다.

후일담으로, `upstreamLatency`는 예전부터 deprecated였지만 하위 호환 때문에 기본 수집이었고, 2024년 12월 말 v1.12.0에서 드디어 기본 집계 대상에서 빠졌다.

## 읽고 남는 질문

- 방법 1의 결정 근거 중 "1만 개 이상은 어차피 버린다"는 MAX_BATCH_SIZE를 올리는 세 번째 선택지를 시사하는데, 그것은 왜 검토되지 않았는지 궁금하다. 그것도 차트 변경이라 같은 이유로 배제됐을 것 같지만 명시가 없다.
- 증설 후 대당 트래픽을 얼마로 맞췄는지, 그 비용이 얼마인지가 없다. "비싼 방법"을 택했다면 그 크기가 있어야 판단이 완결된다.
- summary 대신 histogram으로 바꾸는 업스트림 기여는 검토했는지. v1.12.0에서 제외된 것을 보면 커뮤니티도 같은 결론에 도달한 셈이다.

## 한 줄로 가져가기

"메트릭이 사라졌다"와 "메모리가 는다"는 같은 원인의 다른 얼굴일 수 있고, 그것을 잇는 것은 추측이 아니라 고루틴 덤프의 콜스택이다. 그리고 근본 원인을 알아도 조직 경계(공용 차트) 때문에 비싼 우회를 택하는 것이 합리적일 때가 있다.
