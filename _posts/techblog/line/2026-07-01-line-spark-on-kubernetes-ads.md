---
title: "LINE 「LINE 서비스의 대규모 광고 데이터를 처리하기 위한 Spark on Kubernetes 적용기」 리뷰 — 코어를 절반으로 줄이고도 226% 빨라진 이유는 HDFS와 CPU를 떼어 놓았기 때문"
date: 2026-07-01
status: draft
categories: [TechBlog, LINE]
tags: [Tech Blog Review, LINE, Apache Spark, Kubernetes, YARN, Hadoop, YuniKorn, Data Pipeline, Advertising]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 43
source_url: https://techblog.lycorp.co.jp/ko/processing-large-scale-data-with-spark-on-kubernetes
---

원문: [LINE 서비스의 대규모 광고 데이터를 처리하기 위한 Spark on Kubernetes 적용기](https://techblog.lycorp.co.jp/ko/processing-large-scale-data-with-spark-on-kubernetes) — LY Corporation Tech Blog, 박민재·손정호·정창권(LINE Ads), 2026-03-31

## 한 줄 요약

LINE Ads는 하루 수십억 건 광고를 송출하고 천억 건에 준하는 데이터를 가공한다. 피처가 늘어 주력 테이블이 3년 새 2.91배 커졌는데, Spark on YARN은 **HDFS와 컴퓨팅이 같은 노드에 묶여** Spark 연산이 Hadoop I/O와 CPU를 두고 경합했고, 컴퓨팅만 늘리려 해도 Hadoop 노드를 통째로 증설해야 했으며, JVM·Spark 버전을 자유롭게 못 썼다. Spark on Kubernetes(클러스터 모드, Kubeflow Spark Operator, YuniKorn 갱 스케줄링)로 옮기자 같은 인스턴스 50대에서 **코어를 200 → 100으로 절반만 쓰고도** Kafka→Kafka 스트리밍 처리량이 200K → 653K/초(약 226%)가 됐고, 컴퓨팅 비용은 연 40% 이상 줄었다. 대신 컨테이너 OOM(메모리 오버헤드 0.1 → 0.2 이상)과 파드 종료 시 볼륨 종류에 따른 재시도·실패 동작을 새로 익혀야 했다.

## 배경: YARN의 구조적 한계

요구는 하루 수백억 건·초당 수십만 건 실시간 처리, 성장에 따른 유연한 확장, 최소 지연, 장애 시 영향 최소화와 빠른 복구다. 스케일 아웃으로 풀 수 없었던 이유가 셋이다.

1. YARN은 스토리지와 컴퓨팅이 결합된 노드에서 자원을 할당하므로 Spark가 HDFS와 다른 Hadoop 컴포넌트와 **경합**한다.
2. 컴퓨팅이 부족해 Hadoop 노드를 늘리면 스토리지는 남는데 비용은 든다.
3. JVM·Spark 버전을 자유롭게 설정하기 어려워 최신 기능을 못 쓴다.

## Spark on Kubernetes

드라이버와 익스큐터를 파드로 실행하고 Kubernetes가 클러스터 매니저 역할을 한다. 클라이언트 모드(드라이버는 외부, 익스큐터만 파드)와 클러스터 모드(드라이버도 파드, 제출 후 클라이언트 종료 가능)가 있고, 리소스·스케줄링·로그·네트워크가 모두 Kubernetes 안에서 통합되는 **클러스터 모드**를 택했다. 흐름은 spark-submit → 드라이버 파드 생성·SparkContext·DAG → 익스큐터 파드들(드라이버에 종속) → 태스크 분배. 셔플 데이터는 외부 셔플 서비스 없이 익스큐터 파드 생명 주기에 종속된다.

YARN 대비 장점은 컨테이너 기반 실행(이미지에 의존성 포함, CI/CD 연결), 인프라 독립성(S3·GCS·HDFS 선택), 파드 기반 오토스케일링, 멀티 워크로드 통합(Airflow·ML·API 서버와 한 클러스터), 네임스페이스·ResourceQuota·RBAC 거버넌스, Helm·ArgoCD·GitOps 자동화다.

## 시스템 구성

| 레이어 | 구성 |
| --- | --- |
| 배포 | GitHub Actions(리포지터리 이벤트로 워크플로) + ArgoCD(상태 모니터링·롤백) |
| 컴퓨팅 | Kubeflow Spark Operator의 SparkApplication CRD, Apache YuniKorn, LogSender(파드 로그 → Verda OpenSearch), ClusterMonitoring(Prometheus 지표 → IMON) |
| 스토리지 | Kafka(실시간), HDFS(장기 분석) |
| 모니터링 | Verda OpenSearch(로그), IMON Flash(지표·노드 자원), Grafana(IMON + YuniKorn 지표) |

**YuniKorn.** 기본 Kubernetes 스케줄러에 없는 자원 조정과 **갱 스케줄링**(잡에 필요한 자원을 전부 할당하거나 전혀 하지 않음)을 제공한다. Spark는 익스큐터 수가 충분히 확보되지 않으면 성능이 떨어지거나 실패하므로, 필요한 익스큐터가 모두 확보될 때까지 대기시킨다. 계층적 자원 큐(테넌트별 세밀 제어, ConfigMap 설정), 사용자·앱·큐별 fair/FIFO/우선순위 스케줄링, 웹 콘솔.

## 트러블슈팅

**메모리 오버헤드.** Spark 메모리 오버헤드는 JVM 온힙 외에 컨테이너에 요청하는 오프힙이다. 프로덕션 배포 초기에 JVM OOM이 아니라 **컨테이너 OOM**이 계속 났다. Kubernetes 환경은 YARN보다 컨테이너 오버헤드로 JVM 밖 연산량이 많기 때문이다. 익스큐터 메모리의 0.1이던 오버헤드를 **0.2 이상**으로 올려 해결했다.

**노드·파드 실패.** 드라이버 파드는 하나만 있어야 하므로 종료되면 앱도 종료된다. 익스큐터는 볼륨 종류(emptyDir 1Gi / PVC 블록 50Gi / emptyDir 50Gi)와 종료 사유에 따라 다르다(Spark 3.5.3 기준).

| 상황 | emptyDir 1Gi | PVC 50Gi | emptyDir 50Gi |
| --- | --- | --- | --- |
| OOM 아닌 종료 | 잡 재시도, 새 익스큐터로 스테이지 재수행 | 재시도, PVC 데이터를 새 익스큐터가 재사용 | 재시도, 새 익스큐터로 재수행 |
| OOM 종료(캐시 없는 잡) | 재시도 | 재시도 | 재시도 |
| OOM 종료(캐시된 잡) | **실패**(캐시 파티션 소실) | **실패**(강제 종료된 파드는 유효 상태가 아니라 재사용 불가, 손상 판단) | **실패**(캐시 소실) |
| 디스크 스필 | **실패**(1Gi 한계) | 성공(할당 한도까지) | 성공 |

PVC가 스테이지 재수행에서 데이터를 재사용하는 이점은 있지만 캐시된 잡의 OOM에서는 구원이 되지 않는다는 점, 그리고 디스크 스필에는 볼륨 용량이 곧 생존선이라는 점이 실무적이다.

## 숫자

Kafka → Kafka Structured Streaming 앱, 인스턴스 50, 메모리 4G.

| | 코어/인스턴스 | 총 코어 | 처리량 |
| --- | ---: | ---: | ---: |
| Spark on YARN | 4 | 200 | 200K/초 |
| Spark on Kubernetes | 2 | 100 | 653K/초 |

코어 절반으로 약 **226%** 향상. 이유는 Hadoop 연산을 병행할 필요가 없어 단일 코어의 태스크 성능이 크게 올라서다. HDFS를 읽고 쓰는 배치도 Kubernetes 클러스터가 Hadoop과 같은 데이터센터 네트워크에 있다는 가정에서, 지역성을 만족하기 어려운 데이터의 읽기/쓰기는 기존과 비슷했고 파싱·집계 같은 CPU 연산은 향상됐다. 비용은 대외비지만 비싼 Hadoop용 노드 대신 컴퓨팅 최적화 노드를 쓰고 컴퓨팅만 집중시켜 **연 40% 이상**(스토리지 제외 컴퓨팅 기준) 절감. 그리고 YARN을 건드리지 않고 상위 Spark 버전을 쓸 수 있게 됐다. 향후 Iceberg 같은 테이블 포맷 도입도 이 자유도 위에서 계획한다.

## 읽고 남는 질문

- 226%가 "코어당 성능"인지 "코어 절반이어서 더 인상적"인지 해석이 갈린다. 코어당으로 환산하면 1K → 6.5K/초로 6.5배인데, 그 격차가 전부 HDFS 경합 제거로 설명되는지, YARN 쪽 설정(vcore 오버커밋 등)의 영향은 없는지 궁금하다.
- 셔플이 익스큐터 생명 주기에 종속된다면 익스큐터가 죽을 때마다 셔플 재계산이 생긴다. 큰 배치 잡에서 외부 셔플 서비스나 Celeborn 같은 원격 셔플을 검토했는지.
- 갱 스케줄링은 큰 잡이 자원을 확보할 때까지 기다리게 하므로 작은 잡이 굶거나 반대로 큰 잡이 영원히 못 뜨는 문제가 생길 수 있다. 큐 설계와 우선순위를 실제로 어떻게 잡았는지가 운영에서 가장 궁금하다.

## 한 줄로 가져가기

Spark가 느린 이유가 Spark가 아니라 같은 노드의 HDFS일 수 있다. 컴퓨팅을 스토리지에서 떼어 내면 코어 절반으로도 두 배 이상이 나오지만, 그 대가로 컨테이너 오버헤드와 파드 생명 주기에 묶인 셔플·캐시·디스크를 새로 다뤄야 한다.
