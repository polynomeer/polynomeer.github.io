---
title: "키 생성 병목을 추적해 구조를 바꾼 기록: Part 1 - INSERT가 느린 줄 알았다"
date: 2026-01-03
categories: [Notes, Common]
tags: [Sequence, Performance, Database, Refactoring]
series: sequence-bottleneck
series_title: 키 생성 병목을 추적해 구조를 바꾼 기록
series_order: 1
---

# Part 1. INSERT가 느린 줄 알았다 – 2분짜리 배치의 착각

> 2분 걸리던 배치에서 대부분의 시간은 INSERT 구간에 찍혀 있었다.
> 그래서 INSERT를 튜닝했지만, 실행 시간은 약 1분 30초까지만 줄었다.
> 이 글은 그 차이를 보고 병목의 위치를 다시 찾기 시작한 과정이다.

---

## 1. 문제 상황: “실패하지 않지만, 너무 느린 배치”

문제가 된 배치는 구조적으로 단순했다.

* 입력: 계약 정보
* 처리: 계약별 기본 단가 계산
* 출력: 단가 테이블에 다건 INSERT

실행 로그는 대략 이런 흐름이었다.

```text
[INFO] select price rate candidates finished (≈100ms)
[INFO] start inserting price rates
... (약 1~2분)
[INFO] insert price rates finished
```

표면적으로 보면 명확하다.

* SELECT는 빠르다
* INSERT 구간에서 대부분의 시간이 소요된다

이 지점에서 팀 내 공감대는 자연스럽게 형성됐다.

> “INSERT 쪽이 병목이네.”

---

## 2. INSERT 병목이라는 가설이 그럴듯했던 이유

이 판단은 단순한 추측이 아니었다.
기술적으로도 꽤 합리적이었다.

* INSERT는 쓰기 작업
* 인덱스가 많을수록 비용 증가
* 다건 INSERT는 네트워크 왕복, SQL 파싱 비용 큼
* MyBatis를 쓰고 있었으므로 batch 설정이 제대로 안 됐을 가능성도 큼

그래서 첫 번째 접근은 전형적인 INSERT 튜닝이었다.

* ExecutorType.BATCH 적용
* multi-row INSERT로 변경
* 로그 출력 최소화

`ExecutorType.BATCH`는 MyBatis가 갱신 문장을 모아 한 번에 보내는 실행 모드다. [MyBatis 문서](https://mybatis.org/mybatis-3/java-api.html)는 이 실행기가 "will batch all update statements"(모든 갱신 문장을 묶어 보낸다)고 설명한다. multi-row INSERT는 아래처럼 `VALUES` 뒤에 여러 행을 한 문장으로 묶는 방식이다.

```sql
INSERT INTO price_rate (...)
VALUES
  (...),
  (...),
  (...);
```

이건 “틀린 선택”은 아니었다.

---

## 3. 그런데 성능 개선이 기대만큼 나오지 않았다

튜닝 후 결과는 이랬다.

* 실행 시간:
  **2분 → 약 1분 30초**

분명 빨라지긴 했다.
하지만 체감할 정도는 아니었다.

이 지점에서 첫 번째 의문이 생겼다.

> “INSERT가 진짜 병목이라면,
> 이 정도 변경으로 더 크게 줄어야 하지 않나?”

특히 이상했던 건 다음 두 가지였다.

1. 데이터 건수가 늘어나면 실행 시간이 **선형적으로 증가**
2. INSERT SQL 자체는 복잡하지 않음

   * 트리거 없음
   * FK 없음
   * 서브쿼리 없음

INSERT가 느릴 이유치고는 뭔가 부족했다.
SQL 실행 비용을 줄였는데도 시간이 크게 줄지 않았다면, INSERT SQL 자체가 유일한 원인이라고 보기는 어려웠다.

---

## 4. 로그를 다시 보기 시작했다

그래서 믿고 있던 가정부터 다시 확인했다.
로그를 트랜잭션 단위로 다시 쪼개서 봤다.

```text
[INFO] begin transaction
[INFO] select candidates
[INFO] select finished
[INFO] insert start
... (지연)
[INFO] insert finished
[INFO] commit
```

이 로그로 알 수 있는 것은 `insert start`와 `insert finished` 사이가 길다는 사실뿐이다.
INSERT가 느리게 보인다고 해서 INSERT SQL이 느리다는 뜻은 아니다.

DB 입장에서 INSERT는:

* 실행 중일 수도 있고
* 실행을 기다리고 있을 수도 있다

  * [락](/posts/lock-types-and-waits/)
  * 트랜잭션
  * 리소스 경합

그런데 애플리케이션 로그만으로는 이 둘을 구분할 수 없었다.

---

## 5. 트랜잭션 경계를 의식하기 시작하다

그래서 질문을 바꿨다.

* 이전 질문: “INSERT가 느린가?”
* 바꾼 질문: “INSERT 시점에 이미 뭔가를 기다리고 있나?”

두 번째 질문에 답하려면 INSERT 문장 하나가 아니라 그 앞의 범위를 봐야 했다.

* INSERT 직전까지의 모든 작업
* 같은 트랜잭션 안에서 수행되는 로직

그리고 다시 SELECT 쿼리를 들여다봤다.

---

## 6. SELECT 안에서 발견한, 너무 익숙했던 한 줄

그 쿼리는 대략 이런 형태였다.

```sql
SELECT
  column_a,
  column_b,
  get_next_sequence_value(...)
FROM ...
```

이 함수는 단가 번호를 생성하는 역할이었다.

오래전부터 있던 코드였고,
“SELECT에서 번호 하나 가져오는 정도”라고 생각해왔다.

하지만 이제는 질문이 달라졌다.

> “이 함수는 정말 읽기 전용일까?”
> “이 함수가 DB에서 어떤 작업을 하는지,
> 정확히 알고 있는가?”

---

## 7. 아직은 가설일 뿐이었다

이 시점에서 사실로 확인된 건 많지 않았다.

* INSERT는 실제로 오래 걸린다
* bulk insert만으로는 해결되지 않는다
* SELECT 안에 시퀀스 관련 함수가 있다

아직은 추측의 단계였다.

다만 의심하는 범위는 바뀌었다.
문제의 범위가 **“INSERT SQL”에서 “트랜잭션 전체”로** 넓어졌다.

---

## 8. 다음 단계로 넘어가야 할 이유

INSERT 튜닝으로 30초가 줄었으니 INSERT도 병목의 일부이긴 했다.
하지만 남은 1분 30초를 INSERT만으로는 설명할 수 없었다.
INSERT는 여전히 의심 대상이었지만, 더 이상 유일한 후보가 아니었다.

> “혹시 이 배치는,
> INSERT가 시작되기 전부터
> 이미 느려질 준비를 하고 있었던 건 아닐까?”

이 질문에 답하려면,
이제 그 시퀀스 함수의 내부를 열어볼 차례였다.

---

## 다음 편 예고

### Part 2. SELECT 안에서 UPDATE가 일어나고 있었다

* 시퀀스 함수의 실제 구현
* 왜 SELECT인데 락이 걸렸는지
* INSERT가 느린 ‘척’ 했던 진짜 이유

[Part 2](/posts/architectural-decisions/)에서 이어진다.

---

## 참고

* [MyBatis 3 Java API - SqlSession, ExecutorType](https://mybatis.org/mybatis-3/java-api.html) — `SIMPLE`, `REUSE`, `BATCH` 실행기 설명

---
