---
title: "네이버 D2 「리눅스의 Control Groups 기능이 Kubernetes에 어떻게 적용되는지 살펴보기」 리뷰 — requests와 limits가 실제로 커널의 어떤 파일에 쓰이는지"
date: 2025-10-08
categories: [TechBlog, Naver]
tags: [Tech Blog Review, Naver, Kubernetes, Linux, cgroups, CPU Throttling, Resource Management]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 12
source_url: https://d2.naver.com/helloworld/7248350
---

원문: [리눅스의 Control Groups 기능이 Kubernetes에 어떻게 적용되는지 살펴보기](https://d2.naver.com/helloworld/7248350) — NAVER D2, 성주호, 2025-02-27

## 한 줄 요약

Pod 매니페스트의 `resources.requests`와 `resources.limits`는 결국 리눅스 cgroups의 파일 몇 개에 숫자로 쓰인다. `limits.memory`는 `memory.limit_in_bytes`(넘으면 OOM kill), `limits.cpu`는 `cpu.cfs_quota_us`(넘으면 스로틀링), `requests.cpu`는 `cpu.shares`(경쟁 시 비율). 그런데 **`requests.memory`는 cgroup에 아무것도 쓰지 않는다.** 스케줄링에만 쓰인다. 이 사실 하나가 마지막의 운영 조언 두 가지를 설명한다.

## 배경: cgroups는 디렉터리와 파일이다

cgroups는 프로세스를 그룹으로 묶고 그룹별로 CPU·메모리·I/O·네트워크 사용을 제한·격리하는 커널 기능이다. `/sys/fs/cgroup` 아래에 자원별 디렉터리(`memory`, `cpu,cpuacct`, `cpuset`, `blkio` …)가 있고, 그 안에 디렉터리를 만들면 cgroup이 하나 생기며, 파일에 값을 쓰면 설정이 바뀐다. 원문은 cgroups v1을 기준으로 직접 만져 본다.

## 메모리: limit은 쓰고 request는 안 쓴다

`memory` 아래 `test1` 디렉터리를 만들면 설정 파일이 잔뜩 생긴다. Kubernetes와 관련된 것은 셋이다.

- `memory.limit_in_bytes`: 넘으면 프로세스를 죽이거나 오류. 기본값은 uint64 최대.
- `memory.soft_limit_in_bytes`: 일시적 초과는 허용, 지속 초과는 금지. 기본값은 uint64 최대.
- `tasks`: 이 cgroup에 속한 PID.

실험은 간단하다. 100MB를 쓰는 `stress` 프로세스를 띄우고 `memory.limit_in_bytes`에 1MB를 쓴 뒤 `tasks`에 PID를 넣으면 즉시 OOM으로 죽는다.

이제 `requests.memory: 512Mi`, `limits.memory: 768Mi`인 Pod를 띄우고 그 컨테이너의 cgroup 디렉터리(`kubepods.slice/kubepods-burstable.slice/…/container`)를 보면, `memory.limit_in_bytes`는 예상대로 768Mi다. 그런데 `memory.soft_limit_in_bytes`는 512Mi가 아니라 **기본값 그대로**다. Docker는 `--memory-reservation`으로 soft limit을 쓰지만, Kubernetes는 `requests.memory`를 cgroup에 쓰지 않고 스케줄링(어느 노드에 둘지)에만 참고한다.

## CPU: quota는 상한, shares는 비율

`cpu,cpuacct` 아래 cgroup을 만들면 관련 값은 넷이다.

- `cpu.cfs_period_us`: CPU 접근을 재할당하는 주기. 기본 100000(100ms).
- `cpu.cfs_quota_us`: 그 주기 안에서 쓸 수 있는 시간. 기본 -1(무제한). 다 쓰면 나머지 시간엔 못 쓴다(스로틀링).
- `cpu.shares`: 다른 cgroup 대비 상대 비율. 기본 1024.
- `tasks`.

**quota 실험.** 4코어 장비에 `stress`를 4개 띄워 코어 4개를 100% 쓰게 한 뒤, 한 프로세스만 period 100ms에 quota 50ms로 두면 그 프로세스가 CPU를 절반만 쓴다.

**shares 실험.** cgroup 4개가 모두 1024면 각각 1/4. 하나를 1536으로 올리면 1536/(1536+512+1024+1024) = 37.5%. 실제로 cgroup 둘에 각 4개 프로세스로 포화시킨 뒤 shares를 1024와 512로 두면 66.6%와 33.3%로 갈린다. 중요한 점은 shares는 **경쟁이 있을 때만** 작동하는 비율이라는 것이다. 다른 쪽이 놀고 있으면 제한이 아니다.

Pod로 옮기면 이렇다.

| Pod 설정 | cgroup 파일 | 값 |
| --- | --- | --- |
| (없음) | `cpu.cfs_period_us` | 100000 고정, 매니페스트로 못 바꿈 |
| `limits.cpu: 4000m` | `cpu.cfs_quota_us` | 400000 (4코어 장비면 -1과 같음) |
| `limits.cpu` 미설정 | `cpu.cfs_quota_us` | -1 (무제한) |
| `requests.cpu: 2000m` | `cpu.shares` | 2000/1000 × 1024 = 2048 |

특정 코어를 독점하는 cpuset도 있지만 원문은 생략하고 CPUSETS 문서와 Kubernetes v1.31 CPUManager static policy 링크만 준다.

## 운영 조언 둘, 그리고 그 근거

원문 마지막의 두 줄이 이 글의 실용적 결론이다.

1. **`requests.memory`는 `limits.memory`와 같게 둔다.** 다르게 둔다고 자원을 아끼는 것이 아니다. 위에서 본 대로 request는 cgroup에 안 쓰이므로, request < limit이면 스케줄러는 request만큼만 예약해 두고 실제로는 limit까지 쓸 수 있어 노드 메모리가 과약정된다. 결국 다른 Pod가 OOM으로 죽을 수 있다. 같게 두면 예약과 상한이 일치한다.
2. **API 서버처럼 지연이 중요한 것은 `limits.cpu`를 설정하지 않는다.** quota는 100ms 주기 안에서 할당량을 다 쓰면 나머지 시간 동안 멈추게 한다. 요청이 몰리는 순간 스로틀링이 걸리면 응답이 늦어진다. limit을 빼도 `requests.cpu`(shares) 비율대로 Pod 간에 나뉘므로 다른 프로세스의 자원을 과도하게 뺏지는 않는다.

## 읽고 남는 질문

- cgroups v1 기준이다. v2에서는 `cpu.max`, `memory.max`, `memory.high`, `cpu.weight`로 파일이 바뀌고, 특히 `memory.high`(throttle 기반 soft limit)가 생겨 request를 반영할 여지가 있다. 최근 Kubernetes는 v2가 기본이므로 같은 실험을 v2로 한 번 더 보면 좋겠다.
- "limits.cpu를 빼라"는 조언은 노드 전체가 포화되지 않는다는 전제가 있다. 노드가 꽉 찼을 때 shares만으로 지연 민감 Pod를 보호하기에 충분한지, 그때는 Guaranteed QoS나 cpuset이 필요한지가 궁금하다.
- `limits.cpu`를 빼면 QoS 클래스가 Burstable이 되고 메모리 압박 시 eviction 우선순위가 달라진다. 그 부작용도 같이 언급됐으면 완결성이 있었을 것이다.

## 한 줄로 가져가기

Kubernetes 자원 설정은 추상이 아니라 커널 파일에 쓰이는 숫자다. request 메모리는 어디에도 안 쓰이고, limit CPU는 100ms마다 멈추게 하는 장치라는 걸 알면 "메모리는 같게, CPU limit은 빼라"가 왜 나오는지 보인다.
