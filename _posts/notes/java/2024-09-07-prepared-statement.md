---
title: "Statement와 PreparedStatement는 무엇이 다른가"
date: 2024-09-07
categories: [Notes, Java]
tags: [Java, JDBC, PreparedStatement, SQL]
---

JDBC를 처음 다룰 때 `Statement`와 `PreparedStatement`는 둘 다 SQL을 실행하는 도구처럼 보인다. 하지만 실제로는 사용 목적과 안전성, 성능 특성이 꽤 다르다. 실무에서는 특별한 이유가 없다면 대부분 `PreparedStatement`를 기본값으로 보는 편이 맞다.

## 가장 큰 차이: SQL을 어떻게 전달하느냐

`Statement`는 보통 완성된 SQL 문자열을 그대로 전달한다.

```java
String sql = "SELECT * FROM users WHERE id = " + userId;
Statement stmt = connection.createStatement();
ResultSet rs = stmt.executeQuery(sql);
```

반면 `PreparedStatement`는 SQL의 뼈대를 먼저 준비하고, 값은 나중에 바인딩한다.

```java
String sql = "SELECT * FROM users WHERE id = ?";
PreparedStatement ps = connection.prepareStatement(sql);
ps.setLong(1, userId);
ResultSet rs = ps.executeQuery();
```

이 차이가 보안성과 재사용성, 가독성까지 모두 바꾼다.

## 왜 `PreparedStatement`가 더 안전한가

가장 유명한 이유는 SQL Injection 방지다.

문자열 연결로 SQL을 만들면 사용자 입력이 쿼리 구조 자체를 바꿀 수 있다.

예를 들어:

```text
' OR 1=1 --
```

같은 입력이 그대로 SQL에 포함되면 의도하지 않은 조회가 가능해질 수 있다.

`PreparedStatement`는 SQL과 값을 분리해서 전달한다. 그래서 값이 쿼리 문법으로 해석되지 않고 데이터로만 처리된다. OWASP의 SQL Injection 방어 가이드도 같은 이유를 든다.

> "prepared statements ensure that an attacker cannot change the intent of a query, even if SQL commands are inserted by an attacker."
> ([OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html))

공격자가 SQL 명령을 끼워 넣어도 쿼리의 의도는 바뀌지 않는다는 뜻이다. 사용자 입력이 포함되는 SQL이라면 사실상 기본 선택지라고 봐야 한다.

## 성능에서도 차이가 날 수 있다

`PreparedStatement`는 "미리 컴파일된 SQL"로 설명되곤 하고, Javadoc도 "precompiled SQL statement"를 여러 번 효율적으로 실행하는 객체라고 적는다([PreparedStatement Javadoc](https://docs.oracle.com/en/java/javase/21/docs/api/java.sql/java/sql/PreparedStatement.html)). 다만 실제로 언제 어디서 준비되는지는 DB와 드라이버에 따라 다르다. 일반적으로는 다음 이점이 있다.

- 같은 SQL 템플릿을 반복 실행하기 쉽다
- 파라미터만 바꿔 재사용할 수 있다
- DB가 [실행 계획](/posts/reading-execution-plans/)을 재활용하기 더 유리한 경우가 있다

특히 같은 형태의 쿼리를 여러 번 수행하는 배치나 반복 조회에서는 `PreparedStatement`가 더 자연스럽다. 반대로 바인딩 값의 타입이 들쭉날쭉하면 같은 SQL이 DB에서 다른 쿼리로 취급될 수 있다. Oracle에서 그 일이 벌어진 사례는 [네이버 D2 child cursor 리뷰](/posts/naver-oracle-child-cursor-explosion/)에서 다룬다.

## 가독성과 유지보수 관점에서도 유리하다

문자열 연결로 SQL을 만들면 코드가 금방 지저분해진다.

```java
String sql = "SELECT * FROM orders WHERE status = '" + status + "' AND created_at >= '" + from + "'";
```

이런 코드는:

- 따옴표 처리 실수가 생기기 쉽고
- 타입 변환 규칙이 섞이며
- 조건이 늘수록 읽기 어려워진다

반면 `PreparedStatement`는 SQL 구조와 입력값 바인딩이 분리되어 있어 의도가 더 분명하다.

## 언제 `Statement`를 쓰나

그렇다고 `Statement`가 완전히 쓸모없다는 뜻은 아니다.

다음처럼 입력값이 없고, 매번 다른 SQL 문자열을 즉석에서 실행해야 하는 상황에서는 사용할 수 있다.

- 단순한 DDL 실행
- 관리성 스크립트
- 외부 입력이 개입되지 않는 고정 SQL

예:

```java
Statement stmt = connection.createStatement();
stmt.execute("CREATE TABLE sample (id BIGINT)");
```

하지만 일반적인 CRUD나 검색 쿼리에서는 `PreparedStatement`가 더 안전하고 일관된 선택이다.

## 배치 처리에서도 `PreparedStatement`가 자연스럽다

여러 값을 반복해서 넣는 경우에는 `PreparedStatement`와 배치 실행이 잘 맞는다.

```java
String sql = "INSERT INTO users(name, age) VALUES (?, ?)";
PreparedStatement ps = connection.prepareStatement(sql);

for (User user : users) {
    ps.setString(1, user.getName());
    ps.setInt(2, user.getAge());
    ps.addBatch();
}

ps.executeBatch();
```

이 패턴은 문자열을 매번 새로 조립하는 것보다 훨씬 안정적이고, JDBC 코드도 일관되게 유지된다.

## 실무에서 자주 하는 실수

### `PreparedStatement`를 쓰지만 SQL은 여전히 문자열로 조립하는 경우

예를 들어 조건 일부를 문자열 연결로 붙이고, 나머지만 바인딩하면 Injection 위험이 완전히 사라지지 않을 수 있다. 바인딩 가능한 값은 끝까지 파라미터로 처리하는 습관이 중요하다.

### 동적 컬럼명이나 정렬 조건을 그대로 받는 경우

파라미터 바인딩은 값에만 적용된다. 컬럼명, 테이블명, 정렬 방향 같은 식별자는 `?`로 바인딩할 수 없다. 이런 값은 화이트리스트 기반으로 직접 제한해야 한다. OWASP 가이드도 바인딩할 수 없는 자리에는 입력 검증이나 쿼리 재설계를 방어책으로 권하고, 테이블·컬럼 이름은 사용자 파라미터가 아니라 코드에서 오는 것이 이상적이라고 적는다.

## 정리

`Statement`와 `PreparedStatement`의 차이는 SQL 구조와 값을 분리하느냐에 있다. 보안, 반복 실행, 가독성의 차이가 모두 이 분리에서 나온다.

JDBC를 직접 다룬다면 사용자 입력이나 반복 실행이 조금이라도 있을 때 기본값을 `PreparedStatement`로 둔다. 바인딩할 수 없는 식별자만 화이트리스트로 따로 막으면 된다.

## 참고

- [Java SE 21: PreparedStatement](https://docs.oracle.com/en/java/javase/21/docs/api/java.sql/java/sql/PreparedStatement.html)
- [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
