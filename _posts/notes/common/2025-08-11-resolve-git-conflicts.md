---
title: Resolve Git Conflicts
date: 2025-08-11
categories: [Common, Git]
tags: [Git, Git Conflict]
---

## Resolve Git Conflicts

main 브랜치에서 feature/1 브랜치를 생성하고, feature/1에서 feature/2 브랜치를 생성해서 작업했다. 그런데 feature/1 브랜치에서 PR의 코드리뷰에 대한 피드백으로 수정이 있었다. 이때 기존에 feature/2 -> main으로의 PR에 충돌이 감지되었다.

상황을 요약해보면, `main` ← `feature/1`는 이미 머지됐고, 이제 `feature/2` → `main` PR에서 충돌이 난 상태이다. 일반적으로 PR을 머지하기 전에 `feature-2`를 최신 `main`으로 업데이트 해서 충돌을 미리 해소하는 게 최선이다. 방법은 두 가지인데, rebase와 merge이다.

### 방법1) 깔끔한 히스토리 원하면: rebase

히스토리가 직선이라 보기 좋고, 불필요한 merge commit이 안 생긴다.

```bash
git fetch origin
git checkout feature/2
git rebase origin/main
# 충돌 파일 수정
git add <파일들>
git rebase --continue
# 필요시 중단: git rebase --abort
git push -f origin feature/2   # rebase 뒤엔 force-push 필요
```

- 장점은 커밋 로그가 깔끔하며, 히스토리와 결과만 보면 깔끔하므로 리뷰하기 쉽다.
- 단점은 강제 푸시가 필요하고, 같은 브랜치를 여러 명이 작업하면 주의가 필요하다.

### 방법2) 히스토리 보존/강제 푸시 피하고 싶다면: main을 merge

PR 브랜치에서 `main`을 끌어와 한 번에 충돌을 해결한다.

```bash
git fetch origin
git checkout feature-2
git merge --no-ff origin/main
# 충돌 해결 후
git commit
git push origin feature-2
```

- 장점은 force-push가 불필요하며, 안전한 선택이다.
- 단점은 merge commit이 생겨 로그가 복잡해질 수 있다.

따라서 팀이 rebase 기반 플로우(linear history)를 선호하면 rebase를, 여러 명이 같은 브랜치에서 작업하거나 force-push를 피해야 하면 merge 통해 해결하는게 좋다.

---

## 디렉터리 경로 이동을 반영하지 못한 경우

충돌을 해결하고 rebase 커밋도 생겼지만 여전히 문제가 있었다. infra라는 모듈에서 하위 모듈인 infra/timescaledb, infra/redis, infra/external이 있었는데, infra 모듈의 하위 패키지로 귀속되었다. 이 변경사항을 포함해서 적용되지 않은 내용들이 다수 있었다. 

rebase는 `feature/2`의 커밋들을 그대로 최신 `main` 위에서 다시 재생(replay) 하는 것이라서 문제가 발생한다. `feature/2`는 통합 이전 구조(독립 하위 모듈들)를 건드리는 커밋들로 이루어져 있다. 그래서 rebase 도중/이후에 충돌을 내 쪽(yours) 위주로 풀거나, 파일 이동 매핑 없이 해결하면, 삭제/이동된 옛 경로(`infra-timescaledb`, `infra-redis`, `infra-external`)를 커밋들이 다시 만들어 버린다. Git은 디렉터리 수준 이동을 추적하지 않기 때문에(단일 파일 rename은 감지해도 대규모 폴더 통합은 자동 매핑이 약함), 결과적으로 새 구조(`infra/packages/{timescaledb,redis,external}`)로의 반영이 누락된 것이다.

### 방법1) rebase를 “경로 매핑”하면서 다시 수행(권장)

의도: `feature/14` 커밋을 재생할 때, **옛 경로 → 새 패키지 경로**로 바꿔 태우기.

1. 브랜치 준비

```bash
git fetch origin
git switch feature/14-price-inquiry
git rebase -i origin/main
```

2. 인터랙티브 목록에서 **옛 경로를 건드리는 커밋들에 `edit`** 표시 후 진행.
3. 각 `edit` 지점마다

- 충돌나면 **옛 디렉터리는 과감히 삭제**하고(`git rm -r infra-timescaledb infra-redis infra-external`),
   그 커밋의 변경 내용을 **새 경로로 반영**한다.

- 파일 이동/이름 변경은 `git mv`로 기록을 남겨준다.

  ```bash
  # 예시 매핑
  # infra-timescaledb/*  → infra/packages/timescaledb/*
  # infra-redis/*        → infra/packages/redis/*
  # infra-external/*     → infra/packages/external/*
  
  git mv infra-timescaledb/path/foo.sql infra/packages/timescaledb/path/foo.sql
  git mv infra-redis/path/bar.conf       infra/packages/redis/path/bar.conf
  git mv infra-external/path/baz.yaml    infra/packages/external/path/baz.yaml
  ```

- 한 커밋의 코드 수정분이 **옛 경로 파일에만 적용**돼 있다면, 동일 변경을 **새 경로 파일**에 직접 반영하고, 옛 파일은 삭제한다.

- 변경 정리 후:

  ```bash
  git add -A
  git rebase --continue
  ```

4. 모든 커밋 처리 뒤 푸시

```bash
git push -f origin feature/2
```

여기서 **옛 경로를 살리는 쪽으로 충돌을 “간단히” 풀지 말고**, 매 커밋에서 **새 구조로 포팅**하는 게 핵심이다.

### 방법2) 새로 브랜치를 파서 cherry-pick로 “선별 이식”

rebase가 부담이면, 깨끗한 새 브랜치에서 필요한 커밋만 골라 새 경로로 이식하는 방법도 있다.

```bash
git fetch origin
git switch -c feature/14-rework origin/main

# feature/2에서 필요한 커밋 해시만 하나씩 체리픽
git cherry-pick <commitA> <commitB> ...
# 충돌 시마다 옛→새 경로로 이동/수정 (위와 동일 원칙)
git push -u origin feature/14-rework
```

- 장점: 히스토리를 선별적으로 정리하기 쉽다.
- 단점: 커밋이 많으면 손이 더 가는 경우가 있다.

### 방법3) 지금 상태 유지 + “정리 커밋” 1개로 수습(최소 변경)

이미 rebase를 끝냈고 시간이 급하면,

1. 현재 `feature/14`에서 **옛 디렉터리 전부 삭제**하고
2. 필요한 파일/변경을 **새 패키지 경로로 이동/반영**한 **정리 커밋**을 한 번 더 올린다.

```bash
git rm -r infra-timescaledb infra-redis infra-external
# 필요한 내용은 infra/packages/* 쪽으로 반영/복사
git add -A
git commit -m "Align price inquiry with infra package consolidation"
git push
```

히스토리는 덜 예쁘지만, 기능적으로는 맞춰진다.

---

## 이미 만들어진 rebase commit에 새로운 변경사항 밀어넣기

rebase 커밋들이 feature/2의 커밋 위에 여러개 생성되었다. main 위로 rebase를 했더니 충돌을 해결하면서 생긴 커밋들이 다수 있었다. 이때 이 커밋들을 깔끔하게 squash로 합쳤다. 그런데 일부 코드에서 문제가 있었고, 충돌 해결과정에서의 실수도 있었다. 결국 추가 수정을 한 다음, 이 내용을 feature/2의 commit 뒤가 아닌, 앞에 있던 squash된 커밋에 포함시키고 싶어졌다.

깃에서 기존 커밋에 새로운 변경사항을 추가로 포함하는 경우는 크게 두 가지이다.

### case1) 스쿼시 커밋이 **맨 마지막(HEAD)** 인 경우

```bash
# 수정
<파일 편집>

# 스테이징
git add -A   # 또는 원하는 파일만 선택

# 기존 스쿼시 커밋에 덮어쓰기(메시지 유지)
git commit --amend --no-edit
# (메시지도 바꾸고 싶으면) git commit --amend -m "새 메시지"

# PR 갱신 (히스토리 재작성이라 force-push 필요)
git push -f origin feature/14-price-inquiry
```

꼭 스쿼시 커밋이 아니러다로 커밋이 맨 마지막인 경우, 그냥 amend로 변경하면 된다.

그런데 이 경우에는 intellij에서 그냥 해당 커밋에서 우클릭 후, undo commit으로 돌려놓고 다 합쳐서 다시 커밋을 해도 된다. 문제는 다음 두 번째 케이스이다.

### case2) 스쿼시 커밋이 **HEAD가 아닌 중간**에 있는 경우

방법1) `--fixup` + autosquash

```bash
# 스쿼시 커밋 해시를 S라 하자
git commit --fixup=S           # 수정분 임시 커밋 생성
git rebase -i --autosquash origin/main
# 자동으로 fixup 커밋이 S에 합쳐짐 → 충돌 나면 해결하고
git rebase --continue
git push -f origin feature/2
```

intellij에서는 `git commit --fixup=S`하고 수정분에 대한 커밋을 생성한 다음, `git rebase -i --autosquash origin/main`을 입력하면 합쳐진다. 마지막으로 `git rebase --continue`를 입력하거나 intellij의 경우 상단의 재생 버튼 같은 모양을 클릭하면, 완료된다. 이때 origin과 불일치 해서 또 충돌이 발생하는데, force push가 필요하다.

방법 2: 인터랙티브 rebase로 해당 커밋을 직접 수정

```bash
git rebase -i origin/main
# 에디터에서 스쿼시 커밋(S)을 'edit'로 변경 후 저장

# 수정/스테이징
<파일 편집>
git add -A

# 해당 커밋에 바로 합치기
git commit --amend --no-edit
git rebase --continue

git push -f origin feature/2
```

이 방법도 흔한 방법이지만, IDE의 도움을 받으면서 진행하기에는 위의 방법이 더 간단하고 빠르다.