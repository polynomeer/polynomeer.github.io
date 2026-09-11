# 콘텐츠 계획 2026-09 — 채용 관점 보완 계획

작성일: 2026-09-11
조사 범위: `polynomeer/career-hub`(비공개, 2026-09-10 기준), `github.com/polynomeer` 공개 저장소 59개와 프로필 README, 이 블로그의 `_posts` 1,047개 파일과 채용 표면(`/recruit`, `/capabilities`, `_data/representative_posts.yml`).

이 문서는 "어떤 글을 더 써야 하는가"에 답하기 위해 세 소스를 대조한 결과다. 글 주제만 나열하지 않고, 글을 쓰기 전에 고쳐야 할 표면 문제와 이미 쓰다 만 초안 처리까지 한 계획에 담는다.

## 0. 결론 요약

블로그에는 글이 부족한 게 아니라, **이력서가 주장하는 강점을 뒷받침하는 글이 채용 표면에 연결되어 있지 않다.** 세 가지 불일치가 핵심이다.

1. **이력서와 블로그의 강점 정의가 다르다.** career-hub는 "정합성·동시성·정산 배치 성능·레거시 개선"을 팔고, 블로그 `/recruit` 페이지는 "DB 내부 동작 설명·Spring·구조화된 학습·기술 글쓰기"를 판다. 대표 글 4개 중 실무 성과를 다룬 글은 1개뿐이다.
2. **실무 경험 시리즈가 미완이고, 가장 야심찬 시리즈 36편이 Draft 배지를 단 채 공개돼 있다.** `키 생성 병목` 시리즈는 2부에서 "다음 글에서"로 끝났고(2026-03-20 이후 정지), monticker 22편·Spring 내부 14편은 모두 `status: draft`로 노출 중이다.
3. **가장 타깃에 맞는 최신 프로젝트(parity-pay)가 블로그와 GitHub 프로필 어디에도 없다.** 지원 대상은 토스인컴·토스증권·카카오뱅크·티빙 빌링, 즉 결제·정산·원장 도메인인데 parity-pay(2026-09, 결제·원장·멱등성·대사)는 글 0편, GitHub pinned에도 없다. pinned 4개는 `spring-practice`, `java-practice`, `romanticker`(현재 이름 monticker), `redis-lite-java`로 2025년 상태다.

우선순위는 **표면 정비(글을 안 써도 되는 것) → 미완 시리즈 완결 → 이력서 bullet 1:1 대응 글 → parity-pay 시리즈 → 초안 정리** 순이다.

## 1. 조사 근거

### 1.1 career-hub가 정의한 "팔아야 할 것"

`facts/profile.md`의 검증된 역량 6개와 지원 버전 4종(`versions/`)에서 반복되는 강조점:

| 강점 | 근거 프로젝트 (`facts/projects/`) | 핵심 수치 |
| --- | --- | --- |
| 정확성·정합성 중심 설계 | 지분율 시스템 상태 전이 모델, MDS 정산 중 수정 차단 | Race Condition 제거, 재정산 빈도 감소 |
| 동시성 제어 | SETNX + Lock Token 분산락, 경량 락 + AOP | — |
| 대규모 배치·정산 성능 | 지분율 청크 병렬 처리, Excel SXSSF | 2시간 → 5분, 40분 → 12분, 1.2GB → 180MB |
| 계측 기반 원인 추적 | MAT Heap Dump 분석, Datadog 관찰 | 3.8GB → 1.6GB |
| 레거시 구조 개선 | MCP 전면 개편 (CQRS, 검증 파이프라인, range allocation) | 1.5초 → 300ms, 2분 → 10초 |
| 아키텍처 가드레일 | ArchUnit + SonarCloud | 위반 480 → 75 |

타깃 도메인은 결제·정산·빌링·증권이다. `interview-prep/question-trees.md`의 15개 질문 트리가 곧 면접에서 파고들 지점이고, 이 트리 하나하나가 글 한 편의 자연스러운 단위다.

career-hub에는 `확인 필요`로 남은 미확정 사실이 있다(청크 크기, Lock TTL, MAT에서 본 기능, SQS 멱등 저장소, ThreadPool 크기). **글을 쓰는 과정이 이 기억을 복원하는 가장 좋은 방법이다.** 다만 복원되지 않은 수치는 글에서도 "원칙"으로만 쓰고 지어내지 않는다.

### 1.2 GitHub 프로필 진단

- 최근 4주 활동 저장소: `parity-pay`(Java, 결제·원장), `quno`, `sys-drill`, `code-drill`, `spring-lab`(=spring-internals-lab, 20주 완료·217 테스트), `monticker`. 전부 Claude Code로 문서 주도 개발한 흔적(`CLAUDE.md`, `PLAN.md`, ADR)이 있다.
- pinned 4개가 2025년 학습용 저장소다. 최근 성과물이 첫 화면에 없다.
- 프로필 README 스킬 배지에 Kubernetes, Kafka, Maven이 있다. `facts/profile.md`는 "목록에 없는 기술(Kafka 등)은 실무 경험으로 명시하지 않는다"고 규정한다. 블로그 About의 스택 목록은 facts와 일치하므로, README만 어긋난다.
- README 자기소개("simplifies complexity and finds clarity in chaos")는 이력서 소개문("상태 전이와 동시성, 트랜잭션 정합성이 중요한 시스템")과 톤과 초점이 다르다.
- `parity-pay`의 `reports/12-portfolio-technical-report-draft.md`는 이미 "면접용 한 문장"까지 갖춘 기술 보고서다. 블로그 시리즈의 원고가 사실상 존재한다.

### 1.3 블로그 진단

**볼륨과 분포**

- 1,047개 파일 중 TIL 594개(57%). 날짜 접두어가 없는 README·chapN 파일 약 130개는 Jekyll이 포스트로 렌더링하지 않는다.
- 2026년 69편. 커밋은 2026-03 143건에서 2026-06~09 합계 20건으로 급감했다. 에너지가 사이드 프로젝트 저장소로 옮겨간 시기와 일치한다.
- `status` 필드: published 8, draft 37, archived 2, 나머지 1,000편은 미지정(기본 표시).

**채용 표면**

- `_data/representative_posts.yml` 대표 글: MVCC, Gap Lock, Spring Bean Lifecycle, 키 생성 병목 2부. 앞의 세 편은 개념 정리 글이다. 이력서의 정량 성과와 연결되는 글은 마지막 한 편뿐이다.
- `_data/recruit_mode.yml` hero 문구가 "기술 글쓰기에 집중해 온 백엔드 엔지니어"다. 검토자가 만드는 한 줄 요약("이 사람은 OO를 잘하는 사람")이 "글 잘 쓰는 사람"으로 굳는다. `RESUME_GUIDE.md`의 기준으로 보면 이력서와 블로그가 서로 다른 사람을 설명한다.
- `capability_map.yml`도 같은 축(데이터베이스 내부 동작, Spring 백엔드, 기초 체력, 구조화된 학습)이다.

**실무 경험 글의 상태**

| 시리즈 | 편수 | 상태 | 대응 facts |
| --- | --- | --- | --- |
| 대량 배치 안정성을 높이기 위한 구조 개선 | 5 | 완결 (2026-01-03) | equity-system |
| 키 생성 병목을 추적해 구조를 바꾼 기록 | 2 | **미완** — 2부가 "다음 글에서 어떻게 바꿨는지"로 끝남 | mcp-platform-revamp §4 |
| 운에 맡기던 배치를 시스템으로 바꾸기 | 1 | **고아** — 대량 배치 시리즈와 주제 중복 | equity-system |
| JSP 기반 시스템의 구조적 문제를 해결한 아키텍처 전환기 | 5 | 2025-05-22 하루에 일괄 등록 (Velog 이관본으로 추정) | mcp-platform-revamp §1~3 |
| ISMS 대응을 위한 로그 수집 체계 개선 | 1 | 단편 | creator-studio §2 |
| 대량 엑셀 다운로드 3편 | 3 | 단편 | batch-excel-optimization |

**이력서 bullet 중 블로그에 글이 없는 것**

- MDS: 정산 중 메타데이터 수정 차단(상태 플래그 + AOP 경량 락) — 없음
- MDS: 폴링 배치 → SQS 이벤트 파이프라인, 재시도·DLQ·메시지 ID 멱등 — 없음
- MCP: 시퀀스 range allocation — 2부에서 끊김
- MCP: ArchUnit 가드레일 480 → 75, 신규 100% 강제 + 레거시 점진 정리 — 없음
- MCP: Shadow Release로 MyBatis → QueryDSL 조회 전환 검증 — 없음 (JSP 전환기 3편이 CQRS까지만 다룸)
- 배치: MAT Heap Dump로 영속성 컨텍스트 누적을 특정한 과정 — 없음
- 크리에이터 스튜디오: Post-Commit 이벤트 — 개념 노트 2편(`@TransactionalEventListener`)은 있으나 "왜 도메인별로 정합성 수준을 협의했는가"라는 사례 글은 없음
- 더파이러츠: 결제대행 API 연동 — 없음 (티빙 빌링 지원 시 "거의 확실히 나올 질문"으로 표시됨)

**사이드 프로젝트 중 블로그에 글이 없는 것**

- parity-pay — 0편. 타깃 도메인과 가장 직접 맞닿음.
- spring-internals-lab — 9편 전부 draft.
- starkraft(781 commits), iterview, code-drill, sys-drill, quno — 0편. 이 중 백엔드 포지션에 의미 있는 건 starkraft의 결정론적 시뮬레이션·프로토콜 버저닝 정도이며 우선순위는 낮다.

**Draft 노출**

`status: draft`는 배지가 붙은 채 공개된다. 현재 노출 중인 draft 36편:

- monticker 22편 — career-hub의 2026-08-16 결정은 "이력서에는 EMA 이벤트 탐지 + Claude Code 페어 개발만 남기고 CLOB·VaR·Kafka/Go/Netty·TimescaleDB 세부는 제외한다(면접에서 방어하기 어렵다)"였다. 그런데 블로그에는 제외하기로 한 세부 전부가 draft로 노출돼 있다. 검토자가 블로그에서 CLOB 매칭 엔진 글을 읽고 면접에서 물으면 이력서 전략과 충돌한다.
- spring-internals-lab 9편, spring-lite 5편 — 저장소는 완료 상태(20주, 217 테스트)인데 글만 미완이다.

**스타일**

- 시리즈 글 말미의 `👉` 이모지 — `AGENTS.md`의 "이모지 0 선호"에 어긋난다.
- `Archive` 카테고리가 2025년 글에도 남아 있다(규칙은 `Notes`).
- 영문 제목·한글 제목 혼재(`Preventing Cache Write Amplification under High Concurrency`, `Load Balancing Algorithms`).

## 2. 목표 한 줄

채용 담당자가 블로그를 3분 훑고 만들 한 줄:

> "정합성과 동시성이 걸린 돈의 흐름(정산·결제)을 계측 기반으로 구조화해 풀어온 백엔드 엔지니어. 실무에서 한 일을 수치와 함께 글로 남기고, 같은 원리를 개인 프로젝트에서 재현해 검증한다."

이 문장은 `facts/profile.md` 소개문 1·2와 정렬된다. 아래 모든 항목은 이 한 줄에 기여하는지로 채택 여부를 판단한다.

## 3. 작업 항목

### Tier D — 표면 정비 (글을 쓰지 않아도 되는 즉효 항목)

| # | 항목 | 내용 |
| --- | --- | --- |
| D1 | `_data/recruit_mode.yml` hero·strengths 재작성 | hero title을 이력서 소개문 1과 같은 축으로. strengths 4개를 `정합성·상태 전이 / 동시성·분산락 / 대량 배치 성능 / 레거시 재설계`로 교체. 각 카드 URL은 실무 시리즈로 연결 |
| D2 | `_data/representative_posts.yml` 대표 글 교체 | 대량 배치 4부(분산락 레이스) · 대량 배치 3부(청크 병렬) · 키 생성 병목 3부(완결 후) · parity-pay B3(작성 후). 그 전까지는 MVCC 대신 대량 배치 4부, Spring Lifecycle 대신 JSP 전환기 3편(CQRS) |
| D3 | `_data/capability_map.yml` 노드 재구성 | 클러스터 `systems`에 "정산·배치 정합성" 노드 추가, 대표 글을 실무 시리즈로 |
| D4 | GitHub pinned 6개 교체 | parity-pay, monticker, spring-internals-lab, redis-lite-java, spring-lite, starkraft |
| D5 | GitHub README 스택 배지 정리 | Kubernetes·Kafka·Maven 제거. 소개 3문장을 이력서 소개문과 같은 톤으로. 블로그 About과 문구 통일 |
| D6 | monticker draft 22편 상태 결정 | 이력서 노출 결정과 정렬: 아키텍처 3편 + EMA 이상 탐지 1편 + 관측성 2편 = 6편은 완성 후 `published`, 나머지 16편(CLOB·리스크 게이트·Quant Lab·Quant Analytics·Wallet·Testing)은 `archived`로 전환해 배지 노출을 끊는다. 더 자신 있어지면 되돌린다 |
| D7 | `운에 맡기던 배치` 1부 처리 | 대량 배치 시리즈 0부(서문)로 `series` 변경·병합하거나 `archived` |
| D8 | 스타일 정리 | `👉` 제거, 2025년 글의 `Archive` → `Notes`, JSP 전환기 5편 날짜를 원본 작성 시점으로 복원할지 판단 |

D1~D3은 `docs/features/recruit-mode-design.md`, `representative-posts-design.md`의 데이터 모델 안에서 값만 바꾸는 작업이다.

### Tier A — 이력서 bullet 1:1 대응 글

각 항목은 `interview-prep/question-trees.md`의 트리 번호와 대응한다. 회사 코드는 쓰지 않고 `interview-prep/technical-evidence.md`의 "재구성 예시" 방식을 그대로 따른다. 이미 이력서에 공개한 수치(2시간 → 5분 등)까지만 쓴다.

| # | 제목 (가제) | 대응 | 근거 facts | 연결할 기존 글 | 쓰기 전 확인 |
| --- | --- | --- | --- | --- | --- |
| A1 | 키 생성 병목을 추적해 구조를 바꾼 기록 Part 3 — 채번을 INSERT 시점으로 옮기고 range allocation으로 바꾸기 | Tree 9 | mcp-platform-revamp §4 | 같은 시리즈 1·2부 | range 크기 산정 기준, 결번 허용 여부 |
| A2 | 정산이 도는 동안 기준 데이터를 못 바꾸게 하기 — 상태 플래그와 AOP로 만든 경량 락 | Tree 3 | mds-global-distribution §1 | 대량 배치 5부(분산락)와 대비 | TTL 산정 원칙만 서술 |
| A3 | 폴링 배치를 SQS 이벤트 파이프라인으로 바꾼 이유 — 재시도, DLQ, 메시지 ID 멱등 | Tree 4 | mds-global-distribution §2 | `Bulkhead Pattern`, `Single Flight` 노트 | 멱등 키 저장소 방식 |
| A4 | Heap Dump가 가리킨 곳은 데이터가 아니라 영속성 컨텍스트였다 — Tasklet에서 Chunk로 | Tree 5 | batch-excel-optimization §1 | 대용량 엑셀 3편, `Java GC` 노트 | MAT에서 본 뷰(Dominator Tree 등) |
| A5 | ArchUnit 규칙을 480건 위반 위에 도입하기 — 신규 100% 강제, 레거시는 점진 정리 | Tree 10 | mcp-platform-revamp §5 | `응집도와 결합도`, `헬퍼 클래스는 안티패턴일까` | FreezingArchRule 실제 사용 여부 |
| A6 | Shadow Release — MyBatis 결과와 QueryDSL 결과를 나란히 비교하며 조회를 옮긴 기록 | Tree 7 | mcp-platform-revamp §3 | JSP 전환기 3편(CQRS) | 발견된 불일치 유형 |
| A7 | 모든 도메인이 100% 정합성을 요구하지는 않는다 — Post-Commit 이벤트와 재시도 3회 정책을 정한 기준 | Tree 11 | creator-studio §1 | `@TransactionalEventListener` 노트 2편 | 리스너 순서 의존성 |
| A8 | 결제대행 API 연동에서 "결과 불확실"을 어떻게 다뤄야 했는가 — 2021년에 몰랐고 지금은 아는 것 | tving Q1~Q3 | career.md 더파이러츠 | parity-pay B4와 짝 | 승인·취소 구현 범위 |

A1이 최우선이다. 끊긴 시리즈는 검토자에게 "마무리를 못 하는 사람"으로 읽힌다.

### Tier B — parity-pay 시리즈 (타깃 도메인 직결)

원고는 `parity-pay/reports/12-portfolio-technical-report-draft.md`와 `docs/09-consistency-recovery.md`에 있다. 보고서 §5 "DB 락 분석 — 추론을 측정으로 바꾸기", "측정 방법이 결론을 만들 뻔했습니다", §9-b "E2E가 목이 덮던 것을 드러냈습니다"처럼 **틀렸던 가설과 측정 실수를 함께 적은 부분**이 가장 차별화되는 재료다. 통과한 것만 쓰는 포트폴리오와 구분된다.

| # | 제목 (가제) | 실무 경험과 연결하는 문장 |
| --- | --- | --- |
| B1 | 장애가 나도 지켜야 할 금융 불변조건 6가지 — parity-pay를 시작한 이유 | 지분율 시스템의 상태 전이 모델이 "불변조건을 시스템이 강제한다"의 첫 경험이었다 |
| B2 | 이중부기 원장을 DB 제약과 트리거로 강제하기 — 애플리케이션 코드를 믿지 않는 이유 | MDS 경량 락이 애플리케이션 레벨 정합성이었고 race window가 남았던 경험 |
| B3 | 동시 잔액 차감과 멱등 키 — 락을 필요 이상으로 오래 쥐고 있었던 결함을 측정으로 찾은 기록 | 지분율 청크 트랜잭션에서 락 점유 시간을 줄인 원칙과 같음 |
| B4 | 외부 승인 응답이 사라졌을 때 — UNKNOWN 상태를 보존하고 수렴시키기 | 더파이러츠 결제대행 연동 당시 대비하지 못했던 상황(A8과 짝) |
| B5 | Transactional Outbox와 멱등 소비자 — DB와 메시지의 이중 쓰기 | MDS SQS 파이프라인의 메시지 ID 멱등(A3)을 한 단계 엄밀하게 |
| B6 | 대사(reconciliation) — "기관에 물어보지 못했다"와 "기관에 기록이 없다"를 코드에서 구분하기 | — |
| B7 | 26개 장애 실험이 찾아낸 11개 결함 — 문서나 코드를 읽어서 나온 것은 하나도 없었다 | 계측 기반 원인 추적(Heap Dump, Datadog)의 개인 프로젝트 버전 |

각 편 끝에 "실무에서는 어디까지 했고, 여기서는 무엇을 더 했는가"를 한 단락 넣는다. 개인 프로젝트를 실무 경험으로 오해시키지 않으면서, 원리의 연속성은 보여준다.

### Tier C — 기존 초안 완결

| # | 항목 | 편수 | 처리 |
| --- | --- | --- | --- |
| C1 | spring-internals-lab로 다시 읽는 Spring | 9 draft | 저장소 회고(`docs/retrospective/retrospective.md`)가 완성돼 있으므로 1 → 9 순으로 다듬어 `published`. "Spring을 블랙박스로 쓰지 않는다"의 증거 |
| C2 | spring-lite로 이해하는 Spring 구현 | 5 draft | C1 완료 후. 두 시리즈의 관계(lab = 분석, lite = 재구현)를 1부에 명시 |
| C3 | monticker 6편 (D6에서 남긴 것) | 6 draft | EMA 이상 탐지 편을 먼저. "α=0.1은 관습적 기본값이고 튜닝하지 않았다"를 정직하게 적는다 |

### 우선순위에서 뺀 것

- starkraft, iterview, code-drill, sys-drill, quno 소개 글 — 백엔드 정합성 축과 거리가 있다. 필요하면 "Claude Code로 문서 주도 개발하는 방식" 한 편에 묶어 `GitHub 블로그를 에이전틱 AI와 함께 운영하기`, `Claude Code를 개인 워크벤치처럼 쓰는 방법` 뒤에 붙인다.
- 개념 노트(캐시, HTTP, OS) 추가 — 이미 충분하다. 새 개념 글보다 실무 글 한 편이 낫다.
- TIL — 계속 쓰되 채용 표면에서는 노출하지 않는다.

## 4. 글쓰기 규칙 (이 계획 전용)

- `facts/`에 없는 수치는 글에도 쓰지 않는다. "확인 필요" 항목은 산정 원칙만 서술한다. 예: "TTL은 작업의 예상 최대 소요 시간에 여유를 둔 값으로 잡았다".
- 회사 코드·내부 인프라 구성·장애의 기밀 세부는 쓰지 않는다(`RESUME_GUIDE.md` §1). 코드는 원리를 보여주는 재구성 예시임을 글 안에서 밝힌다.
- 이력서에 쓴 표현과 글의 표현을 맞춘다. 면접관이 이력서를 읽고 블로그를 열었을 때 같은 이야기여야 한다. 반대로 블로그에서 이력서보다 더 큰 주장을 하지 않는다.
- 역할 범위를 정직하게 쓴다. MDS는 시니어가 설계한 계약 위에서 구현했고, MCP는 본인이 설계했고, 클라우드 전환은 참여였다. facts의 역할 서술을 그대로 따른다.
- 구조는 이 블로그의 Problem → Decision → Result 카드(`docs/features/problem-decision-result-design.md`)를 쓰되, 모든 글을 같은 틀로 찍어내지 않는다(`RESUME_GUIDE.md` "정형화된 패턴에 갇히지 않는다").
- 어투·이모지·front matter 규칙은 `AGENTS.md`와 `docs/guides/content-writing-style-guide.md`를 따른다. `status`는 완성 전까지 `draft`로 두지 말고, 완성될 때까지 커밋하지 않거나 로컬에만 둔다. Draft 배지는 채용 표면에서 비용이다.

## 5. 일정 — 12주

2026-03 이후 페이스를 보면 주 1편이 현실적인 상한이다. 표면 정비를 먼저 끝내 글이 한 편도 안 나와도 채용 표면이 개선된 상태를 만든다.

| 주차 | 작업 |
| --- | --- |
| 1~2주 | D1~D8 전부. 특히 D6(monticker 16편 archived)과 D4(pinned)는 하루 안에 끝난다 |
| 3주 | A1 키 생성 병목 3부 — 미완 시리즈 완결 |
| 4주 | A2 정산 중 수정 차단 |
| 5주 | A4 Heap Dump → Chunk |
| 6주 | A3 SQS 이벤트 파이프라인 |
| 7주 | B1 불변조건 6가지 + B3 멱등·동시 차감 (보고서 재편집이라 2편 가능) |
| 8주 | B4 UNKNOWN 수렴 + A8 결제대행 연동 회고 (짝으로) |
| 9주 | B7 26개 실험·11개 결함 |
| 10주 | A5 ArchUnit + D2 대표 글 최종 교체 |
| 11주 | C1 spring-internals-lab 1~5부 published |
| 12주 | C1 6~9부, A6·A7 착수 여부 판단 |

B2·B5·B6, C2·C3은 13주차 이후로 넘긴다. 지원 일정이 앞당겨지면 3~6주차(A1~A4)를 먼저 끝내고 나머지를 미룬다. A1~A4가 면접 질문 트리 3·4·5·9와 직결된다.

## 6. 완료 기준

- `/recruit` 대표 글 4개가 전부 실무 성과 또는 parity-pay 글이다.
- 공개 Draft 배지 0편(published 또는 archived).
- "다음 글에서"로 끝나는 미완 시리즈 0개.
- GitHub pinned 6개가 블로그 시리즈와 1:1로 대응한다.
- career-hub `facts/`의 "확인 필요" 항목 중 글을 쓰며 복원된 것은 facts에 반영한다(청크 크기, TTL 원칙, MAT 뷰, 멱등 저장소).
- 채용 담당자가 블로그에서 읽을 수 있는 이야기와 이력서·면접 답변이 같은 이야기다.
