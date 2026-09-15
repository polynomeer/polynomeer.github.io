---
title: monticker 설계와 구현 기록
series_id: monticker
permalink: /series/monticker/
description: 가격·거래량 변화를 이벤트로 기록하는 주식 관찰 앱 monticker의 설계 결정과 구현을 정리한 시리즈. 왜 이벤트 중심인지, 모듈식 모놀리스와 TimescaleDB를 고른 이유, EMA 기반 이상 탐지, 분산 추적과 서킷 브레이커까지 다룬다.
hero_note: 이벤트 중심 시세 관찰 앱
series_groups:
  - label: 설계
    title: 왜 이렇게 설계했는가
    summary: 제품 철학과 아키텍처 결정. 이벤트 중심 도메인, 모듈식 모놀리스, 시계열 저장소 선택.
    tone: cyan
    starts_at: 1
    ends_at: 3
  - label: 탐지
    title: 평소와 다른 움직임을 어떻게 알아채는가
    summary: 고정 임계값 대신 지수이동평균으로 기준선을 갱신하는 이상 탐지.
    tone: green
    starts_at: 7
    ends_at: 7
  - label: 운영
    title: 관측성과 복원력
    summary: 분산 추적으로 파이프라인 지연을 재고, 외부 API 장애를 서킷 브레이커로 격리한다.
    tone: slate
    starts_at: 21
    ends_at: 22
---
