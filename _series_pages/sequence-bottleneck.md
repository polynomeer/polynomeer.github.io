---
title: 키 생성 병목을 추적해 구조를 바꾼 기록
series_id: sequence-bottleneck
group: work
permalink: /series/sequence-bottleneck/
description: MCP 계약 코드 채번이 2분 걸리던 원인을 추적해 SELECT 안에 숨은 UPDATE를 찾고, 채번을 INSERT 시점·범위 할당·별도 트랜잭션으로 옮겨 10초로 줄인 실무 기록.
hero_note: 병목 분석 시리즈
---
