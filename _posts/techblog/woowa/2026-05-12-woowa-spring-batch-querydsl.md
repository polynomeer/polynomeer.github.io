---
title: "우아한형제들 「Spring Batch와 Querydsl」 리뷰 — offset을 버린 Reader가 21분을 4분으로 만든 이유, 그리고 그 Reader가 답하지 않는 두 가지"
date: 2026-05-12
categories: [TechBlog, Woowa]
tags: [Tech Blog Review, Woowa Brothers, Spring Batch, Querydsl, Pagination, JPA, Settlement]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 33
source_url: https://techblog.woowahan.com/2662/

problem_decision_result:
  problem: "정산 배치는 수십만~수백만 건을 읽어 처리한다. Spring Batch의 페이징 Reader는 뒤로 갈수록 느려지고, Querydsl용 Reader는 공식으로 없어 매번 상속해 만들어야 했다. 우아한형제들 정산시스템팀이 2020년에 그 둘을 한 번에 푼 글이다."
  decision: "원문의 두 Reader(QuerydslPagingItemReader, QuerydslNoOffsetPagingItemReader)의 동작 원리와 실측(21분→4분 36초, 55분→2분 27초)을 옮기고, 실무 배치 시리즈의 청크 전환·Heap Dump 경험과 ParityPay의 커서 페이지네이션 실측에 대조했다."
  result: "offset 제거의 효과는 ParityPay에서도 같은 모양으로 재현됐다(거래내역 110만 건에서 깊이 무관 0.06~0.09ms). 원문이 답하지 않는 것은 둘이다. 읽은 행을 같은 배치가 갱신할 때 offset 페이징이 행을 건너뛰는 문제는 no-offset이 부수적으로 해결하지만 원문은 성능만 말하고, Reader의 페이지 크기와 영속성 컨텍스트의 관계는 Reader가 아니라 Chunk와 flush·clear가 정한다."
---

원문: [Spring Batch와 Querydsl](https://techblog.woowahan.com/2662/) — 우아한형제들 기술블로그, 이동욱(정산시스템팀), 2020-02-05

정산 배치를 다뤄 본 사람이면 이 글을 한 번은 읽었을 것이다. 나도 [대량 배치 시리즈](/series/batch-structure-improvement/)를 쓰던 시기에 읽었고, 그때는 "Querydsl Reader를 이렇게 만드는구나"로 끝났다. 지금 다시 읽는 이유는 그 뒤에 두 가지 경험이 생겼기 때문이다. Tasklet 하나가 수십만 건을 한 트랜잭션에 처리하다 OOM(OutOfMemoryError)이 난 것을 [Heap Dump로 영속성 컨텍스트에서 찾은 일](/posts/batch-heap-dump-to-chunk/), 그리고 ParityPay에서 거래내역 110만 건을 커서 페이지네이션으로 읽어 깊이와 무관한 응답 시간을 실측한 일이다. 원문의 결론이 그 둘과 어떻게 만나는지 보고 싶었다.

## 원문이 말하는 것

두 문제에서 출발한다. 첫째, Spring Batch는 Querydsl용 ItemReader를 제공하지 않아 정산팀은 `AbstractPagingItemReader`를 Job마다 상속해 구현했고, 신규 입사자마다 그 방법을 설명해야 했다. 둘째, MySQL의 [offset 페이징](/posts/pagination-performance/)은 뒤로 갈수록 느려진다. 100만 번째 행을 읽으려면 앞의 100만 행을 훑어야 한다. 원문의 예로는 `limit 10000, 20`이면 10,020개 행을 읽고 앞의 10,000개를 버린다. PostgreSQL 문서도 같은 점을 "The rows skipped by an `OFFSET` clause still have to be computed inside the server"(OFFSET으로 건너뛴 행도 서버 안에서는 계산해야 한다)라고 적는다([PostgreSQL Documentation, LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html)).

첫 문제의 답이 `QuerydslPagingItemReader`다. `JpaPagingItemReader`의 구조를 그대로 두고 JPQL 자리에 Querydsl 쿼리를 람다(`Function<JPAQueryFactory, JPAQuery<T>>`)로 받는다. 페이징 로직은 부모가 갖고, Job은 쿼리만 쓴다.

둘째 문제의 답이 `QuerydslNoOffsetPagingItemReader`다. offset을 쓰지 않는다. 첫 페이지는 정렬 기준 컬럼의 `max()`/`min()`으로 시작점을 잡고, 그 뒤로는 마지막으로 읽은 ID를 기억해 `WHERE id < 마지막ID` (또는 `>`)로 다음 페이지를 읽는다. 어느 페이지든 인덱스에서 바로 시작한다. 실측은 이렇다.

| 배치 | 데이터 | offset 페이징 | no-offset |
| --- | ---: | ---: | ---: |
| 첫 번째 | 869,000건 | 21분 | **4분 36초** |
| 두 번째 | 1,189,000건 | 55분 | **2분 27초** |

마지막 페이지 읽기 시간은 첫 번째 배치에서 2.4초가 0.03초로, 두 번째 배치에서 5초가 0.08초로 줄었다. 주의사항도 적혀 있다. order by나 group by를 PK 외의 기준으로 복잡하게 써야 하면 no-offset Reader를 쓰기 어렵고, 코드는 Spring Boot 2.1.3~2.2.4에서만 검증했으며, 운영 적용 전 테스트가 필요하다는 것이다.

## 같은 곳: offset을 버리면 깊이가 사라진다

ParityPay에서 같은 실험을 다른 자리에서 했다. 거래내역 프로젝션을 커서(마지막 항목의 시각과 ID) 기반으로 읽는 API를 110만 건 위에서 쟀고, 첫 페이지든 마지막 페이지든 0.06~0.09ms로 깊이와 무관했다(reports/11 M-008). 필터로 버린 행이 0이라는 것이 핵심이었다. offset 페이징은 "N행을 읽어서 앞의 N−k행을 버린다"이고, 커서 페이징은 "인덱스에서 k행만 읽는다"이다. 원문의 21분과 4분 36초의 차이가 그 버린 행의 비용이다.

원문은 정산 배치의 Reader에서, ParityPay는 조회 API에서 같은 결론에 닿았다. 문제의 모양이 같기 때문이다. 한 번에 다 못 읽는 데이터를 여러 번에 나눠 읽을 때, 각 번의 시작점을 "몇 번째"로 정하면 매번 앞을 세야 하고, "어디부터"로 정하면 세지 않는다.

## 원문이 답하지 않는 것 1: 읽으면서 갱신할 때

정산 배치는 읽은 행을 갱신하는 경우가 많다. "미정산" 행을 읽어 "정산 완료"로 바꾸는 식이다. 이때 offset 페이징에는 성능과 별개의 문제가 있다. 첫 페이지 100건을 읽어 갱신하면 그 100건은 더 이상 조회 조건(미정산)에 맞지 않고, 두 번째 페이지를 offset 100으로 읽으면 **원래 두 번째 페이지였던 100건을 건너뛴다.** 페이지마다 절반이 빠진다.

Spring Batch에서 이 문제를 아는 사람은 offset을 늘리지 않거나(항상 첫 페이지를 읽음) 정렬 키로 커서를 잡는다. 원문의 no-offset Reader는 후자를 하므로 이 문제를 부수적으로 해결한다. 마지막 ID 이후를 읽으므로 앞 페이지의 갱신이 다음 페이지의 시작점을 바꾸지 않는다. 그런데 원문은 이것을 성능 개선으로만 설명하고 정확성 문제는 언급하지 않는다. 나는 이것이 글의 범위 밖이었을 것이라고 읽는다. 내 입장에서는 이 Reader를 고르는 첫 번째 이유가 성능이 아니라 이것이다. [대량 배치 2부](/posts/bulk-insert-with-lock-part2/)에서 "전체 삭제 후 전체 등록" 구조의 위험을 적었는데, 부분 갱신으로 바꾸는 순간 페이징의 정확성이 새 문제가 되고, 커서 페이징이 그 답이다.

## 원문이 답하지 않는 것 2: Reader의 페이지 크기와 메모리

원문의 Reader는 페이지 단위로 `EntityManager`에서 읽는다. 페이지 크기가 1,000이면 1,000개의 엔티티가 [영속성 컨텍스트](/posts/jpa-architecture/)에 들어온다. 그 엔티티들이 언제 빠지는가는 Reader가 아니라 Chunk의 트랜잭션 경계가 정한다. Spring Batch 문서도 Chunk 지향 처리를 한 건씩 읽어 만든 chunk를 트랜잭션 경계 안에서 쓰고, commit interval에 이르면 커밋하는 방식으로 설명한다([Spring Batch Reference, Chunk-oriented Processing](https://docs.spring.io/spring-batch/reference/step/chunk-oriented-processing.html)). 원문도 `JpaPagingItemReader`의 페이지 단위 트랜잭션 코드를 뺐고, Chunk 단위 트랜잭션이 보장되어 롤백 등이 잘 작동함을 확인했다고 적는다.

이것이 내가 [Heap Dump 글](/posts/batch-heap-dump-to-chunk/)에서 만난 문제의 반대편이다. 그 배치는 Tasklet 하나가 수십만 건을 한 트랜잭션에 처리해서 영속성 컨텍스트가 트랜잭션 종료까지 전부를 기억했고, 힙이 모자란 것이 아니라 구조가 힙을 놓아주지 않았다. Chunk로 바꿔 일정 건수마다 커밋하고 컨텍스트를 비우자 3.8GB가 1.6GB가 됐다. 그래서 원문의 Reader를 썼더라도 Chunk 크기를 잘못 잡으면 같은 일이 난다. **Reader는 "어떻게 읽는가"를 정하고, 메모리는 "언제 놓는가"가 정한다.** 두 글을 합치면 정산 배치의 읽기 쪽 규칙은 커서로 읽고 Chunk로 놓는 것이다.

한 가지 더. 원문의 첫 페이지는 `max()`/`min()` 집계로 시작점을 잡는다. 첫 페이지에 id 조건 없이 정렬하면 전체 정렬이 일어나기 때문이다. 원문은 인덱스 필드의 최대값·최소값을 가져오므로 이 집계의 성능 이슈가 생각보다 크지 않았다고 적는다. 내가 보기에 그 전제는 인덱스가 집계를 받쳐 줄 때다. 인덱스가 있으면 O(1)이지만, 조회 조건이 인덱스 첫 컬럼과 다르면 이 집계가 전체를 훑을 수 있다. ParityPay에서 불변조건 지표가 스크레이프마다 원장 전체를 집계하다 200만 건에서 4.5초가 된 것([4편 결함 G](/posts/parity-pay-experiments-and-defects/))과 같은 자리다. 원문의 주의사항은 PK 외 기준의 복잡한 정렬을 말하지만, 첫 페이지 집계도 같이 확인할 대상이라고 본다.

## 원문이 잘한 것

수치를 실었다. 21분 → 4분 36초, 55분 → 2분 27초, 마지막 페이지 2.4초 → 0.03초. 2020년 기술 블로그 글 중 Reader 구현을 설명하면서 전후 실측을 표로 낸 글은 많지 않다. 그리고 "운영에서 사용하실땐 꼭 테스트를 해보세요"라고 적었다. 라이브러리로 공개하면서 한계(단순 정렬만, 특정 버전만)를 먼저 적은 것이 6년 뒤에 다시 읽어도 쓸 수 있는 이유라고 본다.

반복 코드를 "행사 코드"라고 부르며 신규 입사자가 올 때마다 설명해야 했다는 동기도 좋다. 성능보다 이 동기가 먼저 나온다. 정산팀의 문제는 "느리다"가 아니라 "매번 같은 것을 다시 만든다"였고, 그것을 풀다가 성능도 풀린 순서다.

## 가져갈 것

- 여러 번에 나눠 읽을 때 시작점은 "몇 번째"가 아니라 "어디부터"로 잡는다. 배치 Reader든 조회 API든 같다.
- 읽으면서 갱신하는 배치에서 offset 페이징은 느린 것이 아니라 틀린다. 커서 페이징의 첫 번째 이유는 정확성이다.
- Reader는 읽는 법을, Chunk는 놓는 법을 정한다. 둘 중 하나만 고치면 다른 쪽에서 터진다.
- 첫 페이지의 `max()`/`min()`은 인덱스가 받쳐 주지 않으면 전체 스캔이 될 수 있다. "단순한 정렬만"이라는 원문의 주의사항과 별개로 확인할 대상이다.

## 참고

- [Spring Batch와 Querydsl](https://techblog.woowahan.com/2662/) — 우아한형제들 기술블로그 원문
- [LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html) — PostgreSQL Documentation
- [Chunk-oriented Processing](https://docs.spring.io/spring-batch/reference/step/chunk-oriented-processing.html) — Spring Batch Reference
