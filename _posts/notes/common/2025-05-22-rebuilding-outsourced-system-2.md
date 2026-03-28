---
title: "대량 엑셀 다운로드를 메시지 큐와 S3 사전 생성으로 개선한 이야기"
date: 2025-05-22
categories: [Notes, Common]
tags: [Excel, SQS, S3, Async Processing, Performance]
---

## 📊 대량 엑셀 다운로드, 메시지 큐와 S3 사전 생성을 활용한 구조 개선기

대량 데이터 엑셀 다운로드는 흔한 요구지만, 설계가 미흡하면 API 서버가 쉽게 병목 지점이 됩니다. 우리는 실제 운영 환경에서 전체 데이터를 조건 없이 반복 다운로드하는 요청으로 인해 **API 서버 CPU 사용률이 85%까지 상승**하는 문제를 경험했고, 이를 **비동기 메시지 큐 처리 + S3 사전 생성 전략**으로 구조적으로 해결했습니다. 그 결과, CPU 사용률은 **40% 수준으로 절반 이상 감소**하였고, 사용자 경험 또한 개선되었습니다.

---

## 🧩 배경

서비스 내에서는 다양한 필터 조건에 따라 통계성 데이터를 엑셀로 다운로드할 수 있는 기능을 제공하고 있었습니다. 사용자는 주기적으로 전체 데이터를 필터 없이 다운로드하는 경우가 많았고, 이로 인해 다음과 같은 문제가 발생했습니다.

### ⚠️ 주요 이슈

* 실시간 데이터 조회 + 엑셀 생성으로 인한 API 서버 부하
* 동일한 요청이 반복되며 서버 리소스 낭비
* 피크 시간대에는 CPU 사용률이 85% 이상까지 치솟음
* 요청 처리 중 GC 빈발 및 응답 시간 지연

---

## 🔧 개선 전략

### 1. 요청 구조 구조화 및 메시지 큐 기반 분리 처리

* 모든 엑셀 다운로드 요청을 **직렬화된 필터 조건 기반 메시지 객체**로 변환
* 고유 요청 ID와 함께 **Amazon SQS**로 전송
* 응답은 "파일 생성 중"이라는 상태 정보와 함께 요청 ID 반환

```json
{
  "requester": "user123",
  "filter": {
    "category": "전체",
    "dateRange": "2023-01-01 ~ 2023-12-31"
  },
  "requestId": "excel-20240522-01"
}
```

SQS → 비동기 Worker → QueryDSL 조회 → FastExcel 변환 → S3 업로드 → DB 상태 갱신

### 2. 전체 다운로드 요청의 S3 사전 생성

* 조건이 비어 있거나 "전체 다운로드" 요청으로 판단되는 경우:

  * 매일 자정에 Spring Batch 작업으로 전체 데이터를 기반으로 엑셀 생성
  * **S3 버킷에 미리 업로드**: `full_export_latest.xlsx`
  * 동일 조건 요청 시 즉시 다운로드 링크 반환

```bash
GET /api/download?preset=ALL
→ HTTP 302 Redirect → https://s3.amazonaws.com/my-bucket/full_export_latest.xlsx
```

---

## 🔄 구조 개요

```plaintext
[Client]
   ↓ 요청
[API Server] → [SQS] → [Excel Generator Worker]
                                 ↓
                              [S3 저장]
                                 ↓
                      [DB에 파일 위치 갱신]
   ↑
[Client] ← 상태 조회 or 다운로드 링크
```

---

## 📉 개선 효과

| 항목             | 개선 전    | 개선 후                |
| -------------- | ------- | ------------------- |
| API 서버 CPU 사용률 | 최대 85%  | 평균 40%              |
| GC 발생 빈도       | 수 분 단위  | 10\~15분 단위          |
| 응답 속도          | 평균 6.5초 | 평균 2.1초 (전체는 즉시 링크) |
| 동일 요청 처리 방식    | 매번 생성   | S3 사전 생성 활용         |

---

## 💡 회고

### 핵심 개선 포인트

* **요청을 메시지 큐로 분리**하여 API 서버는 처리 책임에서 벗어남
* **사전 생성 전략**으로 전체 다운로드 요청의 반복 부하 제거
* **필터 직렬화 및 캐싱 ID**를 통해 중복 생성 최소화
* 사용자에게는 "처리 중", "다운로드 준비됨" 상태 기반 UX 제공

### 다음 단계

* 우선순위 기반 큐 구성 (ex. 중요한 요청 우선 처리)
* SSE(Server Sent Events) 또는 WebSocket을 통한 실시간 상태 알림
* 요청량 증가 시 Lambda + S3 기반 무서버 확장 고려

---

## ✍ 마무리하며

단순히 코드를 최적화하는 것보다, **데이터 흐름을 구조적으로 분리하고 반복 가능성을 시스템적으로 차단하는 설계**가 더 큰 성능 개선을 가져올 수 있습니다.
이번 개선을 통해, 엑셀 다운로드라는 전형적인 기능도 충분히 **효율적이고 확장 가능한 방식으로 설계할 수 있음**을 확인할 수 있었습니다.

---

메시지 큐(SQS, Kafka 등)를 사용할 때 **중복 메시지 방지**와 **식별**은 신뢰성과 정확성을 유지하기 위해 매우 중요합니다. 이를 위해 사용되는 대표적인 방법들을 정리해드리겠습니다.

---

## ✅ 1. **메시지 식별자 (Message Deduplication ID) 사용**

### 🔹 전략

* 메시지를 전송할 때 **고유 ID**를 함께 포함
* 이 ID를 기준으로 **처리 여부를 기록/비교하여 중복 처리 방지**

### 🔸 구현 예

```json
{
  "requestId": "excel-20240522-01",  // deduplication key
  "filter": {...},
  "userId": 123
}
```

### 🔸 저장소 예시

| requestId         | status    | createdAt           |
| ----------------- | --------- | ------------------- |
| excel-20240522-01 | COMPLETED | 2024-05-22 10:23:00 |

### 🔸 처리 로직 예시

```java
if (repository.existsByRequestId(requestId)) {
    return; // 이미 처리됨
} else {
    // 처리 후 저장
    repository.save(new ExportRequest(requestId, ...));
}
```

---

## ✅ 2. **SQS FIFO 큐 + DeduplicationId 설정**

### 🔹 사용 조건

* Amazon SQS의 **FIFO 큐** 사용 시 제공되는 기능
* 메시지 전송 시 `MessageDeduplicationId` 헤더를 함께 전송
* 5분 내 동일한 DeduplicationId의 메시지는 자동 중복 제거

### 🔸 예시 코드 (Java AWS SDK)

```java
SendMessageRequest request = new SendMessageRequest()
    .withQueueUrl(queueUrl)
    .withMessageBody(json)
    .withMessageGroupId("excel-download")
    .withMessageDeduplicationId("excel-20240522-01");
```

### ⚠️ 주의

* SQS FIFO는 순서를 보장하지만 Throughput 제한이 있음
* `MessageDeduplicationId`는 5분 동안만 중복 제거

---

## ✅ 3. **Idempotent Consumer 패턴 적용**

### 🔹 핵심 개념

* 메시지를 **"받고 처리할 수는 있지만 결과는 항상 동일"** 하도록 설계
* 동일 메시지가 여러 번 도착하더라도, 한 번만 처리된 것과 동일한 상태 유지

### 🔸 적용 예

* `requestId` 기준으로 상태를 `PENDING`, `IN_PROGRESS`, `COMPLETED`로 관리
* 이미 COMPLETED 상태면 작업을 재수행하지 않음

---

## ✅ 4. **메시지 본문 해시(Hash) 기반 중복 판별**

### 🔹 필터 조건이 같더라도 ID가 다르면 중복될 수 있으므로,

* `SHA256(filter JSON 직렬화)`로 본문 해시 생성
* 해당 해시 값이 DB에 이미 존재하면 중복으로 간주

### 🔸 예시

```java
String filterJson = objectMapper.writeValueAsString(filterDto);
String hash = DigestUtils.sha256Hex(filterJson);
```

| hash 값 (SHA256) | 생성 시간               |
| --------------- | ------------------- |
| a4c3...91f2     | 2024-05-22 08:12:00 |

---

## ✅ 5. **분산락 or 원자적 연산으로 동시 요청 제어**

* 다수의 동일한 요청이 동시에 들어올 경우 **Redis 기반 분산락**을 사용하여 선점 처리
* 또는 DB에서 `requestId`를 `UNIQUE`로 정의하고 insert 시 예외 처리

```sql
CREATE UNIQUE INDEX idx_request_id ON export_requests(request_id);
```

---

## 🧠 전략 조합 추천

| 목적                | 전략                           |
| ----------------- | ---------------------------- |
| 사용자 요청 단위 중복 방지   | `requestId + DB 체크`          |
| 전체 조건 동일 요청 중복 방지 | `filter DTO 직렬화 → 해시 키`      |
| 메시지 큐 자체 중복 방지    | `SQS FIFO + DeduplicationId` |
| 작업 재요청 시 안정성      | `Idempotent Consumer 패턴`     |

---

## 🔁 메시지 중복 처리, 어떻게 방지했는가

엑셀 다운로드 시스템을 비동기 메시지 큐 기반으로 전환한 후, 또 하나의 중요한 과제가 생겼습니다.
바로 **같은 요청이 반복되었을 때 메시지나 처리 작업이 중복되지 않도록 방지**하는 것이었습니다.
단순히 메시지를 받는 것에 그치지 않고, **요청의 중복 여부를 정확하게 식별하고, 안전하게 처리해야** 했습니다.

---

## 🎯 우리가 직면한 문제

* 사용자가 동일한 필터로 엑셀 다운로드 요청을 여러 번 보낼 수 있음
* API 서버나 워커에서 동일한 메시지를 중복 처리할 위험이 있음
* SQS 자체도 **"최소 1회 전달" 보장**, 즉 **중복 메시지 전송 가능성 존재**

---

## ✅ 해결 전략 요약

| 구분           | 전략                                |
| ------------ | --------------------------------- |
| 메시지 식별       | `requestId` 생성 및 전송               |
| 중복 처리 방지     | DB + `UNIQUE` 인덱스 + 상태 저장         |
| SQS 수준 중복 방지 | FIFO 큐 + `MessageDeduplicationId` |
| 필터 중복 방지     | 필터 DTO 직렬화 → SHA-256 해시 생성        |

---

## 1️⃣ 메시지 식별자: requestId 생성 및 전파

엑셀 요청마다 고유한 \*\*`requestId`\*\*를 생성합니다.
이 ID는 메시지 전송, DB 저장, S3 파일명 지정, 상태 추적 등 모든 단계에서 **추적 키** 역할을 합니다.

```json
{
  "requestId": "excel-20240522-user123",
  "filter": {
    "startDate": "2024-01-01",
    "endDate": "2024-12-31",
    "category": "전체"
  },
  "userId": "user123"
}
```

---

## 2️⃣ DB 기반 중복 방지 및 상태 관리

### 📦 테이블 설계

```sql
CREATE TABLE export_request (
  request_id VARCHAR(100) PRIMARY KEY,
  status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'),
  filter_hash VARCHAR(64),
  s3_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 🔍 처리 흐름

```java
if (repository.existsByRequestId(requestId)) {
    return; // 이미 처리된 요청
} else {
    repository.save(new ExportRequest(requestId, "PENDING", ...));
}
```

---

## 3️⃣ SQS FIFO + DeduplicationId 활용

### ✨ 설정 요약

* **FIFO Queue** 사용
* 메시지 전송 시 `MessageDeduplicationId` 명시

```java
SendMessageRequest request = new SendMessageRequest()
    .withQueueUrl(queueUrl)
    .withMessageBody(json)
    .withMessageGroupId("excel-export")
    .withMessageDeduplicationId(requestId); // 중복 방지
```

> ✅ 동일한 `requestId`로 5분 이내 중복 전송된 메시지는 자동으로 무시됨

---

## 4️⃣ 필터 해시 기반 중복 검출

### 🔐 목적

* 동일한 조건으로 매번 요청되는 경우, 사전 생성된 파일을 재사용
* `filter DTO`를 JSON으로 직렬화 → SHA-256 해시 생성

```java
String json = objectMapper.writeValueAsString(filterDto);
String hash = DigestUtils.sha256Hex(json);
```

### 🧠 활용

* `filter_hash` 값으로 S3 캐시 여부 판단
* 이미 생성된 파일이 있으면 즉시 다운로드 링크 제공

---

## 5️⃣ Idempotent Consumer 패턴 적용

### 🤖 워커 처리 흐름

```java
ExportRequest request = repository.findByRequestId(message.getRequestId());

if (request.getStatus() == COMPLETED) {
    return; // 이미 처리 완료됨
}

try {
    request.markInProgress();
    repository.save(request);

    // 엑셀 생성 → S3 업로드
    String s3Url = uploadToS3(...);
    request.markCompleted(s3Url);

} catch (Exception e) {
    request.markFailed();
}
```

> 💡 이 패턴 덕분에 메시지가 중복 도착해도 한 번만 처리됩니다.

---

## 📈 실제 효과

| 항목          | 개선 전            | 개선 후           |
| ----------- | --------------- | -------------- |
| 중복 요청 처리    | 동일 요청마다 새 파일 생성 | S3 캐시 또는 중복 회피 |
| 메시지 중복 수신 시 | 작업 중복 발생        | 한 번만 처리        |
| 전체 처리 시간    | 5\~10분 소요       | 캐시 활용 시 즉시 응답  |

---

## ✍ 마무리하며

단순히 메시지를 "받는 것"에서 끝나는 것이 아니라, **메시지의 정체성을 명확히 하고**,
**요청 중복과 처리 중복을 분리해 다르게 대응**하는 것이 핵심입니다.

이번 구조에서는 다음 세 가지가 가장 큰 역할을 했습니다:

1. **requestId를 기준으로 메시지를 추적하고 DB 상태를 관리한 것**
2. **SQS의 FIFO + DeduplicationId 기능을 활용한 전송 중복 방지**
3. **filter 해시를 기반으로 동일 요청을 재사용 가능하도록 한 구조**

이러한 설계는 대량 데이터를 안정적으로 처리해야 하는 시스템에서
**성능과 신뢰성의 균형을 잡는 핵심 전략**이 될 수 있습니다.

---
