---
title: "혼잡 제어와 지연 - BDP, 버퍼블로트, 처리량과 지연의 교환"
date: 2026-07-31
categories: [Notes, Network]
tags: [Network, TCP, Congestion Control, Latency, Throughput, Bufferbloat]
---

대역폭은 넉넉한데 파일 전송이 느리다. 다운로드를 시작하면 다른 요청의 지연이 함께 튄다. 둘 다 "네트워크가 느리다"로 뭉뚱그려지지만 원인이 다르고, 혼잡 제어가 무엇을 하는지 알면 갈린다.

## 대역폭이 남아도 느린 이유: BDP

TCP는 ACK를 받기 전에 보낼 수 있는 양(윈도)이 정해져 있다. 그 윈도가 작으면 한 왕복시간(RTT)마다 윈도 크기만큼만 보내게 된다.

```text
처리량 ≈ 윈도 크기 / RTT
```

회선을 다 쓰는 데 필요한 윈도 크기가 대역폭-지연 곱(BDP, Bandwidth-Delay Product)이다.

```text
BDP = 대역폭 × RTT
100 Mbps × 100 ms = 1.25 MB
```

서울-미국 간 RTT가 150ms이고 1Gbps 회선이면 BDP는 약 18MB다. 윈도가 그보다 작으면 회선이 아무리 굵어도 그만큼만 나온다. **"대역폭이 남는데 느리다"의 전형적인 원인**이고, RTT가 클수록 BDP도 커지므로 장거리 전송에서 특히 그렇다.

윈도는 두 가지가 제한한다. 수신자가 광고하는 수신 윈도(버퍼 크기, window scaling 옵션이 필요)와 송신자가 계산하는 혼잡 윈도(cwnd)다. 실제 윈도는 둘 중 작은 쪽이다.

## 혼잡 제어가 하는 일

네트워크가 얼마나 받아 줄 수 있는지는 아무도 알려 주지 않는다. TCP는 보내 보고 반응해서 추정한다.

전통적인 알고리즘(Reno, CUBIC)은 패킷 손실을 혼잡 신호로 쓴다. 손실이 없으면 윈도를 키우고, 손실이 나면 줄인다. CUBIC은 빠르고 먼 네트워크에서 확장성과 안정성을 높이도록 설계됐고, 리눅스와 Windows, Apple 스택의 기본 알고리즘이다([RFC 9438](https://www.rfc-editor.org/rfc/rfc9438)).

그런데 **손실이 나야 혼잡을 안다는 것은, 어딘가의 버퍼가 가득 찰 때까지 계속 보낸다는 뜻이다.**

## 버퍼블로트

라우터와 스위치에는 버퍼가 있다. 버퍼가 크면 패킷을 덜 버리므로 좋아 보이지만, 실제로는 반대다.

손실 기반 혼잡 제어는 손실이 날 때까지 보내므로 버퍼를 끝까지 채운다. 버퍼가 크면 그 안에서 기다리는 시간이 길어진다. 패킷은 안 버려지고 대신 수백 ms씩 지연된다. BBR 명세 초안도 손실 기반 혼잡 제어가 인터넷 가장자리의 깊은 버퍼를 반복해서 채워 큰 큐 지연을 만드는 것을 버퍼블로트로 설명한다([draft-ietf-ccwg-bbr](https://datatracker.ietf.org/doc/draft-ietf-ccwg-bbr/)).

그래서 **대용량 전송 하나가 같은 경로의 모든 트래픽 지연을 끌어올린다.** 다운로드 중에 화상 통화가 끊기고, 백업 작업이 도는 동안 API 응답이 느려진다. 처리량은 정상인데 지연만 나빠지므로 대역폭 지표로는 안 보인다.

대책은 두 방향이다.

- 큐 관리: CoDel([RFC 8289](https://www.rfc-editor.org/rfc/rfc8289)), FQ-CoDel([RFC 8290](https://www.rfc-editor.org/rfc/rfc8290))처럼 큐에 오래 머문 패킷을 미리 버리거나 흐름별로 큐를 나눈다. 라우터 쪽의 답이다.
- 다른 혼잡 신호: BBR은 손실만 보지 않고, 최근의 전달률과 RTT, 손실률로 경로의 대역폭과 RTT를 추정해 버퍼를 채우지 않는 지점에서 멈춘다. 명세 초안은 Reno나 CUBIC에 비해 버퍼가 얕거나 무작위 손실이 있는 병목에서 처리량이 크게 높고, 버퍼가 깊은 병목에서 큐 지연이 크게 낮다고 적는다.

## 애플리케이션에서 할 수 있는 것

혼잡 제어는 커널의 일이지만 애플리케이션의 선택이 영향을 준다.

- 연결 재사용. 새 연결은 slow start(작은 윈도에서 출발하는 시작 단계)부터 시작한다. 윈도가 작은 상태에서 출발하므로 짧은 요청일수록 손해가 크다. [keep-alive](/posts/keep-alive/)와 커넥션 풀이 이 비용을 없앤다([TCP 연결 수립과 큐](/posts/tcp-connection-and-queues/)).

- 작은 쓰기 합치기. Nagle 알고리즘은 작은 쓰기를 모아 보내지만, 지연 ACK와 만나면 수백 ms가 붙는다. 그래서 대화형 프로토콜에서는 `TCP_NODELAY`로 Nagle 알고리즘을 끈다([tcp(7)](https://man7.org/linux/man-pages/man7/tcp.7.html)). 대신 애플리케이션이 직접 합쳐 보내야 한다.

- 큰 전송을 분리. 백업, 로그 전송, 대용량 업로드를 지연에 민감한 트래픽과 같은 경로에 두면 버퍼블로트가 그쪽을 때린다. 대역폭 제한이나 경로 분리가 답이다.

## 이 설명이 깨지는 곳

- 데이터센터 내부는 RTT가 작아 BDP가 거의 문제가 되지 않는다. 이 글의 내용이 실제로 쓰이는 곳은 인터넷 경로, 리전 간 통신, 모바일이다.
- HTTP/2의 멀티플렉싱은 TCP 레벨 HOL(head-of-line) 블로킹을 해결하지 못한다. 한 연결에 스트림을 몰면 패킷 하나가 손실됐을 때 전부 기다린다([HTTP/1.1, 2, 3](/posts/http-versions/)).
- 클라우드는 인스턴스 타입별로 대역폭 상한이 있다. 혼잡 제어 이전에 그 상한을 먼저 확인해야 한다.
- BBR이 항상 낫지는 않다. CUBIC과 섞여 있을 때의 공정성 문제가 지적돼 왔고, BBRv3 명세 초안도 Reno/CUBIC과의 공존 개선을 설계 동기 가운데 하나로 둔다.

## 무엇을 재면 확인되는가

1. `iperf3`로 처리량을 재고 RTT와 곱해 실효 윈도를 역산한다. BDP에 못 미치면 윈도가 제한이다.
2. 대용량 전송을 시작하고 같은 경로의 짧은 요청 지연을 동시에 본다. 버퍼블로트가 있으면 즉시 보인다.
3. `ss -i`로 연결별 `cwnd`, `rtt`, 재전송 수를 본다. 손실이 실제로 나고 있는지 확인된다.
4. 혼잡 제어를 CUBIC과 BBR로 바꿔 가며 1번과 2번을 반복한다.

2번은 대역폭 지표로는 안 보이는 지연을 직접 드러낸다. "대역폭은 남는데 왜 느리지"에 대한 답이 그래프 하나에 나온다.

## 실무와의 접점

[monticker의 WebSocket과 폴링 비교](/posts/monticker-ws-vs-polling/)는 같은 머신에서 잰 수치라 이 층의 영향이 거의 없었다. 그 글의 한계에 "같은 머신에서 k6가 부하를 만들었다"를 적은 것이 그 뜻이다. 실제 네트워크를 지나면 conflation(100ms 안에 들어온 틱을 종목별 마지막 값 하나로 합치는 것) 주기와 메시지 크기의 의미가 달라진다. 작은 메시지를 자주 보내는 설계는 RTT가 큰 경로에서 다르게 동작하고, 그것은 로컬에서 잴 수 없다.

## 정리

- "대역폭은 남는데 느리다"는 대개 윈도가 BDP보다 작다는 뜻이다. 처리량과 RTT를 곱해 확인한다.
- "다운로드 중에 다른 요청이 느리다"는 버퍼블로트다. 처리량 지표로는 안 보이고 지연 지표로만 보인다.
- 데이터센터 내부에서는 이 문제들이 거의 드러나지 않는다. 리전 간, 모바일 경로에서 따로 잰다.

## 참고

- [Bufferbloat: Dark Buffers in the Internet (ACM Queue)](https://queue.acm.org/detail.cfm?id=2071893)
- [BBR: Congestion-Based Congestion Control (ACM Queue)](https://queue.acm.org/detail.cfm?id=3022184)
- [Linux man: tcp(7)](https://man7.org/linux/man-pages/man7/tcp.7.html)
- [RFC 9438: CUBIC for Fast and Long-Distance Networks](https://www.rfc-editor.org/rfc/rfc9438)
- [draft-ietf-ccwg-bbr: BBR Congestion Control](https://datatracker.ietf.org/doc/draft-ietf-ccwg-bbr/)
- [RFC 8289: Controlled Delay Active Queue Management](https://www.rfc-editor.org/rfc/rfc8289), [RFC 8290: FQ-CoDel](https://www.rfc-editor.org/rfc/rfc8290)
