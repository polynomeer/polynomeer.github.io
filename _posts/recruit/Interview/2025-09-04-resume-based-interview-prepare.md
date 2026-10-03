---
title: 이력서 기반의 면접 준비 노트
date: 2025-09-04
categories: [Recruit, Interview]
tags: [Recruit, Interview, Career, Java, MySQL]
---

## Java 11, 17, 21의 차이점

Java 11, 17, 21은 모두 LTS(Long-Term Support) 릴리스다. 아래는 각 버전에 포함된 JEP를 기준으로 정리한 것이다. 어떤 기능이 어느 버전에서 정식(final)이 되었는지는 해당 JEP의 Release 항목으로 확인했다.

### Java 11

JDK 11의 GA는 2018년 9월 25일이다([JDK 11](https://openjdk.org/projects/jdk/11/)).

- HTTP Client가 표준 API가 되었다([JEP 321](https://openjdk.org/projects/jdk/11/)).
- Java EE와 CORBA 모듈이 제거되었다. JAXB(`java.xml.bind`), JAX-WS(`java.xml.ws`), JTA(`java.transaction`) 등 9개 모듈이 빠졌다([JEP 320](https://openjdk.org/jeps/320)). 그래서 Java 8에서 올릴 때 이 API를 쓰는 코드나 라이브러리가 있으면 별도 라이브러리를 의존성으로 추가해야 한다.
- Oracle JDK 11부터는 JRE와 Server JRE를 따로 제공하지 않고 JDK만 제공한다. JavaFX도 JDK에 포함되지 않고 openjfx.io에서 별도로 받는다. 애플릿과 Java Web Start를 포함한 deployment stack도 제거되었다([Oracle JDK 11 Release Notes](https://www.oracle.com/java/technologies/javase/11-relnote-issues.html)). 이 항목은 OpenJDK의 JEP가 아니라 Oracle JDK 배포판의 변경이다.
- CMS GC는 Java 11에서 제거되지 않았다. JDK 9에서 deprecated 되었고([JEP 291](https://openjdk.org/jeps/291)), 실제 제거는 JDK 14다([JEP 363](https://openjdk.org/jeps/363)).
- `var`는 JDK 10에서 도입되었고, 초기화식이 있는 지역 변수와 for 문의 인덱스 변수에만 쓸 수 있다. 필드, 메서드 파라미터, 반환 타입에는 쓸 수 없다([JEP 286](https://openjdk.org/jeps/286)). JDK 11에서는 람다 파라미터에도 `var`를 쓸 수 있게 되었다([JEP 323](https://openjdk.org/projects/jdk/11/)).
- 그 밖에 ZGC(실험 기능), Flight Recorder, TLS 1.3이 JDK 11에 포함되었다([JDK 11](https://openjdk.org/projects/jdk/11/)).

### Java 17

JDK 17의 GA는 2021년 9월 14일이다([JDK 17](https://openjdk.org/projects/jdk/17/)).

- Sealed Classes가 정식 기능이 되었다([JEP 409](https://openjdk.org/projects/jdk/17/)).
- Java 11 이후 문법 변화가 많다. Switch Expressions는 JDK 14([JEP 361](https://openjdk.org/jeps/361)), Records와 `instanceof` 패턴 매칭은 JDK 16에서 정식이 되었다([JEP 395](https://openjdk.org/jeps/395), [JEP 394](https://openjdk.org/jeps/394)). 11에서 17로 올리면 이 기능을 모두 정식으로 쓸 수 있다. 반면 `switch` 패턴 매칭은 JDK 17에서 아직 프리뷰다([JEP 406](https://openjdk.org/projects/jdk/17/)).
- Security Manager가 제거 예정(deprecated for removal)으로 지정되었다([JEP 411](https://openjdk.org/projects/jdk/17/)). 기존 보안 정책이 Security Manager에 의존한다면 영향을 받는다.
- JDK 내부 API가 강하게 캡슐화되었다([JEP 403](https://openjdk.org/projects/jdk/17/)). 내부 API에 직접 접근하던 코드는 Java 11에서 올릴 때 영향을 받는다.
- Spring Boot 3.0은 Java 17을 최소 버전으로 요구한다([Spring Boot 3.0 Release Notes](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.0-Release-Notes)).

### Java 21

JDK 21의 GA는 2023년 9월 19일이다([JDK 21](https://openjdk.org/projects/jdk/21/)).

- Virtual Threads가 정식 기능이 되었다([JEP 444](https://openjdk.org/jeps/444)). 목표는 thread-per-request 방식으로 작성한 서버 애플리케이션이 하드웨어를 최대한 활용하며 확장되게 하는 것이다. JEP는 가상 스레드가 더 빠른 스레드가 아니라고 설명한다. 이점은 동시에 처리할 작업이 많고 대부분 I/O를 기다리는 워크로드에서 처리량이 늘어나는 것이고, CPU 위주 작업에서는 이점이 없다.
- `switch` 패턴 매칭([JEP 441](https://openjdk.org/projects/jdk/21/)), Record Patterns([JEP 440](https://openjdk.org/projects/jdk/21/)), Sequenced Collections([JEP 431](https://openjdk.org/projects/jdk/21/))가 포함되었다.
- finalization은 JDK 18에서 제거 예정으로 지정되었다([JEP 421](https://openjdk.org/jeps/421)). JDK 21에서 새로 생긴 변화는 아니다. JEP 421은 대안으로 try-with-resources와 Cleaner API를 제시한다.
- Spring Boot 3.2부터는 Java 21에서 `spring.threads.virtual.enabled`를 `true`로 설정해 가상 스레드를 쓸 수 있다([Spring Boot 3.2 Release Notes](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.2-Release-Notes)).

## MySQL 5.7과 8.0의 차이

MySQL 8.0 레퍼런스 매뉴얼의 새 기능 목록([What Is New in MySQL 8.0](https://dev.mysql.com/doc/refman/8.0/en/mysql-nutshell.html))과 업그레이드 문서([Changes in MySQL 8.0](https://docs.oracle.com/cd/E17952_01/mysql-8.0-en/upgrading-from-previous-series.html))를 기준으로 정리했다.

- 윈도 함수와 공통 테이블 표현식(CTE, `WITH`)을 지원한다. CTE는 재귀와 비재귀를 모두 지원한다.
- 트랜잭션 데이터 딕셔너리를 도입했다. 이전 버전에서는 딕셔너리 데이터를 메타데이터 파일과 비트랜잭션 테이블에 저장했다.
- 기본 문자셋이 `latin1`에서 `utf8mb4`로 바뀌었다. 서버 기본값은 5.7에서 `latin1` / `latin1_swedish_ci`였고([MySQL 5.7 Server Character Set and Collation](https://docs.oracle.com/cd/E17952_01/mysql-5.7-en/charset-server.html)), 8.0에서 `utf8mb4` / `utf8mb4_0900_ai_ci`다([MySQL 8.0 Server Character Set and Collation](https://dev.mysql.com/doc/refman/8.0/en/charset-server.html)).
- 쿼리 캐시가 제거되었다. 5.7에서는 deprecated 상태였다([What Is New in MySQL 5.7](https://docs.oracle.com/cd/E17952_01/mysql-5.7-en/mysql-nutshell.html)).
- 기본 인증 플러그인이 `mysql_native_password`에서 `caching_sha2_password`로 바뀌었다.
- 내림차순 인덱스를 지원한다. 이전에는 인덱스 정의의 `DESC`가 무시되었고, 역순 스캔은 가능했지만 성능 손해가 있었다.
- invisible 인덱스를 지원한다. 옵티마이저는 쓰지 않지만 인덱스는 계속 유지된다.
- 히스토그램 통계를 지원한다. 히스토그램은 데이터 딕셔너리의 `column_statistics` 테이블에 저장되어 옵티마이저가 실행 계획을 세울 때 쓰고, `ANALYZE TABLE`로 관리한다([Optimizer Statistics](https://dev.mysql.com/doc/refman/8.0/en/optimizer-statistics.html)).
- 역할(role)을 지원한다. 역할은 이름이 붙은 권한의 묶음이다.
- JSON 타입은 5.7.8에서 도입되었고([What Is New in MySQL 5.7](https://docs.oracle.com/cd/E17952_01/mysql-5.7-en/mysql-nutshell.html)), 8.0.4에서 JSON 데이터를 관계형 테이블로 변환하는 `JSON_TABLE()` 함수가 추가되었다.

### 기능별 비교

| 범주 | MySQL 5.7 | MySQL 8.0 |
| --- | --- | --- |
| SQL 문법 | 윈도 함수, CTE 없음 | 윈도 함수, CTE 지원 |
| 메타데이터 | 메타데이터 파일과 비트랜잭션 테이블 | 트랜잭션 데이터 딕셔너리 |
| 서버 기본 문자셋 | `latin1` / `latin1_swedish_ci` | `utf8mb4` / `utf8mb4_0900_ai_ci` |
| 쿼리 캐시 | 존재(deprecated) | 제거됨 |
| 기본 인증 플러그인 | `mysql_native_password` | `caching_sha2_password` |
| 인덱스 | `DESC` 정의는 무시됨 | 내림차순 인덱스, invisible 인덱스 |
| 옵티마이저 통계 | 히스토그램 없음 | 히스토그램 통계(`ANALYZE TABLE`) |
| 권한 관리 | 역할 없음 | 역할(role) |
| JSON | JSON 타입 도입(5.7.8) | `JSON_TABLE()` 추가(8.0.4) |

### 업그레이드할 때 확인할 것

- 클라이언트와 드라이버 호환성: `caching_sha2_password`를 모르는 클라이언트와 커넥터는 이 플러그인으로 인증하는 계정에 접속할 수 없다. Connector/J는 8.0.9 이상이 필요하고, 5.7 이하의 `libmysqlclient`에 링크된 클라이언트는 8.0.4 이상으로 다시 컴파일해야 한다([Changes in MySQL 8.0](https://docs.oracle.com/cd/E17952_01/mysql-8.0-en/upgrading-from-previous-series.html)).
- 쿼리 캐시: 5.7에서 쿼리 캐시에 기대고 있었다면 8.0에는 없으므로 대안을 검토해야 한다.
- 문자셋과 정렬 규칙: 문자셋과 콜레이션을 명시하지 않으면 새로 만드는 데이터베이스와 테이블 등의 기본값이 이전과 달라진다([Changes in MySQL 8.0](https://docs.oracle.com/cd/E17952_01/mysql-8.0-en/upgrading-from-previous-series.html)).
- 실행 계획: 내림차순 인덱스와 히스토그램은 옵티마이저의 판단에 쓰이므로, 업그레이드 후 주요 쿼리의 실행 계획을 다시 확인한다.

## 쿼리 튜닝 답변에서 다시 생각해 볼 것

- 트랜잭션 범위가 어떻게 바뀌는지 확인한다.
- 답변 흐름은 문제 인식, 실행 계획에서 힌트 찾기, 프로젝션, lazy 로딩 순이었다. lazy 로딩으로 가져오는 부분은 주로 IN 절로 풀어냈다.
- OR 절은 차라리 쿼리를 쪼개어 보내는 편이 어떤지 생각해 본다.
- 색인(인덱스)은 이미 문제가 없었다.
- lazy 로딩도 병렬 처리로 이어질 수 있다.
- 0.9초에서 더 줄일 수도 있다는 점을 적어 보고 생각해 본다.

## 참고

- [JDK 11](https://openjdk.org/projects/jdk/11/) — OpenJDK
- [JDK 17](https://openjdk.org/projects/jdk/17/) — OpenJDK
- [JDK 21](https://openjdk.org/projects/jdk/21/) — OpenJDK
- [JEP 286: Local-Variable Type Inference](https://openjdk.org/jeps/286)
- [JEP 291: Deprecate the Concurrent Mark Sweep (CMS) Garbage Collector](https://openjdk.org/jeps/291)
- [JEP 320: Remove the Java EE and CORBA Modules](https://openjdk.org/jeps/320)
- [JEP 361: Switch Expressions](https://openjdk.org/jeps/361)
- [JEP 363: Remove the Concurrent Mark Sweep (CMS) Garbage Collector](https://openjdk.org/jeps/363)
- [JEP 394: Pattern Matching for instanceof](https://openjdk.org/jeps/394)
- [JEP 395: Records](https://openjdk.org/jeps/395)
- [JEP 421: Deprecate Finalization for Removal](https://openjdk.org/jeps/421)
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [JDK 11 Release Notes](https://www.oracle.com/java/technologies/javase/11-relnote-issues.html) — Oracle
- [Spring Boot 3.0 Release Notes](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.0-Release-Notes)
- [Spring Boot 3.2 Release Notes](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.2-Release-Notes)
- [What Is New in MySQL 8.0](https://dev.mysql.com/doc/refman/8.0/en/mysql-nutshell.html) — MySQL 8.0 Reference Manual
- [Changes in MySQL 8.0](https://docs.oracle.com/cd/E17952_01/mysql-8.0-en/upgrading-from-previous-series.html) — MySQL 8.0 Reference Manual
- [Server Character Set and Collation (8.0)](https://dev.mysql.com/doc/refman/8.0/en/charset-server.html) — MySQL 8.0 Reference Manual
- [Optimizer Statistics](https://dev.mysql.com/doc/refman/8.0/en/optimizer-statistics.html) — MySQL 8.0 Reference Manual
- [What Is New in MySQL 5.7](https://docs.oracle.com/cd/E17952_01/mysql-5.7-en/mysql-nutshell.html) — MySQL 5.7 Reference Manual
- [Server Character Set and Collation (5.7)](https://docs.oracle.com/cd/E17952_01/mysql-5.7-en/charset-server.html) — MySQL 5.7 Reference Manual
