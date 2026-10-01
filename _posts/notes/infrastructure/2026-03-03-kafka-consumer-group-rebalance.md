---
title: "컨슈머 그룹과 리밸런스 - eager, cooperative, static membership"
date: 2026-03-03
categories: [Notes, Infrastructure]
tags: [Kafka, Consumer Group, Rebalancing, Messaging, Partitioning]
---

컨슈머를 한 대 추가했을 뿐인데 전체 처리가 몇 초 멈춘다. 배포할 때마다 랙이 튀고, 롤링 업데이트에서 인스턴스 수만큼 그 일이 반복된다. 이 글은 리밸런스가 무엇을 멈추는지, 그 멈춤을 줄이는 선택지가 무엇인지 다룬다.

## 그룹, 파티션, 소유권

컨슈머 그룹은 토픽의 파티션을 나눠 갖는다. 규칙은 하나다. **한 파티션은 그룹 안에서 한 컨슈머만 읽는다.** 그래서 파티션 안의 순서가 지켜지고, 동시에 파티션 수가 병렬도의 상한이 된다. 파티션이 6개면 컨슈머를 10개 띄워도 4개는 논다.

그룹의 구성원이 바뀌면 소유권을 다시 나눠야 한다. 이것이 리밸런스다. 트리거는 셋이다.

- 컨슈머가 합류하거나 떠남(배포, 스케일, 크래시)
- 컨슈머가 `session.timeout.ms`(기본 45초) 안에 하트비트를 못 보냄
- 컨슈머가 `max.poll.interval.ms`(기본 5분) 안에 `poll()`을 다시 호출하지 않음([Consumer Configs](https://kafka.apache.org/43/configuration/consumer-configs/))

세 번째가 실무에서 가장 자주 사고를 낸다. 처리 로직이 느려서 `poll()` 주기가 늘어나면, 그 컨슈머는 실패한 것으로 간주되고 그룹은 파티션을 다른 멤버에게 다시 나눈다. 컨슈머는 살아 있으므로 처리를 마치고 커밋하려다 실패한다. 그 결과 느린 처리가 리밸런스를 부르고, 리밸런스가 다시 처리를 늦춘다.

## eager: 전부 놓고 다시 받는다

기본이던 방식(`RangeAssignor`, `RoundRobinAssignor`)은 stop-the-world(전체 정지)다.

1. 모든 컨슈머가 자기 파티션을 전부 반납한다.
2. 그룹 코디네이터가 새 배정을 계산한다.
3. 각자 새 파티션을 받는다.

**이 동안 그룹 전체가 아무것도 처리하지 않는다.** 컨슈머 20대 중 1대가 추가돼도 20대가 다 멈춘다. 멈추는 시간은 배정 계산과 왕복, 그리고 `poll()` 주기에 달린다.

## cooperative: 옮길 것만 옮긴다

`CooperativeStickyAssignor`는 점진적으로 한다.

1. 1차 리밸런스에서 옮겨야 할 파티션만 반납한다.
2. 반납되지 않은 파티션은 그대로 계속 처리한다.
3. 2차 리밸런스에서 반납된 것들을 새 주인에게 준다.

왕복이 두 번이지만 **멈추는 범위가 작다.** 대부분의 컨슈머는 자기 파티션을 계속 읽는다. KIP-429는 이것을 리밸런스가 진행 중이어도 그룹이 일부 레코드를 계속 처리할 수 있다고 설명한다([KIP-429](https://cwiki.apache.org/confluence/display/KAFKA/KIP-429%3A+Kafka+Consumer+Incremental+Rebalance+Protocol)). 컨슈머 수가 많을수록 이득이 크다. 현재 클라이언트의 `partition.assignment.strategy` 기본값은 `[RangeAssignor, CooperativeStickyAssignor]`이고, 기본은 Range로 동작하면서 cooperative로 옮겨 갈 길을 열어 둔 형태다([Consumer Configs](https://kafka.apache.org/43/configuration/consumer-configs/)).

전환에는 순서가 있다. 먼저 모든 컨슈머를 `[Cooperative, Eager]` 둘 다 지원하도록 배포하고, 그 다음 배포에서 eager를 뺀다. KIP-429가 이 두 번의 롤링 재시작을 요구한다. 한 번에 바꾸면 옛 코드의 리더가 eager로 배정을 계산하는 동안, 새 코드의 컨슈머는 파티션을 반납하지 않은 채 합류할 수 있다. 기본값 목록에 이미 둘 다 들어 있는 클라이언트라면 Range를 빼는 롤링 재시작 한 번이면 된다.

## static membership: 재시작을 리밸런스로 보지 않게

배포로 컨슈머가 내려갔다 같은 역할로 다시 올라오는 것은 **구성원 변경이 아니라 재시작**이다. `group.instance.id`를 고정하면 브로커가 그것을 기억하고, `session.timeout.ms` 안에 같은 ID가 돌아오면 캐시해 둔 배정을 그대로 돌려준다. 리밸런스가 아예 일어나지 않는다([KIP-345](https://cwiki.apache.org/confluence/display/KAFKA/KIP-345%3A+Introduce+static+membership+protocol+to+reduce+consumer+rebalances)).

조건이 있다. `session.timeout.ms`가 재시작에 걸리는 시간보다 길어야 한다. 배포에 30초가 걸리는데 타임아웃이 10초면 효과가 없다. 그런데 진짜로 죽은 컨슈머를 감지하는 데도 그만큼 오래 걸린다. 그래서 이 값 하나가 재시작 내성과 장애 감지 속도를 맞바꾼다.

## 세 방식의 비교

| | eager | cooperative | static membership |
| --- | --- | --- | --- |
| 멈추는 범위 | 그룹 전체 | 옮기는 파티션만 | 없음(재시작 한정) |
| 왕복 | 1회 | 2회 | 0회 |
| 적합한 상황 | 컨슈머가 적고 변경이 드묾 | 컨슈머가 많음 | 계획된 배포·재시작 |

셋은 배타적이지 않다. static membership과 cooperative를 함께 쓰는 것이 일반적인 구성이다.

## 이 설명이 깨지는 곳

- **리밸런스가 없어도 중복은 생긴다.** 오프셋 커밋 전에 죽으면 다시 받는다. [at-least-once](/posts/kafka-delivery-guarantees/)는 리밸런스와 무관한 전제이고, [멱등](/posts/idempotency-key-design/) 소비자가 따로 필요하다([ParityPay 8편](/posts/parity-pay-kafka-failures/)).
- 파티션 수를 늘리면 순서 보장이 깨진다. 키 해시의 분모가 바뀌어 같은 키가 다른 파티션으로 간다. 줄이는 것은 아예 안 된다.
- `max.poll.records`를 줄이는 것이 흔한 처방이지만 만능이 아니다. 건당 처리가 느리면 배치를 줄여도 총 시간이 그대로다. 처리를 비동기로 빼면 이번엔 커밋 시점이 어려워진다.
- `group.instance.id`를 잘못 쓰면 두 컨슈머가 같은 ID를 주장한다. 그룹에는 같은 ID의 인스턴스가 한 번에 하나만 있을 수 있으므로([Consumer Configs](https://kafka.apache.org/43/configuration/consumer-configs/)), 컨테이너 오케스트레이터가 같은 ID로 두 파드를 띄우면 하나가 `FENCED_INSTANCE_ID`로 쫓겨난다([KIP-345](https://cwiki.apache.org/confluence/display/KAFKA/KIP-345%3A+Introduce+static+membership+protocol+to+reduce+consumer+rebalances)).

## 무엇을 재면 확인되는가

1. 컨슈머 한 대를 넣고 빼면서 그룹 전체의 처리 정지 시간을 잰다. eager와 cooperative를 같은 조건에서 번갈아.
2. `group.instance.id`를 켜고 배포를 흉내 내 리밸런스가 실제로 일어나지 않는지 확인한다.
3. 처리 시간을 인위로 늘려 `max.poll.interval.ms`를 넘겼을 때 무슨 일이 나는지.

[monticker 24편](/posts/monticker-partition-ordering/)의 한계에 "컨슈머 스레드 C는 한 프로세스 안의 동시성이다. 프로세스 수를 늘린 것은 리밸런스 실험뿐이다."를 적었다. 위 세 가지가 그 후속이다.

## 실무와의 접점

[SQS 파이프라인](/posts/polling-to-sqs-pipeline/)에는 리밸런스라는 개념이 없다. SQS는 파티션 소유권 대신 메시지 단위 가시성 타임아웃을 쓴다. Kafka는 순서를 위해 소유권을 두고, 그 대가로 소유권 재배치라는 정지를 갖는다. 그래서 순서가 필요 없는 작업이라면 그 정지를 감수할 이유도 없다.

## 정리

- 배포 때마다 랙이 튄다면 먼저 `max.poll.interval.ms` 초과와 eager 배정을 의심한다.
- cooperative 전환은 두 번의 롤링 재시작으로 한다.
- static membership의 대가는 죽은 컨슈머 감지가 `session.timeout.ms`만큼 느려지는 것이다.

## 참고

- [Kafka: Consumer Group Protocol](https://kafka.apache.org/documentation/#design_consumergroup)
- [Kafka 4.3 Consumer Configs](https://kafka.apache.org/43/configuration/consumer-configs/)
- [KIP-429: Incremental Cooperative Rebalancing](https://cwiki.apache.org/confluence/display/KAFKA/KIP-429%3A+Kafka+Consumer+Incremental+Rebalance+Protocol)
- [KIP-345: Static Membership](https://cwiki.apache.org/confluence/display/KAFKA/KIP-345%3A+Introduce+static+membership+protocol+to+reduce+consumer+rebalances)
