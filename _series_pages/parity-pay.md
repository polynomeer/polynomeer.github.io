---
title: ParityPay로 검증하는 결제 정합성
series_id: parity-pay
permalink: /series/parity-pay/
description: 결제·원장 백엔드 ParityPay를 만들며 중복 요청, 동시 차감, 외부 응답 유실, 이벤트 중복 전달, 프로세스 재시작 아래에서 금융 불변조건을 어떻게 지켰는지, 실험이 찾아낸 결함과 측정의 실수까지 기록한 시리즈. 불변조건과 동시성, 외부 불확실성, DB와 메시지의 이중 쓰기, 원장과 대사, 브로커와 외부기관 장애 실험까지 아홉 편이다.
hero_note: 장애 실험으로 검증한 결제 백엔드
series_groups:
  - label: 불변조건
    title: 무엇을 지키고, 어디서 강제하는가
    summary: 검증 가능한 불변조건 여섯 개를 세우고, 동일 지갑 경합의 원인을 추론이 아니라 측정으로 확정한 기록.
    tone: cyan
    starts_at: 1
    ends_at: 2
  - label: 외부 불확실성
    title: 응답이 사라졌을 때
    summary: 타임아웃을 실패로 확정하지 않는 UNKNOWN 상태와, 실험 26종이 문서와 테스트 밖에서 찾아낸 결함 12건.
    tone: green
    starts_at: 3
    ends_at: 4
  - label: 이중 쓰기와 원장
    title: DB, 메시지, 기관 기록을 맞추기
    summary: Transactional Outbox와 멱등 소비자, 기관에 물어보지 못한 날을 구분하는 대사, 세 층에서 강제하는 이중부기 원장, 그리고 브로커와 느린 외부기관 앞에서 어떤 장치가 무엇을 막는지 직접 만들어 본 실험.
    tone: slate
    starts_at: 5
    ends_at: 9
---
