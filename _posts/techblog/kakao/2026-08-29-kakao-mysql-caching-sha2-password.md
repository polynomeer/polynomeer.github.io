---
title: "카카오 「MySQL 인증 플러그인 caching_sha2_password에 대한 이해」 리뷰 — 비밀번호 해시가 바뀌는 것보다 '평문이 서버까지 가야 한다'는 점이 전환의 진짜 비용"
date: 2026-08-29
categories: [TechBlog, Kakao]
tags: [Tech Blog Review, Kakao, MySQL, Authentication, SHA-256, TLS, Security, Database]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 64
source_url: https://tech.kakao.com/posts/712
---

원문: [MySQL 인증 플러그인 caching_sha2_password에 대한 이해](https://tech.kakao.com/posts/712) — kakao tech, 2025-07-17

## 한 줄 요약

MySQL 8.0부터 기본 인증 플러그인이 `mysql_native_password`(SHA-1 두 번)에서 `caching_sha2_password`(SHA-256 + 솔트 + 5,000회 반복)로 바뀌었고, 9.0부터는 옛 플러그인이 아예 없어진다. 해시가 강해진 것은 당연한 개선인데, 운영자에게 진짜 문제는 인증 프로토콜이 달라진다는 점이다. 옛 방식은 challenge-response라 평문 비밀번호가 네트워크를 안 탔지만, 새 방식은 **첫 인증(Full Authentication) 때 평문 비밀번호가 서버까지 가야** 하므로 SSL/TLS 또는 RSA 공개키 연결이 필수다. 커넥터 버전, 복제 계정, 그룹 복제 연결까지 바뀌는 이유가 여기 있다.

## 배경: 해시 알고리즘 한 줄 정리

MD5(128비트)는 충돌 공격에 약해 안 쓰고, SHA-1(160비트, 1995)도 비권장, SHA-2(2001, 224~512비트, Merkle-Damgård)가 널리 쓰이며 SHA-3(2015, Keccak 스펀지 구조)가 새 표준이다. MySQL의 새 플러그인은 SHA-256 기반이다. 원문은 이 배경을 표로 정리해 두었다.

## 플러그인 역사

| 버전 | 기본 플러그인 | 방식 |
| --- | --- | --- |
| 1.0~4.0 | mysql_old_password | 자체 비트 연산, 16자리 hex |
| 4.1~5.7 | mysql_native_password | SHA1(SHA1(password)), `*` + 40자 hex |
| 5.7.23 (선택) | sha256_password | SHA-256 + 솔트, SSL/TLS 또는 RSA 필수 |
| 8.0~ | caching_sha2_password | sha256_password + 서버 측 캐시 |
| 9.0~ | (native 제거) | |

`sha256_password`는 솔트로 같은 비밀번호도 다른 해시가 되게 했지만 매번 반복 해싱을 해야 해 느렸고, `caching_sha2_password`는 거기에 **캐시**를 붙여 재인증을 빠르게 한 것이다.

솔트는 비밀번호마다 고유하게 만드는 무작위 바이트(MySQL은 20바이트)로, 비밀은 아니지만 같은 비밀번호의 해시를 다르게 하고, 미리 계산한 해시 목록(레인보우 테이블)을 무력화하며, 사전·무차별 대입을 비밀번호마다 따로 해시하게 만들어 비용을 올린다.

## mysql_native_password는 어떻게 인증하나

저장값은 `SHA1(SHA1(password))`다. 인증은 비밀번호가 네트워크를 타지 않는 challenge-response다.

1. 클라이언트가 사용자명 등을 보낸다(비밀번호 원문 없음).
2. 서버가 20바이트 무작위 문자열(scramble)을 보낸다.
3. 클라이언트는 `h1 = SHA1(pw)`, `h2 = SHA1(h1)`, `h3 = SHA1(scramble + h2)`를 계산해 `token = h1 XOR h3`를 보낸다.
4. 서버는 저장된 `H_db = SHA1(SHA1(pw))`로 `s = SHA1(scramble + H_db)`를 만들고, `token XOR s`로 `h1`을 복원해 `SHA1(h1)`이 `H_db`와 같은지 본다.

서버는 평문을 모른 채로 검증한다. 대신 SHA-1이고 솔트가 없다.

## caching_sha2_password는 어떻게 저장하고 인증하나

**저장.** 비밀번호 생성·변경 시 고유 솔트를 만들고, 솔트 + 평문을 HMAC-SHA256 같은 PRF에 넣어 `caching_sha2_password_digest_rounds`(기본 5,000)만큼 반복한다(키 스트레칭). `authentication_string`은 `$`로 구분된다. `A`(플러그인 표시) · `005`(5,000회) · 20바이트 솔트 인코딩 · 최종 해시.

**Full Authentication.** 처음 접속하거나 서버 캐시에 정보가 없을 때다. 클라이언트가 사용자명을 보내면 서버가 "이 계정은 caching_sha2_password"라고 알리고, 클라이언트는 **두 경로 중 하나로 평문 비밀번호를 서버에 전달**한다.

- SSL/TLS: 암호화된 채널로 평문 전송. 서버가 솔트·반복 횟수로 해시해 저장값과 비교.
- RSA: 서버가 공개키를 보내고, 클라이언트가 그것으로 평문을 암호화해 보내며, 서버가 개인키로 복호화한 뒤 위와 같이 비교.

즉 서버가 솔트를 섞어 5,000회 반복해야 하는 구조라 **서버가 평문을 알아야만** 검증할 수 있고, 그래서 채널 암호화가 필수다.

**Fast Authentication.** Full 인증에 성공하면 서버 메모리(플러그인 힙 영역)에 재인증용 정보가 캐시된다. 이후 재접속은 서버가 nonce를 보내고 클라이언트가 nonce와 비밀번호로 만든 값을 보내면 캐시로 검증한다. 평문도, 반복 해싱도 없다. 캐시는 MySQL 재시작, `FLUSH PRIVILEGES`, 계정 정보 변경 시 비워진다.

## 도입 시 고려할 것

**연결 방식 결정.** 이미 SSL/TLS나 RSA를 쓰고 있으면 고민이 없지만, 아니면 둘 중 하나를 골라야 하고 어느 쪽이든 운영 중인 MySQL에 영향이 간다. SSL/TLS로 간다면 서버 설정과 인증서 관리, 클라이언트 연결 방법, **복제용 계정과 연결 방법**, **그룹 복제 연결 방법**까지 파악해야 한다. 원문은 이 영향도는 주제를 벗어난다며 상세히 다루지 않는다.

**인증 방식 변경의 영향.** 두 가지를 정리해야 한다. caching_sha2_password를 지원하는 커넥터 버전, 그리고 기존 native 계정을 어떻게 전환할지. 메이저 업그레이드와 같이 진행한다면 전환 프로세스도 설계해야 한다. 계정 전환 시나리오는 서비스마다 달라 원문이 다루지 않는다.

8.0에서 native를 계속 쓰려면 `--mysql_native_password=ON`이나 `default_authentication_plugin=mysql_native_password`를 설정하면 되고, 8.4까지는 가능하지만 9.0부터는 불가능하다.

## 읽고 남는 질문

- Fast Authentication에서 "nonce와 비밀번호로 만든 값"의 구체적 계산식이 native의 XOR 방식과 어떻게 다른지가 없다. 캐시에 무엇이 저장되는지(SHA-256 해시의 어떤 형태인지)가 보안 분석에 중요하다.
- 캐시가 서버 메모리에 있으니 커넥션 풀이 새 커넥션을 만들 때마다가 아니라 서버 재시작·`FLUSH PRIVILEGES` 직후에 Full 인증이 몰린다. 대규모 앱 서버 재기동 시 5,000회 반복 해싱이 서버 CPU에 주는 부담이 실측으로 있으면 좋겠다.
- 복제 계정 전환 순서(소스 먼저? 레플리카 먼저?)가 실무에서 가장 조심스러운 부분인데 "다루지 않는다"로 끝났다. 후속 글이 있으면 좋겠다.

## 한 줄로 가져가기

인증 플러그인 전환은 해시 함수를 바꾸는 일이 아니라 "서버가 평문을 알아야 하는 프로토콜"로 바꾸는 일이고, 그래서 TLS·RSA·커넥터·복제까지 한 번에 따라 움직인다. 9.0이 오기 전에 연결 방식부터 정해야 한다.
