---
title: "LINE 「일본어 상품 검색 정확도 높이기: Elasticsearch + Kuromoji에서 OpenSearch + Sudachi로」 리뷰 — 형태소 분석기를 바꿔도 모델 번호와 나카구로는 안 풀리고, 그래서 Multi-field가 필요하다"
date: 2026-08-24
categories: [TechBlog, LINE]
tags: [Tech Blog Review, LINE, OpenSearch, Elasticsearch, Search, Japanese NLP, Sudachi, Kuromoji, E-Commerce]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 52
source_url: https://techblog.lycorp.co.jp/ko/japanese-search-kuromoji-to-sudachi
---

원문: [일본어 상품 검색 정확도 높이기: Elasticsearch + Kuromoji에서 OpenSearch + Sudachi로](https://techblog.lycorp.co.jp/ko/japanese-search-kuromoji-to-sudachi) — LY Corporation Tech Blog, 김진성(LINE Plus 통합 커머스), 2026-08-21

## 한 줄 요약

일본 담당자의 "검색이 안 된다"는 불만의 뿌리는 둘이었다. Kuromoji를 기본 설정 그대로 썼고, 그 사전(IPADIC)은 **2007년 8월 이후 갱신이 멈췄다**. 'スマートフォンケース'가 4조각으로, 품종명 'こしいぶき'가 'こす/いぶき'로 갈라졌고, 그때마다 사용자 사전에 단어를 추가하는 방식은 지속될 수 없었다. 사내 검색 플랫폼이 Elasticsearch 7.10.2를 일몰하고 OpenSearch 2.15.0을 지원하는 시점과 Sudachi의 OpenSearch 2.6+ 지원이 맞물려 전환했다. 그런데 분석기 교체로는 **모델 번호('AW-10DP3' vs 'aw10dp3')와 일본어 구분자(전각·반각 나카구로, 전각 스페이스, 물결표)**가 해결되지 않아, 하나의 필드를 여러 용도로 색인하는 Multi-field 전략(compact·edge·keyword)과 인덱스별 검색 모드를 설계했다.

## 배경: 세 가지 문제

2025년 초 통합 커머스 프로젝트가 시작되고, 안정화 중 일본 담당자로부터 공통된 불편이 보고됐다. 원인은 운영(기본 설정, 상품명 특성에 맞춘 튜닝 없음)과 사전(IPADIC 2.7.0-20070801)의 복합이었다. 8.x의 개선은 사내 플랫폼이 7.10.2까지만 지원해 선택지가 아니었다.

1. **복합어를 의미 단위보다 잘게 분해.** 'スマートフォンケース' → Kuromoji는 'スマートフォンケース/スマート/フォン/ケース' 4토큰, Sudachi는 'スマートフォン/ケース' 2토큰.
2. **신조어·고유명사에 취약.** '新潟県産 こしいぶき'(니가타현산 코시이부키 쌀)로 검색하면 상품이 안 나온다. Kuromoji는 '新潟/県/産/こす/いぶき'로 갈라 품종명을 인식하지 못하고, Sudachi는 '新潟県/産/こしいぶき'로 지역명과 품종명을 모두 잡는다. 사용자 사전에 넣으면 그 순간은 되지만 누락되는 품종·지명·신조어가 계속 쌓이는 구조가 문제였다.
3. **영문/숫자 혼합과 특수 구분자.** 'LDA12L-G-10T62P'는 Kuromoji든 Sudachi든 'LDA/12/L/G/10/T/62/P'로 쪼개져 부분 토큰 매칭으로 엉뚱한 문서가 섞인다. 머천트마다 'AW-10DP3', 'AW_10DP3', 'aw10dp3'로 다르게 등록한다. 나카구로는 전각(U+30FB)과 반각(U+FF65)이 따로 있고 전각 스페이스, 물결표까지 혼용된다. **이것은 분석기를 바꿔도 해결되지 않는다.**

## 왜 OpenSearch + Sudachi인가

기술적 필요만으로 검색 엔진을 바꾸기는 어렵다. 이번엔 인프라가 조건을 만들었다. 사내 플랫폼(Verda, 향후 Flava)이 ES 7.10.2를 일몰하고 OpenSearch 2.4.1과 2.15.0을 지원했다. 검토 시점(2025년 4월경) Sudachi 플러그인은 OpenSearch 2.6~2.14를 CI 통합 테스트 포함 공식 지원했다. 2.4.1은 범위 밖, 2.15.0은 2.14 직후 버전이라 동일 메이저 라인이고 검증에서 문제가 없었다(현재는 2.6~2.19로 확장돼 완전히 포함).

Sudachi(Works Applications)는 복합어를 의미 단위로 유지하고 최신 사전 기반이라 신조어에 유리하다. `split_mode`로 분석 단위를 고른다. C(기본)는 고유명사·복합어를 한 토큰으로('選挙管理委員会'), B는 중간('選挙/管理/委員会'), A는 최소 형태소('選挙/管理/委員/会'). 상품명은 C가 맞고, `sudachi_split` 필터를 같이 쓰면 복합어를 유지하면서 세분 토큰도 추가해 재현율을 높인다. 사전에 없는 단어가 이상하게 갈라져 동의어 확장('携帯' ↔ 'スマホ')이 안 되던 문제도 Sudachi에서는 한 토큰으로 안정되어 synonym 필터와 궁합이 좋고, Sudachi 프로젝트가 동의어 데이터셋도 제공한다. Works Applications가 OpenSearch 호환 브랜치(os-2.6-plus)를 독립적으로 유지해 엔진 전환과 analyzer 교체를 동시에 할 수 있었다.

## 핵심 설계: Multi-field

인덱스는 둘이다. **상품 인덱스**는 수많은 머천트가 직접 등록한 약 8억 건, **카탈로그 인덱스**는 운영이 정제한 약 1억 건. 둘 다 `sudachi_analyzer`가 기본이지만 요구가 다르다.

| 서브 필드 | 어디에 | 목적 |
| --- | --- | --- |
| `productName.compact` | 상품 | 구분자가 다른 모델 번호를 같은 토큰으로 수렴 |
| `productName.edge` | 카탈로그 | 관리자 자동완성(Edge N-gram) |
| `keyword` + `compact_normalizer` | 둘 다 | 정규화된 전체 문자열을 단일 토큰으로, 완전 일치(EXACT) |

**compact_product_name_analyzer.** `sudachi_analyzer`는 icu_normalizer로 전각·반각을 맞춘 뒤 Sudachi tokenizer에 넘기는데, 문제는 그다음이다. compact는 tokenizer 선택으로 푼다. icu_normalizer → `model_delim_to_space`(-, _, / → 공백) → `punct_to_space`(나카구로·물결표 → 공백) → `collapse_spaces`(연속 공백 정리) 순의 커스텀 char_filter 파이프라인이고, 색인과 검색 양쪽에 같이 적용되어 'AW-10DP3'로 찾든 'aw10dp3'로 찾든 같은 토큰이 된다. 단, compact를 모든 쿼리에 붙이면 'スマホ'처럼 짧은 일본어 검색에 엉뚱한 상품이 섞이므로 **길이 3자 초과 + 영숫자 포함일 때만** 조건부로 추가한다.

**Edge N-gram.** 'スマートフォン'을 min=2, max=10으로 색인하면 'スマ', 'スマー', … 'スマートフォン' 토큰이 생겨 'スマ'만 쳐도 매칭된다. 자동완성에는 관련성 점수가 의미 없고 접두사 일치를 빨리 돌려주는 것이 전부다. 이것을 **8억 건 상품 인덱스에는 넣지 않았다.** 단어마다 접두사 토큰이 전부 생기니 문서 수가 많을수록 인덱스 크기와 색인 비용이 직결되고, 상품명은 비정형이라 토큰 증가를 예측할 수 없다. 카탈로그는 1억 건이고 정제돼 있어 감당 가능하며 매칭 작업 편의가 크다. "기능을 추가할 수 있다는 것과 추가해야 한다는 것은 다른 문제다."

## 쿼리로 연결하기

필드에 용도를 줬으면 쿼리도 그에 맞게 명시해야 한다.

상품 인덱스: PARTIAL(기본, match AND, 단어 포함), PHRASE_EXACT_LIKE(match_phrase, 순서까지), EXACT(keyword term). compact는 독립 모드가 아니라 앞의 두 모드에 조건부로 얹는 보완 검색이다.

카탈로그 인덱스: PHRASE(기본, match_phrase + edge 보조를 should로), MATCH(match AND + edge 보조), EDGE(constant_score + edge, 스코어링 없이 접두사만, 자동완성 전용), EXACT. 카탈로그명은 정제돼 edge 접두사 토큰의 신뢰도가 높아 기본 모드에도 보조로 쓴다.

마무리는 겸손하다. 현재 실제 상품을 색인하며 운영 중이고, 검색 로그와 모드별 사용 패턴으로 나아졌는지 데이터로 확인할 계획이며, "완성된 시스템이 아니라 개선 중인 시스템"이다.

## 읽고 남는 질문

- 전환 전후의 검색 품질 지표(zero-result 비율, 클릭률, 담당자 문의 수)가 없다. "데이터로 확인할 계획"이라 했으니 후속이 기대된다.
- 8억 건을 Kuromoji에서 Sudachi로 재색인하는 데 걸린 시간과 전환 중 서비스 유지 방식(별칭 스왑인지 이중 색인인지)이 운영 관점에서 가장 궁금하다.
- compact의 "3자 초과 + 영숫자 포함" 규칙은 휴리스틱이다. 'iPhone 15'처럼 영숫자가 들어간 일반 상품명에서 compact가 오히려 노이즈를 만드는 경우는 없는지, 규칙을 어떻게 조정해 갈지가 있으면 좋겠다.

## 한 줄로 가져가기

형태소 분석기는 언어의 문제를 풀고, 상품 데이터의 문제(모델 번호, 구분자, 자동완성)는 필드 설계와 쿼리 모드가 푼다. 그리고 Edge N-gram처럼 비싼 기능은 "넣을 수 있는가"가 아니라 "이 규모에서 감당되는가"로 결정한다.
