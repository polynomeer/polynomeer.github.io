---
title: "LINE 「장애 Alert의 원인을 스스로 찾다: SRE Observer 개발기」 리뷰 — 알림을 세 축으로 묶고, 다섯 가설을 강제하고, 근거 없는 확신은 가드레일이 깎는다"
date: 2026-09-08
status: draft
categories: [TechBlog, LINE]
tags: [Tech Blog Review, LINE, SRE, AIOps, LLM, MCP, Observability, Root Cause Analysis, Incident Response]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 68
source_url: https://techblog.lycorp.co.jp/ko/building-sre-observer-for-alert-root-cause-analysis
---

원문: [장애 Alert의 원인을 스스로 찾다: SRE Observer 개발기](https://techblog.lycorp.co.jp/ko/building-sre-observer-for-alert-root-cause-analysis) — LY Corporation Tech Blog, LINE Plus Home SRE 팀, 2026-09-04

## 한 줄 요약

새벽 3시 알림이 오면 사람은 대시보드 → 로그 → 트레이스 → 프로파일을 차례로 열어 머릿속에서 연결한다. SRE Observer는 그 연결을 사람이 개입하기 전에 시스템이 하게 만든 파이프라인이다. 알림을 **Semantic(LLM 유사도) > Topology(Tempo 의존 관계) > Temporal(시간 근접)** 세 축의 가중 점수로 하나의 Incident에 병합하고, LLM 에이전트가 **다섯 가설(배포·자원·외부 의존성·코드·인프라)을 반드시 열거**하며 rule-in/rule-out/cannot-verify로 검증하고, 도구 호출마다 Evidence Ledger에 근거를 쌓아 결론을 재검증하며, 근거가 부족하면 원인을 `other`로 **강등**하고 심각도를 '추정'에 둔다. 보고와 멘션은 자동, Pod 재시작·롤백은 Slack 승인 게이트 뒤에. 결과는 초기 알림 노이즈 85~95% 차단, MTTR 50% 단축.

## 배경: 세 가지 문제와 직접 만든 이유

- **알림 폭탄**: 업스트림 하나가 흔들리면 다운스트림들이 줄줄이 타임아웃을 내고 각자 알림을 보낸다. "같은 장애인가 다른 장애인가"부터 사람이 판단해야 했다.
- **수동 RCA**: LGTM-P(Loki·Grafana·Tempo·Mimir·Pyroscope)로 데이터는 한곳에 모였지만 "이 메트릭 이상을 어떤 로그·트레이스로 이어 볼 것인가"는 여전히 사람 머릿속에서만 일어났다.
- **기존 도구**: Alertmanager grouping은 정적 라벨 일치에 의존하고, 상용 AIOps는 운영 환경에 맞게 동작을 통제할 제어권이 부족했다. 결론은 "자동화 자체보다 LLM 에이전트의 동작을 통제할 제어권"이었다.

## 처리 흐름

Alert Ingestion(Mimir Alertmanager, PromQL/LogQL 룰) → Alert Correlation(세 축) → AI Analysis Agent(가설-주도 RCA) → 위험도 판단(근거 가드레일로 P1~P4 확정 또는 미확정) → 1차 대응(승인 없이: 멘션·에스컬레이션) → 2차 대응(승인 후: Pod 재시작·롤백) → Post-Incident Knowledge(확정 P1 리포트를 지식 베이스에). 구성 요소는 Incident Context Store로 맥락을 공유한다.

## 핵심 설계 1: 세 축 상관분석

알림마다 Incident를 만들면 같은 장애가 여러 스레드로 찢어지고, 무조건 합치면 무관한 장애가 섞여 분석이 오염된다. 새 알림 그룹이 오면 열려 있는 Incident마다 세 축 점수를 매기고 가중 합이 임계치를 넘을 때만 병합한다.

| 축 | 가중치 | 기준 |
| --- | --- | --- |
| Semantic | 1(높음) | LLM이 판단한 증상 의미 유사도 |
| Topology | 2 | Tempo 트레이스 기반 서비스 의존 관계(업/다운스트림) |
| Temporal | 3(낮음) | 발생 시점 근접 |

시간만으로는 같은 장애라 단정할 수 없어 의미와 의존 관계에 더 무게를 뒀다. 그리고 **한 축을 과신하지 않는다.** Semantic은 LLM이 계산하지만 무조건 믿지 않고, 의존 그래프가 없으면 Topology를 0으로 두고 나머지로 판단한다.

## 핵심 설계 2: 가설-주도 RCA

LLM이 도구 하나의 결과만 보고 성급하게 결론짓는 것을 막는 것이 요점이다. 에이전트는 조사 시작 시 다섯 가설을 반드시 모두 열거해야 한다.

- `deployment_change`, `resource_exhaustion`, `external_dependency`, `code_bug`, `infra_platform`
- 각 가설은 **rule-in**(직접 관측 신호로 충족), **rule-out**(반박 신호 확인), **cannot-verify** 중 하나
- 다섯이 모두 rule-out 또는 cannot-verify면 원인은 `other`(미특정). 근거 없는 추측 금지

증상별 필수 도구가 정해져 있다. 클러스터 이슈면 Kubernetes 도구 1개 이상, CPU/메모리 압박이면 Pyroscope로 hot function, 배포 후보면 `get_annotations`, 지연/타임아웃이면 `query_prometheus` + `tempo_traceql-search`. 첫 조회가 비어도 "데이터 없음"으로 단정하지 않고 다른 데이터 소스·tenant를 재시도한다. 결과는 증상이 아니라 원인까지 답해야 한다. 지연이면 어느 다운스트림 호출·span인지, CPU면 어느 컨테이너·함수·입력 볼륨인지, 오류면 어느 예외 클래스·코드 경로인지, 포화면 어떤 자원을 어떤 워크로드가 고갈시켰는지.

**Evidence Ledger.** 도구를 부를 때마다 provider_category, tool_name, query_summary, observation_summary, raw_excerpt를 기록하고, 최종 결론 때 이 장부로 근거가 실재하는지 재검증한다. 근거 없이 `code_bug` 같은 구체적 원인을 말하면 앱이 `other`로 낮춘다. `other`는 "아직 특정하지 못했다"는 정직한 상태다.

**탐색 상한.** Soft timeout(추가 수집 중단, 모은 근거로 결론), Hard timeout(전체 절대 상한), Tool budget(호출 횟수 상한). 운영 중 조정 가능한 설정이다.

## 핵심 설계 3: 근거 기반 가드레일

LLM이 `suggested_severity`와 신뢰도를 제안하면 앱이 가드레일을 적용해 `chosen_confidence`를 산출한다. 심각도 **확정**에는 세 조건이 모두 필요하다. 강등 사유(`degrade_reason`)가 없고, Incident가 확정 상태이며, 보정 신뢰도가 기준선 이상. 하나라도 어긋나면 '추정'으로 남는다. 신뢰도는 단계적이다. 최고 단계는 직접적·구체적 근거가 있을 때만이고 이 단계에서만 확정한다. 높은 단계는 원인이 증상과 구분되고 메트릭 외 추가 근거가 하나 더 있어야 한다. `resource_exhaustion`인데 추세 쿼리나 재시작/OOM 확인이 없으면 더 낮게 제한한다. 추정은 재분석이나 새 알림 합류로 근거가 쌓이면 확정으로 승격되고, 한 번 확정되면 재분석해도 되돌아가지 않는다(latch).

## 두 시나리오

**배포가 알림 폭탄이 됐을 때.** service-a 배포 직후 b·c·d에 타임아웃 알림. T+0 b의 알림으로 Incident 생성, T+1분 c·d 알림이 Temporal 높음·Topology 중간 이상(Tempo에서 a를 공통 업스트림으로 공유)·Semantic 높음으로 병합, T+2분 RCA 시작. `get_annotations`로 alert window 안의 a 배포 annotation과 커밋을 확인해 `deployment_change` rule-in, 나머지 rule-out. 근거가 명확해 P1 확정. Slack에 "원인: a의 최근 배포, 영향: b/c/d, 권장: 롤백"과 근거 링크. 담당자가 스레드를 열었을 때 이미 십수 개 알림이 하나로 묶여 있고 원인·범위·대응이 정리돼 있었다.

**근거가 부족할 때 '모른다'고 말하기.** service-e 지연 증가, 트레이스에 1~2초 타임아웃 span과 HTTP 500이 있지만 로그가 아직 Loki에 수집되기 전. LLM 초안은 "다운스트림 의존성 문제"를 어느 정도 신뢰도로 제안했으나, `external_dependency`를 rule-in할 직접 근거가 부족해 앱이 `other`로 강등하고 심각도를 추정으로 뒀다. Slack 메시지는 "확보된 근거는 Tempo 트레이스뿐, 유력한 방향은 다운스트림 지연이나 로그 근거는 없음, 로그 수집 후 Re-analyze로 승격 가능". 원문의 표현으로 "'모른다'를 정직하게 말하는 것은 잘못된 확신을 주는 것만큼 중요하다."

## Human-in-the-Loop

Slack 스레드 하나가 Incident 하나다. 병합된 알림은 답글로 합류하고, RCA 진행 상황이 실시간으로 갱신되며, 하단에 Close Incident·Re-analyze 버튼이 있다. 승인 경계(Approval Gate)는 **시스템 상태를 바꾸는 작업**에만 적용된다. 1차 대응(자동)은 P1이면 팀 멘션·즉시 에스컬레이션·티켓·Runbook, P2는 멘션·티켓(1시간 내), P3는 티켓(다음 근무일), P4나 P1 미확정은 스레드 종료. 2차 대응(승인 후)은 P1/P2에 Pod 재시작·롤백·스케일·알림 임계치 조정, P3에 코드 수정 PR 자동 생성·DB 쿼리 최적화 제안. 알림이 모두 Resolved면 자동 종료.

## 배운 것

- **근거 없는 확신을 막아야 한다.** Ledger와 가드레일은 기술 장치가 아니라 운영 철학이다. 시스템이 근거 없이 단정하면 사람이 직접 할 때보다 위험하다.
- **관측성 응답은 크다.** 로그·트레이스 조회는 금세 수백 KB가 되어 컨텍스트를 채운다. 신호 계층별로 근거를 고르게 정리해 Loki가 드문 상황에서도 Prometheus·Tempo 신호가 밀리지 않게 했다.
- **라벨 차이가 복병이다.** 같은 서비스명이 Prometheus는 `service_name`, Tempo는 `resource.service.name`이고 Loki는 에러 레벨이 본문이 아니라 구조화 메타데이터에 있다. tenant 순회, 라벨 주입, cAdvisor 라벨 기준 등 소스별 조회 관습을 프롬프트에 계속 반영했다.

계획은 burn-rate 기반 심각도, 2차 자동 조치 확대, P1 리포트의 지식 베이스 발행이다.

## 읽고 남는 질문

- 세 축 가중치와 임계치의 실제 값, 그리고 잘못 병합된(다른 장애가 섞인) 비율이 없다. 85~95% 노이즈 차단의 반대편인 오병합률이 있어야 균형이 보인다.
- Tool budget과 timeout의 운영값, 그리고 RCA 한 건의 LLM 비용·소요 시간이 궁금하다. MTTR 50% 단축이 "분석 시간" 기준인지 "복구까지" 기준인지도.
- 한 번 확정되면 되돌리지 않는 latch는 오확정 시 사람이 어떻게 정정하는지(Close 후 재생성인지)가 필요하다.

## 한 줄로 가져가기

LLM에게 장애 분석을 맡길 때 설계할 것은 프롬프트가 아니라 제약이다. 가설을 강제로 열거시키고, 근거를 장부에 남기게 하고, 근거보다 높은 신뢰도를 앱이 깎고, 상태를 바꾸는 손은 사람 승인 뒤에 두는 것. 그러면 "모른다"고 말하는 자동화가 된다.
