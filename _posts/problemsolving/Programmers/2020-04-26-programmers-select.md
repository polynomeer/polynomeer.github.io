---
title: "programmers. SELECT"
date: 2020-04-26
categories: [ProblemSolving, Programmers]
tags: [SQL, Programmers, SELECT]
---

프로그래머스 SQL 문제를 풀기 시작하면 가장 먼저 만나는 유형이 기본 `SELECT` 문이다. 문법 자체는 단순하지만, 어떤 컬럼을 어떤 기준으로 조회할지 문제 요구사항을 정확히 읽는 연습이 중요하다.

---

## 이 문제 유형에서 먼저 볼 것

- 어떤 테이블을 조회하는가
- 출력해야 할 컬럼이 무엇인가
- 정렬 기준이 있는가
- 조건이 없는 단순 조회인지, 필터가 필요한지

기본 문제에서는 SQL 난이도보다 요구사항 해석이 더 중요하다.

아래 풀이는 SELECT 유형의 첫 문제인 [모든 레코드 조회하기](https://school.programmers.co.kr/learn/courses/30/lessons/59034)를 기준으로 한다. 동물 보호소에 들어온 동물 정보가 담긴 `ANIMAL_INS` 테이블에서 모든 동물의 정보를 `ANIMAL_ID` 순으로 조회하는 문제다. 테이블의 컬럼은 `ANIMAL_ID`, `ANIMAL_TYPE`, `DATETIME`, `INTAKE_CONDITION`, `NAME`, `SEX_UPON_INTAKE` 여섯 개다.

---

## 핵심 포인트

### 모든 컬럼을 그대로 가져올 것인지

문제에서 "모든 정보를 조회"하라고 해도 실제 채점은 컬럼 순서와 출력 형태에 민감할 수 있다. 무심코 `SELECT *`를 쓰기보다 요구된 컬럼 순서를 확인하는 습관이 좋다.

`SELECT *`는 선택 목록에 `*` 하나만 두면 모든 컬럼을 고르는 축약 표현이다([MySQL 8.4, SELECT Statement](https://dev.mysql.com/doc/refman/8.4/en/select.html)). 이때 컬럼 순서는 테이블이 정의된 순서를 따른다. 이 문제는 테이블 정의 순서와 출력 순서가 같아서 `*`로도 같은 결과가 나오지만, 실무 코드에서는 컬럼을 명시하는 편이 낫다. 테이블에 컬럼이 추가되거나 순서가 바뀌어도 쿼리 결과의 모양이 그대로 유지되고, 필요 없는 컬럼까지 읽어 오지 않기 때문이다.

### 정렬 기준을 명시할 것인지

SQL 결과 순서는 기본적으로 보장되지 않는다. 문제에서 `ANIMAL_ID`순 같은 기준이 주어지면 반드시 `ORDER BY`를 써야 한다.

PostgreSQL 문서는 이 점을 분명히 적어 둔다. 정렬을 지정하지 않으면 행은 정해지지 않은 순서로 반환되고, 실제 순서는 스캔과 조인 방식, 디스크에 저장된 순서에 따라 달라지므로 기대해서는 안 된다고 한다([PostgreSQL, Sorting Rows](https://www.postgresql.org/docs/current/queries-order.html)). 작은 테이블에서는 우연히 기본 키 순서로 나오는 경우가 많아서 `ORDER BY` 없이도 정답처럼 보일 수 있지만, 데이터가 늘거나 실행 계획이 바뀌면 순서가 달라질 수 있다.

정렬 방향을 적지 않으면 오름차순(`ASC`)이 기본이다. MySQL 문서도 기본은 오름차순이고 역순이 필요하면 `DESC`를 붙이라고 설명한다. 그래서 `ORDER BY ANIMAL_ID`와 `ORDER BY ANIMAL_ID ASC`는 같다.

---

## 풀이 방향

이 문제의 본질은 복잡한 조인이나 집계가 아니라:

- 필요한 컬럼을 선택하고
- 요구한 정렬 조건을 맞추는 것

이다.

```sql
SELECT ANIMAL_ID, ANIMAL_TYPE, DATETIME, INTAKE_CONDITION, NAME, SEX_UPON_INTAKE
FROM ANIMAL_INS
ORDER BY ANIMAL_ID;
```

쿼리는 작성 순서와 다르게 해석된다. `FROM ANIMAL_INS`로 대상 테이블을 정하고, `SELECT`로 출력할 컬럼을 고르고, 마지막으로 `ORDER BY ANIMAL_ID`가 결과 행을 `ANIMAL_ID` 오름차순으로 정렬한다. `WHERE`가 없으므로 모든 행이 결과에 포함된다.

---

## 정리

가장 기초적인 `SELECT` 문제라도 다음 감각을 익히는 데 의미가 있다.

- 출력 컬럼을 명시적으로 적는 습관
- 정렬 기준을 요구사항에서 놓치지 않는 습관
- SQL 결과 순서는 명시하지 않으면 보장되지 않는다는 점

기본 조회 문제는 쉬워 보여도, 이후의 복잡한 SQL 문제를 풀 때 필요한 읽기 습관을 만드는 시작점이 된다.

## 참고

- [모든 레코드 조회하기](https://school.programmers.co.kr/learn/courses/30/lessons/59034) — 프로그래머스
- [SELECT Statement](https://dev.mysql.com/doc/refman/8.4/en/select.html) — MySQL 8.4 Reference Manual
- [Sorting Rows (ORDER BY)](https://www.postgresql.org/docs/current/queries-order.html) — PostgreSQL Documentation
