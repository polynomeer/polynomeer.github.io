---
title: "카카오 「PostgreSQL to ES: Kafka Connect CDC 파이프라인」 1·2편 리뷰 — 변경이 없어서 디스크가 차고, LSN이 사라져서 스냅샷을 다시 짜야 했던 CDC의 실제 운영 비용"
date: 2026-04-13
categories: [TechBlog, Kakao]
tags: [Tech Blog Review, Kakao, CDC, Debezium, Kafka Connect, PostgreSQL, Elasticsearch, Transactional Outbox]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 28
source_url: https://tech.kakao.com/posts/776

problem_decision_result:
  problem: "parity-pay는 Outbox의 대안으로 CDC를 검토하고 '초기 인프라 비용이 크다'는 이유로 뺐다. 그 비용이 실제로 무엇인지는 몰랐다. 카카오 클린플랫폼 팀이 PostgreSQL→Elasticsearch 동기화를 Debezium CDC로 바꾸고 운영하며 만난 문제를 두 편으로 적었다."
  decision: "1편의 구성(Kafka Connect, Debezium, ES Sink, Strimzi)과 2편의 트러블슈팅 세 가지(변경 없는 테이블의 WAL 누적으로 Disk Full, 재시작 시 LSN 무효로 유실 위험, 날짜 기반 인덱스에서 과거 데이터 갱신 시 중복)를 옮기고, parity-pay가 Outbox를 고른 판단과 대조했다."
  result: "CDC의 운영 비용은 '설정이 많다'가 아니라 '실패 모드가 DB 내부에 있다'는 것이었다. WAL slot이 갱신되지 않아 디스크가 차는 문제와 LSN이 유효하지 않다고 판단되는 문제는 애플리케이션 코드 어디에도 없고, 후자는 원인을 끝내 찾지 못해 '문제가 생겨도 유실이 없게' 스냅샷 쿼리를 다시 짜는 쪽으로 풀었다. Outbox의 실패 모드가 우리 테이블과 우리 발행기 안에 있다는 것이 parity-pay가 그것을 고른 실제 이유였다는 것을 이 글을 읽고 알았다."
---

원문: [PostgreSQL to ES: (1) Kafka Connect CDC 파이프라인 구성](https://tech.kakao.com/posts/776), [(2) Kafka Connect 트러블슈팅](https://tech.kakao.com/posts/777) — 카카오 기술블로그, 핀(클린플랫폼), 2025-10-10

[parity-pay 5편](/posts/parity-pay-outbox/)에서 DB와 브로커의 이중 쓰기를 푸는 방법으로 Outbox를 고르고 CDC를 뺐다. 이유는 "폴링 지연은 줄지만 커넥터·스키마 레지스트리·binlog 운영이 붙는다"였다. 그 문장은 CDC를 운영해 보지 않고 쓴 것이다. 이 글은 CDC를 실제로 운영한 팀이 무엇을 만났는지 적었고, 그래서 내 판단이 맞았는지 확인할 재료다.

## 원문이 말하는 것

10년 된 콘텐츠 모니터링 시스템의 PostgreSQL → Elasticsearch 동기화 파이프라인이 문제였다. DB에 큐 테이블을 두고, 배치가 읽어 유입 파이프라인으로 보내고, 거기서 RabbitMQ로, 다시 배치가 ES에 넣는 네 단계였다. ES로 갈 데이터가 굳이 거칠 필요 없는 곳을 거치며 장애 지점만 늘렸고, 문제가 나면 원인 파악이 어려웠다. Logstash, NiFi, PGSync, Kafka Connect를 검토하고 Kafka가 익숙하다는 이유로 Kafka Connect를 골랐다.

1편은 구성이다. Debezium이 PostgreSQL의 logical decoding(pgoutput)으로 변경을 읽어 Kafka에 넣고, 중간의 Python 앱이 비즈니스 로직에 맞게 변환하고, ES Sink Connector가 인덱싱한다. Debezium 설정에서 눈에 띄는 것은 `ByLogicalTableRouter`로 테이블별 토픽을 하나로 합친 것, ES Sink에서 `behavior.on.null.values: delete`로 삭제를 전파한 것, 그리고 Kubernetes에서 Strimzi로 커넥터를 GitOps로 배포한 것이다.

2편이 이 리뷰의 이유다. 운영에서 만난 문제 셋.

**변경이 없어서 디스크가 찬다.** Debezium은 구독 테이블에 변경이 있을 때만 LSN(WAL 위치)을 PostgreSQL에 피드백한다. 변경이 거의 없는 테이블을 구독하면 slot의 LSN이 갱신되지 않고, PostgreSQL은 slot이 필요로 하는 WAL 파일을 지우지 못한다. WAL은 클러스터 전체가 공유하므로 **다른 테이블의 변경이 쌓여 디스크가 찬다.** 해결은 heartbeat 설정이다. 변경이 없어도 주기적으로 heartbeat 메시지를 보내 LSN을 전진시킨다.

**LSN이 유효하지 않다고 한다.** Debezium을 재시작하면 Kafka에 기록한 마지막 LSN부터 다시 요청하는데, 간헐적으로 PostgreSQL이 그 LSN이 유효하지 않다고 판단했다. 거의 안 나지만 나면 유실이다. PostgreSQL 담당과 원인을 찾았지만 재현되지 않아 **원인을 끝내 못 찾았다.** 그래서 문제를 없애는 대신 문제가 나도 유실이 없게 했다. `snapshot.mode: when_needed`로 LSN이 무효면 스냅샷을 다시 뜨되, 기본 스냅샷은 테이블 전체(1억 행이면 1억 행)라 `SnapshotQuery` SPI를 구현해 `updated_at` 기준 최근 N분만 읽게 했다. 적용 뒤 유실이 없었다.

**과거 데이터가 갱신되면 인덱스가 둘이 된다.** ES 인덱스를 생성 월로 나눴는데(`article-2025_08`), 8월 데이터가 9월에 수정되면 `TimestampRouter`가 `article-2025_09`에 중복 저장했다. 해결은 Python 앱이 생성 월 기준 인덱스 이름을 메시지 키에 실어 보내고, 직접 구현한 Transforms가 키에서 인덱스를 꺼내 토픽으로 바꿔치기하는 것이었다.

## CDC의 비용은 설정이 아니라 실패 모드의 위치다

parity-pay가 CDC를 뺀 이유를 "인프라 비용"이라고 썼는데, 이 글을 읽고 나서 그 말이 부정확했다는 것을 알았다. 커넥터 설정과 Strimzi 배포는 1편이 보여주듯 한 번 하면 끝나는 일이다. 진짜 비용은 2편에 있다. **실패 모드가 DB 내부에 있다.**

Outbox의 실패 모드는 우리 테이블과 우리 발행기 안에 있다. 발행기가 안 돌면 `PENDING`이 쌓이고(5편 결함 B), 브로커가 죽으면 `attempt_count`가 안 오르고(결함 C), 발행기를 여러 대 띄우면 순서가 깨진다(결함 F). 전부 우리 코드에서 재현하고 우리 테스트로 고정할 수 있었다. CDC의 실패 모드는 WAL slot, LSN, logical decoding 안에 있다. 변경이 없는 테이블이 디스크를 채운다는 것은 애플리케이션 코드 어디에도 없는 인과다. LSN이 무효가 되는 원인은 DB 담당과 찾아도 못 찾았다. 원문의 팀이 잘못한 것이 아니라, CDC가 DB의 복제 메커니즘 위에 서 있어서 그 메커니즘의 실패가 곧 파이프라인의 실패가 되는 구조다.

그래서 원문의 해법이 인상적이다. "원인을 못 찾았으니 문제가 나도 유실이 없게 한다." 스냅샷 쿼리를 최근 N분으로 좁힌 것은 유실 창을 N분 이내로 묶고, LSN이 무효가 되는 빈도와 무관하게 안전하게 만든다. [parity-pay 3편](/posts/parity-pay-unknown-state/)에서 외부 응답 유실의 원인을 통제할 수 없으니 `UNKNOWN`으로 보존해 수렴시킨 것과 같은 자세다. 통제할 수 없는 실패는 없애는 것이 아니라 그 실패 아래에서도 정합성이 유지되게 만든다.

## 같은 곳: 삭제와 갱신은 삽입과 다르다

세 번째 문제(과거 데이터 갱신 시 인덱스 중복)는 CDC 고유의 문제가 아니라 파생 데이터 전반의 문제다. 원본의 갱신이 파생 저장소에서 "새 문서"가 되면 안 되고 "같은 문서의 갱신"이어야 한다. [parity-pay 7편](/posts/parity-pay-ledger/)에서 원장은 append-only이지만 잔액 스냅샷은 갱신이라 둘의 일치를 INV-010으로 검증해야 했던 것과 같은 자리다. 원문은 그것을 "인덱스 이름을 원본의 생성 월로 고정한다"로 풀었고, 그 결정을 Transforms가 아니라 앞단 앱에서 내리게 한 것이 맞다. 인덱스 이름은 비즈니스 규칙이지 라우팅 규칙이 아니다.

## 원문이 답하지 않는 것

- **지연.** 기존 네 단계 파이프라인 대비 CDC 파이프라인의 end-to-end 지연이 얼마인지 없다. "준실시간"이라고만 적혀 있다. 재설계의 동기가 복잡성이었지 지연이 아니었으므로 당연할 수 있지만, Outbox 폴링(500ms)과 비교할 수 있는 숫자가 있었으면 좋았을 것이다.
- **중복 소비.** Debezium은 at-least-once다. 재시작이나 스냅샷 재실행 시 같은 변경이 두 번 갈 수 있는데, ES Sink가 문서 ID로 upsert하므로 멱등이 자연히 성립한다. 원문은 그것을 명시하지 않았다. 파생 저장소가 upsert가 아니라 append였다면(예: 정산 항목 생성) 이 파이프라인은 [5편의 `consumed_event`](/posts/parity-pay-outbox/) 같은 소비 이력이 필요했을 것이다.
- **heartbeat의 부작용.** heartbeat 토픽에 메시지가 쌓인다. 정리 정책이 무엇인지, 스크레이프 지표처럼 조용히 자라는 것은 없는지는 적혀 있지 않다.

## 가져갈 것

- CDC와 Outbox의 차이는 지연이나 설정량이 아니라 실패 모드가 어디에 있는가다. Outbox는 우리 코드 안, CDC는 DB 복제 메커니즘 안.
- 원인을 못 찾은 실패는 없애지 말고 그 아래에서 정합성이 유지되게 만든다. 스냅샷 창을 좁히는 것이 그 예다.
- 변경이 없는 것도 상태다. slot이 전진하지 않으면 다른 테이블의 WAL이 쌓인다.
- 파생 저장소에서 원본의 갱신은 새 문서가 아니라 같은 문서의 갱신이어야 하고, 그 판단은 라우팅이 아니라 비즈니스 계층이 한다.
