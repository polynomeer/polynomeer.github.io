---
title: "네이버 D2 「JuiceFS: 오브젝트 스토리지를 활용하는 HDFS 호환 분산 파일 시스템」 리뷰 — HDFS도 오브젝트 스토리지도 아닌 세 번째 선택지가 필요한 이유"
date: 2025-11-15
categories: [TechBlog, Naver]
tags: [Tech Blog Review, Naver, Hadoop, HDFS, Object Storage, JuiceFS, Kubernetes, Storage]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
source_url: https://d2.naver.com/helloworld/5215257
---

원문: [JuiceFS: 오브젝트 스토리지를 활용하는 HDFS 호환 분산 파일 시스템](https://d2.naver.com/helloworld/5215257) — NAVER D2, 남경완, 2025-09-10

## 한 줄 요약

Hadoop의 저장소 HDFS는 빠르지만 비싸고 파일 수에 한계가 있으며 Kubernetes에서 쓰기 불편하다. 대안인 오브젝트 스토리지(S3류)는 싸고 무한히 늘어나지만 "파일 시스템이 아니라서" 디렉터리·rename·권한이 없고, 기존 Hadoop 프로그램을 그대로 돌리면 느려지거나 깨진다. JuiceFS는 데이터는 오브젝트 스토리지에, 파일 구조(메타데이터)는 DB에 두어 **오브젝트 스토리지 위에 진짜 파일 시스템을 얹은 것**이다. 그래서 HDFS API·POSIX·Kubernetes 볼륨을 모두 지원하고, 기존 Hadoop 코드는 경로만 `jfs://`로 바꾸면 된다.

## 배경: HDFS의 다섯 가지 한계

HDFS는 데이터가 있는 장비에서 계산을 돌리는 "데이터 로컬리티" 덕에 빠르다. 그런데 AI 시대에 문제가 생겼다.

1. **비용.** 계산과 저장이 한 장비에 묶여 있어 저장 공간만 늘리려 해도 장비를 통째로 추가해야 한다. 게다가 3중 복제가 기본이다.
2. **파일 개수.** 모든 파일의 메타데이터가 네임노드 한 대의 메모리에 들어간다. 1천만 파일에 약 3GB. AI 학습 데이터는 수천만 개의 작은 이미지·음성 파일이라 바로 부딪힌다.
3. **재해 대응.** 보통 단일 데이터센터에 있어 다른 센터로 복제하려면 별도 도구가 필요하다.
4. **운영.** Hadoop 클러스터 운영은 전문 인력이 필요하다.
5. **Kubernetes.** HDFS는 POSIX API도 CSI 드라이버도 없어 Kubernetes의 PersistentVolume으로 못 쓴다. 컨테이너에 Hadoop 패키지·설정·인증을 넣고 HDFS API로 코드를 짜야 한다.

## 오브젝트 스토리지가 답이 아닌 이유

클라우드에서는 계산과 저장을 분리해 S3 같은 오브젝트 스토리지에 데이터를 둔다. 싸고, 사실상 무제한이고, 리전 간 복제도 된다. Hadoop도 S3A라는 어댑터로 S3를 HDFS처럼 쓸 수 있다.

하지만 원문이 강조하듯 **오브젝트 스토리지는 파일 시스템이 아니다**. 이 한 문장에서 나머지 문제가 다 나온다.

- **디렉터리가 없다.** 모든 오브젝트가 평평하게 놓여 있고, 디렉터리 목록은 prefix 검색으로 흉내 낸다. 느리다.
- **rename이 없다.** 파일 시스템의 rename은 O(1) 원자 연산이지만, 오브젝트 스토리지는 복사 후 삭제다. 이것이 치명적인 이유는 MapReduce·Spark의 "커밋" 방식 때문이다. 기본 커미터(FileOutputFormatCommitter)는 임시 디렉터리에 쓰고 rename으로 확정하는데, rename이 복사가 되면 결과 확정이 엄청나게 느려진다. 그래서 오브젝트 스토리지용 Magic Committer가 따로 있고, 그것도 Spark의 동적 파티션 덮어쓰기 같은 경우는 지원하지 못한다.
- **권한이 없다.** POSIX의 owner/group/others가 없어 파일은 666, 디렉터리는 777로 취급된다.
- **느리다.** 항상 네트워크를 탄다.
- **Kubernetes에서도 여전히 불편하다.** s3fs·Mountpoint 같은 POSIX 흉내 도구가 있지만 근본 차이 때문에 완전 호환이 안 되고 느리다.
- **S3 호환이 S3는 아니다.** 온프레미스 S3 호환 스토리지가 애플리케이션이 쓰는 API를 다 지원하는지 따로 확인해야 한다.

결론은 "기존 Hadoop 코드를 S3A로 바꾸기만 하면 된다"가 아니다. rename을 피하고 listing을 줄이도록 코드를 고쳐야 하고, 커미터를 바꿔야 하고, 버전을 좇아야 한다.

## JuiceFS: 메타데이터는 DB, 데이터는 오브젝트

JuiceFS는 두 부분으로 된 분산 파일 시스템이다. 파일 이름·디렉터리 구조·권한 같은 메타데이터는 데이터베이스(메타데이터 엔진)에, 파일 내용은 오브젝트 스토리지에 저장한다. 파일 시스템의 "느낌"을 주는 부분은 DB가 담당하니 디렉터리 listing, rename, 권한이 모두 정상 속도로 된다. HDFS와 닮은 분산 파일 시스템이라서 HDFS API, POSIX API, Kubernetes CSI 드라이버를 모두 지원할 수 있다는 것이 핵심이다.

수정이 어려운 오브젝트 스토리지에 "파일 수정"을 구현하려고 세 단계 개념을 쓴다.

- **chunk(64MB)**: 파일을 64MB로 잘라 오프셋 기반 병렬 처리
- **slice**: chunk 안의 수정 단위. 쓸 때마다 새 slice를 만들고 최신 것이 우선
- **block(기본 4MB)**: 오브젝트 스토리지에 실제 올라가는 최소 단위. 병렬 업로드

그리고 여러 단계의 캐시로 원격 읽기의 느림을 메운다.

## Hadoop에 붙이기

설정은 `core-site.xml`에 `fs.jfs.impl`, `fs.AbstractFileSystem.jfs.impl`, `juicefs.meta` 세 가지가 필수다. 네이버는 공용 Hadoop이라 캐시를 YARN 컨테이너 임시 경로에 두어 작업이 끝나면 캐시도 사라지게 했고, 최대 100GiB로 제한했다.

SDK JAR 배포가 실무적인 포인트다. 모든 노드에 미리 설치하는 것이 쉽지만, 공용 클러스터에서는 모두가 한 버전만 써야 하는 제약이 생긴다. 그래서 애플리케이션이 직접 JAR을 가져가는 방식을 택했다. HDFS CLI는 `HADOOP_CLASSPATH`, MapReduce는 분산 캐시(`mapreduce.application.framework.path`), Spark는 `spark.jars`로 각각 한다.

## 네이버가 직접 고친 다섯 가지

공용 Hadoop과 Kubernetes AI 플랫폼이 데이터를 공유하려고 JuiceFS 자체에 기여한 부분이다. 대부분 "누가 파일의 주인인가" 문제다.

- **all-squash 마운트**: Hadoop은 LDAP 계정의 UID/GID로 파일을 만들지만 Kubernetes 컨테이너는 임의의 UID로 돈다. 마운트할 때 지정한 UID:GID로 접근하게 하는 옵션을 추가했다.
- **juicefs.users/groups 직접 지정**: 기존에는 사용자명:UID 파일을 만들어 경로를 지정해야 했다. 설정값으로 바로 쓰게 했다.
- **subdir 지원**: Kubernetes에서 PVC마다 하위 디렉터리가 생기는데 Hadoop SDK에는 특정 하위 경로만 보이게 하는 옵션이 없었다. `juicefs.subdir`을 추가했다.
- **hdfs 명령으로 쿼터 확인**: PVC의 요청 용량이 디렉터리 쿼터가 되는데 `hdfs dfs -count -q`로 볼 수 없었다. 되게 했다.
- **Prometheus remote_write**: Pushgateway는 정리가 필요하고 Graphite는 형식이 달라, remote_write로 vmagent나 Prometheus에 직접 보내게 했다.

## 숫자

| 테스트 | 조건 | 결과 |
| --- | --- | --- |
| DFSIO 순차 쓰기 | map 10개, 100GB, block 16MB | JuiceFS가 HDFS의 1.7배 (작은 블록 병렬 업로드) |
| DFSIO 순차 읽기 | 위와 같음 | JuiceFS가 HDFS의 0.75배 (캐시되면 HDFS 수준 예상) |
| TPC-DS (Spark SQL) | 100GB 테이블 | JuiceFS 응답 시간이 HDFS의 1.8배, 캐시된 경우 HDFS와 유사 |

쓰기는 오히려 빠르고, 읽기는 로컬리티 차이만큼 느리며, 캐시가 그 차이를 메운다는 그림이다.

## 언제 무엇을 쓰나

원문은 JuiceFS를 만능으로 팔지 않는다. 로컬리티가 필요한 빠른 처리는 HDFS, 접근 빈도가 낮거나 Iceberg처럼 오브젝트 스토리지에 최적화된 포맷은 오브젝트 스토리지 직접 사용. JuiceFS가 나은 경우는 넷이다.

- Kubernetes와 Hadoop 사이에 데이터를 공유해야 할 때
- 기존 Hadoop 애플리케이션을 안 고치고 HDFS와 병행하고 싶을 때
- 같은 데이터를 반복해 읽어 캐시 효과가 기대될 때
- S3 호환 스토리지가 애플리케이션의 S3 API를 잘 지원하지 못할 때

## 읽고 남는 질문

- 메타데이터 엔진(DB)이 새로운 단일 장애점이자 병목이 된다. HDFS 네임노드 메모리 한계를 DB로 옮긴 셈인데, 네이버가 어떤 DB를 어느 규모로 쓰는지, 파일 수천만 개에서 메타데이터 성능이 어땠는지가 없다. 전편(AI 플랫폼 도입기)에 있을 수 있다.
- 공용 Hadoop에서 캐시를 컨테이너 임시 경로에 두면 작업마다 캐시가 사라진다. TPC-DS의 "캐시된 경우 HDFS 수준"은 같은 작업 안에서 반복 읽기가 있을 때만 성립하는 것 아닌지.
- 쓰기가 HDFS보다 1.7배 빠른 것은 3중 복제를 안 하기 때문이기도 할 텐데, 오브젝트 스토리지 쪽의 내구성(복제·erasure coding)이 어떻게 설정됐는지에 따라 비교의 공정성이 달라진다.

## 한 줄로 가져가기

오브젝트 스토리지는 파일 시스템이 아니므로, 파일 시스템처럼 쓰려면 "파일 시스템인 척하는 층"이 필요하고, 그 층의 핵심은 메타데이터를 어디에 두느냐다.
