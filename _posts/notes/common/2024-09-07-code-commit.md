---
title: AWS Code Commit
date: 2024-09-05
categories: [Notes, Common]
tags: [AWS, AWS CodeCommit, Git]
---

# AWS Code Commit

AWS CodeCommit은 AWS가 운영하는 비공개 Git 저장소 서비스다. 공식 문서는 CodeCommit을 비공개 Git 저장소를 호스팅하는 관리형 소스 제어 서비스로 소개한다([What is AWS CodeCommit?](https://docs.aws.amazon.com/codecommit/latest/userguide/welcome.html)). 표준 Git 기능을 지원하므로 `git clone`, `git push` 같은 평소 명령을 그대로 쓰고, 저장소 접근 권한은 IAM으로 관리한다는 점이 GitHub 같은 일반 Git 호스팅과 다르다.

> 덧붙임: AWS는 2024년 7월 CodeCommit의 비중을 줄이겠다고 발표했다가, 2025년 11월 24일 CodeCommit이 정식 서비스(General Availability)로 돌아온다고 다시 발표했다([AWS DevOps Blog](https://aws.amazon.com/blogs/devops/aws-codecommit-returns-to-general-availability/)). 새로 도입을 검토한다면 현재 서비스 상태를 먼저 확인하는 편이 안전하다.

---

## User guide
- https://docs.aws.amazon.com/ko_kr/codecommit/latest/userguide/getting-started.html#getting-started-create-commit
- https://ap-northeast-2.console.aws.amazon.com/codesuite/codedeploy/start?region=ap-northeast-2

첫 번째 링크는 커밋을 만들고 푸시하는 시작 가이드이고, 두 번째는 서울 리전(`ap-northeast-2`)의 CodeSuite 콘솔에서 CodeDeploy 시작 화면으로 가는 링크다.

---

## 기본 흐름

공식 문서가 설명하는 사용 흐름은 다음과 같다.

1. AWS CLI나 CodeCommit 콘솔에서 저장소를 만든다.
2. 개발 PC에서 `git clone`으로 로컬 저장소를 만든다.
3. 로컬에서 수정하고 `git add`, `git commit` 후 `git push`로 CodeCommit에 보낸다.
4. 다른 사람의 변경은 `git pull`로 받는다.

저장소는 리전 단위로 존재한다. 콘솔에서 저장소가 보이지 않으면 리전 선택부터 확인한다.

---

## 연결 방식 세 가지

콘솔의 Clone URL 메뉴는 연결 방식에 따라 세 종류의 URL을 준다([Setup for HTTPS users using Git credentials](https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-gc.html)).

| 방식 | 인증 수단 | 언제 쓰나 |
| --- | --- | --- |
| HTTPS | IAM에서 발급한 Git 자격 증명(사용자 이름과 비밀번호) 또는 AWS CLI의 credential helper | 가장 간단하고, 정적 사용자 이름과 비밀번호를 받는 IDE나 도구와 호환된다 |
| HTTPS (GRC) | `git-remote-codecommit`과 AWS 자격 증명 | AWS CLI 프로필이나 임시 자격 증명을 그대로 쓰고 싶을 때 |
| SSH | IAM 사용자에 등록한 SSH 공개 키 | SSH 키 기반 작업에 익숙할 때 |

### CodeCommit 구성방법

- https://docs.aws.amazon.com/ko_kr/codecommit/latest/userguide/setting-up-gc.html

위 문서는 HTTPS와 Git 자격 증명을 쓰는 방법이다. 순서는 다음과 같다.

1. IAM 사용자를 만들거나 기존 사용자를 고른다.
2. 그 사용자에게 `AWSCodeCommitPowerUser` 같은 CodeCommit용 관리형 정책을 붙인다.
3. Git을 설치한다. 문서 기준으로 CodeCommit은 Git 1.7.9 이상을 지원한다.
4. IAM 콘솔의 사용자 상세 화면에서 Security credentials 탭으로 가서 AWS CodeCommit용 자격 증명을 생성한다.
5. 생성된 사용자 이름과 비밀번호를 저장하고, HTTPS URL로 클론한다.

```bash
git clone https://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/MyDemoRepo my-demo-repo
```

문서 예시는 미국 동부(오하이오) 리전 주소를 쓰지만, 형식은 `git-codecommit.<리전>.amazonaws.com/v1/repos/<저장소 이름>`으로 같다. 몇 가지 주의할 점이 있다.

- Git 자격 증명의 사용자 이름과 비밀번호는 직접 정할 수 없고 IAM이 생성한다.
- 비밀번호는 생성 직후 한 번만 볼 수 있다. 저장하지 못했다면 재설정해야 한다.
- 이전에 AWS CLI credential helper를 설정했다면 `.gitconfig`에서 그 설정을 지워야 Git 자격 증명이 쓰인다. macOS에서는 키체인에 남은 자격 증명도 지워야 할 수 있다.
- CodeCommit은 AWS KMS를 사용하므로, 사용자에게 KMS 동작을 명시적으로 거부하는 정책이 붙어 있으면 안 된다.

### 참고사항

Windows에서 AWS CodeCommit 리포지토리에 대한 SSH 연결을 위한 설정 단계

- https://docs.aws.amazon.com/ko_kr/codecommit/latest/userguide/setting-up-ssh-windows.html

SSH 방식은 IAM 사용자에 공개 키를 올리고, 그때 발급되는 SSH Key ID를 SSH 접속 사용자 이름으로 쓰는 구조다. Windows 문서의 순서를 요약하면 다음과 같다.

1. Git Bash 같은 Bash 에뮬레이터에서 `ssh-keygen`으로 키 쌍을 만든다. 예를 들어 `~/.ssh/codecommit_rsa`와 `~/.ssh/codecommit_rsa.pub`이 생긴다.
2. IAM 콘솔의 Security credentials 탭에서 Upload SSH public key를 눌러 `.pub` 파일 내용을 붙여 넣는다.
3. 등록 후 표시되는 SSH Key ID를 복사한다.
4. `~/.ssh/config`에 아래 내용을 추가한다.

```text
Host git-codecommit.*.amazonaws.com
  User APKAEIBAERJR2EXAMPLE
  IdentityFile ~/.ssh/codecommit_rsa
```

`User`에는 3단계의 SSH Key ID를, `IdentityFile`에는 비밀 키 경로를 넣는다. 이 파일 이름은 확장자 없이 `config`여야 한다. 메모장으로 저장하다가 `config.txt`가 되면 연결이 실패한다고 문서가 따로 경고한다.

5. 연결을 확인한다.

```bash
ssh git-codecommit.ap-northeast-2.amazonaws.com
```

처음 접속하면 서버 지문을 확인하라는 메시지가 나온다. CodeCommit 서버 지문은 리전마다 다르므로 문서의 리전별 지문 표와 비교한다. 문제가 있으면 `ssh -v`로 자세한 로그를 본다. 연결되면 SSH URL로 클론한다.

```bash
git clone ssh://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/MyDemoRepo my-demo-repo
```

---

## 저장소 이벤트를 다른 시스템에 알리기

CodeCommit 저장소에는 트리거를 걸 수 있다. 푸시 같은 이벤트가 생기면 Amazon SNS로 알림을 보내거나 AWS Lambda 함수를 호출하는 방식이고, 저장소 하나에 트리거를 최대 10개까지 만들 수 있다([Manage triggers](https://docs.aws.amazon.com/codecommit/latest/userguide/how-to-notify.html)). 이 트리거로 협업 메신저에 푸시 알림을 보내는 방법은 [JANDI와 AWS CodeCommit 연동](/posts/jandi/)에 정리했다.

## 참고

- [What is AWS CodeCommit?](https://docs.aws.amazon.com/codecommit/latest/userguide/welcome.html) — AWS CodeCommit User Guide
- [Setup for HTTPS users using Git credentials](https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-gc.html) — AWS CodeCommit User Guide
- [Setup steps for SSH connections on Windows](https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-ssh-windows.html) — AWS CodeCommit User Guide
- [Manage triggers for an AWS CodeCommit repository](https://docs.aws.amazon.com/codecommit/latest/userguide/how-to-notify.html) — AWS CodeCommit User Guide
- [AWS CodeCommit Returns to General Availability](https://aws.amazon.com/blogs/devops/aws-codecommit-returns-to-general-availability/) — AWS DevOps Blog
