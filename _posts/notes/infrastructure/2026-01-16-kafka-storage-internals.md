---
title: "Kafka의 저장 구조 - 세그먼트와 오프셋, 페이지 캐시와 zero-copy"
date: 2026-01-16
categories: [Notes, Infrastructure]
tags: [Kafka, Apache Kafka, Storage, Page Cache, Performance, Messaging]
---

Kafka가 빠른 이유를 "메모리를 쓰니까"로 설명하면 틀린다. Kafka 브로커는 메시지를 JVM 힙에 쌓아 두지 않는다. 디스크에 append하고, 커널의 [페이지 캐시](/posts/page-cache-and-fsync/)(커널이 파일 내용을 메모리에 들고 있는 영역)에 맡긴다. 이 구조를 알아야 "브로커 힙을 늘려도 왜 안 빨라지는가", "왜 컨슈머가 밀리면 갑자기 디스크를 읽는가"가 설명된다.

## 파티션은 디렉터리, 로그는 세그먼트 파일

파티션 하나가 디스크의 디렉터리 하나다. 그 안에 세그먼트 파일이 쌓인다.

```text
topic-0/
  00000000000000000000.log     실제 레코드
  00000000000000000000.index   오프셋 → 파일 위치 (희소 인덱스)
  00000000000000000000.timeindex 타임스탬프 → 오프셋
  00000000000000368123.log     다음 세그먼트
```

파일 이름은 그 세그먼트의 첫 오프셋이다. 오프셋으로 조회할 때 브로커는 파일 이름으로 이진 탐색해 세그먼트를 고르고, `.index`로 대략의 파일 위치를 찾은 뒤 거기서부터 순차로 읽는다. `.index`는 모든 레코드를 담지 않는다(`index.interval.bytes`마다 한 항목, 기본 4096바이트, [Topic Configs](https://kafka.apache.org/43/configuration/topic-configs/)). 인덱스를 작게 유지해 메모리에 올리고, 나머지는 순차 스캔으로 메운다.

쓰기는 활성 세그먼트의 끝에 append만 한다. 수정도 삭제도 없다. 그래서 디스크 입장에서 쓰기가 순차 쓰기가 되고, Kafka의 처리량은 여기서 나온다.

세그먼트가 `segment.bytes`나 `segment.ms`에 도달하면 닫히고 새 파일이 열린다. 보존(`retention.ms`, `retention.bytes`)은 **닫힌 세그먼트 파일 단위로** 삭제된다. 레코드 하나씩 지우지 않는다. 토픽 설정 문서도 "Retention and cleaning is always done a file at a time"라고 적는다(보존과 정리는 항상 파일 하나 단위로 한다, [Topic Configs](https://kafka.apache.org/43/configuration/topic-configs/)). 그래서 보존 기간을 넘긴 메시지가 한동안 남아 있는 것이 정상이다.

## 페이지 캐시가 실제 캐시다

브로커는 `write()`로 파일에 쓰고 커널이 페이지 캐시에 담는다. 컨슈머가 방금 쓴 오프셋을 읽으면 그 데이터는 아직 캐시에 있으므로 디스크에 가지 않는다. **따라잡고 있는 컨슈머는 디스크를 읽지 않는다.** Kafka 설계 문서도 컨슈머가 대부분 따라잡은 클러스터에서는 디스크 읽기가 보이지 않는다고 적는다([Kafka Design: Efficiency](https://kafka.apache.org/43/design/design/)).

이 구조에서 두 가지가 따라 나온다.

- 브로커 힙을 크게 잡는 것은 대개 손해다. 힙이 커지면 페이지 캐시에 쓸 메모리가 준다. Kafka 운영 문서가 예로 드는 JVM 인자도 힙 `-Xmx6g`이다([Kafka Operations: Java Version](https://kafka.apache.org/43/operations/java-version/)).
- 컨슈머 랙(컨슈머가 읽은 위치와 로그 끝 사이의 거리)이 커지면 디스크 읽기가 시작된다. 캐시에서 밀려난 옛 오프셋을 읽기 때문이다. 이때 그 브로커의 다른 파티션 지연도 같이 나빠진다. 그래서 랙 지표는 "메시지가 늦는다"와 함께 "곧 디스크를 읽는다"도 알려 준다.

## zero-copy가 아끼는 것

컨슈머에게 보낼 때 브로커는 [`sendfile()`](/posts/user-space-and-kernel-space/)을 쓴다. 일반 경로는 디스크 → 페이지 캐시 → 애플리케이션 버퍼 → 소켓 버퍼 → NIC로 복사가 네 번 일어나고 사용자 공간을 두 번 왕복한다. `sendfile()`은 페이지 캐시에서 소켓으로 바로 보낸다. 그래서 복사와 컨텍스트 스위치가 준다([Kafka Design: Efficiency](https://kafka.apache.org/43/design/design/)).

여기에는 조건이 있다. 브로커가 레코드를 건드리지 않을 때만 가능하다. 압축 형식이 프로듀서와 컨슈머 사이에서 바뀌거나, 브로커가 재압축·형식 변환을 하면 사용자 공간으로 올라와야 하고 zero-copy가 깨진다. 구버전 클라이언트가 섞여 형식 변환(down-conversion)이 일어나는 클러스터에서 CPU가 갑자기 오르는 것이 이 경우다. TLS를 켜도 암호화를 위해 데이터가 사용자 공간을 지나야 하므로 같은 손해가 난다. 설계 문서는 "sendfile is not used when SSL is enabled"라고 적는다(SSL을 켜면 sendfile을 쓰지 않는다).

## 이 설명이 깨지는 곳

- **`flush`는 기본적으로 Kafka가 하지 않는다.** 디스크 반영은 커널에 맡기고, 내구성은 [`fsync`](/posts/page-cache-and-fsync/)가 아니라 복제로 얻는다(`acks=all` + `min.insync.replicas`). 운영 문서는 기본 flush 설정이 애플리케이션 fsync를 끈다고 적고, 그 근거로 장애 난 노드가 복제본에서 복구된다는 점을 든다([Kafka Operations: Hardware and OS](https://kafka.apache.org/43/operations/hardware-and-os/)). 그래서 단일 노드 Kafka에서는 이 전제가 빠진다.
- 순차 쓰기의 이점은 파티션 수가 늘면 줄어든다. 디스크 하나에 파티션이 수백 개면 각 파일에 대한 쓰기는 디스크 입장에서 더 이상 순차가 아니다.
- zero-copy는 TLS와 함께 쓸 수 없다. 암호화를 켜면 그 이점은 사라진다고 보는 편이 맞다.
- 오프셋은 파티션 안에서만 의미가 있다. 토픽 전체의 순서를 말하는 숫자가 아니다.

## 무엇을 재면 확인되는가

1. 컨슈머를 멈춰 랙을 키운 뒤 다시 켜고, 브로커의 디스크 읽기 IOPS와 컨슈머 처리량을 함께 본다. 캐시에서 벗어나는 지점이 보인다.
2. 브로커 힙을 늘리고 줄여 가며 같은 부하에서 p99를 비교한다.
3. 구버전 클라이언트를 붙여 형식 변환이 일어날 때 브로커 CPU를 본다.

[monticker 24편](/posts/monticker-partition-ordering/)에서 파티션과 컨슈머 격자를 재면서 본 것은 순서와 격리의 교환이었고, 저장 계층은 건드리지 않았다. 위 세 가지는 아직 재지 않았다.

## 실무와의 접점

[ParityPay 5편](/posts/parity-pay-outbox/)의 한계에 "`PUBLISHED` 행이 쌓이는데 테이블 정리를 하지 않았다"고 적었다. Outbox 테이블은 DB에 만든 로그이고, Kafka가 세그먼트 파일 단위로 지우는 것을 그 테이블에서는 파티셔닝으로 흉내 내야 한다. 로그를 직접 만들어 보면 Kafka가 행 단위 삭제를 피하고 파일 단위로 지우는 이유가 보인다.

## 정리

- 보존 기간을 넘긴 메시지가 남아 있는 것은 세그먼트 단위 삭제의 결과다.
- 힙을 키우면 페이지 캐시가 준다. 컨슈머 랙은 지연 지표이면서 디스크 읽기의 예고다.
- 형식 변환이나 TLS가 있으면 zero-copy를 전제로 한 처리량 계산은 맞지 않는다.
- 단일 노드에서는 내구성의 근거인 복제가 없다.

## 참고

- [Kafka Documentation: Persistence](https://kafka.apache.org/documentation/#persistence)
- [Kafka 4.3 Design](https://kafka.apache.org/43/design/design/)
- [Kafka 4.3 Operations: Hardware and OS](https://kafka.apache.org/43/operations/hardware-and-os/)
- [Kafka 4.3 Operations: Java Version](https://kafka.apache.org/43/operations/java-version/)
- [Kafka 4.3 Topic Configs](https://kafka.apache.org/43/configuration/topic-configs/)
- [Kafka: Efficiency](https://kafka.apache.org/documentation/#maximizingefficiency)
- Jay Kreps, [The Log: What every software engineer should know about real-time data's unifying abstraction](https://web.archive.org/web/20240105095933/https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying)
