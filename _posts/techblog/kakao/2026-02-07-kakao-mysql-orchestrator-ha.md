---
title: "카카오 「MySQL Orchestrator 기반의 새로운 HA 표준 개발기」 리뷰 — 10년 멈춘 Perl 도구를 떠나 Raft 클러스터로, 그리고 slave_net_timeout 한 줄"
date: 2026-02-07
categories: [TechBlog, Kakao]
tags: [Tech Blog Review, Kakao, MySQL, High Availability, Orchestrator, MHA, Raft, Failover, Replication]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
source_url: https://tech.kakao.com/posts/775
---

원문: [MySQL Orchestrator 기반의 새로운 HA 표준 개발기](https://tech.kakao.com/posts/775) — kakao tech, 2025-09-30

## 한 줄 요약

카카오는 2015년부터 MHA로 MySQL 고가용성을 맞춰 왔지만, MHA는 10년 넘게 패치가 없고, Perl이라 고치기 어렵고, 외부에서 Source 서버를 찔러 보는 구조라 네트워크 장애에 오동작하며, Replica 상태는 아예 볼 수 없었다. 2023년 13개 후보를 비교해 **Orchestrator**를 골랐고, 가장 어렵지만 가장 안전한 **Raft HA**(3대 이상 홀수)로 구성했다. 사내 DBaaS와 잇는 연동 시스템 Protego를 만들고, 코드 변경은 최소화하며 위험한 UI 제거·API 추가·Hook 알림·Replica용 **DNS Failover**를 넣었다. 그리고 Orchestrator의 장애 판정 방식에 맞춰 `slave_net_timeout`을 바꾸자 네트워크 장애 페일오버가 5~10초로 줄었다. 3년 안에 MHA를 전부 대체하는 것이 목표다.

## 배경: MHA의 세 가지 한계

MHA는 2012년 DeNA의 Yoshinori Matsunobu가 만든 자동 페일오버 도구다. 문제는 셋이다.

1. **변화 대응 부족.** 10년 넘게 패치·기능 추가가 없다. MySQL과 OS 버전이 올라가는데 대응이 없다.
2. **구조적 한계.** Source 서버 상태를 외부에서 접근해 확인하는 로직이라 "네트워크는 안정적"이라는 전제가 깔려 있고, 다양한 네트워크 장애에서 오동작했다. 카카오는 이를 보완하려 HAM이라는 MHA 클러스터 매니저를 만들었지만 Perl 소스를 고치는 것이 큰 부담이었다. 그리고 MHA는 "Source가 죽으면 Replica를 승격"이 기본 설계라 **Replica 상태를 보고 조치**하는 요구를 넣을 수 없었다.
3. **Perl.** 한국에서 거의 안 쓰는 언어라 분석·수정에 시간이 많이 든다.

## 선정: 13개 후보 중 Orchestrator

MySQL Cluster, ProxySQL, Corosync+Pacemaker(+NFS/DRBD), Heartbeat 조합, PRM, Percona XtraDB Cluster, Automatic Asynchronous Replication Connection Failover, ClusterControl, InnoDB Cluster, Orchestrator 등을 검토했다. Orchestrator는 Shlomi Noach(gh-ost 개발자, Vitess 기여자)가 만든 것으로, 단순 페일오버를 넘어 복제 토폴로지 전체를 이해하고 복구(healing)하는 데 초점이 있다. MHA와 달리 **한 클러스터에서 여러 토폴로지를 관리**하고, **자기 자신도 클러스터로 HA**를 갖출 수 있다.

## 구성: Raft HA

Orchestrator 클러스터는 Meta DB 구성과 프로세스 관리 방식에 따라 넷으로 나뉜다.

| 구성 | Orchestrator | Meta DB | Orchestrator 자체 HA |
| --- | --- | --- | --- |
| No HA | 1 | 1 | 없음(테스트·개발용) |
| Semi HA | 여러 개 | 1(Source-Replica 가능) | 없음 |
| Shared Backend HA | 여러 개 | 클러스터(InnoDB Cluster 등) | 없음 |
| Raft HA | 클러스터(리더 선출) | 리더가 관리 | 있음 |

구성 난이도가 가장 높지만 안전한 Raft HA를 택했다. Raft는 여러 서버가 하나처럼 동작하도록 합의를 만드는 알고리즘이고, 핵심은 **정족수(과반수)**다.

| 노드 | 과반수 | 장애 허용 | 분리 시 |
| --- | --- | --- | --- |
| 3 | 2 | 1 | 2:1로 갈리면 2쪽이 정상 동작 |
| 4 | 3 | 1 | 2:2로 갈리면 양쪽 모두 불가 |
| 5 | 3 | 2 | 3:2로 갈리면 3쪽이 정상 동작 |

짝수는 split-brain은 안 생기지만 정족수가 회복될 때까지 서비스가 멈추고, 장애 허용 수가 하나 적은 홀수와 같아 비효율적이다. 그래서 **최소 3대, 홀수**다. 리더 선출뿐 아니라 내부 로그 커밋도 과반수에서 이뤄져야 커밋된다.

## 카카오에 맞추기

**Protego.** 모든 DB가 DBaaS로 운영되므로 Orchestrator를 그냥 쓸 수 없었다. DB 메타 정보를 제공하고 Orchestrator와 DBaaS를 연동하는 솔루션을 만들었다.

**코드 수정.** 전제는 둘이다. 변경을 최소화한다. 업스트림 최신 버전과 카카오 버전 사이의 충돌이 문제가 되지 않도록 배포 프로세스를 정의한다. 다섯 영역(Web UI, Client API, Hook, Backend DB, 핵심 로직)에서 이렇게 고쳤다. 위험한 UI 제거, Protego 연동 API 추가, Hook으로 이벤트 알림, Backend DB의 메타 정보를 Protego가 읽어 활용.

**DNS Failover.** MHA에서는 불가능했던 Replica 활용 요구다. 서비스용 Replica 도메인을 만들어 매핑하고, Orchestrator Backend DB의 Replica 상태를 보다가, 장애가 확인되면 도메인을 다른 Replica로 바꾼다. 다른 작업은 안 하고 도메인만 바꾸니 DNS Failover다. 지금은 5분 정도 텀을 두고 바꾸며 고도화 여지가 있다.

**자동화.** 최초 구성(git clone부터 빌드·계정·파일 수정까지 7단계 수동 작업)을 스크립트로, 배포와 빌드를 Jenkins로 자동화했다.

## 운영: slave_net_timeout

이 글에서 가장 실용적인 부분이다. Orchestrator는 세 가지로 상태를 판단한다. Source의 `SELECT 1`, Replica의 `SHOW REPLICA STATUS`, Replica의 `SHOW SOURCE STATUS`. 즉 Source 헬스체크와 **Replica의 복제 상태**를 함께 보고 페일오버를 결정한다.

- **Source 프로세스가 죽은 경우**: Orchestrator가 UnreachableMaster를 감지하고 Replica 복제 상태를 본다. 보통 Source가 죽으면 Replica에 Dead Signal이 가서 IO 스레드가 Connecting으로 바뀌므로 빠르게 확정된다.
- **Source는 멀쩡한데 네트워크만 끊긴 경우**: Dead Signal이 안 오므로 Replica는 `slave_net_timeout`(Source에서 이벤트를 못 받을 때 기다리는 시간)만큼 기다린 뒤에야 연결 끊김을 확정한다. Orchestrator는 그만큼 지연된 뒤 페일오버한다.

그래서 카카오는 MySQL 서버들의 `slave_net_timeout`을 바꿨고, 네트워크 장애 페일오버가 **5~10초 안**으로 개선됐다.

## 결론

현재 Orchestrator와 MHA를 병행 중이고 3년 안에 통합이 목표다. 기대 효과는 네트워크 장애로 인한 페일오버 오류 제거, Replica 모니터링과 후속 처리, 업무 생산성이다.

## 읽고 남는 질문

- `slave_net_timeout`을 얼마로 바꿨는지 값이 없다. 너무 낮추면 일시적 네트워크 흔들림에 복제가 끊겼다 붙었다 하고 불필요한 페일오버가 날 수 있어서, 5~10초라는 결과와 함께 설정값과 오탐 경험이 있으면 좋겠다.
- Orchestrator의 페일오버는 승격까지고, 애플리케이션이 새 Source를 찾는 경로(VIP, DNS, 프록시)가 무엇인지가 없다. Replica는 DNS Failover라 했으니 Source도 DNS인지 궁금하다.
- Orchestrator 자체가 openark에서 Percona 포크로 관리 주체가 옮겨 갔다. MHA를 떠난 이유가 "관리되지 않아서"인데, Orchestrator의 유지보수 전망을 어떻게 판단했는지 한 줄 있었으면 설득력이 더했을 것이다.

## 한 줄로 가져가기

HA 도구를 바꾸는 일의 절반은 도구 선정과 클러스터 구성이고, 나머지 절반은 "그 도구가 장애를 어떻게 판정하는가"에 맞춰 DB 설정을 다시 보는 것이다. Orchestrator는 Replica의 눈으로 보므로 `slave_net_timeout`이 곧 페일오버 시간이 된다.
