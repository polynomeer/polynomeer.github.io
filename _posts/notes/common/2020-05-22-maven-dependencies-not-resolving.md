---
title: "Maven Dependencies를 가져오지 못할 때 어디부터 봐야 하는가"
date: 2020-05-22
categories: [Notes, Common]
tags: [Maven, Dependency Management, Build]
---

Maven 프로젝트를 열었는데 의존성이 내려받아지지 않으면, 처음에는 단순히 IDE 문제처럼 보일 수 있다. 하지만 실제 원인은 저장소 설정, 네트워크, 프록시, 로컬 캐시, 버전 좌표 오류 등 다양하다.

---

## Maven이 의존성을 찾는 순서

원인을 좁히려면 Maven이 의존성을 어디서 찾는지부터 알아야 한다. Maven 문서에 따르면 로컬 저장소는 Maven이 실행되는 컴퓨터의 디렉터리이고, 원격에서 내려받은 것을 캐시한다. 다운로드는 프로젝트가 선언한 의존성이 로컬 저장소에 없을 때 일어나고, 기본적으로 중앙 저장소(Maven Central)에서 받는다([Introduction to Repositories](https://maven.apache.org/guides/introduction/introduction-to-repositories.html)).

1. 로컬 저장소(기본 `~/.m2/repository`)에 해당 좌표의 파일이 있는지 본다.
2. 없으면 `pom.xml`과 `settings.xml`에 설정된 원격 저장소에 요청한다. 미러가 설정돼 있으면 원래 저장소 대신 미러로 간다.
3. 받은 파일을 로컬 저장소에 저장하고 빌드에 쓴다.

실패는 이 세 단계 중 하나에서 일어난다. 좌표가 틀렸거나, 원격 저장소에 닿지 못했거나, 로컬에 남은 것이 잘못됐거나.

---

## 가장 먼저 확인할 것

- `groupId`, `artifactId`, `version`이 맞는가
- 중앙 저장소나 사설 저장소에 실제로 존재하는가
- 네트워크나 프록시 제한이 있는가
- 로컬 캐시가 깨져 있지는 않은가

---

## IDE 문제와 빌드 문제를 구분하기

중요한 것은 IDE 화면이 아니라 CLI 빌드다.

`mvn dependency:resolve`나 `mvn clean compile`이 실패하면 실제 의존성 문제이고, CLI는 되는데 IDE만 안 되면 인덱싱이나 프로젝트 동기화 문제일 가능성이 크다.

CLI에서 실패했다면 옵션 몇 개로 정보를 더 얻을 수 있다([Maven CLI Options Reference](https://maven.apache.org/ref/3.9.9/maven-embedder/cli.html)).

```bash
mvn -U clean compile        # 누락된 릴리스와 갱신된 스냅샷을 원격 저장소에서 강제로 다시 확인
mvn -X clean compile        # 디버그 출력: 어느 저장소 URL로 요청했는지 보인다
mvn dependency:tree         # 의존성 트리: 어떤 의존성이 문제의 라이브러리를 끌어왔는지 보인다
```

`-U`가 필요한 이유가 있다. Maven은 원격 저장소를 얼마나 자주 다시 확인할지를 `updatePolicy`로 정하고, 기본값은 `daily`다([Settings Reference](https://maven.apache.org/settings.html)). 저장소 설정을 고친 뒤에도 같은 실패가 반복된다면, Maven이 아직 원격을 다시 확인하지 않은 것일 수 있다. `-U`는 이 확인을 강제한다.

`-X` 출력에서는 실제로 요청한 URL을 찾는다. 기대한 사내 저장소가 아니라 중앙 저장소로 가고 있다면 저장소나 미러 설정이 적용되지 않은 것이다.

---

## 자주 나오는 원인

### 잘못된 버전 좌표

오타가 있거나 존재하지 않는 버전을 적으면 당연히 내려받지 못한다.

중앙 저장소 검색 화면에서 같은 좌표가 실제로 있는지 확인한다. 직접 선언하지 않은 라이브러리가 문제라면 `mvn dependency:tree`로 그것을 끌어온 상위 의존성을 찾는다.

### 사설 저장소 설정 누락

회사 환경에서는 Nexus나 Artifactory를 거치는 경우가 많다. 이 저장소 설정이 빠지면 외부에서는 존재하는 라이브러리도 내부 환경에서 못 받을 수 있다.

사설 저장소는 보통 `~/.m2/settings.xml`의 미러로 설정한다([Using Mirrors for Repositories](https://maven.apache.org/guides/mini/guide-mirror-settings.html)).

```xml
<settings>
  <mirrors>
    <mirror>
      <id>internal-repository</id>
      <name>Internal Repository Manager</name>
      <url>https://repo.example.com/maven2</url>
      <mirrorOf>*</mirrorOf>
    </mirror>
  </mirrors>
  <servers>
    <server>
      <id>internal-repository</id>
      <username>build-user</username>
      <password>build-password</password>
    </server>
  </servers>
</settings>
```

- `mirrorOf`가 `central`이면 중앙 저장소 요청만, `*`이면 모든 저장소 요청을 이 미러로 보낸다. `external:*`는 localhost나 파일 기반이 아닌 모든 저장소를 뜻한다.
- 인증이 필요한 저장소라면 `<servers>`에 자격 증명을 넣는다. 문서에 따르면 `server`의 `id`는 Maven이 접속하려는 저장소나 미러의 `id`와 일치해야 한다. 이 둘이 다르면 인증 정보가 해당 저장소 요청에 쓰이지 않는다.
- 하나의 저장소에는 미러가 최대 하나만 적용된다.

### 로컬 캐시 손상

`.m2` 아래에 깨진 아티팩트가 남아 있으면 반복적으로 실패할 수 있다. 이 경우 특정 디렉터리만 지우고 다시 받는 것이 전체 삭제보다 안전하다.

예를 들어 `com.example:foo:1.2.0`이 문제라면 `~/.m2/repository/com/example/foo/1.2.0/` 디렉터리만 지우고 `mvn -U`로 다시 받는다. 전체 삭제는 모든 의존성을 처음부터 다시 받게 하므로 느리고, 사설 저장소 접근이 막힌 환경에서는 오히려 더 많은 것을 잃는다. Maven 문서도 로컬 저장소는 평소 손댈 필요가 없고, 디스크가 부족할 때 정리하거나 모두 다시 받을 각오가 있을 때 지우면 된다고 적는다.

### 프록시와 인증 문제

사내망, VPN, 프록시 인증이 개입되면 저장소 접근 자체가 막힐 수 있다.

Maven이 프록시를 거쳐 저장소에 접속하게 하려면 `settings.xml`에 프록시를 적는다([Configuring a proxy](https://maven.apache.org/guides/mini/guide-proxies.html)).

```xml
<proxies>
  <proxy>
    <id>example-proxy</id>
    <active>true</active>
    <protocol>http</protocol>
    <host>proxy.example.com</host>
    <port>8080</port>
    <username>proxyuser</username>
    <password>somepassword</password>
    <nonProxyHosts>www.google.com|*.example.com</nonProxyHosts>
  </proxy>
</proxies>
```

사용자 이름과 비밀번호는 프록시가 기본 인증을 요구할 때만 필요하다. 사내 저장소처럼 프록시를 거치지 않아야 하는 호스트는 `nonProxyHosts`에 `|`로 구분해 넣는다. 문서는 NTLM 프록시는 테스트되지 않아 지원하지 않는다고 적는다.

---

## 덧붙임: HTTP 저장소 차단

이 글을 쓴 뒤인 2021년에 나온 Maven 3.8.1부터는 외부 HTTP 저장소가 기본으로 차단된다. 기본 `conf/settings.xml`에 `maven-default-http-blocker` 미러가 추가되었고, 중간자 공격(CVE-2021-26291)을 막기 위한 변경이다([Maven 3.8.1 Release Notes](https://maven.apache.org/docs/3.8.1/release-notes.html)). 오래된 프로젝트가 `http://` 주소의 저장소를 쓰고 있다면, Maven을 올린 뒤 갑자기 의존성을 받지 못할 수 있다. 저장소 주소를 HTTPS로 바꾸는 것이 우선이다.

---

## 정리

Maven 의존성 문제는 IDE를 다시 켜는 것으로 끝나지 않는 경우가 많다. 좌표, 저장소, 캐시, 네트워크를 순서대로 나눠 보면 대부분의 원인을 좁힐 수 있다.

## 참고

- [Introduction to Repositories](https://maven.apache.org/guides/introduction/introduction-to-repositories.html) — Apache Maven
- [Settings Reference](https://maven.apache.org/settings.html) — Apache Maven
- [Using Mirrors for Repositories](https://maven.apache.org/guides/mini/guide-mirror-settings.html) — Apache Maven
- [Configuring a proxy](https://maven.apache.org/guides/mini/guide-proxies.html) — Apache Maven
- [CLI Options Reference](https://maven.apache.org/ref/3.9.9/maven-embedder/cli.html) — Apache Maven
- [Maven 3.8.1 Release Notes](https://maven.apache.org/docs/3.8.1/release-notes.html) — Apache Maven
