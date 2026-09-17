---
title: 토스증권 엔지니어 발표 리뷰
series_id: toss-securities-talks
permalink: /series/toss-securities-talks/
description: SLASH 22·23·24와 토스 메이커스 컨퍼런스 25에서 토스증권 소속 엔지니어가 발표한 세션 열아홉 편을 한 편씩 리뷰한 시리즈. 발표 영상과 자막을 근거로 내용을 정리하고, 설계 결정의 이유와 대가를 짚고, 발표가 답하지 않은 질문을 남긴다.
hero_note: 세션 한 편에 리뷰 한 편
series_groups:
  - label: SLASH 22
    title: 실시간 시세와 해외주식 주문
    summary: 런칭 직전 폴링을 WebSocket으로 바꾼 시세 적용기와, 분산락 위에 낙관적 락을 얹고 타임아웃을 실패로 확정하지 않는 해외주식 원장.
    tone: violet
    starts_at: 1
    ends_at: 2
  - label: SLASH 23
    title: 시세 플랫폼, 뉴스 ML, Kafka 이중화, 로그 인프라
    summary: Redis Pub/Sub과 이벤트 루프로 22,000 TPS에서 1ms를 만든 시세 처리부, 종목 매칭·중요도·번역 모델, Active-Active Kafka, 하루 53억 건 Elasticsearch.
    tone: cyan
    starts_at: 3
    ends_at: 6
  - label: SLASH 24
    title: 검증, 데이터, 푸시, 프론트엔드, 랭킹
    summary: 운영 트래픽을 재생해 차세대 원장을 검증한 Verifier, 액트 타입 DW 모델, SSE 푸시, SharedWorker, Compose 안착, ClickHouse 랭킹.
    tone: green
    starts_at: 7
    ends_at: 12
  - label: TMC 25
    title: 프론트엔드, ML 플랫폼, 데이터, 서버, 인프라
    summary: Native ESM 마이크로 프론트엔드, GPU 낭비 등급, LLM 자동 내재화, 실시간 alert 플랫폼, Compose 리컴포지션, 풀링 주문, Iceberg와 Ceph.
    tone: slate
    starts_at: 13
    ends_at: 19
---
