---
title: "시크릿 관리 - 로테이션과 주입 경로"
date: 2026-06-30
categories: [Notes, Infrastructure]
tags: [Security, Secret, Configuration, Deployment, Spring Boot, Operations]
---

시크릿 관리는 "저장소를 무엇으로 쓸까"의 문제로 좁혀지기 쉽다. 실제로 사고를 만드는 것은 저장소가 아니라 경로다. 값이 어디서 출발해 어디를 지나 애플리케이션에 닿는지, 그 과정에서 어디에 복사본이 남는지가 노출 지점을 정한다.

## 무엇이 시크릿인가

DB 비밀번호, API 키, 토큰 서명 키, 암호화 키, 외부 기관 인증서. 공통점은 유출되면 곧바로 권한으로 쓰인다는 것이다.

시크릿이 아닌 것과 섞지 않는 것이 첫 단계다. 엔드포인트 URL, 타임아웃, 풀 크기는 설정이지 시크릿이 아니다. 둘을 같은 파일에 두면 설정을 다루는 편의(로그 출력, 커밋, 공유)가 시크릿에도 적용된다.

## 주입 경로별 노출 지점

| 경로 | 노출되는 곳 |
| --- | --- |
| 소스 코드 상수 | 저장소 전체 이력. 한 번 커밋되면 되돌릴 수 없다 |
| 설정 파일을 커밋 | 같음 |
| 환경 변수 | `/proc/<pid>/environ`, `docker inspect`, 크래시 덤프, 일부 APM |
| 파일 마운트 | 컨테이너 파일시스템. 권한으로 제한 가능 |
| 시작 시 시크릿 저장소 조회 | 메모리. 저장소 접근 자격 증명이 필요(부트스트랩 문제) |

환경 변수는 가장 흔한 방식이고 가장 자주 새는 경로이기도 하다. **프로세스 환경은 생각보다 널리 읽힌다.** 디버그 엔드포인트, 크래시 리포터, 프로세스 목록 도구가 그것을 뜬다. OWASP도 "Environment variables are generally accessible to all processes and may be included in logs or system dumps."라고 적는다(환경 변수는 대개 모든 프로세스가 읽을 수 있고 로그나 시스템 덤프에 포함될 수 있다, [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)). 파일 마운트는 접근을 파일 권한으로 좁힐 수 있다는 점에서 다르다.

## 부트스트랩 문제

시크릿 저장소(Vault, AWS Secrets Manager 등)를 쓰면 "그 저장소에 접근할 자격 증명"이 필요해진다. 시크릿을 지키려고 시크릿을 하나 더 만드는 셈이다.

현실적인 답은 **플랫폼이 주는 신원**을 쓰는 것이다. AWS의 IAM Role for Service Account, 쿠버네티스의 ServiceAccount 토큰, 클라우드의 인스턴스 메타데이터. 애플리케이션이 들고 있는 것이 아니라 환경이 증명해 주는 신원이므로 유출할 값 자체가 없다.

## 기본값을 두지 않는다

시크릿에 기본값을 주면 **배포가 조용히 성공한다.** 설정이 빠졌는데도 애플리케이션이 뜨고, 알려진 값으로 동작한다. 개발 편의로 넣은 `password: changeme`가 운영에 그대로 가는 경로가 이것이다.

[ParityPay](/posts/parity-pay-invariants/)의 [ADR-011](https://github.com/polynomeer/parity-pay/blob/main/docs/adr/011-deployment-shape.md)이 이 규칙을 적었다. 웹훅 서명 비밀값이 기본 설정에 개발용 값으로 박혀 있어서, 아무것도 주입하지 않아도 배포가 알려진 비밀값으로 조용히 떴다. 그래서 기본값을 없애고 없으면 뜨지 않게 했다. 기동 실패는 시끄럽고 즉시 발견되지만, 알려진 값으로 뜬 서비스는 조용하다.

스프링에서는 `@Value("${app.secret}")`에 기본값을 주지 않으면 없을 때 기동이 실패한다. 이것이 의도된 동작이다.

## 로테이션

시크릿은 언젠가 바꿔야 한다. 유출 의심, 퇴사자 정리, 정책상 주기, 인증서 만료. 로테이션이 설계에 없으면 그날이 장애가 된다.

어려운 부분은 **두 값이 동시에 유효한 구간**이다. 새 값으로 바꾸는 순간 옛 값으로 발급된 것들이 전부 무효가 되면 안 된다.

- **대칭키·API 키**: 두 개를 동시에 허용하는 기간을 둔다. 새 키로 발급을 시작하고, 옛 키는 검증만 받다가 유예 기간 뒤 제거한다. OWASP도 쓰기에는 새 키를, 읽기에는 옛 키를 남겨 두는 방식을 로테이션 전략으로 든다.
- **JWT 서명 키**: 키 ID(`kid`)를 헤더에 넣어 여러 키를 동시에 검증한다. JWKS가 이 구조다([JWT의 구조와 검증](/posts/jwt-structure-and-verification/)).
- **DB 비밀번호**: 사용자를 두 개 두거나, 짧은 수명의 동적 자격 증명을 발급받는다.

그래서 무중단 로테이션이 가능한 구조를 미리 만들어 둬야 한다. 값을 바꾸는 절차보다 "두 값이 공존하는 기간"의 설계가 어렵다.

## 실수로 커밋했을 때

되돌릴 수 없다고 봐야 한다. 히스토리를 고쳐도 포크, 캐시, CI 로그, 로컬 클론에 남는다. **순서는 하나다. 즉시 무효화하고, 새 값을 발급하고, 그 다음에 이력을 정리한다.** OWASP도 노출된 키는 즉시 폐기해야 한다고 적는다. 이력 정리를 먼저 하면 그 사이에 노출 상태가 유지된다.

예방은 커밋 전 검사다. OWASP는 IDE나 pre-commit 훅처럼 개발자 단계에서 시크릿을 탐지하라고 권한다. 시크릿 스캐너를 pre-commit 훅과 CI에 함께 둔다. 훅은 우회 가능하므로 CI가 최종 방어선이다.

## 이 설명이 깨지는 곳

- **로그가 가장 흔한 유출 경로다.** 요청 본문을 통째로 찍거나, 예외 메시지에 연결 문자열이 포함되거나, 설정 객체를 `toString()`으로 남기면 그대로 나간다. [ParityPay의 규칙](/posts/parity-pay-invariants/)에 "로그·이벤트 payload에 비밀번호, 토큰, 전체 계좌번호를 남기지 않는다"가 있는 이유다.
- 암호화 저장이 접근 제어를 대신하지 않는다. 복호화 키에 접근 가능한 모두가 평문에 접근 가능하다.
- 쿠버네티스 Secret은 기본적으로 base64 인코딩일 뿐이다. 문서는 Secret이 기본적으로 API 서버의 저장소(etcd)에 암호화되지 않은 채 저장된다고 적고, 최소 조치로 저장 시 암호화와 최소 권한 RBAC(역할 기반 접근 제어)을 든다([Kubernetes: Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)).
- 개발 환경의 시크릿도 시크릿이다. 개발 DB가 운영 데이터의 복사본이면 특히 그렇다.

## 무엇을 재면 확인되는가

측정보다 점검에 가깝다.

1. 실행 중인 컨테이너에서 `docker inspect`와 `/proc/<pid>/environ`으로 시크릿이 보이는지 직접 확인한다.
2. 로그를 시크릿 패턴으로 검색한다. 정기적으로 돌리는 것이 의미 있다.
3. 시크릿을 지우고 배포해 본다. 기동이 실패하는지, 아니면 기본값으로 뜨는지.

3번이 가장 확실한 점검이다. 기본값이 없다는 규칙은 그것을 실제로 해 봐야 확인된다.

## 실무와의 접점

[ISMS 대응](/posts/logsystem/) 작업에서 로그 수집 체계를 다뤘다. 그때 주된 관심은 "필요한 로그를 빠짐없이 모으는 것"이었고, "모으지 말아야 할 것이 섞이지 않는가"는 부차적이었다. 지금 보면 순서가 반대여야 한다. 수집 범위를 넓히면 유출 경로도 함께 넓어지기 때문이다.

## 정리

- 저장소를 고르기 전에 값이 지나는 경로와 복사본이 남는 곳을 먼저 적어 본다.
- 실수로 커밋했으면 무효화 → 재발급 → 이력 정리 순서다.

## 참고

- [OWASP: Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Kubernetes: Secrets - Security considerations](https://kubernetes.io/docs/concepts/configuration/secret/)
- [12 Factor App: Config](https://12factor.net/config)
