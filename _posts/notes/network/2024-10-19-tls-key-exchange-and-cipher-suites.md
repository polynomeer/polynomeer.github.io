---
title: "TLS 키 교환과 암호 스위트 - key share, forward secrecy, PSK, AES-NI"
date: 2024-10-19
status: published
categories: [Notes, Network]
tags: [Network, TLS, Security, Cryptography, Handshake]
---

[TLS 핸드셰이크의 비용](/posts/tls-handshake-cost/)에는 몇 개의 용어가 설명 없이 나온다. TLS 1.3 클라이언트는 ClientHello에 "키 공유 추정값"을 미리 싣고, 1.3은 "정적 RSA 스위트를 제거"했고, 재개는 "PSK 교환"으로 바뀌었고, 대칭 암호는 "AES-NI 덕분에 거의 공짜"라고 했다. 이 글은 그 네 가지를 처음부터 설명한다.

## 두 단계로 나뉘는 암호화

TLS 연결은 두 단계로 일한다.

1. **핸드셰이크.** 양쪽이 아직 공유한 비밀이 없는 상태에서, 공개된 네트워크로 메시지를 주고받아 같은 비밀 값을 얻는다. 이것이 키 교환이다. 여기에 비대칭 암호(공개키 암호)가 쓰인다.
2. **레코드 보호.** 핸드셰이크에서 얻은 비밀로 대칭 키를 만들고, 이후 모든 데이터를 그 키로 암호화한다. 대칭 암호는 비대칭 암호보다 훨씬 빠르다.

비대칭 연산은 연결당 한 번이고, 대칭 연산은 바이트마다 일어난다. 그래서 대칭 쪽이 빨라야 전체가 빠르다.

## 암호 스위트가 정하는 것

암호 스위트(cipher suite)는 위 단계에 쓸 알고리즘 조합의 이름이다. 클라이언트가 지원 목록을 보내고 서버가 하나를 고른다.

TLS 1.2의 이름은 모든 것을 한 줄에 담았다. `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256`은 키 교환(ECDHE), 서버 인증(RSA 서명), 레코드 암호(AES-128-GCM), 해시(SHA-256)를 함께 지정한다.

TLS 1.3은 이것을 쪼갰다. 암호 스위트는 레코드 보호 알고리즘과 키 유도에 쓸 해시만 정하고, 키 교환과 인증은 별도 확장으로 협상한다([RFC 8446, 1.2절](https://datatracker.ietf.org/doc/html/rfc8446#section-1.2)). 그래서 1.3의 스위트 이름은 짧다.

| TLS 1.3 스위트 | 레코드 보호 | 해시 |
| --- | --- | --- |
| `TLS_AES_128_GCM_SHA256` | AES-128-GCM | SHA-256 |
| `TLS_AES_256_GCM_SHA384` | AES-256-GCM | SHA-384 |
| `TLS_CHACHA20_POLY1305_SHA256` | ChaCha20-Poly1305 | SHA-256 |

목록은 [RFC 8446 B.4절](https://datatracker.ietf.org/doc/html/rfc8446#appendix-B.4)에 있고, 그중 `TLS_AES_128_GCM_SHA256`은 반드시 구현해야 한다([9.1절](https://datatracker.ietf.org/doc/html/rfc8446#section-9.1)). 선택지가 적으니 운영자가 약한 조합을 고를 여지도 줄었다.

## (EC)DHE와 key share

Diffie-Hellman(DH) 키 교환은 양쪽이 각자 비밀 값을 하나씩 만들고, 거기서 계산한 공개 값만 서로 보낸다. 상대의 공개 값과 자신의 비밀 값을 조합하면 양쪽이 같은 결과를 얻는다. 중간에서 공개 값 두 개를 모두 본 사람은 그 결과를 계산할 수 없다. 타원 곡선 위에서 같은 일을 하면 ECDH다.

끝의 E(ephemeral, 임시)가 중요하다. DHE와 ECDHE는 연결마다 새 비밀 값을 만들고, 연결이 끝나면 버린다.

TLS 1.3에서 클라이언트가 보내는 공개 값이 `key_share` 확장이다([4.2.8절](https://datatracker.ietf.org/doc/html/rfc8446#section-4.2.8)). 클라이언트는 서버가 어떤 곡선(그룹)을 고를지 모르는 상태에서, 고를 것 같은 그룹의 공개 값을 ClientHello에 미리 담는다. 서버가 그중 하나로 응답하면 첫 왕복에서 키 교환이 끝난다. 이것이 1.3이 1-RTT인 이유이고, 추정이 빗나가면 서버가 HelloRetryRequest로 다른 그룹을 요청해 왕복이 하나 늘어난다([2.1절](https://datatracker.ietf.org/doc/html/rfc8446#section-2.1)). 필수 구현 그룹은 secp256r1이다([9.1절](https://datatracker.ietf.org/doc/html/rfc8446#section-9.1)).

## forward secrecy와 정적 RSA

TLS 1.2까지 흔했던 정적 RSA 키 교환은 다르게 동작했다. 클라이언트가 세션 비밀을 만들어 서버 인증서의 RSA 공개키로 암호화해 보낸다. 세션 비밀이 서버의 장기 개인키 하나로만 보호되는 구조다.

이 구조의 약점은 시간이 지나서 드러난다. 공격자가 오늘 암호화된 트래픽을 녹화해 두고, 1년 뒤 서버 개인키를 손에 넣으면 녹화한 세션을 모두 복호화할 수 있다. RFC 9325는 이 상황을 장기 키를 얻은 공격자가 세션 키와 대화 전체를 복호화할 수 있다고 설명한다([RFC 9325, 7.3절](https://datatracker.ietf.org/doc/html/rfc9325#section-7.3)).

forward secrecy(전방 비밀성)는 이 문제를 막는 성질이다. (EC)DHE는 연결마다 임시 비밀 값을 쓰고 버리므로, 나중에 서버 개인키가 유출되어도 지난 세션의 키를 다시 계산할 수 없다. 서버 개인키는 "이 서버가 진짜인가"를 증명하는 서명에만 쓰인다.

그래서 TLS 1.3은 정적 RSA와 정적 DH 스위트를 제거했고, 남은 공개키 기반 키 교환은 모두 forward secrecy를 제공한다([RFC 8446, 1.2절](https://datatracker.ietf.org/doc/html/rfc8446#section-1.2)). TLS 1.2를 쓰는 곳에도 RFC 9325는 정적 RSA를 협상하지 말라고(SHOULD NOT) 하고, ECDHE와 AES-GCM 조합의 스위트 넷을 권한다([4.1절](https://datatracker.ietf.org/doc/html/rfc9325#section-4.1), [4.2절](https://datatracker.ietf.org/doc/html/rfc9325#section-4.2)).

## PSK

PSK(pre-shared key)는 양쪽이 미리 공유한 키다. TLS 1.3의 세션 재개는 이것을 쓴다. 핸드셰이크가 끝나면 서버가 NewSessionTicket으로 PSK 식별자를 보내고, 클라이언트는 다음 연결에서 그 식별자를 제시해 같은 키를 다시 쓴다([2.2절](https://datatracker.ietf.org/doc/html/rfc8446#section-2.2)).

TLS 1.3의 키 교환 모드는 셋이다([2절](https://datatracker.ietf.org/doc/html/rfc8446#section-2)).

- (EC)DHE만 쓰는 전체 핸드셰이크
- PSK만 쓰는 재개
- PSK와 (EC)DHE를 함께 쓰는 재개

둘째와 셋째의 차이가 forward secrecy다. PSK만 쓰면 비대칭 연산이 빠지는 대신, 그 PSK가 유출되면 해당 애플리케이션 데이터의 forward secrecy를 잃는다([2.2절](https://datatracker.ietf.org/doc/html/rfc8446#section-2.2)). 재개 때도 (EC)DHE를 함께 돌리면 이 손해가 없다. [0-RTT](/posts/tls-handshake-cost/)의 early data는 이 PSK에서 유도한 키로 암호화된다.

## AES-NI

핸드셰이크가 끝나면 남는 일은 대칭 암호, 대부분 AES-GCM이다. AES는 한 블록을 여러 라운드에 걸쳐 섞는다. 소프트웨어로 구현하면 라운드마다 테이블 조회와 비트 연산이 반복된다.

AES-NI는 이 라운드를 CPU 명령어 하나로 처리하는 인텔의 명령어 집합이다. 암호화 라운드(`AESENC`, `AESENCLAST`), 복호화 라운드(`AESDEC`, `AESDECLAST`), 키 확장 보조(`AESKEYGENASSIST`, `AESIMC`)의 여섯 명령으로 되어 있다. 인텔 문서는 순차 모드에서 소프트웨어 구현 대비 2~3배, 병렬화 가능한 모드에서 10배까지의 개선을 제시한다. 테이블 조회가 없으므로 캐시 타이밍을 노리는 부채널 공격에도 강하다([Intel AES-NI](https://www.intel.com/content/www/us/en/developer/articles/technical/advanced-encryption-standard-instructions-aes-ni.html)).

[핸드셰이크 비용 글](/posts/tls-handshake-cost/)에서 대칭 암복호를 "거의 무시 가능"이라고 한 근거가 이것이다. 1.3의 스위트 목록에는 AES 계열 외에 ChaCha20-Poly1305도 있어서, AES 가속이 없는 환경에서는 이쪽을 고를 수 있다.

## 정리

- 비대칭 암호는 연결당 한 번 키를 합의하는 데 쓰이고, 실제 데이터는 그 키에서 만든 대칭 키로 보호된다.
- TLS 1.3의 암호 스위트는 레코드 보호와 해시만 고르고, 키 교환은 `key_share`로 첫 메시지에 미리 실어 보내 왕복을 줄인다.
- 정적 RSA는 서버 개인키 하나가 과거의 모든 세션을 지키는 구조라서 제거됐다. 임시 키를 쓰는 (EC)DHE가 forward secrecy를 준다.
- PSK만으로 재개하면 빠르지만 forward secrecy를 잃는다. (EC)DHE와 함께 쓰면 둘 다 얻는다.

## 참고

- [RFC 8446: The Transport Layer Security (TLS) Protocol Version 1.3](https://datatracker.ietf.org/doc/html/rfc8446) - 1.2절(1.2와의 차이), 2절과 2.2절(키 교환 모드와 PSK), 4.2.8절(key_share), 9.1절(필수 구현), 부록 B.4(암호 스위트)
- [RFC 9325: Recommendations for Secure Use of TLS and DTLS](https://datatracker.ietf.org/doc/html/rfc9325) - 4.1절, 4.2절(권장 스위트), 7.3절(forward secrecy). RFC 7525를 대체한다.
- [Intel: Advanced Encryption Standard Instructions (AES-NI)](https://www.intel.com/content/www/us/en/developer/articles/technical/advanced-encryption-standard-instructions-aes-ni.html)
- [TLS 핸드셰이크의 비용](/posts/tls-handshake-cost/), [SSL/TLS 정리](/posts/ssl-tls/)
