---
title: "[3주차] 속도를 지배하는 DB 인덱스"
date: 2025-05-21
categories: [Lecture, 6주 완성! 백엔드 이력서 차별화 전략 4가지]
tags: [Database, Index]
---

## 03. 인덱스란?

[인덱스](/posts/db-index/)는 책갈피를 끼워 두고 필요할 때 바로 해당 페이지를 펴는 것과 같다. DB에서 자주 조회하는 필드 값의 위치를 따로 저장해 두므로 데이터를 빠르게 찾을 수 있다. 대신 데이터가 추가될 때마다 책갈피도 새로 꽂아야 한다(인덱스 갱신). 그래서 조회는 빨라지지만 쓰기는 느려질 수 있다.

### 인덱스의 적용 원리

서점에서 사람들은 주로 카테고리(IT, 교육, 참고서, 요리 등)를 기준으로 책을 찾는다. 그래서 책 테이블에 책을 등록할 때, 많이 찾을 것 같은 속성을 인덱스에 따로 다시 저장해 둔다. 카테고리로 정렬된 인덱스가 있으면 모든 책을 하나씩 보며 원하는 카테고리인지 확인할 필요가 없다. 찾아야 하는 범위를 인덱스에서 바로 알 수 있기 때문이다.

book이라는 테이블에 id, name, category, price, is_adult, published_at 컬럼이 있는 경우를 가정해보자.

| id   | name                     | category   | price | is_adult | published_at        |
| ---- | ------------------------ | ---------- | ----- | -------- | ------------------- |
| 1    | The Art of Computer      | Technology | 35000 | false    | 2015-03-10 00:00:00 |
| 2    | Midnight Secrets         | Romance    | 12000 | true     | 2022-11-01 00:00:00 |
| 3    | Data Structures in Depth | Education  | 28000 | false    | 2018-07-22 00:00:00 |
| 4    | Blood and Betrayal       | Thriller   | 15000 | true     | 2021-05-15 00:00:00 |
| 5    | Introduction to AI       | Technology | 40000 | false    | 2020-10-01 00:00:00 |
| 6    | Love in the Time of Code | Romance    | 18000 | false    | 2023-02-14 00:00:00 |
| 7    | Advanced Quantum Physics | Science    | 50000 | false    | 2019-01-30 00:00:00 |
| 8    | Forbidden Desires        | Romance    | 13000 | true     | 2023-06-01 00:00:00 |
| 9    | The Algorithm Bible      | Technology | 45000 | false    | 2024-01-01 00:00:00 |
| 10   | Cursed Kingdoms          | Fantasy    | 22000 | true     | 2022-09-10 00:00:00 |

그런데 요즘 들어서 유저들이 "카테고리" 와 "성인용" 두가지 칼럼을 기준으로 검색하는 경우가 늘어났다고 한다. 이런 경우에는 두 칼럼을 함께 묶어 인덱스를 걸 수 있다. 이를 복합 인덱스라고 한다. "성인용" 칼럼과 "카테고리" 칼럼 순서로 인덱스를 걸어보면 다음과 같다. 

| is_adult | category   |
| -------- | ---------- |
| false    | Education  |
| false    | Science    |
| false    | Technology |
| false    | Technology |
| false    | Technology |
| false    | Romance    |
| true     | Fantasy    |
| true     | Romance    |
| true     | Romance    |
| true     | Thriller   |

강의는 이 인덱스로 "Romance" 카테고리의 "성인용" 책을 찾는 과정을 이렇게 설명한다. is_adult가 true인 행마다 카테고리를 하나씩 확인해야 하므로 검사 횟수가 많아진다.

강의가 짚는 원인은 is_adult의 서로 다른 값의 종류(카디널리티)가 true와 false 두 개뿐이라는 점이다. is_adult = true인 레코드가 너무 많으면 이 칼럼만으로는 범위가 좁혀지지 않는다. 즉 [선택도](/posts/reading-execution-plans/)가 낮다. 서로 다른 값의 종류가 많은 쪽은 category다.

```note
Q. boolean 컬럼에 인덱스를 설정하면 성능에 유리할까요?
A. boolean 타입 필드에 인덱스를 설정하는 것이 성능상 유리할지는 데이터 분포와 쿼리 사용 패턴에 따라 다릅니다. 일반적으로 boolean 필드는 선택성이 낮아 인덱스를 설정하는 것이 성능 개선에 크게 도움이 되지 않을 수 있습니다. 하지만, 특정 쿼리에서 해당 필드를 자주 필터링하거나 균등한 데이터 분포가 있다면 인덱스를 설정하는 것이 성능에 도움이 될 수 있습니다.
만약 성능을 측정하고 최적화하는 과정에서 실제로 인덱스를 생성하는 것이 효과적이다는 결과가 나왔다면, 인덱스를 사용하는 것이 좋습니다. 그렇지 않다면, 불필요한 인덱스는 피하는 것이 좋습니다.
```

| category   | is_adult |
| ---------- | -------- |
| Education  | false    |
| Fantasy    | true     |
| Romance    | false    |
| Romance    | true     |
| Romance    | true     |
| Science    | false    |
| Technology | false    |
| Technology | false    |
| Technology | false    |
| Thriller   | true     |

그래서 강의는 "카테고리", "성인용" 순서로 복합 인덱스를 다시 만든다. 이제 "Romance" 카테고리의 "성인용" 책을 찾으면 먼저 category가 "Romance"인 책들로 범위가 좁혀진다. 다른 카테고리의 책은 이 단계에서 걸러지고, 남은 행에서 is_adult가 true인 책만 고르면 된다. 강의의 결론은 서로 다른 값의 종류가 많은 칼럼을 앞에 두어야 탐색이 빠르다는 것이다.

이 결론에는 조건이 붙는다. MySQL 문서에 따르면 복합 인덱스는 왼쪽부터의 접두(leftmost prefix)로만 탐색에 쓰인다. `(col1, col2)` 인덱스는 `col1` 조건만 있는 쿼리나 `col1`과 `col2` 조건이 모두 있는 쿼리에 쓰이고, `col2` 조건만 있는 쿼리에는 쓰이지 않는다([MySQL 8.4 Reference Manual, Multiple-Column Indexes](https://dev.mysql.com/doc/refman/8.4/en/multiple-column-indexes.html)). 위 예처럼 두 칼럼 모두 등호 조건이면 B-Tree는 두 값의 조합으로 바로 범위를 찾으므로 칼럼 순서에 따른 차이가 크지 않다. 순서가 크게 갈리는 경우는 한 칼럼만 조건에 쓰이거나 앞 칼럼이 범위 조건일 때다. 그래서 칼럼 순서는 카디널리티보다 먼저 쿼리 패턴을 보고 정하는 편이 맞다고 나는 읽는다([인덱스가 선택되지 않는 순간](/posts/when-the-index-is-not-used/)).

## 05. 인덱스의 심화 이론

### B-Tree

> 완전 이진 트리의 높이가 최대 O(log(N))임을 확인했습니다. 즉 ,탐색을 안정적으로 할 수 있는 장점이 있는 자료구조입니다. 그런데 이것보다 DB 에서 사용하기에 더 좋은 자료구조가 있습니다.
>
> 바로 **Balance Tree(B-Tree)** 라는 자료구조입니다. 관계형 DB 에서 자주 사용되는 구조이고, 면접 질문으로 정말 많이 듣는 형태이기 때문에 우리는 이에 대해서 이해하는 것이 좋습니다.

[B-Tree](/posts/btree-index-internals/)는 이진 탐색 트리를 확장한 형태로, 하나의 노드가 여러 개의 키를 가질 수 있는 균형 트리다. 모든 리프 노드가 같은 레벨에 있고, 각 노드는 자식 노드를 가리키는 포인터를 가진다. RDBMS에서 가장 일반적으로 쓰이는 기본 인덱스 구조다. 예를 들어 MySQL InnoDB는 공간 인덱스를 제외한 모든 인덱스를 B-tree로 저장한다([MySQL 8.4 Reference Manual, The Physical Structure of an InnoDB Index](https://dev.mysql.com/doc/refman/8.4/en/innodb-physical-structure.html)).

B-Tree 는 다음과 같은 특징이 있다.

1. **다중 키 저장**: 각 노드는 여러 개의 키를 포함하며, 키들은 오름차순으로 정렬되어 있다.
2. **자식 노드 분할**: 노드의 키 개수가 N개라면, 해당 노드는 최대 N+1개의 자식 노드를 가질 수 있다.
3. **균형 유지**: 모든 리프 노드는 동일한 레벨에 위치하여 트리의 균형을 유지한다.

### Clustered Index, Non-Clustered Index

## 참고

- [MySQL 8.4 Reference Manual, Multiple-Column Indexes](https://dev.mysql.com/doc/refman/8.4/en/multiple-column-indexes.html)
- [MySQL 8.4 Reference Manual, The Physical Structure of an InnoDB Index](https://dev.mysql.com/doc/refman/8.4/en/innodb-physical-structure.html)
