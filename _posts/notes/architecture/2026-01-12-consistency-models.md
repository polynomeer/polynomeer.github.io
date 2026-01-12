---
title: "일관성 모델 - 선형화, 순차, 최종 일관성, 그리고 CAP를 설정값의 언어로"
date: 2026-01-12
categories: [Notes, Architecture]
tags: [Distributed System, Consistency, CAP, Linearizability, Eventual Consistency, Replication]
---

"강한 일관성"과 "최종 일관성" 두 단어로 분산 시스템의 일관성을 이야기하면, 정작 설정 파일 앞에서 막힌다. Kafka의 `acks`, PostgreSQL의 `synchronous_commit`, MongoDB의 `writeConcern`·`readConcern`은 전부 일관성 모델을 값으로 고르는 자리인데, 두 단어짜리 어휘로는 그 값을 고를 수 없다. 이 글은 모델의 이름을 설정값과 연결하는 것이 목적이다.

## 세 모델의 차이는 "무엇이 보이지 않는가"

**선형화(linearizability)** 는 가장 강하다. 모든 연산이 어느 한 시점에 원자적으로 일어난 것처럼 보이고, 그 순서는 **실제 시간 순서**를 지킨다. A의 쓰기가 끝난 뒤 시작한 B의 읽기는 반드시 A의 값을 본다. 단일 객체에 대한 성질이다.

**순차(sequential)** 는 전체 순서는 있지만 실시간 순서를 지키지 않는다. 모두가 같은 순서로 보되, 그 순서가 벽시계와 달라도 된다. B가 A보다 늦게 읽었는데 옛 값을 볼 수 있다.

**인과(causal)** 는 인과관계가 있는 연산의 순서만 지킨다. "댓글은 글보다 먼저 보이지 않는다"는 보장하지만, 무관한 두 글의 순서는 사람마다 다를 수 있다.

**최종(eventual)** 은 쓰기가 멈추면 언젠가 수렴한다는 것만 보장한다. "언젠가"에 상한이 없다.

실무에서 쓰는 어휘도 여기 붙는다. **read-your-writes**(내가 쓴 것은 내가 읽는다), **monotonic reads**(한 번 본 값보다 과거로 돌아가지 않는다)는 최종 일관성 위에 얹는 세션 보장이고, 대부분의 "복제 지연 때문에 방금 쓴 게 안 보여요" 버그는 이 두 보장의 부재다.

## 설정값으로 번역하기

| 시스템 | 설정 | 무엇을 고르는 것인가 |
| --- | --- | --- |
| Kafka | `acks=0 / 1 / all` + `min.insync.replicas` | 쓰기가 "완료"로 간주되는 복제 수. `all`은 ISR 전체, `1`은 리더만 |
| PostgreSQL | `synchronous_commit = off / local / on / remote_apply` | 커밋 응답 전에 WAL이 어디까지 갔는가 |
| MongoDB | `writeConcern: w:1 / majority`, `readConcern: local / majority / linearizable` | 쓰기 확인 범위와 읽기 시점 |
| Redis | 비동기 복제(기본), `WAIT` | 복제 확인을 명시적으로 기다릴지 |
| DNS·CDN | TTL | 수렴까지 걸리는 시간의 상한 |

여기서 한 가지가 분명해진다. **일관성은 시스템의 성질이 아니라 호출마다 고르는 값이다.** 같은 MongoDB에서 결제 경로는 `majority`, 조회 경로는 `local`을 쓸 수 있다. "우리는 최종 일관성 시스템입니다"라는 문장은 대개 기본값을 말한 것이다.

## CAP는 선택지가 아니라 장애 중의 동작이다

CAP를 "셋 중 둘"로 외우면 오해한다. 분할(P)은 고르는 것이 아니라 **일어나는 일**이다. 네트워크가 끊긴 순간, 시스템은 둘 중 하나를 한다.

- **CP**: 과반과 연결되지 않은 쪽이 응답을 거부한다. 틀린 답을 주느니 답하지 않는다.
- **AP**: 양쪽 다 응답하고 나중에 수렴시킨다. 충돌 해소 규칙이 필요하다.

그리고 분할이 없는 평시에도 선택이 있다. PACELC가 그 확장이다. **분할 시(P)에는 A와 C 중에, 그 외(E)에는 지연(L)과 일관성(C) 중에** 고른다. 실무에서 더 자주 만나는 것은 후자다. 분할은 드물고, 동기 복제의 지연은 매일이다.

## 이 설명이 깨지는 곳

- **선형화는 단일 객체 성질이고, 직렬화는 트랜잭션 성질이다.** 둘은 다른 축이다. 두 개를 합친 것이 strict serializable이고, 대부분의 DB는 둘 중 하나만 말한다.
- **"강한 일관성"이라는 말은 표준 용어가 아니다.** 제품 문서마다 가리키는 것이 다르므로, 벤더 문서에서 이 단어를 보면 어떤 보장인지 따로 확인해야 한다.
- **합의 알고리즘이 있어도 클라이언트가 옛 리더에게 말하면 옛 값을 읽을 수 있다.** 읽기를 어디로 보내는지가 보장의 일부다.
- **일관성 모델은 지연을 말해 주지 않는다.** `acks=all`이 얼마나 느린지는 모델이 아니라 토폴로지가 정한다.

## 무엇을 재면 확인되는가

모델 이름으로는 비용을 알 수 없다. 같은 클러스터에서 설정값만 바꿔 재야 한다.

1. `acks=0/1/all`별 처리량과 p99, 그리고 브로커를 죽였을 때의 유실 건수.
2. 복제 지연 아래에서 "방금 쓴 것을 읽기"의 실패율.
3. 동기 복제를 켰을 때 커밋 지연의 분포.

[ParityPay 8편](/posts/parity-pay-kafka-failures/)에서 1번을 쟀다. `acks=all`은 브로커가 죽어 있던 7초 동안 유실 0건이었고, `acks=1`과 `0`은 배치 단위로 잃었다. 다만 단일 노드였으므로 ISR 축소와 리더 교체는 재지 못했고, 그것이 그 글의 한계로 남아 있다. 모델의 이름이 주는 보장과 실제 토폴로지가 주는 보장은 다르다는 것이 여기서 갈린다.

## 실무와의 접점

[SQS 파이프라인 전환](/posts/polling-to-sqs-pipeline/)에서 순서 역전을 상태 전이로 다뤘다. 그때는 "최종 일관성"이라는 말을 쓰지 않았지만, 실제로 한 일은 인과 순서를 메시지 순서에 의존하지 않고 상태로 복원하는 것이었다. 일관성 모델의 어휘로 다시 쓰면, **약한 모델 위에서 필요한 보장만 애플리케이션이 만들어 쓴 것**이다.

## 정리

- 일관성 모델은 "무엇이 보이지 않는가"의 목록이다. 선형화는 실시간 순서까지, 최종은 수렴만 보장한다.
- read-your-writes와 monotonic reads는 최종 일관성 위에 얹는 세션 보장이고, 복제 지연 버그의 대부분은 이 둘의 부재다.
- 일관성은 시스템의 성질이 아니라 호출마다 고르는 설정값이다.
- CAP의 P는 선택지가 아니다. 고르는 것은 분할 중의 동작이고, 평시의 선택은 PACELC의 L과 C다.
- 모델의 이름은 보장을 말하고 비용은 말하지 않는다. 비용은 같은 클러스터에서 설정만 바꿔 재야 나온다.

## 참고

- Herlihy & Wing, [Linearizability: A Correctness Condition for Concurrent Objects](https://cs.brown.edu/~mph/HerlihyW90/p463-herlihy.pdf) (1990)
- Abadi, [Consistency Tradeoffs in Modern Distributed Database System Design](https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf) (PACELC)
- [Jepsen: Consistency Models](https://jepsen.io/consistency)
- [Kafka: Producer acks](https://kafka.apache.org/documentation/#producerconfigs_acks), [PostgreSQL: synchronous_commit](https://www.postgresql.org/docs/current/runtime-config-wal.html)
