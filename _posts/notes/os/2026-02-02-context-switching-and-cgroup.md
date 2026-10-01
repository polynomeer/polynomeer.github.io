---
title: "컨텍스트 스위칭과 스케줄링 - CFS, cgroup CPU 제한, 그리고 스로틀링"
date: 2026-02-02
categories: [Notes, OS]
tags: [OS, Scheduling, Context Switch, cgroup, Container, Performance, Kubernetes]
---

컨테이너에 `cpus: 2`를 주면 "CPU 2개를 쓴다"고 읽게 된다. 실제로는 100ms마다 200ms의 CPU 시간을 쓸 수 있다는 뜻이고, 그 차이가 p99(가장 느린 1% 요청의 지연)를 만든다. 스레드를 많이 만들면 느려진다는 것도 알지만 어디서 느려지는지는 설명하기 어렵다. 둘 다 리눅스 스케줄러의 동작에서 나온다.

## 컨텍스트 스위칭의 비용은 두 겹이다

직접 비용은 커널이 하는 일이다. 레지스터 저장과 복원, 스케줄러 자료구조 갱신, 주소 공간이 바뀌면 페이지 테이블 전환. 마이크로초 단위다.

간접 비용이 더 크다. 스위칭 직후 캐시와 TLB(가상 주소를 물리 주소로 바꾼 결과를 담는 캐시)에는 이전 스레드의 내용이 들어 있다. 그래서 새 스레드는 캐시 미스를 겪는다. 워킹셋이 크면 이 비용이 직접 비용을 넘는다. 스레드를 늘렸는데 처리량이 오히려 준다면 대개 여기다.

`vmstat 1`의 `cs` 열이나 `pidstat -w`로 초당 스위칭 수를 볼 수 있다. 절대값에 기준은 없고, 부하를 바꿔 가며 처리량과 함께 봐야 의미가 있다.

자발적(voluntary) 스위칭과 비자발적(involuntary) 스위칭을 나누는 것이 실무적으로 더 유용하다. 전자는 스레드가 IO나 락을 기다리며 스스로 양보한 것이고, 후자는 타임 슬라이스를 다 써서 뺏긴 것이다. 비자발적이 많으면 실행 가능한 스레드가 코어보다 많다는 뜻이다.

## CFS: 우선순위가 아니라 "받을 몫"

리눅스의 기본 스케줄러 CFS는 각 태스크가 받은 CPU 시간을 `vruntime`으로 누적하고, 가장 적게 받은 태스크를 다음에 실행한다. 커널 문서는 이 선택 규칙을 "it always tries to run the task with the smallest p->se.vruntime value"라고 적는다([CFS Scheduler](https://docs.kernel.org/scheduler/sched-design-CFS.html)). 지금까지 가장 적게 실행된 태스크를 고른다는 뜻이다. `nice` 값은 이 누적 속도의 가중치를 바꾼다. 우선순위 큐가 아니라 공평 분배가 모델이다.

그래서 실행 가능한 스레드가 많아도 각자가 조금씩은 받는다. 굶지는 않지만 **지연은 스레드 수에 비례해 늘어난다.** 코어 2개에 실행 가능한 스레드 200개면, 한 스레드가 다시 실행될 때까지 기다리는 시간은 그만큼 길어진다.

(커널 6.6부터 기본 스케줄러가 EEVDF로 옮겨 가기 시작했다. 태스크마다 가상 마감 시각을 계산해 짧은 타임 슬라이스를 원하는 지연 민감 태스크를 먼저 고를 수 있게 한 것이고, 같은 우선순위의 실행 가능 태스크에 CPU 시간을 고르게 나눈다는 큰 틀은 같다([EEVDF Scheduler](https://docs.kernel.org/scheduler/sched-eevdf.html)).)

## cgroup CPU 제한: 몫과 상한은 다르다

컨테이너의 CPU 설정은 두 종류다. 둘을 섞어 읽으면 오해한다.

| 설정 | cgroup v2 | 뜻 |
| --- | --- | --- |
| 몫(share) | `cpu.weight` | 경쟁할 때의 상대 비율. 한가하면 더 써도 된다 |
| 상한(quota) | `cpu.max = "200000 100000"` | 100ms(period)마다 200ms(quota)까지. 남아도 못 쓴다 |

`cpu.max`의 형식은 `$MAX $PERIOD`(마이크로초)이고 기본값은 `max 100000`, 즉 주기 100ms에 상한 없음이다([cgroup v2: CPU Interface Files](https://docs.kernel.org/admin-guide/cgroup-v2.html#cpu-interface-files)). Docker의 `cpus: 2`와 쿠버네티스의 `limits.cpu: 2`는 상한이다. `requests.cpu`는 몫이다. 쿠버네티스 문서도 CPU limit을 컨테이너가 쓸 수 있는 CPU 시간의 hard ceiling으로, CPU request를 경쟁 시의 가중치로 설명한다([Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)).

상한이 만드는 현상이 스로틀링이다. 한 주기(기본 100ms) 안에 할당량을 다 쓰면, 그 주기가 끝날 때까지 실행되지 않는다. 남은 시간이 얼마든 멈춘다. 그래서 CPU 사용률이 상한에 못 미치는데도 스로틀링이 걸리는 일이 흔하다. **사용률은 평균이고 스로틀링은 순간에 일어난다.** 100ms 중 앞 20ms에 몰아 쓰고 80ms를 멈추면 평균 사용률은 20%인데 지연은 80ms가 붙는다.

스레드가 많을수록 이 문제가 커진다. 스레드 20개가 각각 조금씩 쓰면 한 주기의 할당량을 순식간에 소진한다. JVM의 [GC](/posts/java-garbage-collection/) 스레드와 [JIT](/posts/jit-compilation/) 컴파일러 스레드도 이 할당량을 쓴다.

확인은 `cpu.stat`의 `nr_throttled`와 `throttled_usec`이다. 쿠버네티스에서는 `container_cpu_cfs_throttled_seconds_total`로 나온다. 사용률이 아니라 이 지표를 봐야 한다.

## 이 설명이 깨지는 곳

- JVM은 컨테이너 상한을 코어 수로 환산한다. `Runtime.availableProcessors()`가 이 값을 돌려주고, 그 값이 ForkJoinPool 병렬도, GC 스레드 수, 커넥션 풀 기본값에 쓰인다. HotSpot은 quota/period를 올림(`ceilf`)한다([jdk-21+35 `cgroupSubsystem_linux.cpp` 497행](https://github.com/openjdk/jdk/blob/jdk-21%2B35/src/hotspot/os/linux/cgroupSubsystem_linux.cpp#L497)). 그래서 `cpus: 1.5`처럼 소수를 주면 2가 되고, 실제 상한보다 큰 병렬도의 풀이 생겨 할당량을 더 빨리 소진한다.
- 상한을 없애면 스로틀링은 사라지지만 이웃이 굶는다. 쿠버네티스에서 `limits`를 빼는 처방이 도는 이유이자, 그것이 만능이 아닌 이유다.
- IO 대기는 CPU 할당량을 쓰지 않는다. 느린 것이 전부 CPU 문제는 아니고, [Tomcat 스레드 고갈](/posts/tomcat-thread-exhaustion/)처럼 CPU가 한가한 채로 멈추는 경우가 있다.
- 컨텍스트 스위칭 수 자체는 목표가 아니다. [이벤트 루프](/posts/epoll/)로 줄일 수 있지만, 그 대가로 블로킹 호출 하나가 전체를 멈춘다.

## 무엇을 재면 확인되는가

1. 같은 부하에서 `cpu.max`를 바꿔 가며 `nr_throttled`와 p99를 함께 본다. 사용률과 스로틀링이 같이 움직이지 않는 구간이 나온다.
2. 스레드 풀 크기를 코어 수의 1, 2, 4, 8배로 바꿔 가며 처리량과 비자발적 스위칭 수를 본다.
3. `availableProcessors()`가 컨테이너에서 무엇을 돌려주는지 직접 찍어 본다.

[monticker의 WebSocket과 폴링 비교](/posts/monticker-ws-vs-polling/)에서 "api·worker는 호스트 프로세스라 리소스 상한이 없다"를 한계로 적었다. 상한이 없으면 위 세 가지를 잴 수 없다. [spring-ops-lab](https://github.com/polynomeer/spring-ops-lab)에서 컨테이너 제한을 먼저 고정한 이유가 그것이다.

## 실무와의 접점

[대량 배치의 청크 병렬 처리](/posts/bulk-insert-with-lock-part3/)에서 병렬도를 올려 시간을 줄였다. 그때 기준은 처리량이었고, 컨테이너 상한과 스로틀링은 보지 않았다. 지금 다시 본다면 병렬도를 올리기 전에 `nr_throttled`부터 확인할 것이다. 상한이 걸린 환경에서 병렬도를 올리면 스위칭만 늘고 처리량은 그대로인 구간이 생기기 때문이다.

## 정리

- 자발적·비자발적 스위칭을 나눠 보면 "기다리는 중"과 "뺏기는 중"이 갈린다.
- 평균 사용률이 낮아도 순간 소진으로 스로틀링이 걸리므로, 봐야 할 지표는 사용률이 아니라 `nr_throttled`다.
- JVM은 상한을 올림해 코어 수로 쓴다. 소수 지정은 실제 상한보다 큰 풀을 만든다.

## 참고

- [Linux: CFS Scheduler](https://docs.kernel.org/scheduler/sched-design-CFS.html)
- [Linux: EEVDF Scheduler](https://docs.kernel.org/scheduler/sched-eevdf.html)
- [Control Group v2: CPU Interface Files](https://docs.kernel.org/admin-guide/cgroup-v2.html#cpu-interface-files)
- [Kubernetes: CPU limits and throttling](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [OpenJDK jdk-21+35: cgroupSubsystem_linux.cpp](https://github.com/openjdk/jdk/blob/jdk-21%2B35/src/hotspot/os/linux/cgroupSubsystem_linux.cpp)
- [프로세스와 스레드 정리](/posts/process-and-thread/), [멀티스레딩 정리](/posts/multi-threading/)
