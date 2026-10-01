---
title: "ISMS 대응을 위한 로그 수집 체계 개선"
date: 2025-05-22
categories: [Notes, Common]
tags: [Logging, ISMS, Elasticsearch, Kibana, Audit Log]
---

JSON 포맷, MDC, Filebeat, Elasticsearch, Kibana로 감사 로그 대시보드를 만든 과정입니다. 각 요소의 일반적인 사용법은 [백엔드 시스템 로깅 베스트 프랙티스](/posts/logging-system-best-practice/)에서 다뤘습니다.

## 배경: 왜 로그 시스템을 개선해야 했는가

정보보호 관리체계(ISMS) 인증을 준비하면서 가장 강하게 마주한 요구사항 중 하나는 감사 추적의 정밀도와 실시간 대응력이었습니다.

그런데 기존 시스템은 이 요구를 채우지 못했습니다. 로그 형식이 모호해서 기계적으로 검색하기 어려웠고, 로그만으로는 사용자를 식별하기 어려웠으며, 특정 기능의 호출 이력을 추적하는 데 시간이 오래 걸렸습니다. 그래서 다음 목표로 로그 수집 체계를 전면 개편했습니다.

* 로그 포맷의 일관성과 구조화
* 사용자 및 요청 단위 추적 가능성 확보
* 기능/메뉴 단위 감사 식별자 정의
* 실시간 조회 및 모니터링 체계 마련

---

## 개선 방향

### 1. 로그 포맷 표준화: JSON 기반 구조 설계

가장 먼저 로그 포맷을 JSON 기반으로 통일했습니다.

```json
{
  "timestamp": "2025-05-22T10:00:00Z",
  "level": "INFO",
  "service": "account-service",
  "menuCode": "USER_001",
  "actionCode": "LOGIN_ATTEMPT",
  "userId": "user_12345",
  "clientIp": "192.168.0.1",
  "traceId": "abc123xyz",
  "message": "사용자 로그인 시도"
}
```

* `menuCode`, `actionCode`는 내부적으로 정의한 기능 단위별 식별 코드입니다. 감사 로그를 기능별로 분류하고 필터링하는 기준이 됩니다.
* 모든 로그가 같은 JSON 필드를 가지므로, 수집과 조회를 필드 단위로 할 수 있게 되었습니다.

---

### 2. MDC(Mapped Diagnostic Context) 기반 사용자 추적

포맷을 통일해도 로그 한 줄에 사용자와 요청 정보가 없으면 행위를 사용자에게 연결할 수 없습니다. 그래서 Spring Boot + Logback 조합에서 MDC를 활용해 사용자 및 요청 단위 식별자(traceId)를 로그에 자동 삽입하도록 구성했습니다.

```java
MDC.put("userId", user.getId());
MDC.put("traceId", UUID.randomUUID().toString());
```

이를 통해 다음과 같은 식별이 가능해졌습니다.

* 특정 사용자의 행위 로그 조회
* 하나의 요청 흐름(traceId)에 속한 로그 전체 추적
* 다중 사용자 동시 요청 시 컨텍스트 분리

마지막 항목은 MDC가 값을 스레드별로 보관하기 때문에 성립합니다([Logback 매뉴얼](https://logback.qos.ch/manual/mdc.html)). 같은 이유로 자식 스레드나 `Executors`로 넘긴 작업에는 MDC가 자동으로 이어지지 않으므로, 비동기 구간에서는 값을 복사해 넘겨야 합니다.

---

### 3. Filebeat → Elasticsearch → Kibana 연동

수집된 로그는 로컬 파일에 저장되며, 이를 Filebeat가 감지하여 Elasticsearch로 전송합니다.

* Filebeat에서 로그 파일을 JSON으로 파싱하여 전송. Filebeat는 줄 단위로 읽으므로 로그 한 건을 한 줄의 JSON으로 출력해야 합니다([Filebeat 문서](https://www.elastic.co/guide/en/beats/filebeat/current/filebeat-input-filestream.html)).
* Elasticsearch에 인덱싱되면서 구조화된 형태로 저장
* Kibana를 통해 실시간 대시보드 구성 및 조건별 필터링 UI 제공

> 예시 대시보드:
>
> * 특정 기간 내 로그인 실패 이력
> * 사용자별 최근 접근 기능 목록
> * 기능별 사용 빈도 및 에러 발생률

---

## 기대 효과

| 개선 전          | 개선 후              |
| ------------- | ----------------- |
| 로그 포맷 불일치     | JSON 기반 표준화       |
| 사용자 정보 식별 어려움 | MDC 기반 사용자 식별 가능  |
| 기능 단위 추적 어려움  | 메뉴/액션 코드 정의로 구조화  |
| 수작업 추적        | Kibana 실시간 필터링 가능 |
| 감사 대응 지연      | 즉시 검색 및 다운로드 가능   |

---

## 결과 및 성과

* ISMS 인증 심사 3회 연속 통과
* 보안 감사 응대 시간 평균 70% 단축
* 담당자들로부터 "감사 로그 분석이 쉬워졌다"는 피드백 확보
* 타 부서에서도 해당 로그 포맷 및 대시보드 체계를 도입 요청

---

## 마무리하며

보안 로그는 시스템의 상태를 추적하고 사용자의 행위를 설명하며 보안 위협에 대응하는 데이터입니다. 이번 개선은 인증 체크리스트 대응을 넘어, 시스템 관측성과 추적 가능성을 확보한 작업이었습니다.

## 참고

* [Logback Manual, Chapter 8: Mapped Diagnostic Context](https://logback.qos.ch/manual/mdc.html)
* [Filebeat Reference: filestream input](https://www.elastic.co/guide/en/beats/filebeat/current/filebeat-input-filestream.html)

---
