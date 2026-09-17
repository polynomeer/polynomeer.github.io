---
title: "카카오 「개인화된 Airflow 테스트 환경 구축 및 운영 경험」 리뷰 — PR을 열면 5분 안에 내 Airflow가 생기는 AirZone의 세 가지 설계 결정"
date: 2026-09-10
categories: [TechBlog, Kakao]
tags: [Tech Blog Review, Kakao, Apache Airflow, Kubernetes, Helm, Developer Experience, Data Pipeline, Platform Engineering]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 70
source_url: https://tech.kakao.com/posts/829
---

원문: [개인화된 Airflow 테스트 환경 구축 및 운영 경험](https://tech.kakao.com/posts/829) — kakao tech, 비오·소나·테라(데이터서비스), 2026-08-07

## 한 줄 요약

수천 개 DAG를 하둡별 Airflow 클러스터에서 돌리는 조직에서, DAG 하나를 테스트하려면 로컬 구축(비싸고 운영과 다름), 개발용(커밋·푸시 후 submodule 갱신과 파싱을 매번 기다림), 테스트용(SSH 컨테이너에 파일 복사)을 오가야 했다. **AirZone**(Airflow Zero Zone)은 PR을 열면 코멘트에 생성 링크가 달리고, 누르면 `레포명-PR번호` 네임스페이스에 Airflow 웹·스케줄러·PostgreSQL·Jupyter·DAG PVC가 한 벌 뜬다. 설계 결정은 셋이다. 요청(API)과 배포(Kubernetes Job)를 분리하고, PR 단위로 네임스페이스를 격리하고, 전용 Helm 차트를 만든다. PR이 닫히면 CronJob이 지운다. 결과는 "PR 하나로 운영과 같은 Airflow를 5분 내외에".

## 배경: 기존 인프라와 세 가지 테스트 방식

팀 파이프라인은 프로젝트 저장소 수십 개로 나뉘지만 Airflow가 읽는 DAG 저장소는 하나다. 프로젝트에 push하면 webhook을 받은 airflow-api가 공통 저장소의 서브모듈 포인터를 갱신하고, Scheduler Pod의 git-sync 사이드카가 주기적으로 pull한다. 태스크는 Worker가 직접 돌리지 않고 `AAKubernetesPodOperator`가 별도 Pod(자체 빌드 하둡 이미지, init container로 kinit)를 띄워 Spark·Hive를 실행한다.

이 위에서 테스트는 셋 중 하나였다. **로컬 Airflow**는 하둡 인증·연결·도커까지 맞춰야 해 초기 비용이 크고 조금만 달라도 운영에서 실패한다. **개발용 Airflow**는 git을 거치므로 고칠 때마다 커밋·푸시하고 submodule update부터 DAG 파싱까지 기다려야 한다. **테스트용 Airflow**는 SSH 컨테이너에 파일을 복사하는데 수정마다 복사해야 한다. 그리고 실제 데이터가 필요하면 production에 테스트 DAG를 넣기도 했는데, 스케줄러와 워커는 모든 DAG가 공유하는 자원이다.

요구사항은 둘. Kubernetes나 Helm을 몰라도 만들고 지울 수 있는 **준비 없는 환경**, 그리고 다른 작업과 **격리된 환경**.

## 세 가지 설계 결정

**1. 요청과 배포를 분리한다.** 환경 하나를 만드는 데는 시크릿 배포, Helm 설치, 헬스체크까지 수 분이 걸린다. API 프로세스가 이를 붙잡으면 응답이 늦고, 실패 시 재시도가 어렵고, 배포 로그가 API 로그에 섞인다. 그래서 `airzone-api`는 유효성(브랜치 정보, PR 존재·open 여부, 같은 PR의 네임스페이스 중복)만 검사하고 바로 응답하며, 실제 배포는 `create-airzone-{namespace}` 이름의 **Kubernetes Job**이 컨테이너 안에서 `helm install`부터 헬스체크까지 한다. 같은 이름의 Job이 남아 있으면 지우고 새로 만들어 이전 실패 흔적이 새 요청을 막지 않게 한다. Job마다 독립된 로그와 상태가 남아 어느 요청의 어느 단계가 실패했는지 바로 좁힐 수 있다.

**2. PR 단위 네임스페이스.** 다른 PR의 테스트가 자원을 침범하지 않고, 한 사람이 여러 PR을 동시에 열어 각각 테스트할 수 있으며, 리뷰어가 PR 링크로 리뷰용 환경에 들어가 실제 동작을 볼 수 있고, 어떤 코드가 배포됐는지 PR 하나로 특정된다. 삭제도 네임스페이스 기준이라 수명 주기가 단순하다.

**3. 전용 Helm 차트.** 기존 Airflow 차트로는 PR 브랜치 작업 공간, 브라우저 IDE, 키탭 주입, 테스트용 로그 링크, 삭제 가능한 네임스페이스를 한 배포 단위로 다루기 어렵다. 반대로 PGBouncer나 외부 DB 연결처럼 운영에는 필요하지만 개인 환경에는 과한 것은 걷어냈다. 차트에는 Git 정보(PR head repo·branch), DAG PVC, KubernetesExecutor 설정, 인증(사용자·공용 principal, 키탭, Jupyter 토큰, TLS), 노드·스토리지, Elasticsearch·Kibana 로그 연동이 들어간다.

접점은 GitHub PR 코멘트다. 사용자가 이미 테스트를 시작하는 지점이 PR이므로 별도 UI를 배울 필요가 없다. 하둡별 생성 링크를 함께 남긴다. 단, **Jupyter 토큰과 네임스페이스 토큰은 PR이 아니라 카카오워크로만** 전달한다. PR은 공개 범위가 넓기 때문이다.

## 가장 고민한 부분: DAG 파일

사용자는 Jupyter에서 고치고, 스케줄러는 그 변경을 바로 봐야 하며, KubernetesExecutor의 Worker Pod는 실행 때마다 새로 뜬다. 사내 공유 스토리지를 작업 디렉터리로 쓰는 것은 파일이 많을 때 느리고 권한이 바뀌는 문제가 있어 접었다. 최종안은 Scheduler Pod의 init container가 PR 브랜치를 **한 번 clone해 PVC에** 두고, Scheduler·Jupyter·code-server가 같은 PVC를 마운트하며, Worker Pod는 태스크 시작 시 Scheduler Pod에서 DAG 디렉터리를 **복사**해 실행하는 것이다. 운영의 DAG 배포 방식과 같지는 않지만, 임시 환경에서는 "고치고 바로 실행하는 경험"이 더 중요하다고 판단했다.

노드 스케줄링에도 함정이 있었다. 프로덕션 클러스터는 세 리전에 노드 그룹이 나뉘고 리전마다 Cinder 기반 storageClass가 따로다. Cinder 볼륨은 생성된 리전 안에서만 붙으므로 **Pod와 PVC가 같은 리전**이어야 한다. 그리고 특정 노드 그룹만 계속 쓰면 그 리전만 소진되므로 배포마다 여유가 가장 많은 노드 그룹을 골라 그 안에 띄운다.

Helm 설치 완료가 곧 접속 가능은 아니라서 Web·Jupyter·Scheduler가 실제로 응답할 때까지 폴링한 뒤 성공으로 본다. 하둡 접속을 위해 요청자의 개인 키탭을 찾아 주입하고, 없으면 공용 키탭으로 채운 뒤 카카오워크로 알린다. 성공하면 접속 주소와 삭제 링크를 PR과 카카오워크에, 실패하면 관리자에게 원인을 보낸다.

## Beta 운영에서 배운 것

1차 Beta 후 2차 정식 배포에 반영한 피드백 세 가지.

- **코드 수정 도구.** Jupyter는 파일을 고치면 체크포인트 파일을 따로 만드는데, Airflow가 원본 대신 그것을 읽어 수정이 반영되지 않는 경우가 있었다. (code-server가 추가된 배경으로 읽힌다.)
- **상시 환경으로 키우지 않는다.** 개인 환경은 끝나면 지워지는 것이 전제다. 14일 이상 유지되는 환경은 자동 정리한다.
- **그래도 상시 개인 Airflow를 원하는 요청**에는 같은 구성을 자체 클러스터에 배포하는 Helm 차트 가이드를 제공했고, 다른 조직도 이를 써서 자체 환경을 구축했다.

가장 큰 변화는 로컬·개발·테스트용을 제각각 쓰던 크루들이 모두 AirZone으로 넘어와 **테스트 방식이 하나로 정리된 것**이다.

## 읽고 남는 질문

- 환경 하나의 자원 비용(PostgreSQL + 스케줄러 + Jupyter + PVC)과 동시에 열려 있는 환경 수의 최대치가 없다. 세 리전을 고르게 쓴다는 것은 자원 압박이 실제로 있었다는 뜻일 텐데, 그 규모가 궁금하다.
- Worker가 Scheduler Pod에서 DAG를 복사하는 방식은 Scheduler Pod가 재시작되면 어떻게 되는지, 그리고 태스크 수십 개가 동시에 뜰 때 복사 부하가 문제되지 않는지 궁금하다.
- 개발용 하둡과 연동하는지 운영 하둡과도 연동하는지가 링크 선택에 맡겨져 있다. 개인 키탭으로 운영 데이터에 접근하는 테스트 환경이라면 그 권한 경계를 어떻게 관리하는지가 보안 관점에서 중요하다.

## 한 줄로 가져가기

개발자 경험 도구의 핵심은 새 UI가 아니라 "이미 있는 접점(PR)에 붙이는 것"이고, 그 뒤의 신뢰성은 오래 걸리는 일을 API에서 떼어 Job으로 넘기고 실패를 Job 단위로 볼 수 있게 만드는 데서 나온다.
