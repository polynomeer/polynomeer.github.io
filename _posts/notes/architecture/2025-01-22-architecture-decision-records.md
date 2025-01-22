---
title: "ADR(Architecture Decision Record) - 결정의 맥락을 결정과 함께 남기기"
date: 2025-01-22
status: published
categories: [Notes, Architecture]
tags: [Architecture, ADR, Decision Making, Documentation]
---

[Tomcat 스레드 고갈 실험](/posts/tomcat-thread-exhaustion/)에는 "부하는 open 모델이다"라는 문장 옆에 ADR-001 링크가 붙어 있다. 본문은 open 모델을 쓴다는 사실만 말한다. 왜 closed 모델이 아닌지, 그 선택 때문에 결과 표를 어떻게 적어야 하는지는 ADR에 따로 적혀 있다.

이 글은 ADR이 무엇이고, 어떤 형식으로 쓰고, 언제 쓰는지를 정리한다. 예시로 그 ADR-001을 그대로 쓴다.

## ADR은 결정 하나를 적은 짧은 문서다

ADR은 Architecture Decision Record의 줄임말이다. adr.github.io는 ADR을 아키텍처상 중요한 결정 하나를 그 근거, 트레이드오프, 결과와 함께 적은 문서로 정의한다. 그리고 ADR을 모은 것이 프로젝트의 결정 로그(decision log)가 된다고 설명한다([adr.github.io](https://adr.github.io/)).

핵심은 "하나"다. 설계 문서 한 권에 여러 결정을 섞지 않는다. 결정 하나에 문서 하나를 쓰고 번호를 붙인다.

## 왜 남기는가

이 형식을 널리 알린 것은 Michael Nygard의 2011년 글 "Documenting Architecture Decisions"다([Nygard, 2011](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions)). Nygard는 결정의 이유를 모르는 사람이 프로젝트에 들어왔을 때 할 수 있는 일이 둘뿐이라고 본다.

- **그대로 따른다.** 맥락이 바뀌어 다시 볼 결정인데도 손대지 못한다.
- **그냥 바꾼다.** 그 결정이 지키던 것을 모르는 채 바꿔 프로젝트의 가치를 깎는다.

ADR은 세 번째 선택지를 만든다. 결정할 때의 맥락을 읽고, 그 맥락이 아직 유효한지 보고 나서 따르거나 바꾼다.

## Nygard의 형식: 제목, 상태, 맥락, 결정, 결과

Nygard가 제안한 항목은 다섯이다.

| 항목 | 적는 것 |
| --- | --- |
| 제목 | 짧은 명사구 |
| 상태 | 합의 전이면 proposed, 합의되면 accepted. 뒤의 ADR이 바꾸거나 뒤집으면 deprecated 또는 superseded와 대체 문서 링크 |
| 맥락 | 결정을 압박하는 힘. 기술적인 것뿐 아니라 정치적·사회적·프로젝트 고유의 사정 |
| 결정 | 그 힘에 대한 대응. 능동태의 완결된 문장 |
| 결과 | 결정을 적용한 뒤의 상황. 긍정적인 것만이 아니라 부정적·중립적인 결과까지 전부 |

운영 규칙도 몇 가지 붙어 있다. 저장소 안에 `doc/arch/adr-NNN.md` 같은 경로로 둔다. 번호는 순서대로 붙이고 재사용하지 않는다. 결정을 뒤집어도 옛 문서를 지우지 않고 superseded로 표시해 남긴다. 분량은 한두 쪽이다.

Nygard 형식 말고도 MADR, Y-statement 같은 템플릿이 있다([adr.github.io](https://adr.github.io/)). 항목 이름은 달라도 "맥락 → 결정 → 결과"의 뼈대는 같다.

## 예시: spring-ops-lab ADR-001

[ADR-001: 부하 모델의 기본은 open model](https://github.com/polynomeer/spring-ops-lab/blob/main/docs/adr/001-open-model-load-as-default.md)을 항목별로 줄이면 다음과 같다.

- **상태**: 채택, 2026-09-23.
- **맥락**: closed 모델은 가상 사용자 수를 고정하고, 각 사용자가 응답을 받은 뒤 다음 요청을 보낸다. open 모델은 도착률을 고정한다. 서버가 느려지면 closed 모델은 요청을 덜 보낸다. 부하가 저절로 줄어 꼬리 지연이 실제보다 짧게 나온다. 이것이 [coordinated omission](/posts/percentile-statistics/)이다. 실제 사용자는 그렇게 기다려 주지 않는다.
- **결정**: k6의 기본 실행기는 `constant-arrival-rate`(open 모델)로 한다. `constant-vus`(closed 모델)는 두 모델의 차이를 보이는 대조군으로만 쓴다. VU는 목표 RPS와 최대 지연의 곱보다 넉넉히 잡는다.
- **결과**: 결과 표에 목표 RPS와 실제 RPS를 함께 싣는다. `dropped_iterations`가 보고되면 실행을 폐기하고 다시 잰다. closed 모델 수치를 open 모델 결과와 같은 표에 섞지 않는다.

결과 항목이 이 ADR에서 가장 쓸모 있는 부분이다. 결정 자체는 한 줄이지만, 그 결정 때문에 앞으로 모든 실험 글이 지켜야 할 규칙 세 가지가 생겼다. 나중에 누군가 "결과 표에 실제 RPS 열은 왜 있나"라고 물으면 답이 이 문서에 있다. Nygard도 한 ADR의 결과가 다음 ADR의 맥락이 되기 쉽다고 적었다.

## 언제 쓰는가

모든 결정에 쓰지는 않는다. adr.github.io는 대상을 아키텍처상 중요한 요구, 즉 시스템의 구조나 품질에 측정 가능한 영향을 주는 요구에 대한 결정으로 한정한다. 실무에서 쓸 만한 기준은 다음 정도다.

- 되돌리기 비싸다. 데이터 형식, 저장소 선택, 통신 방식 같은 것.
- 여러 글이나 모듈이 그 결정에 기대고 있다. ADR-001처럼 모든 실험의 측정 방식을 정하는 것.
- 다른 선택지가 그럴듯해서, 나중에 누군가 다시 물을 것이 뻔하다.

코드 리뷰에서 같은 질문이 두 번 나오면 ADR로 옮길 때가 된 것이다.

## 정리

- ADR은 결정 하나와 그 맥락, 결과를 한두 쪽에 적어 저장소 안에 번호를 붙여 두는 문서다.
- 남기는 이유는 나중에 오는 사람이 "그대로 따르기"와 "그냥 바꾸기" 사이에서 근거를 갖고 고르게 하려는 것이다.
- 결과 항목에는 좋은 점만이 아니라 그 결정 때문에 생기는 규칙과 비용을 전부 적는다.
- 결정이 뒤집혀도 옛 ADR은 지우지 않고 superseded로 남긴다. 결정이 어떻게 바뀌어 왔는지도 기록이다.

## 참고

- [Michael Nygard, Documenting Architecture Decisions (2011)](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [Architectural Decision Records (adr.github.io)](https://adr.github.io/)
- [spring-ops-lab ADR-001: 부하 모델의 기본은 open model](https://github.com/polynomeer/spring-ops-lab/blob/main/docs/adr/001-open-model-load-as-default.md)
- [무너지는 Spring 서버 1 - Tomcat 스레드 고갈](/posts/tomcat-thread-exhaustion/)
