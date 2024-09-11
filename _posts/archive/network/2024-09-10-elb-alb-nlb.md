---
title: ELB vs ALB vs NLB
date: 2024-09-10
categories: [Archive, Network]
tags: [AWS, ELB, ALB, NLB]
---

# ELB vs ALB vs NLB

로드 밸런서는 클라우드 환경에서 흔히 볼 수 있다. 고가용성(High Availability)이 필요하다면, 애플리케이션의 최소 두 대의 인스턴스 앞 단에 로드 밸런서를 설정하게 된다.

AWS는 다양한 시나리오에 맞게 적용된 세 가지 유형의 로드 밸런서를 제공한다. 바로 Elastic Load Balancer(ELB), Application Load Balancer(ALB), Network Load Balancer(NLB)이다.

## Common Features

먼저, 세 가지 유형의 로드 밸런서에 공통적인 사항은 다음과 같다. 

모든 AWS 로드 밸런서는 들어오는 요청을 여러 개의 타겟에 분산한다. 대상은 EC2 인스턴스 또는 Docker 컨테이너일 수 있다. 모두 health checks를 구현하며, unhealthy 인스턴스를 감지하는 데 사용된다. 모두 고가용성과 탄력성(elastic)을 갖추고 있다.

*elastic: AWS 용어로, 워크로드에 따라 몇 분 내에 scale up/down 할 수 있다.

TLS 종료는 세 가지 모두에 사용 가능한 기능이며, 모두 인터넷 연결 또는 내부 연결일 수 있다. 마지막으로 ELB, ALB 및 NLB는 모두 유용한 메트릭을 CloudWatch로 내보내고 관련 정보를 CloudWatch Logs에 기록할 수 있다.

유의해야 할 점은 트래픽이 갑자기 급증할 것으로 예상하는 경우(이벤트, 판매, 테스트 등) AWS 지원에 연락하여 **로드 밸런서를 "사전 워밍업(pre-warm)"** 하는 것이 좋다. 그렇지 않으면 로드 밸런서가 유입 트래픽 급증에 적응하는 데 너무 오래 걸릴 수 있다.

먼저, 첫 번째(그리고 가장 오래된) 로드 밸런서 유형인 클래식 로드 밸런서(또는 ELB)부터 자세히 살펴본다.

## Classic Load Balancer (Elastic Load Balancer, ELB)

이 로드 밸런서는 보통 Elastic Load Balancer의 약자인 ELB로 줄여서 부른다. 2009년에 처음 소개되었을 때의 이름이고 유일하게 사용 가능한 로드 밸런서 유형이었기 때문이다. 이해하기 쉽게 Nginx 또는 HAProxy 인스턴스라고 생각하면 된다.

ELB는 4계층(TCP)과 7계층(HTTP)에서 모두 작동하며, 매우 오래된 AWS 계정이 있는 경우 EC2-Classic에서 작동하는 유일한 로드 밸런서이다. 또한 애플리케이션 정의 스티키 세션 쿠키를 지원하는 유일한 로드 밸런서이다. 반면 ALB는 자체 쿠키를 사용하며, 이를 제어할 수 없다.

7계층에서 ELB는 TLS 트래픽을 종료할 수 있다. 또한 SSL 인증서를 제공하는 한 대상에 대한 트래픽을 다시 암호화할 수도 있다. (자체 서명 인증서도 괜찮다) 이는 많은 컴플라이언스 프로그램에서 일반적으로 요구되는 종단 간 암호화를 제공한다. 선택적으로 ELB는 추가 보안을 위해 대상이 제공한 TLS 인증서를 확인하도록 구성할 수 있다.

ELB에는 몇 가지 제한이 있다. 예를 들어, Fargate에서 실행되는 EKS 컨테이너와 호환되지 않는다. 또한 인스턴스당 두 개 이상의 포트에서 트래픽을 전달할 수 없으며 IP 주소로의 전달을 지원하지 않는다. ECS 또는 EKS의 명시적 EC2 인스턴스 또는 컨테이너로만 전달할 수 있다. 마지막으로 ELB는 웹소켓을 지원하지 않지만 레이어 4를 사용하여 이 제한을 해결할 수 있다.

us-east-1 지역에서 ELB를 실행하려면 ELB 시간당 $0.025와 트래픽 1GB당 $0.008의 비용이 든다.

AWS는 새로운 로드 밸런서를 선호하여 **ELB 사용을 권장하지 않는다.** 단언컨대, ELB를 사용하는 것이 더 바람직한 시나리오는 거의 없다. 일반적으로 이는 선택의 여지가 없는 경우이다. 예를 들어, 워크로드가 여전히 EC2-Classic 에서 실행 되거나 로드 밸런서가 고유한 스티키 세션 쿠키를 사용해야 하는 경우 ELB가 사용 가능한 유일한 옵션이다.

## The Next Step in Load Balancing

2016년 AWS는 Elastic Load Balancing 버전 2를 출시했는데, 이는 Application Load Balancer(ALB)와 Network Load Balancer(NLB)의 두 가지 오퍼로 구성되어 있다. 둘 다 유사한 아키텍처와 개념을 사용합니다. 

가장 중요한 점은 둘 다 "대상 그룹(Target Groups)"이라는 개념을 사용한다는 것이다. 이는 리디렉션의 한 단계이며, 이런 방식으로 개념화할 수 있다: 리스너는 요청을 수신하고 (다양한 규칙에 따라) 요청을 전달할 대상 그룹을 결정한다. -> 그런 다음 대상 그룹은 요청을 인스턴스, 컨테이너 또는 IP 주소로 라우팅한다. -> 대상 그룹은 트래픽을 분할하는 방법을 결정하고 대상에 대한 health check를 수행하여 대상을 관리한다.

ALB와 NLB는 모두 IP 주소로 트래픽을 전달할 수 있으므로 AWS 클라우드 외부의 대상(예: 온프레미스 서버 또는 다른 클라우드 공급자에 호스팅된 인스턴스)도 대상으로 삼을 수 있다.

## Application Load Balancer(ALB)

애플리케이션 로드 밸런서(ALB)는 7계층(HTTP)에서만 작동한다. 호스트 이름, 경로, 쿼리 문자열 매개변수, HTTP 메서드, HTTP 헤더, 소스 IP 또는 포트 번호를 기반으로 들어오는 요청에 대한 광범위한 라우팅 규칙이 있다. 반면 ELB는 포트 번호를 기반으로 하는 라우팅만 허용한다. 또한 ELB와 달리 ALB는 단일 대상의 여러 포트로 요청을 라우팅할 수 있다. 게다가 ALB는 요청을 Lambda 함수로 라우팅할 수 있다.

ALB의 매우 유용한 기능은 **고정된 응답이나 리다이렉션을 반환**하도록 구성할 수 있다는 것이다. 따라서 이러한 기본 작업을 수행하는 데 서버가 필요하지 않다. 모든 것이 ALB 자체에 내장되어 있기 때문이다. 또한 매우 중요한 점은 ALB가 HTTP/2와 웹소켓을 지원한다는 것이다.

ALB는 또한 **Server Name Indication(SNI)**를 지원하여, 여러 도메인 이름을 제공할 수 있다. (반면에 ELB는 하나의 도메인 이름만 제공할 수 있다) 그러나 ALB에 첨부할 수 있는 인증서 수에는 제한이 있다. 즉, 기본 인증서 외에 25개의 인증서이다.

ALB의 흥미로운 특징은 OIDC, SAML, LDAP, Microsoft AD, Facebook 및 Google과 같은 잘 알려진 소셜 ID 공급자를 포함한 다양한 방법을 통해 **사용자 인증**을 지원한다는 것이다. 이를 통해 애플리케이션의 사용자 인증 부분을 로드 밸런서로 오프로드하는 데 도움이 될 수 있습니다. 

ALB 가격은 ELB보다 약간 더 복잡합니다. us-east-1 지역의 경우 ALB당 $0.0225 + LCU-시간당 $0.008이 청구됩니다. LCU의 정의는 [여기에서](https://aws.amazon.com/ko/elasticloadbalancing/pricing/) 찾을 수 있다. 전반적으로 가격은 ELB와 거의 동일하다.

ALB는 일반적으로 **웹 애플리케이션**에 사용됩니다. 마이크로서비스 아키텍처가 있는 경우 ALB를 주어진 서비스를 구현하는 EC2 인스턴스 또는 Docker 컨테이너 앞에서 내부 로드 밸런서로 사용할 수 있습니다. REST API를 구현하는 애플리케이션 앞에서도 사용할 수 있지만, **AWS API Gateway가 일반적으로 더 나은 선택입니다.**

## Network Load Balancer(NLB)

네트워크 로드 밸런서(NLB)는 4계층에서만 작동하며 TCP와 UDP를 모두 처리할 수 있으며 TLS로 암호화된 TCP 연결도 처리할 수 있다. 주요 특징은 성능이 매우 높다는 것이다. 또한 정적 IP 주소를 사용하고 ALB 및 ELB에서는 불가능한 **Elastic IP**를 할당할 수 있다.

NLB는 기본적으로 TCP/UDP 패킷의 소스 IP 주소를 보존한다. 반면, ALB와 ELB는 전달 정보가 포함된 추가 HTTP 헤더를 추가하도록 구성할 수 있으며, 이러한 헤더는 애플리케이션에서 올바르게 구문 분석되어야 한다.

us-east-1 지역의 NLB 가격은 NLB 시간당 $0.0225 + LCU 시간당 $0.006입니다. NLB의 LCU 정의는 ALB의 정의와 매우 유사하며 자세한 내용은 [여기에서](https://aws.amazon.com/ko/elasticloadbalancing/pricing/) 확인할 수 있다. 전반적으로 가격은 ELB 및 ALB와 거의 동일하다.

NLB는 ALB가 다루지 않는 모든 것에 사용된다. 일반적인 사용 사례는 거의 실시간 데이터 스트리밍 서비스(비디오, 주식 시세 등)이다. 또 다른 일반적인 사례는 애플리케이션이 **HTTP가 아닌 프로토콜을 사용하는 경우** NLB를 사용해야 한다는 것이다.

## Comparison Table

Basic load balancing features

| Feature                             | ALB  | NLB       | ELB  |
| ----------------------------------- | ---- | --------- | ---- |
| Balance load between targets        | Yes  | Yes       | Yes  |
| Perform health checks on targets    | Yes  | Yes       | Yes  |
| Highly available                    | Yes  | Yes       | Yes  |
| Elastic                             | Yes  | Yes       | Yes  |
| TLS Termination                     | Yes  | Yes       | Yes  |
| Performance                         | Good | Very high | Good |
| Send logs and metrics to CloudWatch | Yes  | Yes       | Yes  |
| Layer 4 (TCP)                       | No   | Yes       | Yes  |
| Layer 7 (HTTP)                      | Yes  | No        | Yes  |
| Running costs                       | Low  | Low       | Low  |

Advanced load balancing features

| Feature                                             | ALB  | NLB  | ELB     |
| --------------------------------------------------- | ---- | ---- | ------- |
| Advanced routing options                            | Yes  | N/A  | No      |
| Can send fixed response without backend             | Yes  | No   | No      |
| Supports user authentication                        | Yes  | No   | No      |
| Can serve multiple domains over HTTPS               | Yes  | Yes  | No      |
| Preserve source IP                                  | No   | Yes  | No      |
| Can be used in EC2-Classic                          | No   | No   | Yes     |
| Supports application-defined sticky session cookies | No   | N/A  | Yes     |
| Supports Docker containers                          | Yes  | Yes  | Yes (*) |
| Supports targets outside AWS                        | Yes  | Yes  | No      |
| Supports websockets                                 | Yes  | N/A  | No      |
| Can route to many ports on a given target           | Yes  | Yes  | No      |

## Conclusion

AWS는 로드 밸런싱과 관련하여 다양한 옵션을 제공한다. 또한 AWS 로드 밸런서는 AWS Certificate Manager , AWS Web Application Firewall , AWS Shield , Amazon CloudWatch 등과 같은 나머지 AWS 서비스와 매우 잘 통합된다.

그들의 가격은 매우 비슷하므로 가격보다는 용도나 환경에 맞게 선택하면 된다. 일반적으로, 7계층(애플리케이션 계층) 로드 밸런싱에는 ALB를 사용하고 다른 모든 것에는 NLB를 사용하는것이 보편적이다.

## References

- [ELB vs. ALB vs. NLB: Choosing the Best AWS Load Balancer for Your Needs](https://iamondemand.com/blog/elb-vs-alb-vs-nlb-choosing-the-best-aws-load-balancer-for-your-needs/)
- [Differences: ALB vs. NLB vs. CLB](https://nidhiashtikar.medium.com/differences-alb-vs-nlb-vs-clb-29f25fc1033b)
- [What’s the difference between application, network, and gateway load balancing?](https://aws.amazon.com/compare/the-difference-between-the-difference-between-application-network-and-gateway-load-balancing/)
- [CLB vs. ALB vs. NLB—Which AWS load balancer is right for you?](https://www.site24x7.com/learn/clb-vs-alb-vs-nlb.html)

---

## Nginx Server: ALB vs NLB

프론트엔드의 Nginx 서버 앞에 ALB (Application Load Balancer)와 NLB (Network Load Balancer) 중 어느 것이 더 나은지에 대한 선택은, REST API 서버와 유사한 기준을 적용할 수 있습니다. 하지만 프론트엔드 서버의 특성에 따라 선택이 달라질 수 있습니다.

### 1. **트래픽 유형**
   - **ALB**: 프론트엔드는 일반적으로 HTTP/HTTPS 트래픽을 처리하며, 경로 기반 라우팅, 호스트 기반 라우팅 등의 기능이 유용할 수 있습니다. ALB는 이런 HTTP(S) 트래픽을 처리하는 데 적합합니다. 프론트엔드가 다양한 경로 또는 서브도메인에 따라 다르게 라우팅해야 한다면 ALB가 더 적합합니다.
   - **NLB**: 프론트엔드가 TCP 또는 UDP를 사용하거나 매우 높은 성능을 요구할 때 NLB가 적합할 수 있습니다. 하지만 일반적인 웹 프론트엔드는 대부분 HTTP 트래픽을 사용하므로 ALB가 더 많이 선택됩니다.

### 2. **성능 요구 사항**
   - **ALB**: 레이턴시는 NLB보다 상대적으로 높지만, 프론트엔드 웹 서버에서 필요한 고급 기능을 제공할 수 있습니다. 대부분의 웹 애플리케이션에서는 이 정도의 레이턴시는 큰 문제가 되지 않습니다.
   - **NLB**: 매우 낮은 레이턴시가 필요하거나 프론트엔드가 TCP 트래픽을 처리해야 한다면 NLB를 선택할 수 있습니다. 그러나 일반적인 웹사이트에서는 이런 성능이 반드시 필요하지 않기 때문에 NLB는 적합하지 않을 수 있습니다.

### 3. **보안 요구 사항**
   - **ALB**: HTTPS 트래픽 처리 및 TLS 종료를 지원하며, 프론트엔드에서 SSL/TLS를 직접 처리하는 대신 ALB에서 이를 처리하도록 설정할 수 있습니다. 또한 ALB는 WAF(Web Application Firewall) 통합을 지원하므로 보안 측면에서도 유리합니다.
   - **NLB**: L4 계층에서의 보안 설정이 가능하지만, HTTP(S) 트래픽에 대한 세부적인 보안 제어를 하기 위해서는 ALB가 더 적합합니다.

### 4. **라우팅 기능**
   - **ALB**: 호스트 기반, 경로 기반 라우팅 등 애플리케이션 계층에서의 다양한 라우팅 기능을 제공합니다. 프론트엔드에서 서브도메인이나 URL 경로에 따라 다른 서버로 라우팅할 필요가 있을 때 매우 유용합니다.
   - **NLB**: IP 주소 및 포트 기반의 로드 밸런싱을 제공하며, 매우 빠르게 처리할 수 있지만 애플리케이션 계층에서의 고급 라우팅은 지원하지 않습니다.

### 5. **비용**
   - **ALB**: 기능이 많기 때문에 비용이 다소 높을 수 있습니다.
   - **NLB**: L4 계층에서 동작하기 때문에 기본적인 기능만 제공하여 상대적으로 비용이 저렴할 수 있습니다.

### 결론
- **ALB**: 일반적인 웹 프론트엔드 서버는 HTTP/HTTPS 트래픽을 처리하며, 경로 기반 또는 도메인 기반 라우팅, 보안 기능 등을 제공하는 ALB가 더 적합합니다. 특히 HTTPS 트래픽 처리 및 인증서 관리, 애플리케이션 계층에서의 다양한 로드 밸런싱 기능이 필요하다면 ALB를 선택하는 것이 좋습니다.
- **NLB**: 매우 낮은 레이턴시가 요구되거나 HTTP 이외의 트래픽을 처리해야 할 때는 NLB를 고려할 수 있지만, 일반적인 웹 프론트엔드 상황에서는 필요하지 않을 가능성이 큽니다.

따라서 **프론트엔드의 Nginx 서버**에는 **ALB**가 더 나은 선택이 될 가능성이 높습니다.

## REST API Server: ALB vs NLB

REST API 서버 앞에 ALB (Application Load Balancer)와 NLB (Network Load Balancer) 중 무엇을 사용할지는 주로 다음과 같은 요구 사항에 따라 결정됩니다:

### 1. **트래픽 유형**
   - **ALB**: HTTP/HTTPS 계층(애플리케이션 계층, L7)에서 동작하며, 경로 기반 라우팅, 호스트 기반 라우팅, WebSocket, HTTP/2 등을 지원합니다. REST API가 주로 HTTP 기반 트래픽을 다루기 때문에 ALB가 적합할 수 있습니다.
   - **NLB**: TCP/UDP 계층(전송 계층, L4)에서 동작하며, 매우 낮은 레이턴시가 필요한 경우나 HTTP 이외의 프로토콜을 사용할 경우 유리합니다. NLB는 고속 트래픽 처리 및 IP 주소 기반 라우팅을 제공하며, 매우 빠른 성능이 필요할 때 선택할 수 있습니다.

### 2. **성능 요구 사항**
   - **ALB**: 레이턴시는 NLB보다 상대적으로 높지만, 애플리케이션 계층의 기능을 많이 활용할 수 있습니다. 대부분의 REST API는 이런 기능들이 유용하므로 일반적으로 ALB가 적합합니다.
   - **NLB**: 매우 낮은 레이턴시와 초당 많은 연결을 처리해야 한다면 NLB가 더 적합할 수 있습니다.

### 3. **보안 요구 사항**
   - **ALB**: 인증서 관리(HTTPS), WAF(Web Application Firewall) 등 애플리케이션 계층에서 보안 관련 기능을 많이 제공합니다. REST API는 HTTPS를 많이 사용하기 때문에 ALB의 보안 기능이 유리할 수 있습니다.
   - **NLB**: TLS 종단(SSL/TLS termination)을 지원하지만, L4 계층에서 보안 정책을 처리하기 때문에 세부적인 보안 제어가 필요하면 ALB가 더 적합합니다.

### 4. **비용**
   - **ALB**: 추가적인 기능들로 인해 NLB보다 비용이 높을 수 있습니다.
   - **NLB**: 매우 기본적인 L4 로드 밸런싱 기능만 제공하므로 비용이 더 저렴할 수 있습니다.

### 5. **로드 밸런싱 기능**
   - **ALB**: HTTP 상태 코드를 기반으로 한 헬스 체크, 애플리케이션 레벨에서의 로드 밸런싱과 세션 스티키니스(Sticky Sessions)를 지원합니다.
   - **NLB**: IP 주소 및 포트 기반의 로드 밸런싱을 제공하며, 더 빠른 처리 성능을 갖고 있습니다. API 서버가 더 많은 TCP 연결을 처리해야 한다면 유리합니다.

### 결론
- **ALB**: HTTP/HTTPS 기반 REST API 서버라면, 경로 기반 라우팅, 세션 스티키니스, WAF 등 애플리케이션 계층의 기능이 유용하므로 ALB가 적합합니다.
- **NLB**: 매우 낮은 레이턴시가 요구되거나 대량의 트래픽을 빠르게 처리해야 하는 경우, 또는 HTTP 이외의 프로토콜을 사용해야 한다면 NLB가 더 적합할 수 있습니다.

대부분의 REST API 서버에는 **ALB**를 사용하는 것이 더 일반적이고 적합합니다.