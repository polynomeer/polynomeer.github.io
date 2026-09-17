---
title: "네이버 D2 「Kubernetes Job과 커스텀 컨트롤러를 활용한 배치 처리 경험기」 리뷰 — 배치를 VM에서 Job으로 옮기고, 순서가 필요한 것은 suspend와 Reconcile로 잇는다"
date: 2025-03-16
status: draft
categories: [TechBlog, Naver]
tags: [Tech Blog Review, Naver, Kubernetes, Batch, Kubernetes Job, Custom Controller, Kubebuilder, Operator Pattern]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 3
source_url: https://d2.naver.com/helloworld/4142663
---

원문: [Kubernetes Job과 커스텀 컨트롤러를 활용한 배치 처리 경험기](https://d2.naver.com/helloworld/4142663) — NAVER D2, 권혁내, 2025-01-10

## 한 줄 요약

VM 한 대에서 배치를 돌리면 서로 상관없는 작업도 앞 작업이 끝날 때까지 기다린다. 서버를 늘리면 대부분의 시간에 놀아서 낭비다. Kubernetes Job으로 옮기면 배치 하나하나가 독립된 파드에서 병렬로 돈다. 다만 **순서가 필요한 배치**는 Job만으로는 안 된다. Jenkins 같은 외부에서는 Job 상태를 실시간으로 모르기 때문이다. 그래서 커스텀 컨트롤러로 작은 스케줄러를 만들었다. Job을 `suspend: true`로 만들어 두고, 컨트롤러가 라벨의 순서대로 하나씩 suspend를 풀며 성공하면 다음, 실패하면 멈춘다.

## 배경: 동시에 돌리고 싶은 배치가 너무 많다

프로젝트 초기엔 배치가 몇 개 없어 VM 한 대면 된다. 시간이 지나면 특정 시각에 알림을 여러 종류 보내야 하는 식으로 배치가 늘고, VM 한 대는 CPU·메모리 때문에 동시에 못 돌린다. 독립적인 작업인데도 줄을 선다. 서버를 추가하면 비용과 관리 포인트가 늘고, 특정 시각에만 쓰니 대부분 논다. 그 시각에만 서버를 만드는 것은 확장성이 없다.

## 핵심 아이디어 1: 배치 하나 = Job 하나

Kubernetes Job은 일회성 작업용 오브젝트다. 사용자가 Job 생성을 요청하면 API 서버가 etcd에 저장하고, 컨트롤러 매니저가 감지해 spec대로 파드를 만들고, 스케줄러가 적절한 노드에 배치한다. 그래서 각 Job은 독립된 파드에서 병렬로 돈다. 자동 복구가 따라오고, 같은 Job 구성을 다른 클러스터에서 돌리면 이중화도 된다.

원문은 Helm으로 배포한다. `templates/job.yaml`이 `values.yaml`의 값(이미지, 리소스 limit, 실행 명령, JVM 옵션 등)을 참조하고, 환경별로 `env/dev`, `env/real`의 values를 두며, 실행 시 `--set`으로 파라미터를 주입한다. 여러 Job을 동시에 배포하면 각기 다른 노드에 할당돼 실행되는 것을 확인했다. 연관 없는 작업이 서로 기다리지 않게 됐다.

## 핵심 아이디어 2: 순서가 필요한 배치는 컨트롤러가 잇는다

문제는 의존성이 있어 순차로 돌아야 하는 배치다. Job은 파드에서 독립적으로 도니까 **클러스터 밖에서는 실행 상태를 실시간으로 알기 어렵다.** 지연 없이 순차 처리하려면 클러스터 안에서 상태를 보며 스케줄링해야 한다. 그래서 커스텀 컨트롤러를 만들었다. 원문은 "오픈소스가 있으면 그것을 쓰는 게 낫고, 못 쓰는 환경이거나 특수 요구가 있거나 학습 목적일 때 직접 만들라"고 미리 못 박는다.

### 컨트롤러는 어떻게 도는가

커스텀 컨트롤러는 사용자가 정의한 리소스의 현재 상태를 계속 보며 의도한 상태로 맞추는 컴포넌트다. 이 반복이 Reconcile Loop다. 컨트롤러가 API 서버에 직접 계속 물어보면 부하가 크므로 client-go가 중간 부품을 준다.

- **Reflector**: 리소스를 watch하고 이벤트가 오면 로컬 캐시에 동기화. 조회는 캐시에서.
- **Informer**: 이벤트 종류에 맞는 핸들러를 불러 workQueue에 넣음.
- 컨트롤러는 workQueue에서 하나씩 꺼내 **Reconcile** 메서드로 상태를 조정.

Kubebuilder는 이 컨트롤러 매니저 부분을 만들어 주므로 사용자는 커스텀 리소스 정의와 Reconcile 로직만 쓰면 된다.

### 스케줄러 설계

동작은 두 줄이다.

1. 실행할 Job의 라벨에 `group`과 `order`를 적고 `spec.suspend: true`로 만들어 둔다.
2. 커스텀 리소스 `JobScheduler`에 그룹명을 넣어 생성하면, 컨트롤러가 그 그룹의 Job을 순서대로 정렬해 하나씩 suspend를 푼다.

리소스는 `Spec.JobGroupName`(무엇을 돌릴지)과 `Status.JobOrderGroup`(정렬된 Job 목록), `Status.CurrentActiveJobIndex`(지금 어디까지)로 이뤄진다. Reconcile 로직은 셋이다.

- **초기화**: 네임스페이스의 Job을 전부 가져와 `group` 라벨이 Spec과 같은 것만 골라 `order`로 정렬해 Status에 저장.
- **실행**: 순서가 가장 낮은 Job의 `Spec.Suspend`를 false로 바꿔 실행.
- **감시**: Job Status의 `Active`/`Succeeded`/`Failed`를 본다. Active면 `RequeueAfter: 1분`으로 다시 온다. Succeeded면 인덱스를 올려 다음 Job. Failed면 `BackoffLimit`까지 재시도 중이면 1분 뒤 다시, 다 실패했으면 Reconcile 종료.

로컬 클러스터에서 `make install`(CRD 등록)과 `make run`(컨트롤러 매니저)으로 띄우고, `order: "1"`, `"2"`인 suspend Job 둘과 `jobGroupName: test-group`인 JobScheduler를 만들면 순서대로 실행되고 모두 성공하는 것을 확인했다. 운영 배포는 kustomization으로 YAML 하나로 패키징한다.

## 읽고 남는 질문

- 감시 주기가 1분 폴링이다. Job 리소스에 대한 watch를 걸어(Owns/Watches) 상태 변화 이벤트로 Reconcile을 트리거하면 지연 없이 순차 처리가 가능한데, 왜 폴링을 택했는지가 없다. "지연 없이"가 목표였다면 이 부분이 아쉽다.
- 초기화가 네임스페이스의 Job을 전부 List한다. Job이 수천 개 쌓이면 부담이 되고, `ttlSecondsAfterFinished`로 완료 Job을 정리하는지도 궁금하다.
- 실패 시 "종료"인데 그 뒤가 없다. 알림, 재실행 방법, 중간부터 재개(인덱스 유지)가 되는지가 실무에서는 더 중요하다.
- 원문 스스로 Argo Workflows·Airflow를 권한다. 그렇다면 이 구현은 학습용에 가깝고, 실제 운영에서 어느 쪽을 택했는지가 있으면 좋겠다.

## 한 줄로 가져가기

독립 배치는 Job 하나씩으로 풀어 병렬로 돌리고, 순서가 필요한 배치는 클러스터 안에서 상태를 보는 것(컨트롤러)이 이어야 한다. 그 최소 구현은 "suspend로 만들어 두고 하나씩 푼다"이고, 그 이상은 워크플로 엔진의 몫이다.
