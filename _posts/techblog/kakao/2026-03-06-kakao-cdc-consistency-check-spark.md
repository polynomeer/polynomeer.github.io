---
title: "카카오 「CDC 파이프라인 정합성 검사 Spark 잡 개발」(Part 1·2) 리뷰 — Reader·Translator·Comparator·Reporter로 나누고, DB 부하와 병렬도 사이의 균형점을 찾은 이야기"
date: 2026-03-06
status: draft
categories: [TechBlog, Kakao]
tags: [Tech Blog Review, Kakao, Apache Spark, CDC, Data Consistency, Scala, JDBC, Apache Iceberg, Design Patterns]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 21
source_url: https://tech.kakao.com/posts/717
---

원문(2부, 모두 2025-07-28 kakao tech, dawn 최여명·데이터분석플랫폼):
[Part 1. 코드 설계편](https://tech.kakao.com/posts/717) · [Part 2. Spark 최적화편](https://tech.kakao.com/posts/718)

## 한 줄 요약

카카오 데이터분석플랫폼은 300개 이상의 CDC 파이프라인을 돌리며 매일 소스(MySQL)와 타깃(MySQL·Iceberg)이 같은지 검사한다. 검사 잡은 테이블 단위 JSON으로 제출되고, 코드는 **읽기(Reader) → 값 보정(Translator) → 비교(Comparator) → 보고(Reporter)** 네 컴포넌트로 나뉜다. Part 2의 핵심은 MySQL을 읽을 때 "빠르게"보다 "DB에 부담 없이"가 우선이라는 점이다. 병렬도는 `min(executor × core, numPartitions)`로 정해지고, 1,000만 건 테이블에서 워커 32에 파티션 10이면 5초, 그 이상은 늘려도 소용없었다. 비교는 PK 기준 full outer join이고, `=!=`가 NULL에서 NULL을 돌려주는 함정을 `isNull`로 막는다.

## Part 1: 설계

**잡 정의.** JSON 하나가 테이블 하나다. 소스·타깃 접속 정보, PK 컬럼, `numPartitions`, 스캔 모드(fullscan/keybased/limit), 리포트 방식, Spark 설정이 들어간다. 테이블 단위로 쪼개는 이유는 이슈를 테이블별로 감지하고 한 잡의 실패가 다른 잡에 번지지 않게 하기 위해서다. JSON은 Scala case class로 매핑하고, `DatasourceConfig`는 trait로 두고 MySQL·MongoDB·Iceberg 구현체를 Jackson의 `@JsonTypeInfo`/`@JsonSubTypes`로 `datasourceType` 값에 따라 골라 역직렬화한다.

**네 컴포넌트.**

- **Reader**: `DatasourceReader` 추상 클래스에 세 스캔 모드를 추상 메서드로 두고 `MysqlReader`, `IcebergReader`가 구현한다. 새 데이터소스가 오면 모드 구현이 강제된다.
- **Translator**: 비교 전에 값을 맞춘다. 이기종이면 타입 차이(예: Iceberg는 JSON 타입이 없어 문자열로 저장되고 공백·포맷이 달라짐 → 양쪽을 표준 문자열로 정규화), 보안존이면 해싱·마스킹된 컬럼. 데이터소스 조합에 따른 기본 Translator와 사용자가 JSON에 적은 커스텀 Translator를 병합해 리스트로 순서대로 적용한다.
- **Comparator**: 소스·타깃 DataFrame과 PK 목록을 받아 비교하고 결과를 내부 상태로 저장하는 명령형 컴포넌트. 실행 시점과 결과 참조 시점을 분리한다.
- **Reporter**: 콘솔·사내 메신저·DB 등 채널별 하위 클래스. 결과는 `ConsistencyResult` DTO로 전달하고 포맷팅은 부모에서 공통 구현.

**패턴.** 설정에 따라 런타임에 Reader·Translator·Reporter를 만드는 심플 팩토리, 스캔 모드별 읽기 뒤 공통 처리(컬럼 제외, 스키마 로깅)를 상위에 둔 템플릿 메서드, Translator를 갈아 끼우는 전략 패턴, Spark 세션을 환경(Production/Sandbox/Local)별 생성 로직과 함께 `object`로 묶은 싱글톤. 스타일은 scalafmt + scalafix(import 정리)를 pre-commit과 CI 훅에 걸었다.

솔직한 회고가 좋다. Java 스타일 문법이 남아 있고, Translator는 더 나은 방법이 있었을 것 같고, enum 대신 문자열을 쓴 것이 아쉽다고 적었다. "내가 없어도 누구나 이해하고 고칠 수 있는 구조"가 설계 철학이었다.

## Part 2: Spark 최적화

**왜 Spark인가.** 매일 300개 이상, 테이블당 최대 수억 건, MySQL↔Iceberg 이기종 비교. 잡 제출 방식이라 테이블별 잡으로 나뉘고 YARN이 큐잉·스케줄링을 해 주며, 파티션 병렬 처리가 되고, 어떤 소스든 DataFrame으로 추상화된다.

**MySQL: 부하가 먼저다.** 검사는 세컨더리에서 하지만 동기화 지연이나 프라이머리 스위칭에 영향을 줄 수 있어 속도와 안정성의 타협점이 필요하다.

- *fullscan*: 쿼리 하나가 너무 많이 읽으면 슬로우 쿼리, 너무 잘게 나누면 커넥션 과점유. `numPartitions`는 최대 동시 JDBC 커넥션 수이고 실제 병렬도는 `min(executor × core, numPartitions)`. `partitionColumn`(PK)과 미리 조회한 `min(id)`/`max(id)`를 `lowerBound`/`upperBound`로 준다(이 값은 분할 기준일 뿐 필터가 아니다).

  | Executor | Core | 워커 | numPartitions | 소요(초) |
  | ---: | ---: | ---: | ---: | ---: |
  | 8 | 4 | 32 | 1 | 28 |
  | 8 | 4 | 32 | 5 | 8 |
  | 8 | 4 | 32 | 10 | 5 |
  | 8 | 4 | 32 | 50 | 5 |
  | 16 | 4 | 64 | 100 | 4 |
  | 32 | 4 | 128 | 100 | 4 |

  1,000만 건 기준. 파티션 10에서 이미 5초이고 워커를 4배로 늘려도 4초다. 병목이 Spark가 아니라 DB 쪽으로 넘어간 것이다.

- *keybased*: 매일 변경된 PK를 ORC로 따로 남기는 서브 태스크가 있어, 전체가 아니라 그 PK만 읽는다. `predicates` 옵션에 `WHERE id IN (...)` 문자열 리스트를 주면 조건마다 쿼리가 병렬로 돈다. PK를 100개씩 IN절로 묶고, 그 조건들을 다시 `numPartitions` 단위로 그룹핑해 동시 커넥션을 제한한다. 변경분이 많으면 파티션·태스크가 폭증해 잡이 오히려 느려지므로 레코드 0.5KB × 파티션당 256MB 목표 = **파티션당 50만 건**으로 `coalesce`한다. `predicates`는 `spark.read.format("jdbc")`가 아니라 `spark.read.jdbc(...)`에서만 된다.
- *limit*: 연동 직후 샘플 검증용. `dbtable`에 LIMIT 서브쿼리를 넣고 단일 쿼리로, 최대 100만 건 상한.

**Iceberg: 부하는 자유, 인덱스는 없음.** 운영 DB가 아니라 워커를 훨씬 크게 잡을 수 있지만 PK 인덱스가 없어 특정 레코드 조회가 어렵다. fullscan은 그대로, keybased는 **풀스캔 후 변경분 PK와 inner join**, limit은 풀스캔 후 order by + limit. 매번 풀스캔이니 compaction과 스냅샷 만료를 주기적으로 한다.

**캐싱.** Spark는 지연 평가라 `count()`·`show()`마다 다시 읽는다. Reader가 `spark.read` 직후 `cache()`를 호출해 DB 접근을 최초 1회로 묶는다.

**비교 로직.** 세 경우를 잡아야 한다. 같은 PK인데 값이 다름, 소스에만 있음(INSERT 미반영), 타깃에만 있음(DELETE 미반영). PK 기준 **full_outer join** 후 PK 한쪽이 null인 행(2·3)과 PK는 같은데 다른 컬럼이 다른 행(1)을 필터링한다. 함정 하나: `=!=`는 한쪽이 NULL이면 true/false가 아니라 **NULL을 반환**해 필터에서 무시된다. 그래서 `isNull`/`isNotNull`을 명시적으로 섞는다. 이 조인은 양쪽이 비슷한 크기의 대용량이라 SortMergeJoin이 가장 안정적이다.

**로컬 모드.** 보안존 DB는 YARN 클러스터의 수많은 서버 접근을 허용할 수 없어 허용된 단일 장비에서 로컬 모드로 돈다. Executor 옵션은 무의미하고 `spark.driver.memory`를 최대로. 그리고 `spark.sql.autoBroadcastJoinThreshold=-1`로 브로드캐스트 조인을 막는다. 브로드캐스트는 테이블 전체를 메모리에 올리고 디스크 spill을 지원하지 않아 자원이 적은 로컬 모드에서 OOM이나 무한 실행이 난다. 실제로 이 옵션 없이 잡이 끝나지 않는 현상을 겪었다.

회고에서 연속된 PK 구간은 IN 대신 BETWEEN이 나을 것 같고, Iceberg는 사전 필터링과 Sort Order로 file-level pruning을 더 살릴 여지가 있다고 적었다.

## 읽고 남는 질문

- 검사 시점에 CDC가 아직 반영하지 못한 "정상적인 지연"과 진짜 불일치를 어떻게 구분하는지가 없다. 소스를 읽는 순간과 타깃을 읽는 순간 사이의 변경이 오탐이 될 텐데, 스냅샷 시각을 맞추거나 재검사로 거르는 규칙이 있을 것 같다.
- 표에서 워커 32/파티션 10과 워커 128/파티션 100의 차이가 1초다. 후자는 커넥션 100개를 세컨더리에 붙이는 것인데 그때 DB 쪽 지표(CPU, 복제 지연)가 어땠는지가 "부하가 먼저"라는 원칙의 실측이 됐을 것이다.
- keybased 모드의 PK를 100개씩 IN절로 묶는 이유가 MySQL 쿼리 길이 때문인지 실행 계획 때문인지 궁금하다. 범위 기반으로 바꾸면 조건 수가 크게 줄어들 텐데 회고에도 같은 고민이 있다.

## 한 줄로 가져가기

정합성 검사는 "두 테이블을 조인하는 것"이 아니라 "운영 DB에 부담을 주지 않으면서 두 테이블을 조인하는 것"이고, 그 제약이 병렬도·파티션 크기·스캔 모드·조인 전략을 전부 결정한다. 그리고 NULL은 `=!=`로 비교되지 않는다.
