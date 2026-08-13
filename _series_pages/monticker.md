---
title: monticker 기술 블로그 시리즈 설계
series_id: monticker
permalink: /series/monticker/
description: 6개 시리즈 · 총 22편 · 입문에서 심화까지 이어지는 monticker 설계와 구현 흐름.
hero_note: 입문 → 심화 흐름
series_groups:
  - label: SERIES 1
    title: 왜 이렇게 설계했는가
    summary: 제품의 철학과 아키텍처 결정 배경, "이벤트 중심 시세 플랫폼"이 무엇인지부터 시작.
    tone: cyan
    starts_at: 1
    ends_at: 3
  - label: SERIES 2
    title: 실시간 시세 파이프라인
    summary: Kafka, Go, Netty로 구성한 시세 수집·중계 파이프라인의 설계와 구현.
    tone: green
    starts_at: 4
    ends_at: 7
  - label: SERIES 3
    title: 모의투자 체결 엔진
    summary: 실거래소 구조를 모사한 CLOB 매칭 엔진과 주문 전 리스크 게이트 구현.
    tone: amber
    starts_at: 8
    ends_at: 9
  - label: SERIES 4
    title: 이벤트 소싱 원장
    summary: 투자 과정의 현금 흐름을 이벤트 소싱 패턴으로 기록하고 복기하는 방법.
    tone: violet
    starts_at: 10
    ends_at: 11
  - label: SERIES 5
    title: Quant Lab
    summary: 코딩 없는 투자 전략 빌더부터 백테스트, 포워드 테스트, 과최적화 탐지까지.
    tone: rose
    starts_at: 12
    ends_at: 14
  - label: SERIES 6
    title: Quant Analytics
    summary: 포트폴리오 최적화, 세금 최적화, Kelly, 패턴 인식, 국면 감지 알고리즘 구현.
    tone: teal
    starts_at: 15
    ends_at: 19
bonus_group:
  label: 보너스
  title: 운영·품질·성능
  summary: 테스트, 관측성, 복원력까지 서비스 운영 품질을 다루는 실무 편.
  tone: slate
  starts_at: 20
  ends_at: 22
series_flow:
  - S1 기획·설계
  - S2 실시간 파이프라인
  - S3 체결 엔진
  - S4 이벤트 소싱
  - S5 Quant Lab
  - S6 Analytics
  - Bonus
series_stats:
  - value: "6"
    label: 시리즈
  - value: "22"
    label: 편
  - value: S1~2
    label: 아키텍처 중심
    detail: 비개발자도 읽을 수 있는 흐름
  - value: S3~6
    label: 알고리즘·구현 심화
    detail: 개발자 대상
  - value: Bonus
    label: 운영·테스팅 실무
---
