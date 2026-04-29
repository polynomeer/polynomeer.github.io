---
title: "Spring Batch의 구조 - 청크, 파티셔닝, 재시작과 메타데이터"
date: 2026-04-29
categories: [Notes, Spring]
tags: [Spring, Spring Batch, Batch, Chunk, Partitioning, Performance]
---

배치를 직접 만들면 결국 같은 것들을 다시 만들게 된다. 어디까지 했는지 기억하기, 실패한 지점부터 다시 하기, 몇 건씩 끊어서 커밋하기, 병렬로 돌리기. Spring Batch는 이 넷을 규격화한 프레임워크이고, 구조를 알면 "왜 이 설정이 있는가"가 설명된다.

## Job, Step, 그리고 메타데이터

`Job`은 여러 `Step`의 나열이고, 실행 이력은 **`JobRepository`가 DB에 기록한다.** 이 메타데이터가 프레임워크의 절반이다.

| 테이블 | 담는 것 |
| --- | --- |
| `BATCH_JOB_INSTANCE` | Job 이름 + 파라미터의 조합. "어떤 실행인가"의 정체 |
| `BATCH_JOB_EXECUTION` | 그 인스턴스의 실제 실행. 상태, 시작·종료 시각 |
| `BATCH_STEP_EXECUTION` | Step별 읽은 수, 쓴 수, 건너뛴 수, 커밋 수 |
| `BATCH_*_EXECUTION_CONTEXT` | 재시작에 필요한 위치 정보 |

여기서 중요한 규칙이 나온다. **같은 Job 이름 + 같은 파라미터는 한 번만 성공할 수 있다.** 이미 성공한 조합으로 다시 실행하면 `JobInstanceAlreadyCompleteException`이다. 그래서 날짜나 실행 시각을 파라미터로 넣는 관행이 생겼다. 이것은 불편이 아니라 **중복 실행 방지 장치**다.

## Tasklet과 Chunk

`Step`의 구현은 둘이다.

**Tasklet**은 "한 덩어리 작업"이다. 파일 이동, 테이블 정리, 프로시저 호출처럼 나눌 필요가 없는 일에 쓴다. 트랜잭션이 하나이므로 **그 안에서 대량 처리를 하면 트랜잭션이 길어지고 메모리가 쌓인다.**

**Chunk**는 `ItemReader` → `ItemProcessor` → `ItemWriter`를 N건씩 묶어 처리하고 **묶음마다 커밋**한다.

```text
read read read ... (chunk size만큼) → process → write → commit → 다음 묶음
```

얻는 것이 셋이다. 트랜잭션이 짧아지고, 메모리에 올라오는 것이 묶음 크기로 제한되며, 실패해도 그 묶음 전까지는 커밋돼 있다.

[Heap Dump가 가리킨 곳](/posts/batch-heap-dump-to-chunk/)에서 Tasklet을 Chunk로 바꾼 이유가 이것이었다. 문제는 데이터 크기가 아니라 **영속성 컨텍스트에 쌓인 엔티티**였고, 묶음마다 커밋하면 그 컨텍스트가 비워진다.

## 청크 크기를 정하는 기준

크게 잡으면 커밋 횟수가 줄어 처리량이 오르고, 작게 잡으면 트랜잭션과 메모리가 가벼워진다. 교환의 양쪽 끝은 이렇다.

- **너무 크면**: 트랜잭션이 길어져 DB 잠금 보유가 늘고, 메모리가 쌓이며, 실패 시 되돌리는 양이 커진다.
- **너무 작으면**: 커밋과 flush 왕복이 잦아 처리량이 떨어진다.

정답은 측정이다. 다만 **JPA를 쓴다면 `chunkSize`와 하이버네이트의 `batch_size`를 맞추는 것**이 흔한 출발점이다. 둘이 어긋나면 flush가 예상과 다른 시점에 일어난다.

## 실패 다루기: skip과 retry

`faultTolerant()`를 켜면 두 가지가 생긴다.

**skip**은 특정 예외를 만난 항목을 건너뛴다. 데이터 품질 문제(형식 오류, 참조 없음)에 쓴다. 한도(`skipLimit`)를 반드시 둔다. 한도가 없으면 전부 실패해도 Job은 "성공"으로 끝난다.

**retry**는 일시적 실패를 다시 시도한다. 락 경합이나 순간적인 네트워크 오류에 쓴다.

주의할 점이 있다. **retry나 skip이 걸리면 그 묶음은 항목 단위로 다시 처리된다.** 어느 항목이 문제였는지 알아내기 위해 묶음을 쪼개 재실행하기 때문이다. 이때 `ItemProcessor`가 멱등하지 않으면 부작용이 두 번 일어난다. 프로세서에 외부 호출이나 상태 변경을 넣지 않아야 하는 이유다.

## 병렬화의 세 층

| 방법 | 나누는 단위 | 적합한 경우 |
| --- | --- | --- |
| Multi-threaded Step | 같은 Step 안에서 묶음을 여러 스레드가 | Reader가 스레드 안전할 때 |
| Parallel Steps | 서로 독립인 Step들을 동시에 | 단계 간 의존이 없을 때 |
| **Partitioning** | 데이터를 범위로 나눠 Step 인스턴스를 여럿 | 대량 데이터의 수평 분할 |

Partitioning이 가장 널리 쓰인다. `Partitioner`가 "1~10000번, 10001~20000번" 식으로 범위를 나누고, 각 파티션이 독립된 `StepExecution`을 갖는다. 메타데이터에 파티션별 진행이 기록되므로 **재시작도 파티션 단위로** 된다.

Multi-threaded Step은 주의가 필요하다. 대부분의 `ItemReader`는 스레드 안전하지 않고, 상태를 가진 Reader(`JpaPagingItemReader` 등)를 여러 스레드가 쓰면 항목을 건너뛰거나 중복한다. 그래서 병렬이 필요하면 Partitioning으로 가는 것이 안전하다.

## 이 설명이 깨지는 곳

- **재시작이 항상 안전한 것은 아니다.** 프레임워크는 "어디까지 커밋됐는가"를 기억할 뿐, 그 사이에 일어난 외부 부작용은 모른다. 재시작 가능한 배치는 처리 자체가 멱등해야 한다.
- **`JobParameters`에 실행 시각을 넣으면 중복 실행 방지가 사라진다.** 매번 다른 인스턴스가 되므로 두 번 돌려도 막지 않는다. 의도한 것인지 확인해야 한다.
- **Tasklet이 항상 나쁜 것은 아니다.** 나눌 필요 없는 작업에 Chunk를 씌우면 복잡도만 는다.
- **메타데이터 테이블도 자란다.** 오래된 실행 이력의 정리 정책이 필요하다.

## 무엇을 재면 확인되는가

1. 청크 크기를 100/500/1000/5000으로 바꿔 가며 처리 시간, 힙 사용량, DB 잠금 보유 시간을 함께 본다.
2. Partitioning의 파티션 수를 바꿔 가며 처리량이 포화되는 지점을 찾는다. DB가 병목이면 파티션을 늘려도 안 는다.
3. 재시작을 일부러 유발해(중간에 강제 종료) 재개 지점이 정확한지, 부작용이 두 번 일어나지 않는지 확인한다.

[대량 배치 3부](/posts/bulk-insert-with-lock-part3/)에서 청크 병렬 처리를 다뤘고, 그때 기준은 처리량이었다. 지금이라면 [컨테이너 CPU 상한과 스로틀링](/posts/context-switching-and-cgroup/)을 함께 봤을 것이다.

## 실무와의 접점

[대량 배치 시리즈](/series/batch-structure-improvement/)에서 만든 것은 프레임워크가 주는 것과 같은 문제였다. 어디까지 했는지 기록하기, 실패 지점부터 재개하기, 상호 배제. 직접 만들면서 상태 저장소(`DELETING`·`REGISTERING`·`COMPLETED`)를 둔 것이 사실상 `BATCH_STEP_EXECUTION`의 축소판이었다. 프레임워크를 쓰든 안 쓰든 **배치에 필요한 것의 목록은 같다**는 것이 그 경험의 결론이다.

## 정리

- 메타데이터가 프레임워크의 절반이다. 재시작과 중복 실행 방지가 전부 여기서 나온다.
- 같은 Job 이름 + 파라미터는 한 번만 성공한다. 파라미터에 시각을 넣으면 그 보호가 사라진다.
- Chunk는 트랜잭션 길이, 메모리, 실패 범위를 동시에 줄인다.
- skip과 retry에는 한도를 둔다. 한도 없는 skip은 전부 실패한 Job을 성공으로 보고한다.
- retry·skip 시 묶음이 항목 단위로 재처리되므로 `ItemProcessor`는 멱등해야 한다.
- 병렬이 필요하면 Partitioning이 안전하다. Multi-threaded Step은 Reader의 스레드 안전성에 걸린다.

## 참고

- [Spring Batch: Domain Language](https://docs.spring.io/spring-batch/reference/domain.html)
- [Spring Batch: Scaling and Parallel Processing](https://docs.spring.io/spring-batch/reference/scalability.html)
- [Heap Dump가 가리킨 곳](/posts/batch-heap-dump-to-chunk/)
