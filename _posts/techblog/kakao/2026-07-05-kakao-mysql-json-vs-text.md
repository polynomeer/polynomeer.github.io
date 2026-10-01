---
title: "카카오 「MySQL Json 데이터 타입의 저장 구조와 성능 비교」 리뷰 — 통째로 넣고 통째로 꺼내면 TEXT, 키로 파고들면 JSON"
date: 2026-07-05
categories: [TechBlog, Kakao]
tags: [Tech Blog Review, Kakao, MySQL, JSON, InnoDB, Storage Format, Performance, Database]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 44
source_url: https://tech.kakao.com/posts/774
---

원문: [MySQL Json 데이터 타입의 저장 구조와 성능 비교](https://tech.kakao.com/posts/774) — kakao tech, 2025-09-18

## 한 줄 요약

MySQL의 JSON 타입은 문자열을 그대로 저장하지 않고 파싱 → 바이너리 직렬화 → 유효성 검사를 거쳐 타입·키 개수·오프셋 테이블이 붙은 구조로 저장하고, 읽을 때는 역직렬화해 문자열로 다시 만든다. TEXT는 받은 그대로 넣고 그대로 꺼낸다. 그래서 `{"a":"x","b":"y","c":"z"}`가 JSON 타입에서는 35바이트, TEXT에서는 25바이트다. 원문의 결론은 저장하고 통째로 읽기만 하면 TEXT가 빠르고, `JSON_EXTRACT()`처럼 키로 접근하면 JSON이 훨씬 빠르다는 것이다. 키 접근이 빠른 이유는 원문이 따로 설명하지 않아서, 아래에서 MySQL 문서로 보충한다.

## 배경

5.7.8부터 JSON 타입이 있다. 장점은 유효성 보장과 JSON에 최적화된 저장 방식이다. 그런데 JSON 문자열을 TEXT에 넣어도 되니, 둘 중 무엇이 언제 유리한지를 저장 구조부터 따져 본 글이다. 원문은 `hexdump`로 ibd 파일을 열어 `supremum`을 찾아 실제 저장 위치를 확인한다.

## 저장: 직렬화 3단계

JSON 타입에 저장하면 `Item::save_str_value_in_field()` → `Field_json::store()`에서 `parse()`, `serialize()`, `store_binary()`가 순서대로 불린다.

1. JSON 인스턴스 생성: `sql_common/json_dom.h`의 `Json_dom` 서브클래스로 만든다. `Json_object`는 키로 빠르게 찾으려고 `std::map`, `Json_array`는 순서 보존을 위해 벡터를 쓴다.
2. 직렬화: 저장용 바이너리로 변환.
3. 저장: `store_binary()`에서 JSON 형식 검사 후 `Field_blob::store()`.

TEXT는 이 과정이 없다. 원문은 직렬화와 유효성 검사라는 이 추가 작업이 성능 차이의 주요 요인이라고 본다.

## 바이너리 구조

ibd에 저장된 `Json_object`는 이렇게 생겼다.

| 요소 | 크기 | 의미 |
| --- | --- | --- |
| Type | 1B | 문서 유형(SMALL_OBJECT, LARGE_OBJECT 등, `json_binary.cc` 매크로) |
| Key Count | 2B(small) / 4B(large) | 키 개수 |
| Value Size | 2B / 4B | 이 객체의 총 바이트 |
| Key Entry × n | 4B씩 | 각 키의 오프셋 + 길이 |
| Value Entry × n | 3B씩 | 각 값의 타입 + 오프셋 |
| Key List | 가변 | 키 문자열들이 이어서 |
| Value List | 가변 | 값들이 이어서 |

키와 값이 `key:value`로 섞여 있지 않고 키 목록과 값 목록이 분리돼 있으며, 앞에 오프셋 테이블이 있다. 여기까지가 원문의 분석이다. 이 구조가 무엇에 쓰이는지는 [MySQL 문서](https://dev.mysql.com/doc/refman/8.0/en/json.html)가 직접 말한다. "The binary format is structured to enable the server to look up subobjects or nested values directly by key or array index without reading all values before or after them in the document." (서버가 문서의 앞뒤 값을 모두 읽지 않고 키나 배열 인덱스로 하위 값에 바로 접근하게 하는 구조다.)

## 크기 비교

예제 `{"a":"x","b":"y","c":"z"}`(키 3개, 키 문자열 3B, 값 문자열 3B).

- JSON: Type 1 + Key Count 2 + Value Size 2 + Key Entry 4×3 + Value Entry 3×3 + Key List 3 + Value List(값마다 1B + 값 문자열 3) 3×1 + 3 = 35B
- TEXT: 중괄호 2 + 구분 문자(따옴표·콜론·쉼표) 3×6−1 = 17 + 3 + 3 = 25B

메타 정보 때문에 JSON이 더 크다. 원문은 여기에 단서를 붙인다. TEXT는 받은 문자열을 그대로 저장하므로 공백·줄바꿈이 많은 예쁜 JSON을 넣으면 그것까지 다 저장된다. JSON 타입은 불필요한 문자를 제거하고 저장하므로, 그런 입력에서는 오히려 TEXT가 커질 수 있다.

## 읽기: 역직렬화

JSON 타입은 ibd의 바이너리를 읽어 JSON 객체를 만들고, 그 객체로 문자열을 생성해 클라이언트에 보낸다. TEXT는 변환 없이 보낸다. 즉 JSON 타입은 쓰기와 읽기 양쪽에 변환 비용이 있다.

## 성능 결론

원문은 여러 시나리오를 돌렸지만 요점만 정리했다.

TEXT가 유리한 경우는 JSON을 저장하고 전체를 꺼내는 단순 저장·읽기(SELECT에서 JSON 함수 없이 컬럼 전체를 읽는 것). 직렬화·역직렬화가 없어 빠르다. 유효성 검사는 못 하지만 애플리케이션에서 할 수 있는 영역이다.

JSON이 유리한 경우는 JSON 함수로 가공하는 경우, 특히 키로 값을 추출하는 경우다. `JSON_EXTRACT()`를 SELECT에 쓴 QPS(초당 쿼리 수) 비교에서 큰 차이가 났다. 원문은 TEXT 컬럼에도 JSON 함수를 쓸 수는 있지만 JSON 컬럼 쪽이 훨씬 빠르다고만 쓴다. 나는 그 차이를 파싱에서 찾는다. 문서는 바이너리로 저장된 값을 읽을 때 텍스트에서 다시 파싱할 필요가 없다고 적는다. 다른 JSON 함수는 결과가 다를 수 있다는 단서가 붙어 있다.

마무리는 "완벽한 정답은 없지만 원리를 알면 최선의 선택은 할 수 있다"이다.

## 읽고 남는 질문

- QPS 그래프의 수치가 본문에 없다. TEXT 대비 몇 배인지, 문서 크기(키 수백 개짜리)에서 차이가 어떻게 커지는지가 있으면 선택 기준이 더 명확하다.
- WHERE 절에서 JSON 키를 조건으로 쓰는 경우(생성 컬럼 + 인덱스, 8.0의 multi-valued index)는 다루지 않았다. 실무에서 JSON 타입을 택하는 가장 큰 이유가 그것이라 아쉽다.
- 부분 업데이트(`JSON_SET`으로 일부만 바꿀 때 8.0의 partial update와 binlog `binlog_row_value_options=PARTIAL_JSON`)는 JSON 타입만의 큰 장점인데 언급이 없다. 쓰기 성능 비교에 이 요소가 들어가면 결론이 달라질 수 있다.

## 한 줄로 가져가기

JSON 타입의 비용은 저장할 때 파싱해 오프셋 테이블을 만들고, 통째로 읽을 때 다시 문자열로 되돌리는 것이다. 그 비용은 키로 접근할 때만 돌아온다. 통째로만 다룬다면 그 비용을 낼 이유가 없다.

## 참고

- [MySQL Json 데이터 타입의 저장 구조와 성능 비교](https://tech.kakao.com/posts/774) — kakao tech, 2025-09-18
- [MySQL 8.0 Reference Manual: The JSON Data Type](https://dev.mysql.com/doc/refman/8.0/en/json.html) — 바이너리 저장 형식, 부분 업데이트
