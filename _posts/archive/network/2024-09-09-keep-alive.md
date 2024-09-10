---
title: Keep-Alive
date: 2024-09-09
categories: [Archive, Network]
tags: [Timeout, Keep-Alive]
---

# Keep-Alive

Keep-Alive 또는 Persistent Connection은 HTTP 요청 양을 줄이고 웹 페이지 속도를 높이기 위한 서버와 클라이언트 간의 통신 패턴이다. 즉, 하나의 커넥션을 최대한 효율적으로 활용하기 위한 매커니즘이다.

Keep-Alive가 켜져 있으면 클라이언트와 서버는 이후에 요청이나 응답을 위해 연결을 유지하는 데 동의한다는 의미이다.

- [Keep-Alive: How Does It Improves Website Performance](https://www.hostinger.com/tutorials/improving-website-performance-enabling-keep-alive)

## Understand the TCP keepalive parameters

TCP Keepalive는 3개의 파라미터에 의해 제어된다: keepalive time, keepalive interval, keepalive probes. keepalive time은 첫 번째 keepalive 패킷이 전송되고 난 후에 비활성상태의 지속시간이다. keepalive interval은 연속적인 각 keepalive 패킷의 간격이다. keepalive probes는 커넥션이 종료되기 전에 keepalive 패킷이 응답하지 않은 개수이다.

- [What are the best practices for implementing TCP keepalive?](https://www.linkedin.com/advice/1/what-best-practices-implementing-tcp-keepalive)

## Keep-Alive Best Practices

그러면 Keepalive time을 최소한으로 설정해서 반복적으로 LB 또는 브라우저에 패킷을 보내게되면 커넥션이 절대로 끊어지지 않는다고 생각해볼 수 있다. 그게 좋은 방법일까?

> KeepAlive's main purpose is to send several static files via HTTP 1.1 on the same connection. So if you disable or set KeepAlive too short the client has to make a connection for every css, js, jpg, whatever static file it wants from your server. Building up a connection takes time, so it is wise to set it to **300 seconds.** Most browsers keep connections open from 120 to 300 seconds, also most of the SSL keys have the same 300 sec timeout.

Keepalive의 주요 목적은 정적인 자원을 같은 커넥션 상에서 전송하기 위함인데, 이를 너무 짧게 설정하면 클라이언트 측에서 매번 정적인 자원을 받아오기에는 너무 짧은 시간이다. 그러면 어떻게 설정하는것이 가장 Best Practices일까?

- [Is It Better to set KeepAlive to 1 second rather than turning it off all together?](https://serverfault.com/questions/355717/is-it-better-to-set-keepalive-to-1-second-rather-than-turning-it-off-all-togethe)

### Best Practices for TCP Keepalive Settings

이상적인 TCP keepalive 설정은 특정 네트워크 요구 사항과 실행 중인 애플리케이션 유형에 따라 달라진다. TCP keepalive 설정을 구성하기 위한 몇 가지 일반적인 모범 사례는 다음과 같다.

#### 1. Choose an appropriate keepalive time

tcp_keepalive_time을 너무 낮게 설정하면 불필요한 네트워크 트래픽이 발생하고 시스템 부하가 증가할 수 있다. 반면에 너무 높게 설정하면 끊어진 연결의 감지가 지연될 수 있다. 일반적인 지침으로 **600 ~ 7200초(10분 ~ 2시간)** 사이의 값을 권장한다. 보통 600초로 많이 설정한다.

```
net.ipv4.tcp_keepalive_time = 600
```

#### 2. Set a reasonable keepalive interval

tcp_keepalive_intvl은 원격 호스트에서 응답을 받지 못할 경우 keepalive 패킷 사이의 간격을 결정한다. 이 값을 너무 낮게 설정하면 네트워크 혼잡이 발생할 수 있고, 너무 높게 설정하면 끊어진 연결 감지 속도가 느려질 수 있다. 일반적으로 30 ~ 120초 사이의 값이면 충분하다.

```
넷.ipv4.tcp_keepalive_intvl = 60
```

#### 3. Determine the number of keepalive probes

tcp_keepalive_probes 값은 연결이 끊어진 것으로 간주되기 전에 보내야 하는 승인되지 않은 keepalive 패킷의 수를 지정한다. 값이 높을수록 원격 호스트가 응답할 가능성이 높아지지만 끊어진 연결 감지가 지연될 수도 있다. 일반적으로 3 ~ 10 사이의 값이 권장된다.

```
net.ipv4.tcp_keepalive_probes = 5
```

#### Configure TCP Keepalive for a Web Server

적당한 양의 트래픽이 있는 웹 서버를 실행 중이라고 가정해 본다. 서버에 너무 많은 부하를 주지 않고 유휴 연결이 적시에 감지되고 닫히도록 해야한다.

다음 설정을 사용하는 것이 좋다.

```
net.ipv4.tcp_keepalive_time = 900 # 15분
net.ipv4.tcp_keepalive_intvl = 60 # 1분
net.ipv4.tcp_keepalive_probes = 5
```

이 예에서 keepalive 패킷은 15분간의 비활성 후에 전송된다. 원격 호스트에서 응답이 없으면 추가 keepalive 패킷이 매분 전송되어 총 5개의 패킷이 응답 없이 전송될 때까지 전송된다. 여전히 응답이 없으면 연결이 끊어진 것으로 간주되어 닫힌다.

- [TCP keepalive Recommended Settings and Best Practices](https://webhostinggeeks.com/howto/tcp-keepalive-recommended-settings-and-best-practices/)