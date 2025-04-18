---
title: Java 진화의 두 축 JEP vs JSR
date: 2025-04-17
categories: [Archive, Programming]
tags: [Java, JEP, JSR]
---

# Java 진화의 두 축: JEP vs JSR

Java 플랫폼은 수십 년 동안 지속적으로 발전해왔고, 그 변화의 흐름을 이끄는 두 가지 핵심 제안 시스템이 있다. 바로 **JEP (JDK Enhancement Proposal)** 과 **JSR (Java Specification Request)** 이다. 이 글에서는 두 시스템의 차이점, 유래, 넘버링 체계까지 명확히 정리한다.

---

## 1. JEP (JDK Enhancement Proposal)

### 정의
JEP는 **JDK Enhancement Proposal**의 약자로, Java 개발 키트(JDK)의 새로운 기능이나 변경 사항을 제안하는 **OpenJDK 내부 문서 체계**이다.

### 목적
- 새로운 기능, 언어 개선, JVM 기능 확장 등의 제안을 정리
- OpenJDK 커뮤니티 중심의 **개발 로드맵 공유 및 구현 방향 제시**
- Python의 PEP(Python Enhancement Proposal)에서 착안하여 도입

### 시작
- **JEP 0**부터 시작 (2011년경)
- Oracle과 OpenJDK 개발팀 주도로 설계

### 예시
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444) (Java 21)
- [JEP 409: Sealed Classes](https://openjdk.org/jeps/409) (Java 17)

---

## 2. JSR (Java Specification Request)

### 정의
JSR은 **Java Specification Request**의 약자로, Java 플랫폼의 공식 표준 명세를 정의하는 **JCP(Java Community Process)** 기반 문서이다.

### 목적
- Java SE, EE, ME 플랫폼 전반의 **공식 API 명세 제안 및 변경**
- Java 표준화와 생태계 확장을 위한 **형식적 절차**
- 다수의 기업 및 개인이 참여하는 **공개 표준화 프로세스**

### 시작
- **JSR 1**부터 시작 (1998년)
- Sun Microsystems 시절부터 운영되어 현재까지 유지

### 예시
- [JSR 380: Bean Validation 2.0](https://jcp.org/en/jsr/detail?id=380)
- [JSR 338: JPA 2.1](https://jcp.org/en/jsr/detail?id=338)

---

## 3. JEP vs JSR 넘버링 방식

| 항목 | JEP | JSR |
|------|-----|-----|
| 시작 번호 | JEP 0 | JSR 1 |
| 넘버링 방식 | OpenJDK에서 독립적으로 관리 | JCP에서 독립적으로 관리 |
| 서로 연동되는가? | 예: JEP → JSR로 이어지는 경우도 있었음 | 반대로는 드뭄 |
| 관계 | 현재는 JEP 중심 개발로 전환 | 공식 명세는 여전히 JSR 기반이지만 활동은 미미 |

**중요:**  

> JEP의 번호는 **JSR의 마지막 번호 이후로 시작된 것이 아니라**, 전혀 **별개로 독립적으로 부여된 체계**이다.

즉, JEP 1은 JSR 381 이후가 아닌 **JEP 0부터 새롭게 시작된 것**이다.

---

## 4. 현재의 흐름: JEP 중심 체계로 이동

Java 9 이후부터는 플랫폼의 민첩한 발전을 위해 **JEP 중심의 설계 및 구현 프로세스**가 주도되고 있으며, JSR은 과거 Java 표준의 중심이었지만, **Jakarta EE에서는 더 이상 사용되지 않고 있으며**, 현재는 각 플랫폼(Eclipse, OpenJDK)이 자체 명세 체계를 통해 진화하고 있다.

> - **JSR(Java Specification Request)**는 더 이상 **Java EE / Jakarta EE 표준으로 사용되지 않는다.**
> - **Java EE → Jakarta EE 이관 이후**부터는, **JCP(JCP.org) 대신 Eclipse Foundation이 자체 명세 프로세스를 통해 표준을 관리**
> - **Java SE 일부 기능만 JSR로 남아 있으나**, 실질적으로 **JEP 중심**으로 전환

**JCP는 폐쇄적이고 느린 표준화 프로세스**였고, Oracle이 Java EE를 Eclipse Foundation에 기증하면서, 다음과 같이 선언하였다.

> ⚠️ **"JSR을 통한 명세 관리는 Jakarta EE에서 더 이상 사용하지 않겠다"**

---

## 5. JEP vs JSR 정리

| 항목 | JEP | JSR |
|------|-----|-----|
| 이름 | JDK Enhancement Proposal | Java Specification Request |
| 역할 | JDK 기능 제안/설계/실험 | Java 플랫폼 공식 명세 |
| 관리 주체 | OpenJDK (Oracle) | JCP (Java Community Process) |
| 시작 번호 | 0 | 1 |
| 도입 시기 | 2011년경 | 1998년경 |
| 현재 주류 | ✅ 활발히 사용됨 | ❌ 거의 중단됨 |

---

실무에서 **JEP**와 **JSR**은 직접 "작성"하거나 "제출"하는 것이 아니라, **기능 이해**, **기술 선정**, **문서 작성** 시에 **참고하고 인용하는 용도로 활용**됩니다.
 각각의 성격이 다르기 때문에, **언제 어떤 문맥에서 JEP 또는 JSR을 언급하는 게 적절한지** 알려드릴게요.

------

## 6. 실무에서의 의사소통 관점

| 상황                         | 사용 용어        | 설명                                           |
| ---------------------------- | ---------------- | ---------------------------------------------- |
| Java 버전별 기능 변화 설명   | ✅ JEP            | 개발자들과 명확한 버전 변화 공유 가능          |
| API 명세 기반 설계/개발      | ✅ JSR            | 공식 스펙에 기반한 설계 표기                   |
| 프레임워크나 라이브러리 평가 | ✅ JSR            | "어떤 JSR 구현체냐?" 기준으로 비교             |
| 기술 도입 회의 또는 교육     | ✅ JEP & JSR 병행 | 도입기술이 실험적이면 JEP, 표준이면 JSR로 구분 |

------

## ✍️ 한 줄 요약

> JEP는 **“왜 이 기능이 생겼는지”** 설명할 때, JSR은 **“이 기능이 어떤 표준을 따르는지”** 설명할 때 사용하자.

실무에서 JEP와 JSR을 잘 인용하면 **기술적 신뢰도와 커뮤니케이션 효율**이 크게 올라간다.

---

## 🔗 공식 목록 링크

- 📘 [JEP 전체 목록 보기](https://openjdk.org/jeps/0)
- 📗 [JSR 전체 목록 보기](https://www.jcp.org/en/jsr/all)
