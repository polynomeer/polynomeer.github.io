---
title: "TCP 연결 수립과 큐 - SYN 백로그, accept 큐, TIME_WAIT"
date: 2026-06-22
categories: [Notes, Network]
tags: [Network, TCP, Backlog, TIME_WAIT, Keep-Alive, Performance, Tomcat]
---

애플리케이션 지연 지표는 정상인데 사용자는 느리다고 한다. 서버가 요청을 **받기 전**에 시간이 가고 있으면 이런 일이 생긴다. 애플리케이션이 재는 시간은 대개 요청을 받은 뒤부터이고, 그 앞에 커널의 큐 두 개가 있다.

## 핸드셰이크와 두 개의 큐

연결 수립은 3-way handshake다. 그 동안 커널은 연결을 **두 큐**에 나눠 담는다.

```text
클라이언트            서버
   SYN      ───────▶  SYN 큐에 넣음 (half-open)
   SYN-ACK  ◀───────
   ACK      ───────▶  accept 큐로 이동 (ESTABLISHED)
                      ↓
                      애플리케이션이 accept()로 꺼냄
```

| 큐 | 담는 것 | 크기 |
| --- | --- | --- |
| SYN 큐 | 핸드셰이크 진행 중 | `net.ipv4.tcp_max_syn_backlog` |
| accept 큐 | 수립 완료, 애플리케이션이 안 꺼감 | `listen()`의 backlog와 `net.core.somaxconn` 중 작은 값 |

핵심은 **accept 큐**다. 연결은 이미 수립됐고 클라이언트는 요청을 보냈는데, 애플리케이션이 `accept()`를 부르지 못하면 여기 쌓인다. 애플리케이션 입장에서는 그 요청이 아직 존재하지 않으므로 **지연 지표에 잡히지 않는다.**

accept 큐가 가득 차면 커널은 새 ACK를 **조용히 버린다**(기본값). 클라이언트는 응답이 없으니 SYN을 재전송하고, 그 간격은 지수적으로 늘어난다(1초, 3초, 7초…). **사용자가 겪는 몇 초의 지연이 서버 로그 어디에도 없는** 상황이 이렇게 만들어진다.

`net.ipv4.tcp_abort_on_overflow=1`로 바꾸면 버리는 대신 RST를 보낸다. 빨리 실패하지만 클라이언트는 연결 초기화 오류를 본다. 조용한 지연과 명시적 실패 중 무엇이 나은지는 상황에 따라 다르다.

## Tomcat의 설정과 대응

서블릿 컨테이너의 설정이 이 큐들과 직접 연결된다.

| 설정 | 대응 |
| --- | --- |
| `server.tomcat.accept-count` | `listen()` backlog, 즉 accept 큐 크기 |
| `server.tomcat.threads.max` | `accept()` 후 요청을 처리할 스레드 수 |
| `server.tomcat.max-connections` | 동시에 열어 둘 수 있는 연결 수 |

[Tomcat 스레드 고갈 실험](/posts/tomcat-thread-exhaustion/)에서 본 것이 이 구조다. 느린 업스트림 때문에 요청 스레드 200개가 전부 소켓 읽기에 묶이자, 새 요청은 accept 큐에 쌓였고 그 큐가 차자 클라이언트가 기다리기 시작했다. `/api/fast`의 p50이 클라이언트 타임아웃 30초가 된 것은 **서버가 그 요청을 처리하는 데 30초가 걸려서가 아니라, 꺼내지도 못했기 때문**이다.

그 실험의 한계에 "`accept-count: 100`을 변화시키지 않아, 피해자의 지연 중 얼마가 accept 큐 대기이고 얼마가 워커 대기인지 나누지 못했다"고 적었다. 두 큐를 나눠 보는 것이 이 글의 실용적 결론이다.

## 진단: 큐 길이를 직접 본다

```bash
ss -ltn        # Recv-Q = 현재 accept 큐 길이, Send-Q = 큐 상한
netstat -s | grep -i listen   # overflow와 drop 누적
```

`ListenOverflows`와 `ListenDrops`가 **증가하고 있다면** accept 큐가 넘치고 있다는 직접 증거다. 이 두 카운터는 애플리케이션 지표에 절대 나타나지 않으므로 별도로 수집해야 한다.

## TIME_WAIT

연결을 **먼저 닫는 쪽**이 TIME_WAIT에 들어가고, 2×MSL(리눅스에서 보통 60초) 동안 머문다. 이유는 둘이다. 마지막 ACK가 유실됐을 때 재전송에 답하기 위해서, 그리고 같은 4-tuple로 새 연결이 생겼을 때 옛 패킷이 섞이지 않게 하기 위해서.

문제가 되는 경우는 정해져 있다.

**서버가 먼저 닫을 때.** 서버에 TIME_WAIT이 수만 개 쌓인다. 메모리는 적게 쓰지만 포트 추적 테이블이 커진다.

**클라이언트 쪽(예: 서버가 다른 서버를 호출)에서 쌓일 때.** 이쪽이 더 위험하다. 출발지 포트가 고갈되면(`ip_local_port_range`, 보통 3만~6만 개) **새 연결을 못 연다.** 외부 호출이 많은 서비스에서 실제로 만나는 한계다.

답은 소켓 설정이 아니라 **연결 재사용**이다. HTTP keep-alive와 커넥션 풀을 쓰면 연결을 여닫지 않으므로 TIME_WAIT이 생기지 않는다. `tcp_tw_reuse` 같은 커널 옵션은 보조 수단이고, `tcp_tw_recycle`은 NAT 환경에서 문제를 일으켜 리눅스에서 제거됐다.

## 이 설명이 깨지는 곳

- **컨테이너와 로드 밸런서가 층을 더한다.** 큐가 여러 곳에 생기므로, 한 층에서만 보면 원인을 놓친다.
- **SYN flood 방어(`tcp_syncookies`)가 켜져 있으면 SYN 큐 동작이 달라진다.** 큐를 쓰지 않고 쿠키로 상태를 복원한다.
- **backlog를 키우는 것이 해법인 경우는 드물다.** 큐가 길어지면 더 오래 기다린 요청을 처리하게 될 뿐이고, 이미 클라이언트가 포기한 요청일 수 있다. 원인은 대개 처리 속도이지 큐 크기가 아니다.
- **이벤트 루프 모델에서도 accept 큐는 같다.** `accept()`를 못 부르면 쌓이는 것은 동일하다.

## 무엇을 재면 확인되는가

1. 부하를 걸면서 `ss -ltn`의 Recv-Q와 `ListenOverflows`를 함께 본다. 애플리케이션 지연이 정상인데 이 값이 오르는 구간이 있는지.
2. `accept-count`를 10/100/1000으로 바꿔 가며 클라이언트가 겪는 지연 분포를 본다. 큐가 길수록 실패가 지연으로 바뀐다.
3. 외부 호출을 커넥션 풀 없이 하고 TIME_WAIT 수와 포트 고갈까지의 시간을 잰다.

1번과 2번이 [spring-ops-lab](https://github.com/polynomeer/spring-ops-lab)의 S1에 추가할 행이다.

## 실무와의 접점

[keep-alive 정리](/posts/keep-alive/)에서 연결 재사용 설정을 다뤘다. 지금 보면 그 글들에 빠진 것은 **그 설정이 어느 큐에 영향을 주는가**였다. 서버의 지연 지표만 보고 "우리는 빠르다"고 말하기 전에, 요청이 그 지표에 잡히기까지 어디를 지나는지를 알아야 한다. 측정되지 않는 구간이 있으면 그 구간은 없는 것이 아니라 **보이지 않는 것**이다.

## 정리

- 연결 수립 중에는 SYN 큐, 수립 후 `accept()` 전에는 accept 큐에 있다.
- accept 큐가 넘치면 커널이 조용히 버리고 클라이언트는 지수 백오프로 재전송한다. 서버 로그에 남지 않는다.
- Tomcat의 `accept-count`가 accept 큐 크기이고, `threads.max`가 꺼내는 속도를 정한다.
- `ListenOverflows`·`ListenDrops` 증가가 큐 넘침의 직접 증거다.
- TIME_WAIT은 먼저 닫는 쪽에 생긴다. 클라이언트 쪽 포트 고갈이 더 위험하고, 답은 연결 재사용이다.
- backlog를 키우는 것은 대개 원인 처방이 아니다.

## 참고

- [Linux man: listen(2)](https://man7.org/linux/man-pages/man2/listen.2.html), [tcp(7)](https://man7.org/linux/man-pages/man7/tcp.7.html)
- [Cloudflare: SYN packet handling in the wild](https://blog.cloudflare.com/syn-packet-handling-in-the-wild/)
- [keep-alive 정리](/posts/keep-alive/)
