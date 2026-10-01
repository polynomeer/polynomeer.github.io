---
title: "HTTP/1.1, 2, 3 - HOL 블로킹은 어디로 옮겨갔는가"
date: 2026-08-23
categories: [Notes, Network]
tags: [Network, HTTP, HTTP/2, HTTP/3, QUIC, Latency, Head-of-line Blocking]
---

세 버전의 차이를 "2는 멀티플렉싱, 3은 UDP"로 외우면 실무 판단에 쓸 수 없다. 세 버전은 같은 문제를 각각 다른 층으로 밀어낸 역사이고, 그 문제의 이름이 head-of-line(HOL) 블로킹이다. 앞에 선 하나가 막히면 뒤에 선 것들이 상관없이 함께 기다리는 현상이다. 어디서 막히는지를 따라가면 언제 무엇을 쓸지가 정해진다.

## HTTP/1.1: 연결 하나에 요청 하나씩

연결 하나에서 요청을 보내면 응답이 올 때까지 다음 요청을 보낼 수 없다. 앞 요청이 느리면 뒤가 전부 기다린다. 애플리케이션 계층의 HOL 블로킹이다.

파이프라이닝이 명세에 있지만 서버는 요청을 받은 순서대로 응답을 보내야 한다([RFC 9112 §9.3.2](https://www.rfc-editor.org/rfc/rfc9112#section-9.3.2)). 그래서 문제가 그대로였고, 실제로는 거의 쓰이지 않는다.

RFC 9113도 HTTP/1.1의 파이프라이닝이 애플리케이션 계층 HOL 블로킹을 안고 있어서 클라이언트가 여러 연결을 쓴다고 설명한다([RFC 9113 §1](https://www.rfc-editor.org/rfc/rfc9113#section-1)). 브라우저가 택한 우회가 이렇게 **연결을 여러 개 여는 것**이다. 도메인당 6개 정도. 그리고 그 6개를 더 쓰려고 도메인을 쪼개는 기법(domain sharding), 요청 수를 줄이려고 파일을 합치는 기법(번들링, 스프라이트)이 나왔다. 전부 프로토콜의 한계를 애플리케이션이 우회한 것이다.

## HTTP/2: 한 연결에 스트림 여럿

연결 하나에 논리적 스트림을 여럿 두고 프레임 단위로 섞어 보낸다. 요청 100개를 동시에 보내고 응답이 순서와 무관하게 온다. 헤더는 HPACK으로 압축되고, 반복되는 헤더는 인덱스로 참조된다.

애플리케이션 계층의 HOL 블로킹이 사라졌다. 그래서 1.1 시절의 우회 기법들이 역효과가 된다. 도메인 샤딩은 연결을 늘려 압축과 혼잡 제어의 이점을 깎고, 과도한 번들링은 캐시 효율을 떨어뜨린다.

그런데 문제가 없어진 것이 아니라 **TCP 층으로 내려갔다.** 명세도 "TCP head-of-line blocking is not addressed by this protocol"(TCP의 HOL 블로킹은 이 프로토콜이 다루지 않는다)라고 적는다(RFC 9113 §1). 스트림 100개가 하나의 TCP 연결을 공유하므로, 패킷 하나가 손실되면 TCP는 순서 보장을 위해 그 뒤의 모든 데이터를 애플리케이션에 넘기지 않는다. 그래서 무관한 스트림 99개가 함께 멈춘다. 손실률이 높은 모바일 네트워크에서 HTTP/2가 1.1보다 나쁠 수 있는 이유다.

서버 푸시도 넣었지만 성능 이득을 내기 어려워 거의 쓰이지 않았고(Chrome 팀이 인용한 HTTP Archive 2021 집계로 HTTP/2 사이트의 1.25%), Chrome은 106부터 기본으로 껐다. Chrome 팀은 그 대안으로 `103 Early Hints`를 든다. 리소스 자체를 밀어 넣는 대신 먼저 요청하면 좋을 리소스의 힌트만 보내고, 요청할지는 브라우저가 정한다([Remove HTTP/2 Server Push from Chrome](https://developer.chrome.com/blog/removing-push)).

## HTTP/3: TCP를 떠난다

HTTP/3이 쓰는 QUIC은 UDP 위에서 자체 전송을 구현한 프로토콜이다. 차이는 **스트림별로 독립된 순서 보장**에서 나온다. 패킷이 손실되면 그 패킷에 데이터가 실린 스트림만 재전송을 기다리고, 다른 스트림은 계속 전달된다. 그래서 TCP 층의 HOL 블로킹이 사라진다. 다만 한 QUIC 패킷에 여러 스트림의 데이터가 실렸다면 그 패킷의 손실은 그 스트림들을 함께 막는다([RFC 9000 §13](https://www.rfc-editor.org/rfc/rfc9000#section-13)).

추가로 얻는 것들.

- 핸드셰이크가 짧다. 전송과 TLS 1.3 핸드셰이크가 합쳐져 1-RTT이고, 재방문이면 0-RTT도 가능하다([TLS 핸드셰이크의 비용](/posts/tls-handshake-cost/)).
- 연결 마이그레이션. 연결 ID로 식별하므로 IP가 바뀌어도(와이파이 → LTE) 연결이 유지된다. 모바일에서 체감이 크다.
- 커널 업데이트를 기다리지 않는다. 전송 구현이 사용자 공간에 있어 개선이 빠르다.

대가도 있다.

- CPU를 더 쓴다. 커널의 TCP 최적화(오프로드, `sendfile`)를 못 쓰고 사용자 공간에서 처리한다.
- UDP가 막히거나 우선순위가 낮은 네트워크가 있다. 폴백이 필요하다.
- 미들박스와 도구가 덜 성숙하다. 패킷이 암호화돼 있어 네트워크 장비가 들여다보지 못한다. 보안상 장점이자 운영상 불편이다.

## 정리하면: 문제가 옮겨간 경로

```text
HTTP/1.1  애플리케이션 계층 HOL  → 연결을 여러 개 여는 우회
HTTP/2    TCP 계층 HOL           → 손실이 많으면 1.1보다 나쁠 수 있음
HTTP/3    HOL 해소               → CPU와 운영 도구를 대가로
```

## 어디에 무엇을 쓰는가

| 구간 | 선택 |
| --- | --- |
| 브라우저 ↔ CDN·엣지 | HTTP/2와 3. 손실이 있는 모바일에서 3의 이점이 크다 |
| 엣지 ↔ 오리진 (데이터센터 내부) | 1.1이나 2로 충분하다. 손실이 거의 없어 3의 이점이 작다 |
| 서비스 간 gRPC | HTTP/2 (gRPC의 전제) |
| 대용량 파일 전송 | 버전보다 [혼잡 제어와 BDP](/posts/congestion-control-and-latency/)가 지배적이다 |

두 번째 줄이 실무에서 자주 오해된다. **데이터센터 내부는 패킷 손실이 거의 없으므로 TCP HOL 블로킹이 문제가 되지 않는다.** 내부 통신을 HTTP/3으로 바꿀 이유는 대개 없다.

## 이 설명이 깨지는 곳

- HTTP/2를 L4 로드 밸런서 뒤에 두면 쏠린다. 연결 하나에 스트림이 몰리므로 연결 단위 분산이 무의미해진다. L7 프록시나 클라이언트 측 분산이 필요하다([REST·gRPC·GraphQL](/posts/rest-grpc-graphql/)).
- 버전을 올려도 애플리케이션이 느리면 소용없다. 지연의 대부분이 서버 처리나 DB라면 프로토콜 이득은 소수점이다.
- HTTP/2의 우선순위 기능은 구현이 제각각이었고, RFC 9113에서 RFC 7540의 우선순위 신호 방식이 폐기(deprecated)됐다. 대신 HTTP 버전과 무관한 `Priority` 헤더로 클라이언트가 선호를 알리는 방식이 [RFC 9218](https://www.rfc-editor.org/rfc/rfc9218)로 나왔다.
- 0-RTT는 재전송(replay) 공격에 취약하다. TLS 1.3 명세는 0-RTT 데이터에 연결 간 재전송 방지 보장이 없다고 적는다([RFC 8446 §2.3](https://www.rfc-editor.org/rfc/rfc8446#section-2.3)). 그래서 멱등한 요청에만 써야 한다([멱등한 API 설계](/posts/idempotent-api-design/)).

## 무엇을 재면 확인되는가

1. 손실률을 인위로 주입하고(`tc netem` 등) HTTP/1.1, 2, 3의 페이지 로딩 시간을 비교한다. 손실 0%에서는 2가 좋고, 2~5%에서 3이 갈린다.
2. 같은 오리진에 연결 수를 바꿔 가며 처리량과 헤더 오버헤드를 본다.
3. 모바일 네트워크 전환(와이파이 ↔ LTE)에서 연결 유지 여부를 확인한다.

1번이 세 버전의 차이를 가장 직관적으로 보여준다.

## 실무와의 접점

[monticker의 WebSocket과 폴링 비교](/posts/monticker-ws-vs-polling/)에서 실시간 전송 방식을 쟀다. 그 선택지에 HTTP/2 SSE나 HTTP/3도 있었지만, 같은 머신에서 잰 조건에서는 프로토콜 차이가 드러나지 않았을 것이다. 손실과 RTT가 없는 환경에서는 프로토콜 비교의 의미가 작고, 이것이 이 글과 그 실험의 공통된 한계다.

## 정리

- 버전 선택은 경로의 손실률이 정한다. 손실이 있는 모바일 구간은 3, 손실이 거의 없는 데이터센터 내부는 1.1이나 2로 충분하다.
- 2로 올리면 1.1 시절의 우회(도메인 샤딩, 과도한 번들링)를 걷어 낸다.
- 프로토콜 비교는 손실과 RTT를 주입한 환경에서 잰다.

## 참고

- [RFC 9113: HTTP/2](https://datatracker.ietf.org/doc/html/rfc9113)
- [RFC 9114: HTTP/3](https://datatracker.ietf.org/doc/html/rfc9114), [RFC 9000: QUIC](https://datatracker.ietf.org/doc/html/rfc9000)
- [RFC 9112: HTTP/1.1](https://www.rfc-editor.org/rfc/rfc9112), [RFC 9218: Extensible Prioritization Scheme for HTTP](https://www.rfc-editor.org/rfc/rfc9218), [RFC 8446: TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446)
- [Chrome for Developers: Remove HTTP/2 Server Push from Chrome](https://developer.chrome.com/blog/removing-push)
- [Cloudflare: HTTP/3 from A to Z](https://blog.cloudflare.com/http3-the-past-present-and-future/)
- [혼잡 제어와 지연](/posts/congestion-control-and-latency/)
