---
title: Network Load Balancers(NLB)
date: 2024-09-09
categories: [Archive, Network]
tags: [Timeout, NLB, AWS]
---

# Network Load Balancers(NLB)

Network Load Balancer(NLB)는 클라이언트에게 싱글 포인트 컨택트를 지원한다. 클라이언트는 NLB에게 요청을 보내고 NLB는 그 요청을 EC2 인스턴스(하나 이상의 Availability Zones)와 같은 타겟들에게 보낸다.

## Load balancer state

provisioning
The Network Load Balancer is being set up.

active
The Network Load Balancer is fully set up and ready to route traffic.

failed
The Network Load Balancer couldn't be set up.

## Connection idle timeout

클라이언트가 NLB를 통해 전송하는 각 TCP 요청에 대해, 해당 연결의 상태가 모두 추적된다. 클라이언트나 타겟이 idle timeout을 초과하여 오랫동안 연결을 통해 데이터를 보내지 않으면 커넥션이 닫힌다. 클라이언트나 대상이 idle timeout 초과 기간(period elapses)이 지난 후에 데이터를 보내면 연결이 더 이상 유효하지 않음을 나타내는 TCP RST 패킷을 수신한다.

TCP 흐름에 대한 idle timeout 초과 값을 350초로 설정했다. ~~이 값은 수정할 수 없습니다.~~ **클라이언트나 대상은 TCP keepalive 패킷을 사용하여 idle timeout 초과를 재설정할 수 있다.** 단, TLS 연결을 유지하기 위해 전송된 keepalive 패킷은 데이터나 페이로드를 포함할 수 없다.

TLS 리스너가 클라이언트나 대상에서 TCP keepalive 패킷을 수신하면 Network Load Balancer는 TCP keepalive 패킷을 생성하여 20초마다 프론트엔드와 백엔드 연결에 모두 전송합니다. 이 동작은 수정할 수 없다.

UDP가 연결 없는 방식이지만, Network Load Balancer는 소스 및 대상 IP 주소와 포트를 기반으로 UDP 흐름 상태를 유지한다. 이를 통해 동일한 흐름에 속하는 패킷이 동일한 타겟으로 일관되게 전송된다. idle timeout 초과 기간(period elapses)이 경과한 후 Network Load Balancer는 들어오는 UDP 패킷을 새 흐름으로 간주하여 새 대상으로 라우팅한다. Elastic Load Balancing은 UDP 흐름에 대한 유휴 시간 초과 값을 120초로 설정한다.

EC2 인스턴스는 반환 경로를 설정하기 위해 30초 이내에 새 요청에 응답해야 한다.

## References

- [Network Load Balancers](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/network-load-balancers.html)

## Recently

2024년 9월 3일 발표된 내용에 의하면 이제 NLB의 idle timeout은 350초로 고정된 값이 아니라 60~6000초로 변경이 가능하다.

[AWS Network Load Balancer now supports configurable TCP idle timeout](https://aws.amazon.com/about-aws/whats-new/2024/09/aws-network-load-balancer-tcp-idle-timeout/)
