---
title: "컨슈머 그룹과 리밸런스 - eager, cooperative, static membership"
date: 2026-03-03
categories: [Notes, Infrastructure]
tags: [Kafka, Consumer Group, Rebalancing, Messaging, Partitioning]
---

컨슈머를 한 대 추가했을 뿐인데 전체 처리가 몇 초 멈춘다. 배포할 때마다 랙이 튀고, 롤링 업데이트에서 인스턴스 수만큼 그 일이 반복된다. 리밸런스가 무엇을 멈추는지, 그리고 그 멈춤을 줄이는 선택지가 무엇인지 정리한다.

## 그룹, 파티션, 소유권

컨슈머 그룹은 토픽의 파티션을 나눠 갖는다. 규칙은 하나다. **한 파티션은 그룹 안에서 한 컨슈머만 읽는다.** 이것이 순서 보장의 근거이자 병렬도의 상한이다. 파티션이 6개면 컨슈머를 10개 띄워도 4개는 논다.

그룹의 구성원이 바뀌면 소유권을 다시 나눠야 한다. 이것이 **리밸런스**다. 트리거는 셋이다.

- 컨슈머가 합류하거나 떠남(배포, 스케일, 크래시)
- 컨슈머가 `session.timeout.ms` 안에 하트비트를 못 보냄
- 컨슈머가 `max.poll.interval.ms` 안에 `poll()`을 다시 호출하지 않음

세 번째가 실무에서 가장 자주 사고를 낸다. 처리 로직이 느려서 `poll()` 주기가 늘어나면, 브로커는 그 컨슈머가 죽었다고 보고 파티션을 뺏는다. 컨슈머는 살아 있으므로 처리를 마치고 커밋하려다 실패한다. **느린 처리가 리밸런스를 부르고, 리밸런스가 다시 처리를 늦춘다.**

## eager: 전부 놓고 다시 받는다

기본이던 방식(`RangeAssignor`, `RoundRobinAssignor`)은 **stop-the-world**다.

1. 모든 컨슈머가 자기 파티션을 **전부 반납**한다.
2. 그룹 코디네이터가 새 배정을 계산한다.
3. 각자 새 파티션을 받는다.

이 동안 그룹 전체가 아무것도 처리하지 않는다. 컨슈머 20대 중 1대가 추가돼도 20대가 다 멈춘다. 멈추는 시간은 배정 계산과 왕복, 그리고 `poll()` 주기에 달린다.

## cooperative: 옮길 것만 옮긴다

`CooperativeStickyAssignor`는 점진적으로 한다.

1. 1차 리밸런스에서 **옮겨야 할 파티션만** 반납한다.
2. 반납되지 않은 파티션은 그대로 계속 처리한다.
3. 2차 리밸런스에서 반납된 것들을 새 주인에게 준다.

왕복이 두 번이지만 **멈추는 범위가 작다.** 대부분의 컨슈머는 자기 파티션을 계속 읽는다. 컨슈머 수가 많을수록 이득이 크고, 지금은 이쪽이 기본 권장이다.

전환에는 순서가 있다. 프로토콜이 섞이면 안 되므로, 먼저 모든 컨슈머를 `[Cooperative, Eager]` 둘 다 지원하도록 배포하고, 그 다음 배포에서 eager를 뺀다. 한 번에 바꾸면 그룹이 형성되지 않는다.

## static membership: 재시작을 리밸런스로 보지 않게

배포로 컨슈머가 내려갔다 같은 역할로 다시 올라오는 것은 **구성원 변경이 아니라 재시작**이다. `group.instance.id`를 고정하면 브로커가 그것을 기억하고, `session.timeout.ms` 안에 같은 ID가 돌아오면 파티션을 그대로 돌려준다. 리밸런스가 아예 일어나지 않는다.

조건이 있다. `session.timeout.ms`가 **재시작에 걸리는 시간보다 길어야** 한다. 배포에 30초가 걸리는데 타임아웃이 10초면 효과가 없다. 그리고 진짜로 죽은 컨슈머를 감지하는 데도 그만큼 오래 걸린다. 이 값이 교환의 손잡이다.

## 세 방식의 비교

| | eager | cooperative | static membership |
| --- | --- | --- | --- |
| 멈추는 범위 | 그룹 전체 | 옮기는 파티션만 | 없음(재시작 한정) |
| 왕복 | 1회 | 2회 | 0회 |
| 적합한 상황 | 컨슈머가 적고 변경이 드묾 | 컨슈머가 많음 | 계획된 배포·재시작 |

셋은 배타적이지 않다. static membership과 cooperative를 함께 쓰는 것이 일반적인 구성이다.

## 이 설명이 깨지는 곳

- **리밸런스가 없어도 중복은 생긴다.** 오프셋 커밋 전에 죽으면 다시 받는다. at-least-once는 리밸런스와 무관한 전제이고, 멱등 소비자가 따로 필요하다([ParityPay 8편](/posts/parity-pay-kafka-failures/)).
- **파티션 수를 늘리면 순서 보장이 깨진다.** 키 해시의 분모가 바뀌어 같은 키가 다른 파티션으로 간다. 줄이는 것은 아예 안 된다.
- **`max.poll.records`를 줄이는 것이 흔한 처방이지만 만능이 아니다.** 건당 처리가 느리면 배치를 줄여도 총 시간이 그대로다. 처리를 비동기로 빼면 이번엔 커밋 시점이 어려워진다.
- **`group.instance.id`를 잘못 쓰면 두 컨슈머가 같은 ID를 주장한다.** 컨테이너 오케스트레이터가 같은 ID로 두 파드를 띄우면 하나가 쫓겨난다.

## 무엇을 재면 확인되는가

1. 컨슈머 한 대를 넣고 빼면서 그룹 전체의 처리 정지 시간을 잰다. eager와 cooperative를 같은 조건에서 번갈아.
2. `group.instance.id`를 켜고 배포를 흉내 내 리밸런스가 실제로 일어나지 않는지 확인한다.
3. 처리 시간을 인위로 늘려 `max.poll.interval.ms`를 넘겼을 때 무슨 일이 나는지.

[monticker 24편](/posts/monticker-partition-ordering/)에서 "컨슈머 스레드는 한 프로세스 안의 동시성이고, 프로세스 수를 늘린 것은 리밸런스를 포함하므로 따로 봐야 한다"를 한계로 적었다. 위 세 가지가 그 후속이다.

## 실무와의 접점

[SQS 파이프라인](/posts/polling-to-sqs-pipeline/)에는 리밸런스라는 개념이 없다. SQS는 파티션 소유권 대신 메시지 단위 가시성 타임아웃을 쓴다. 두 모델의 차이가 여기서 선명해진다. **Kafka는 순서를 위해 소유권을 두고, 그 대가로 소유권 재배치라는 정지를 갖는다.** 순서가 필요 없으면 그 정지도 필요 없다.

## 정리

- 한 파티션은 그룹 안에서 한 컨슈머만 읽는다. 이것이 순서 보장이자 병렬도의 상한이다.
- 리밸런스 트리거 중 실무에서 가장 잦은 것은 `max.poll.interval.ms` 초과다. 느린 처리가 리밸런스를 부른다.
- eager는 그룹 전체를 멈추고, cooperative는 옮기는 파티션만 멈춘다. 컨슈머가 많을수록 후자가 유리하다.
- cooperative 전환은 두 번의 배포로 한다. 한 번에 바꾸면 그룹이 형성되지 않는다.
- static membership은 재시작을 구성원 변경으로 보지 않는다. 대가는 죽은 컨슈머 감지가 느려지는 것이다.

## 참고

- [Kafka: Consumer Group Protocol](https://kafka.apache.org/documentation/#design_consumergroup)
- [KIP-429: Incremental Cooperative Rebalancing](https://cwiki.apache.org/confluence/display/KAFKA/KIP-429%3A+Kafka+Consumer+Incremental+Rebalance+Protocol)
- [KIP-345: Static Membership](https://cwiki.apache.org/confluence/display/KAFKA/KIP-345%3A+Introduce+static+membership+protocol+to+reduce+consumer+rebalances)
