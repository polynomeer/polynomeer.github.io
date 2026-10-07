---
title: "실제 면접에서 받은 질문: 회고와 보완한 답변"
date: 2025-08-05
categories: [Recruit, Interview]
tags: [Recruit, Interview, Reflection]
---

다섯 곳(W사, 엔라이즈, 뤼이드, Toss, 두들린)의 면접에서 받은 질문과, 그중 내가 충분히 답하지 못한 지점, 그리고 그 답변을 다시 정리한 내용이다. 질문은 면접관이 직접 한 것을 위주로 모았고, 질문 형식은 아니어도 문맥상 의도가 분명한 문장도 포함했다.

답변이 부족했다고 본 기준은 다음과 같다.

- 답변 중에 "잘 모르겠다", "정확히는 모르지만", "완벽히는 못했지만" 같은 불확실한 표현을 썼다.
- 면접관이 다시 되묻거나 보충 설명을 유도했다.
- 구조가 모호해 핵심이 흐려졌거나, 기술 개념을 충분히 설명하지 못했다.
- 실무 맥락에서의 적용이나 개선 방안이 약했다.

여러 면접에서 반복해서 나온 주제(채번 병목, `@TransactionalEventListener`, 대량 처리와 트랜잭션 범위, 메시지와 이벤트 유실)는 회사별로 나누지 않고 뒤쪽의 [여러 면접에서 반복된 주제](#여러-면접에서-반복된-주제)에 한 번만 정리했다.

---

## W사 면접

### 코딩 테스트 관련 질문

1. 문제를 메모리 캐시로 해결하시겠다고 결정한 이유가 무엇인가요?
2. 인메모리 캐시를 사용할 때 어떤 문제가 생기고, 히트율 전략으로 어떻게 개선하려고 하셨나요?
3. 무수히 많은 요청이 들어왔을 때 현재 구조에서 어떤 문제가 생길까요?
4. 콘텐츠 캐시와 카운트 맵의 생명주기를 어떻게 관리하실 생각이신가요?
5. 메모리를 2GB로 제한한 경우, 그 이상 요청이 오면 어떤 일이 벌어질까요?
6. 메모리를 초과 사용하는 경우 소프트웨어나 하드웨어적으로 어떤 일이 발생할 수 있을까요?
7. 성능 저하가 발생할 수 있는 포인트가 있다면 어디일까요?

### 이력서와 경력 기반 질문

1. 드리어스컴퍼니 퇴사 사유는 무엇인가요?
2. MCP 시스템이 어떤 시스템인지 쉽게 설명해줄 수 있을까요?
3. MDS 시스템은 어떤 시스템이었는지 설명해주실 수 있나요?
4. 크리에이터 스튜디오는 어떤 서비스였나요?
5. MCP 개편 프로젝트에서 본인이 맡은 역할은 무엇이었나요?
6. 그 프로젝트에서 총 몇 명이 백엔드 개발자로 참여했나요?
7. 사용 기술 중 Spring Security와 LDAP은 어떤 방식으로 사용했나요?
8. MDS에서 RBAC (Role-Based Access Control) 구조는 어떻게 설계하셨나요?

### 업무 방식과 협업 관련 질문

1. 드리어스컴퍼니에서 본인의 목표는 무엇이었나요?
2. 일을 주도적으로 진행하는 편인가요?
3. 그 회사의 조직 문화가 본인에게 잘 맞았나요?
4. 긴 업무 시간이나 야근 등은 괜찮으셨나요?
5. 업무하면서 가장 어려웠던 문제는 무엇이었고, 이를 어떻게 해결하셨나요?
6. 기술적인 방향이나 구조를 팀에 설득할 때 어떤 노력을 하셨나요?
7. 일정 압박을 받은 적이 있었나요? 있었다면 어떻게 대처하셨나요?

### 기술 역량 관련 질문

1. 본인이 가장 자신 있는 기술 역량은 무엇인가요?
2. 기획팀이나 비기술 구성원과 협업할 때 본인의 장점은 무엇인가요?

### 프로젝트 성과 관련 질문

1. 대량 등록 기능 개선에서 시간 단축(2시간 → 5분)의 맥락과 의미는 무엇이었나요?

### 인메모리 캐시의 한계와 대응

질문은 "무수히 많은 요청이 온다고 가정했을 때 지금의 구조에서는 어떤 문제가 있을까요?"였다. 캐시를 쓴 이유는 설명했고 구조적 문제도 인식하고 있었지만, 캐시 크기 제한이나 실제 운영 환경에서의 조치는 추상적으로 답했다. 추가 질문에 메모리 초과에서 OOM(OutOfMemoryError), 성능 저하와 장애로 이어지는 흐름은 설명했지만 구체적인 대응 방안이 부족했다.

다시 정리하면 이렇다. 인메모리 캐시는 응답이 빠르지만 캐시할 수 있는 데이터가 메모리 크기에 묶인다. 요청이 몰려 힙이 부족해지면 객체를 할당하지 못해 `java.lang.OutOfMemoryError: Java heap space`가 나고, 그 전 단계로 GC가 대부분의 시간을 쓰면서 힙을 거의 회수하지 못하면 `GC Overhead limit exceeded`가 난다([Oracle 트러블슈팅 가이드](https://docs.oracle.com/en/java/javase/21/troubleshoot/troubleshooting-memory-leaks.html)). 이를 막으려면 캐시 크기에 상한을 두고 LRU 같은 축출 정책과 TTL 기반 만료를 함께 적용하고, 메모리 사용량이 일정 수준을 넘으면 캐시 압축이나 캐시를 우회하는 로직을 둘 수 있다. 트래픽이 급증할 수 있는 시점에는 Redis 같은 외부 캐시를 함께 쓰는 2단계 캐시도 고려했다.

### 카운트 맵과 콘텐츠 캐시의 생명주기

질문은 "카운트 맵은 콘텐츠 캐시와 생명주기가 같아야 하지 않나요?"였다. 나는 "나중에 생명주기를 같이 해야겠다는 생각을 했다"고 답했고, 처음부터 고려하지 않았다는 인상을 남겼다.

다시 정리하면 이렇다. 초기 설계에서는 두 객체를 독립적으로 관리했지만, 구현 과정에서 두 객체의 만료 정책이 어긋나는 문제를 발견했다. 그래서 콘텐츠 캐시와 카운트 맵을 하나의 wrapper 객체로 묶고 TTL과 히트 카운트를 함께 관리하도록 바꿨다. 이렇게 하면 한쪽만 남아 메모리를 차지하는 일이 없어지고 캐시 정책도 한곳에서 일관되게 관리된다.

### 성능 저하 포인트

질문은 "성능 저하가 발생할 수 있는 포인트가 있을까요?"였다. 경험은 있었지만 원인을 정확히 설명하지 못했고, "정확히 무엇 때문인지는 모르겠다"는 식으로 답했다.

다시 정리하면 이렇다. 성능 저하는 보통 메모리 부족, GC pause, I/O 블로킹, 컨텍스트 스위칭 증가 같은 지점에서 생긴다. 내가 겪은 경우는 Redis 캐시에 장애가 나면서 요청이 DB로 넘어가 DB 부하가 늘고 응답 지연이 누적된 경우였다. 캐시 노드가 비면 모든 캐시 미스가 DB 조회로 이어져 지연이 늘어난다([AWS ElastiCache 캐싱 전략](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html)). 이 경험으로 캐시 장애에 대비한 전략이 필요하다고 보고, 이후에는 fallback 시에도 캐시 계층을 분산하는 구조를 도입했다.

### Redis 락 관련 장애 경험

실제 장애 사례를 설명할 때, 문제가 된 try-finally 구조와 그 영향을 장황하고 복잡하게 설명했다. 맥락 없이 길어지면서 "finally에서 락을 해제했기 때문에 생긴 문제"라는 요점이 묻혔다. 분산 락 자체에 대한 보완은 [Redis 분산 락](#redis-분산-락)에 정리했다.

### LDAP 연동

LDAP 사용 경험을 묻는 질문에 "LDAP을 직접 운영한 주체는 인프라 팀이었고, 나는 연동만 했다"고 답했다. 깊은 이해보다는 단순 연동 수준으로 들렸다.

다시 정리하면 이렇다. LDAP은 사내 계정 관리 시스템이었고, 사용자 인증과 권한 확인을 위해 연동했다. LDAP은 조직의 사용자 정보를 모아 두는 중앙 저장소이자 인증 서비스로 흔히 쓰인다. 서버를 직접 운영하지는 않았지만 Spring Security의 LDAP 모듈로 인증 흐름을 구성했다. Spring Security는 사용자의 자격 증명을 LDAP 서버에 보내 확인하는 bind 인증과, 저장된 비밀번호와 비교하는 방식을 제공하고, 사용자에게 줄 권한은 `LdapAuthoritiesPopulator`가 정한다([Spring Security LDAP 인증](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/ldap.html)). 로그인 시에는 LDAP에서 사용자를 조회해 DB의 연동 정보와 동기화했고, LDAP 인증 실패 시의 예외 처리와 사용자 role 매핑도 구현했다.

### RBAC 설계

면접관이 구조 설명을 요청했다. 메뉴별 권한 구조를 설명하다가 "구현 담당자가 합쳐버렸다", "정교하지 않았다", "잘 기억은 안 난다"는 표현을 썼고, 구조 설계를 주도했는지 단순히 참여했는지 불분명하게 들렸다.

다시 정리하면 이렇다. RBAC는 사용자에게 하나 이상의 역할을, 역할에 하나 이상의 권한을 부여하는 모델이다([NIST RBAC](https://csrc.nist.gov/projects/role-based-access-control)). MDS에서는 이 구조를 테이블 설계부터 반영했다. Role, RoleGroup, Menu를 각각 테이블로 분리해 관계형으로 설계했다. RoleGroup은 조직별 역할을 모아 두는 단위였고, Menu는 화면 단위로 정의해 Role마다 읽기와 쓰기 권한을 구분해 매핑했다. 인증 시에는 사용자의 Role, RoleGroup, Menu 순으로 접근 권한을 확인했다. 그래서 권한을 유연하게 추가하거나 Role을 재사용할 수 있었다.

### 기술적인 발표와 설득 경험

세미나를 통해 구조를 설득한 경험을 언급했지만 구체적인 예시나 성과는 말하지 못했다. "설득력이 있었다고 생각한다"는 내 판단만 있었고, 상대방의 피드백이나 결과는 제시하지 못했다.

---

## 엔라이즈 면접

### 경력과 이직 관련 질문

- 현재 회사 퇴사 사유는 무엇인가요?
- 쉬는 기간 동안 다시 일을 하지 않으셨던 이유는 무엇인가요?
- 전에 다니시던 회사로 돌아가지 않고 새로운 회사를 찾으시는 이유는 무엇인가요?

### 기술과 프로젝트 경험 질문

- 직전 직장에서 겪으신 기술적 문제 중 가장 어려웠던 것은 무엇이었고, 어떻게 해결하셨나요?
- 레거시 시스템을 개편하시게 된 의사 결정 과정은 어떻게 이루어졌나요?
- 레거시 시스템을 한 번에 개편하셨나요, 나눠서 진행하셨나요?
- 개편 과정에서 QA는 어떻게 진행하셨나요?
- 계약 코드가 무엇인지, 어떤 식으로 구성되어 있는지 설명해주실 수 있나요?
- 계약 코드 생성 시 성능 저하 문제는 어떻게 해결하셨나요?
- 동시성이 높은 환경이라면 어떻게 대응하셨을까요?
- TTL을 설정한다면 어떤 기준으로 설정하시겠어요?
- 요청이 20개 들어왔을 때, 그 중 10개만 처리 가능한 상황에서 어떤 전략을 쓰시겠어요?
- 레디스를 이용한 분산 락을 구현할 때 어떤 방식을 사용할 수 있을까요?
- 500 에러가 났을 때 원인을 어떻게 파악하고 해결하시겠어요?
- DB 커넥션 문제가 의심될 경우 어떤 접근을 하시겠습니까?
- DB CPU가 90% 이상 사용 중인 경우, 어떻게 진단하고 조치하시겠어요?
- 쿼리 튜닝 과정에서 어떤 방법으로 튜닝하셨는지 설명해주실 수 있나요?
- 인덱스 풀 스캔이 발생했을 때 어떻게 대응하실 건가요?

### 시스템과 서비스 이해 질문

- MCP 시스템과 MDS 시스템의 차이는 무엇인가요?
- 정산 시스템을 만들면서 발생했던 문제와 해결 방식은 무엇이었나요?
- 트랜잭션 이벤트 리스너를 사용하셨다고 했는데, 왜 사용하셨나요?
- 외부 연결이 실패할 수 있는 상황에서 어떻게 보완하셨나요?
- 트랜잭션 이벤트 리스너 대신 수동 트랜잭션 제어 방식도 있는데, 그럼에도 불구하고 이벤트 리스너를 선택하신 이유는 무엇인가요?

### 제품과 스타트업 환경 질문

- 스타트업에서 제품 기획에 참여할 수 있는 기회를 중요하게 생각하신다고 하셨는데, 실제로 어느 정도 참여하신 적이 있으신가요?
- 다같이 여행을 가거나 동호회 활동처럼 사용자 그룹이 생기는 경우, 그런 기능을 제품에 도입한 적이 있거나 생각해보신 적이 있나요?

### 기타 기술과 설계 질문

- 레디스에서 분산 락을 구현할 때 여러 방식이 있는데, 어떤 구현 방식을 고려하셨나요?
- 순서대로 요청이 들어왔을 때, 일부 요청만 처리 가능하다면 어떻게 고르게 분산 처리하실 건가요?

### Redis 분산 락

`SET NX`로 배타 락을 구현할 수 있다는 수준에서만 답했다. 어떤 구현 방식인지, TTL을 어떤 기준으로 잡는지, 요청을 어떻게 고르게 분산하는지는 구체적으로 말하지 못했다.

다시 정리하면 이렇다. 단일 Redis 인스턴스에서는 `SET resource_name my_random_value NX PX 30000`처럼 키가 없을 때만 값을 쓰고 만료 시간을 함께 건다. 값은 클라이언트와 요청마다 고유해야 하고, 해제할 때는 저장된 값이 내 값과 같을 때만 지운다(값 비교와 삭제를 한 번에 하는 Lua 스크립트). 그냥 `DEL`로 지우면, 작업이 TTL보다 오래 걸려 락이 이미 다른 클라이언트에게 넘어간 뒤에 그 락을 지울 수 있다([Redis 분산 락 문서](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)). finally 블록에서 무조건 락을 해제하는 코드가 위험한 이유도 여기에 있다.

단일 인스턴스는 장애 지점이 하나이고, 복제본으로 failover해도 복제가 비동기라서 두 클라이언트가 같은 락을 잡을 수 있다. Redis 문서는 이를 보완하는 Redlock 알고리즘을 제안한다. 독립된 N개의 마스터(문서 예시는 N=5)에 같은 키와 값으로 락을 시도하고, 과반(N/2+1, 예시에서는 3개)에서 락 유효 시간 안에 획득했을 때만 락을 잡은 것으로 본다. 다만 문서도 정합성이 중요하면 fencing token을 구현하라고 하고, Martin Kleppmann의 분석을 함께 읽기를 권한다.

TTL은 요청의 평균 처리 시간에 여유를 더해 잡는다. 예를 들어 평균이 1초면 1.5~2초로 잡는다. 락 획득에 실패한 요청은 큐에 넣어 재시도하거나, 여러 클라이언트가 동시에 재시도하지 않도록 무작위 지연 후 재시도한다(Redis 문서도 실패 시 random delay 후 재시도를 권한다). 처리 순서를 분산해야 하면 요청 해시 기반 샤딩도 고려할 수 있다.

### 500 에러 대응

"모니터링을 보고 트레이스를 확인한다" 수준의 일반론으로 답했고, 원인 파악에서 재현, 수정으로 이어지는 흐름이 구체적이지 않았다.

다시 정리하면 이렇다. 500 에러가 나면 먼저 APM이나 로그 시스템(Sentry, ELK, Datadog 등)에서 에러 트레이스를 확인한다. 그다음 같은 입력으로 테스트 환경에서 재현을 시도하고, 데이터 상태에 따라 발생 여부가 달라지는지 본다. 원인으로 DB 커넥션 부족이 의심되면 커넥션 풀 사용량과 대기 타임아웃을 점검한다. HikariCP라면 `connectionTimeout`이 풀에서 커넥션을 기다리는 최대 시간이고, `leakDetectionThreshold`를 설정하면 커넥션이 그 시간 이상 풀 밖에 머물 때 누수 가능성을 로그로 남긴다([HikariCP README](https://github.com/brettwooldridge/HikariCP)). 커넥션 누수가 원인인 경우도 있어서, 헬스 체크와 별개로 커넥션 풀 상태를 모니터링해야 한다.

### 쿼리 튜닝과 인덱스 풀 스캔

인덱스 풀 스캔의 의미를 정확히 설명하지 못했고 대응 방법도 추상적이었다.

다시 정리하면 이렇다. MySQL `EXPLAIN`에서 인덱스 풀 스캔은 `type`이 `index`로 나타난다. 테이블 풀 스캔(`ALL`)과 같지만 인덱스 트리를 처음부터 끝까지 읽는다는 점이 다르다. 이때 인덱스가 쿼리에 필요한 컬럼을 모두 담은 커버링 인덱스면 인덱스 트리만 읽고 `Extra`에 `Using index`가 표시된다. 그렇지 않으면 인덱스 순서대로 행을 찾아가며 테이블 전체를 읽는다. `Using index condition`은 풀 스캔 여부와는 다른 표시로, 인덱스 튜플로 조건을 먼저 확인해 테이블 행 읽기를 미루는 Index Condition Pushdown이 적용됐다는 뜻이다([MySQL 8.4 EXPLAIN 출력 형식](https://dev.mysql.com/doc/refman/8.4/en/explain-output.html)). 그래서 풀 스캔을 판단할 때는 `type`과 `rows`를 먼저 보고, 필터 컬럼에 맞는 복합 인덱스를 추가하거나 조회 컬럼을 줄여 커버링 인덱스로 만들 수 있는지 검토한다. 개선 전후는 실행 시간과 읽은 행 수로 비교한다.

엔라이즈에서는 계약 코드 채번과 `@TransactionalEventListener`도 질문받았고, 이 내용은 아래의 [채번 병목과 키 생성 전략](#채번-병목과-키-생성-전략), [@TransactionalEventListener를 쓴 이유](#transactionaleventlistener를-쓴-이유)에 정리했다.

---

## 뤼이드 면접

### 경력과 이직 관련 질문

- 지금까지 어떤 회사에서 어떤 일을 하셨는지 간략히 설명해주시겠어요?
- 드림어스컴퍼니에서는 왜 퇴사하셨나요?
- 퇴사 후 6개월 동안 무엇을 하셨나요?

### 기술 경험과 프로젝트 관련 질문

- 기억에 남는, 본인을 대표할 수 있는 프로젝트가 있다면 소개해주세요.
- MCP 레거시 시스템에서 어떤 역할을 맡으셨나요?
- 시퀀스 처리 방식에 성능 저하가 있었다고 하셨는데, 어떤 방식으로 개선하셨나요?
- 계약 코드 생성 로직의 병목 문제를 어떻게 해결하셨나요?
- API 구조를 개선하셨다고 하셨는데, 어떻게 트랜잭션 처리의 원자성을 확보하셨나요?
- 특정 API에서 데이터가 커서 문제가 있었다고 했는데, 어떻게 해결하셨나요?
- 프로젝트 오픈 이후 장애 최소화를 위해 어떤 배포 전략을 사용하셨나요?
- 프로젝트 오픈 당시 테스트는 어떻게 진행하셨나요?
- 마이바티스와 JPA를 병행 사용했다고 했는데, 어떻게 구조를 설계했나요?
- 오픈 당시 주요 이슈는 없었나요?

### 시스템 아키텍처와 설계 질문

- 모놀리식 아키텍처와 마이크로서비스 아키텍처의 차이를 어떻게 이해하고 계신가요?
- 이벤트 소싱에 대해 설명해 주실 수 있나요?
- 트랜잭션 이벤트 리스너를 사용하신 이유는 무엇인가요?
- 트랜잭션 이후에 외부 API를 호출하는 다른 방식은 어떤 것이 있을까요?
- 이벤트 유실 가능성을 어떻게 보완하실 수 있을까요?
- 큐 시스템을 사용할 경우 이벤트 유실 방지를 위한 보완책은 어떤 것이 있을까요?

### 문제 해결과 성능 최적화 질문

- OOM 장애 경험이 있다고 하셨는데, 어떻게 원인을 분석하고 해결하셨나요?
- 트랜잭션 범위가 너무 넓어서 발생한 문제를 어떻게 개선하셨나요?
- 정산 배치에서 발생한 메모리 누수 문제는 어떻게 대응하셨나요?

### 개발 문화, 테스트, 문서화 질문

- 테스트 커버리지는 어떻게 관리하고 계신가요?
- 테스트 커버리지 100%보다 중요한 것은 무엇이라고 생각하시나요?
- 문서화는 어떻게 진행하시나요? 도구는 무엇을 사용하셨나요?
- 코드와 문서의 동기화를 어떻게 유지하고 있나요?

### 협업, 조직 문화, 개인 역량 질문

- 기획자, 운영팀과의 협업은 어떻게 진행되었나요?
- 기술 리뷰 시간에 어떤 방식으로 참여하셨나요?
- 개발자 본인을 어떻게 표현하실 수 있나요?
- 갈등 상황이 생겼을 때 어떻게 풀어가시나요?
- 이상적인 개발 조직은 어떤 모습이라고 생각하시나요?

### 기술 스택과 개념 질문

- 마이크로서비스에서 장애 전파를 방지하는 장치는 무엇이 있을까요?
- 이벤트 소싱 시, 이벤트 저장소는 어떤 구조로 설계하셨나요?
- JPA와 마이바티스를 동시에 사용할 때, 리포지토리 추상화는 어떻게 구성하셨나요?
- 헥사고날 아키텍처에 대해 어떻게 이해하고 계신가요? 적용 경험이 있나요?
- 리플렉션을 사용해서 프라이빗 메서드 접근이 가능한가요?

### 코딩 테스트와 문제 풀이 질문

- 쿠폰 발급 문제에서, 누적 쿠폰 개수 반영이 잘못되었는데 어떻게 수정하시겠습니까?
- 기업-지원자 매칭 문제에서 어떤 방식으로 구현하셨고, 개선할 수 있는 부분은 무엇이라고 생각하시나요?

### OOM 장애의 원인 분석과 해결

"캐시 데이터를 많이 담아서 발생했다"는 수준으로 피상적으로 설명했고, 진단과 조치, 재발 방지에 대한 기술적 설명이 부족했다.

다시 정리하면 이렇다. 장애 당시 서비스가 비정상 종료됐고, 로그에서 `OutOfMemoryError: Java heap space`를 확인했다. 이 메시지는 힙에 객체를 할당하지 못했다는 뜻이고, 단순히 힙 크기가 부족한 경우도 있지만 오래 도는 애플리케이션에서는 의도치 않게 참조를 붙잡아 GC가 회수하지 못하는 메모리 누수를 가리키기도 한다. `-XX:+HeapDumpOnOutOfMemoryError`를 켜 두면 OOM 시점의 힙 덤프를 남겨 분석할 수 있다([Oracle 트러블슈팅 가이드](https://docs.oracle.com/en/java/javase/21/troubleshoot/troubleshooting-memory-leaks.html)). 힙 덤프를 분석해 보니 Redis에서 조회한 데이터를 담아 두는 `Map` 객체가 GC되지 않고 계속 누적되고 있었다. 그래서 TTL을 명확히 설정하고, 캐시 객체를 크기 제한과 만료를 지원하는 Caffeine 캐시로 바꿨다. Caffeine의 축출 정책은 LRU가 아니라 Window TinyLFU다([Caffeine Efficiency](https://github.com/ben-manes/caffeine/wiki/Efficiency)). 이후 GC 로그로 메모리 사용량을 점검했고, 같은 구조에서 재현 테스트로 재발하지 않음을 확인했다.

### MyBatis와 JPA를 함께 쓴 구조

"기존이 MyBatis였고 새로운 건 JPA였다" 정도로만 설명했고, 함께 쓸 때의 문제와 대응은 설명하지 못했다.

다시 정리하면 이렇다. 기존 시스템은 MyBatis로 구현돼 있었고, 신규 도메인은 생산성과 유지보수성을 위해 JPA로 도입했다. DAO(MyBatis)와 Repository(JPA) 계층을 분리해 책임을 나눴다. 두 기술을 같은 트랜잭션에서 쓸 때 핵심은 같은 DataSource를 하나의 트랜잭션 매니저가 관리하게 하는 것이다. `JpaTransactionManager`는 같은 DataSource를 쓰는 일반 JDBC 코드도 같은 트랜잭션 안에서 지원하고([JpaTransactionManager Javadoc](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/orm/jpa/JpaTransactionManager.html)), MyBatis-Spring은 Spring 트랜잭션에 참여하되 트랜잭션 매니저와 `SqlSessionFactoryBean`이 같은 DataSource를 써야 한다([MyBatis-Spring Transactions](https://mybatis.org/spring/transactions.html)). 처음 보완안에서는 `ChainedTransactionManager`로 트랜잭션 매니저를 묶는다고 적었는데, 이 클래스는 Spring Data Commons 2.5부터 deprecated다([ChainedTransactionManager Javadoc](https://docs.spring.io/spring-data/commons/docs/current/api/org/springframework/data/transaction/ChainedTransactionManager.html)). 정합성은 통합 테스트로 검증했다.

뤼이드에서 나온 `@TransactionalEventListener`, 정산 배치 메모리 누수, 이벤트 유실 질문은 아래 [여러 면접에서 반복된 주제](#여러-면접에서-반복된-주제)에 정리했다.

---

## Toss 면접

### 자기소개와 경험 관련 질문

- 간단히 자기소개 해주시겠어요?
- 레거시 개편 프로젝트가 있다고 하셨는데, 어떤 프로젝트인지 상세히 설명해주시겠어요?
- API가 단편적으로 구성되어서 개선하셨다고 했는데, 어떤 내용인지 설명해주세요.
- 레거시 개선 프로젝트에서 전체 구조를 어떻게 개선하셨나요?
- Map으로 작성된 필드들을 DTO로 옮기는 과정에서 어떻게 진행했나요?
- MapStruct를 사용하면서 얻은 이점이나 커스터마이징한 사례가 있나요?
- MapStruct의 `@AfterMapping`, `@BeforeMapping`을 알고 계신가요?

### 성능 개선과 문제 해결 질문

- SPA 화면의 성능을 5.2초에서 2.3초로 개선하셨다고 했는데, 어떤 부분을 어떻게 개선하셨나요?
- 계약코드 생성 과정에서 시퀀스 병목을 어떻게 개선하셨나요?
- 시퀀스를 점유하면서 성능이 저하된 원인은 무엇이었고, 어떻게 탐지하셨나요?
- 낙관적 락 방식이 어떤 것인지 설명해주시겠어요?
- 시퀀스를 담을 때 사용하신 자료구조는 무엇인가요?
- 동시성을 고려할 수 있는 구조인가요?
- 이 방식을 개선한다면 어떻게 개선하시겠어요?
- 구체적으로 병렬처리는 어떻게 구현할 수 있을까요?
- 서버가 여러 대인 경우, 시퀀스 점유는 어떻게 해결할 수 있을까요?
- 결국 단일 지점에서 직렬화되는데, 그게 정합성과 성능상 괜찮을까요?

### MSA와 장애 처리 질문

- MSA 구조에서 다운스트림 서버가 장애날 경우, retry를 계속하는 게 맞을까요?
- 다른 개선 방법은 없을까요?

두 번째 질문은 서킷 브레이커 패턴을 염두에 둔 후속 질문이었다.

### 키 생성 전략과 최적화 질문

- 시퀀스를 chunk 단위로 생성한다고 하셨는데, 1만개 생성 시 11번 점유하는 건 비효율적이지 않을까요?
- chunk 단위를 효율적으로 조정하려면 어떻게 개선할 수 있을까요?
- 키 생성 전략을 새로 구성한다면 어떻게 설계하시겠어요?

### 장애 복구와 파이프라인 안정성 질문

- 입수 파이프라인이 단일 장애 지점을 갖는 것 같은데, 장애 시 어떻게 대응했나요?
- Datadog으로 입수 파이프라인을 재처리하거나 자동화하지 않았나요?
- 개선 방향이 있다면 어떻게 구성할 수 있을까요?

### MQ 사용 경험 질문

- RabbitMQ를 사용해보셨나요?
- 메시지는 어떤 방식으로 사용하셨나요?
- TTL이나 기타 설정 없이 사용하셨나요?
- 기존 레거시 시스템에 구축된 것을 그대로 사용하신 건가요?
- 메시지가 DLQ로 갔을 경우 어떻게 처리하셨나요?
- MQ 메시지 유실 시, 어떻게 재처리했나요?
- RabbitMQ는 직접 설치 및 운영하신 건가요? 어디까지 담당하셨나요?

### JPA 배치와 GC 최적화 질문

- JPA 기반 배치 개선을 구체적으로 설명해주시겠어요?
- `@Transactional`을 Job 전체에 사용한 이유는 무엇이었나요?
- GC는 어떤 걸 사용하셨나요? ZGC와 G1GC의 차이를 이해하고 계신가요?
- 잡에서 시퀀스 chunk 단위는 어떻게 정하셨나요? 기준은 무엇이었나요?
- `flush()`와 `clear()`의 차이점을 알고 계신가요?
- chunk 단위 처리 중 일부 실패 시, 재처리는 어떻게 했나요?
- 실패 후 flush된 데이터는 어떻게 관리되었나요?
- 재처리 시 성공한 데이터는 건너뛰도록 처리했나요?

### MSA 장애 전파와 서킷 브레이커

retry에만 초점을 맞춰 답했고, 부하 전파와 서비스 격리는 고려하지 못했다. 서킷 브레이커가 필요하다는 말도 하지 못했다.

다시 정리하면 이렇다. MSA에서 다운스트림 서비스에 장애가 나면 upstream도 타임아웃과 재시도로 스레드와 커넥션을 붙잡혀 리소스가 고갈될 수 있다. 그래서 retry만으로는 부족하고 서킷 브레이커로 장애를 격리해야 한다. Resilience4j의 CircuitBreaker는 CLOSED, OPEN, HALF_OPEN 상태를 갖고, 실패율이나 느린 호출 비율이 설정한 임계치 이상이면 OPEN으로 바뀌어 호출을 `CallNotPermittedException`으로 거절한다. 설정한 대기 시간이 지나면 HALF_OPEN에서 일부 호출로 회복 여부를 확인한다([Resilience4j CircuitBreaker](https://resilience4j.readme.io/docs/circuitbreaker)). 거절된 호출에는 fallback을 둔다. Hystrix도 같은 역할을 했지만 지금은 유지보수 모드이고, Netflix도 새 프로젝트에는 resilience4j 같은 활발한 프로젝트를 쓴다고 밝혔다([Hystrix README](https://github.com/Netflix/Hystrix)). 이렇게 하면 장애 난 서비스로 불필요한 요청이 계속 가지 않고 전체 시스템이 버틴다. 서킷 브레이커 개념은 [Circuit Braker](/posts/circuit-braker/)에 정리해 두었다.

### G1GC와 ZGC

"G1GC를 썼다"고만 했고, 어떤 기준으로 골랐는지는 설명하지 못했다.

다시 정리하면 이렇다. G1은 힙을 같은 크기의 region으로 나눠 관리하고, 수백 밀리초를 넘지 않는 예측 가능한 pause 목표를 지향한다([Oracle G1 가이드](https://docs.oracle.com/en/java/javase/21/gctuning/garbage-first-g1-garbage-collector1.html)). JDK 9부터 기본 GC이고, 그 전 기본값은 처리량 중심의 Parallel GC였다([JEP 248](https://openjdk.org/jeps/248)). ZGC는 비용이 큰 작업을 동시에 처리해 애플리케이션 스레드를 1밀리초 넘게 멈추지 않는 것을 목표로 하고, pause 시간이 힙 크기와 무관하다. JDK 11에서 실험 기능으로 들어왔고([JEP 333](https://openjdk.org/jeps/333)) JDK 15에서 정식 기능이 됐으며([JEP 377](https://openjdk.org/jeps/377)), JDK 21에서 세대별 방식이 추가됐다. 튜닝 면에서는 최대 힙 크기(`-Xmx`)가 가장 중요한 옵션이라고 안내한다([ZGC wiki](https://wiki.openjdk.org/display/zgc/Main)). 처음 보완안에서는 "ZGC는 튜닝 난이도가 높다"고 적었는데, 이 문서와 맞지 않아 뺐다. 당시는 JDK 8 환경이라 ZGC를 쓸 수 없었고, GC pause로 인한 latency가 주요 이슈였기 때문에 G1GC를 선택했다. pause time이 더 중요해지면 JDK를 올린 뒤 ZGC로 전환하는 것을 고려할 수 있다.

Toss에서 나온 시퀀스 점유, JPA 배치, RabbitMQ DLQ 질문은 아래 [여러 면접에서 반복된 주제](#여러-면접에서-반복된-주제)에 정리했다.

---

## 두들린 면접

대부분 기술 면접이었고, 백엔드 시스템의 설계, 운영, 성능 개선, 트랜잭션 관리, 캐시 전략에 대한 질문이 많았다.

### 경험 기반 질문

1. 기억에 남는 과제나 경험은 무엇인가요?
2. MCP 리뉴얼 프로젝트에서 어떤 문제를 해결했나요?
3. API 트랜잭션 문제가 어떤 상황이었고 어떻게 해결했나요?
4. API 호출을 하나의 트랜잭션으로 묶은 방식은?
5. 프론트와 백엔드의 통신 구조를 어떻게 개선했나요?
6. 기존 시스템과 새로운 시스템을 어떻게 이관했는지 설명해주세요.
7. 프로젝트 진행 중 운영팀과 협업은 어떻게 이루어졌나요?
8. MCP 1.0, 2.0, 3.0 구조와 역할을 설명해주세요.
9. 시스템 릴리즈 후 사용자 피드백은 어땠나요?
10. 로그를 어떻게 체계화했나요?

### 기술 설계와 개선 질문

1. 레거시 시스템의 시퀀스 테이블 문제를 어떻게 개선했나요?
2. 낙관적 락과 비관적 락의 차이점은 무엇이며, 언제 사용하는 것이 적절한가요?
3. 팬텀 리드란 무엇이며 이를 방지하기 위한 방법은?
4. API 응답 페이로드 최소화를 어떻게 설계했나요?
5. 트랙 API의 성능 병목을 어떻게 개선했나요?
6. 데이터의 페이징 처리 전략은 무엇이었나요?
7. 대용량 데이터에 대한 성능 측정 방식은?
8. 분산락이 필요한 이유는 무엇이며, 어떻게 구현했나요?
9. 캐시를 사용하는 상황과 전략에는 어떤 것이 있나요?
10. 캐시 일관성을 위한 전략에는 어떤 것들이 있나요? (예: Write-through, Write-behind 등)
11. Redis TTL과 캐시 무효화 방식에 대해 설명해주세요.
12. 캐시 miss 시 리스크를 줄이기 위한 방법은?
13. 이벤트 큐 (ex: RabbitMQ, Kafka)의 차이점과 사용 이유는 무엇인가요?
14. 메시지 유실을 방지하는 방법은 무엇인가요?
15. 대량 벌크 인서트 시 트랜잭션 구조의 주의사항은?
16. B+Tree 인덱스 구조에서 대량 인서트가 미치는 영향은?

### 동기와 지원 동기 관련 질문

1. 멘토링을 다시 받는 목적은 무엇인가요?
2. 이전 멘토링 경험과 어떤 차이를 기대하고 있나요?
3. 두들린에 지원한 이유는 무엇인가요?
4. 두들린의 핵심 가치 중 본인과 맞는 부분은?
5. 향후 창업 계획이 있는가?
6. 마지막으로 하고 싶은 말은?

### 낙관적 락과 비관적 락

용어 정의는 했지만, 어떤 상황에서 어느 쪽을 적용해야 하는지는 설명하지 못했다.

다시 정리하면 이렇다. 낙관적 락은 여러 트랜잭션이 서로 영향을 주지 않고 끝날 수 있다고 가정하고, 데이터를 잠그지 않고 진행하다가 커밋 전에 다른 트랜잭션이 데이터를 바꿨는지 확인한다. 충돌이 있으면 커밋하려던 트랜잭션이 롤백된다. JPA에서는 버전 컬럼으로 이를 확인한다. 비관적 락은 동시 트랜잭션이 충돌한다고 가정하고, 데이터를 읽은 뒤 잠가 두었다가 사용이 끝나면 푼다([Hibernate User Guide, Locking](https://docs.hibernate.org/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#locking)). 그래서 경쟁이 잦은 자원에는 비관적 락이, 충돌이 드물고 처리량이 중요한 곳에는 낙관적 락이 맞다. 내 프로젝트에서는 계약 코드 채번에 낙관적 락을 썼고, 이 내용은 아래 [채번 병목과 키 생성 전략](#채번-병목과-키-생성-전략)에 있다.

### 캐시 일관성 전략

캐시 전략의 종류는 말했지만, 각각의 장단점과 실무 적용 기준이 부족했다.

다시 정리하면 이렇다. 대표적인 전략은 Cache-aside, Write-through, Write-behind다.

- Cache-aside는 읽을 때 캐시에 없으면 데이터 저장소에서 읽어 캐시에 넣고, 쓸 때는 저장소를 먼저 갱신한 뒤 캐시 항목을 무효화한다. 무효화 순서가 반대면 그 사이에 옛 값이 다시 캐시에 들어갈 수 있다. 쓰기 직후 다음 읽기 전까지는 캐시 미스가 나거나 잠깐 옛 데이터가 보일 수 있다([Azure Cache-Aside 패턴](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside)).
- Write-through는 DB에 쓸 때마다 캐시도 함께 갱신해 캐시 데이터가 낡지 않는다. 대신 쓰기마다 두 번 왕복하는 비용이 있고, 새 노드에는 데이터가 비어 있으며, 읽히지 않는 데이터까지 캐시에 쌓인다. TTL을 함께 두면 이 낭비를 줄일 수 있다([AWS ElastiCache 캐싱 전략](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html)).
- Write-behind는 변경을 캐시에 먼저 반영하고 일정 지연 뒤 비동기로 저장소에 쓴다. 쓰기 지연이 줄고 같은 항목의 여러 변경이 한 번의 쓰기로 합쳐져 DB 부하가 줄어든다. 대신 DB 갱신이 캐시 트랜잭션 밖에서 일어나므로 DB 쓰기 실패에 대한 대비가 필요하고, 큐가 저장소에 기록될 때까지는 캐시가 원본 역할을 한다([Oracle Coherence, Caching Data Sources](https://docs.oracle.com/en/middleware/standalone/coherence/14.1.1.2206/develop-applications/caching-data-sources.html)).

실무에서는 읽기 위주 서비스에 Cache-aside를, 쓰기 직후 일관성이 중요한 경우에는 Write-through를 주로 사용했다.

두들린에서 나온 시퀀스 테이블, 메시지 유실, 대량 인서트 질문은 아래 [여러 면접에서 반복된 주제](#여러-면접에서-반복된-주제)에 정리했다.

---

## 여러 면접에서 반복된 주제

### 채번 병목과 키 생성 전략

계약 코드 채번은 엔라이즈, 뤼이드, Toss, 두들린에서 모두 질문받았다.

면접마다 부족했던 지점은 이렇다.

- 엔라이즈: 낙관적 락을 썼다고는 말했지만, 충돌을 어떻게 처리하는지와 병렬성 고려가 명확하지 않았다. 멀티 인서트와 멀티 스레드 상황에 대한 보완도 부족했다.
- Toss: chunk 단위로 미리 점유했다고 답했지만, 병렬 처리와 서버 다중화에 대한 고려가 부족했고 개선 아이디어에 구체적인 방법이 없었다.
- 두들린: "병목이 있었다"고만 말했고, 병목 원인과 개선 후 효과는 설명하지 못했다.

다시 정리하면 이렇다. 기존에는 시퀀스 값을 `SELECT ... FOR UPDATE`로 읽어 인서트했다. `SELECT ... FOR UPDATE`는 읽은 행과 관련 인덱스 항목에 `UPDATE`와 같은 잠금을 걸어, 다른 트랜잭션이 그 행을 갱신하거나 잠그지 못하게 막는다([MySQL 8.4 Locking Reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html)). 그래서 단일 시퀀스 테이블에 동시 요청이 몰리면 트랜잭션이 이 행에서 줄을 서는 병목이 생겼다. 이를 낙관적 락 방식으로 바꿔, 다음 시퀀스를 예측해 생성한 뒤 `WHERE` 조건으로 충돌 여부를 확인하고 실패하면 재시도했다. 또한 시퀀스를 chunk 단위로 선점해 애플리케이션 메모리에 두고 쓰는 방식으로 DB 접근 횟수를 줄였다. 그 결과 초당 처리 가능한 요청 수가 3배 이상 늘었고 시퀀스 테이블의 락 경합도 해소됐다.

서버가 여러 대면 chunk 선점 구간이 겹치지 않도록 해야 하고, 결국 선점 지점에서 직렬화가 생긴다. 이를 완화하는 선택지는 다음과 같다.

- Redis 분산 락이나 ZooKeeper의 락 레시피로 선점 구간을 보호한다. ZooKeeper 문서는 어느 시점에도 두 클라이언트가 같은 락을 갖지 않는 분산 락 레시피를 제공한다([ZooKeeper Recipes](https://zookeeper.apache.org/doc/current/recipes.html)).
- Redis `INCR`로 원자적으로 증가하는 카운터를 쓴다([Redis INCR](https://redis.io/docs/latest/commands/incr/)).
- 서버별 prefix를 붙여 서버마다 독립된 번호 공간을 쓴다.
- Snowflake처럼 고유 ID를 대규모로 생성하는 분산 ID 생성기를 쓴다([twitter-archive/snowflake](https://github.com/twitter-archive/snowflake)). 다만 Twitter의 원래 저장소는 보관(archived) 상태다.
- UUID를 쓴다. UUID는 128비트로 시공간에 걸친 고유성을 의도한 식별자이고, 무작위 UUIDv4는 인덱스 지역성이 나빠 DB 성능이 떨어질 수 있어 시간 순서를 갖는 UUIDv7이 정의됐다([RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html)).

처음 보완안에 있던 "Kafka의 monotonic ID generator"는 근거를 찾지 못해 뺐다.

### @TransactionalEventListener를 쓴 이유

엔라이즈와 뤼이드 두 면접에서 모두 나온 질문이다. `@TransactionalEventListener` 자체는 [@TransactionalEventListener가 무시되는 이유](/posts/transactional-event-listener/)에 정리했다.

- 엔라이즈: "계층을 하나 더 만드는 게 부담스러워서"라고 답했고, 설득력이 부족했다.
- 뤼이드: "서비스 로직을 깔끔하게 만들기 위해 사용했다"는 식으로 모호하게 설명했고, 왜 필요한지와 대안이 무엇인지 논리적 근거가 부족했다.

다시 정리하면 이렇다. 트랜잭션이 커밋된 뒤에만 실행돼야 하는 로직이 있었다. 이메일 전송, 로그 적재, 알림 발송, 외부 API 호출, 캐시 무효화 같은 작업이다. 서비스 계층에서 트랜잭션 안에서 외부 시스템을 바로 호출하면, 트랜잭션이 롤백돼도 외부 작업은 되돌릴 수 없어 데이터가 어긋난다. `@TransactionalEventListener`는 기본적으로 커밋 단계(`AFTER_COMMIT`)에 리스너를 묶고, `BEFORE_COMMIT`, `AFTER_ROLLBACK`, `AFTER_COMPLETION`도 고를 수 있다. 실행 중인 트랜잭션이 없으면 리스너는 아예 호출되지 않고, `fallbackExecution = true`로 바꿀 수 있다([Spring Framework, Transaction-bound Events](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html)). 그래서 커밋이 실패하면 외부 작업은 실행되지 않고, 서비스 로직과 후처리를 분리한 구조도 유지된다.

수동 트랜잭션 제어나 큐 시스템(Kafka 등)을 통한 비동기 처리도 대안이다. 해당 프로젝트에서는 구조의 단순함과 빠른 개발이 중요했기 때문에 이벤트 리스너가 맞다고 판단했다. 다만 `AFTER_COMMIT` 리스너는 커밋 이후에 실행되므로, 리스너에서 외부 호출이 실패하면 DB는 이미 커밋된 상태다. 이 공백이 다음 주제인 이벤트 유실 질문으로 이어졌다.

### 대량 처리와 트랜잭션 범위

뤼이드(정산 배치 메모리 누수), Toss(JPA 기반 배치), 두들린(대량 인서트의 트랜잭션 구조)에서 같은 주제를 질문받았다.

- 뤼이드: "쿼리를 한 번에 날려서"라는 추상적인 표현으로 답했고, 실제 개선 방법은 구체적으로 설명하지 못했다.
- Toss: `flush()`와 `clear()`를 쓴 이유가 불명확했고, 재처리와 실패 케이스에 대한 설계 설명이 부족했다.
- 두들린: 트랜잭션 범위를 어디까지 잡아야 하는지에 대한 전략을 말하지 못했다.

다시 정리하면 이렇다. 배치에서 수만 건을 한 번에 조회하고 처리하면서 메모리 사용량이 계속 늘었다. Hibernate는 영속 상태의 객체를 모두 세션에 캐시하므로, 세션을 오래 열어 두거나 데이터를 너무 많이 읽으면 OOM이 날 때까지 커진다. 그래서 일정 건수마다 `flush()`로 변경을 DB에 반영하고 `clear()`로 영속성 컨텍스트를 비워 1차 캐시 크기를 제어했다. 비워진 엔티티는 더 이상 참조되지 않으므로 GC가 회수할 수 있다. 조회 쪽은 결과를 한꺼번에 리스트로 받지 않고, 데이터베이스 커서로 조금씩 읽는 `getResultStream()`이나 `ScrollableResults`, 또는 페이지 단위 조회로 나눠 읽을 수 있다. 다만 Hibernate 문서는 커서를 오래 열어 두는 것을 권하지 않는다([Hibernate User Guide, Batching](https://docs.hibernate.org/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#batch)).

트랜잭션 범위도 문제였다. Job 전체를 하나의 `@Transactional`로 묶으면 실패 시 전체가 롤백되고, 긴 트랜잭션은 커넥션 풀을 고갈시켜 다른 트랜잭션이 진행하지 못하게 할 수 있다. 그래서 chunk 단위로 트랜잭션을 나눠, 중간에 실패하면 해당 chunk만 재처리하도록 했다. 단건 실패가 전체 배치 실패로 번지지 않도록 chunk 안에서 예외를 처리했고, 실패 건은 재처리 큐에 넣어 후속 배치에서 다시 시도했다. 대량 인서트에서 하나 더 볼 것은 JDBC 배치다. Hibernate는 JDBC 배치가 기본으로 꺼져 있어 `hibernate.jdbc.batch_size`를 설정해야 하고, identity 식별자 생성기를 쓰면 insert 배치를 자동으로 끈다.

### 메시지와 이벤트 유실 방지

뤼이드(이벤트 유실), Toss(RabbitMQ DLQ와 메시지 유실), 두들린(메시지 유실 방지)에서 같은 주제를 질문받았다.

- 뤼이드: "아직 MQ를 쓰진 않았지만 고민 중이다" 정도로 답했고, 유실 가능성과 대응 전략에 대한 체계적인 이해가 부족했다.
- Toss: 기본 메시지 처리만 설명했고, DLQ 처리와 유실 방지 전략은 말하지 못했다.
- 두들린: "메시지가 유실되지 않도록 주의했다" 수준의 추상적인 설명에 그쳤다.

다시 정리하면 이렇다. 유실을 막는 핵심은 내구성 있는 저장소와 처리 상태 추적이다.

RabbitMQ에서는 중요한 데이터에 durable 큐(또는 복제 큐)를 쓰고 메시지를 persistent로 발행한다. 브로커가 메시지를 받았는지는 publisher confirm으로, 소비자가 처리했는지는 consumer acknowledgement로 확인한다. 이 장치들을 쓰면 at-least-once 전달이 되므로 같은 메시지가 다시 올 수 있고, 소비자는 중복 제거를 따로 하기보다 멱등하게 설계해야 한다([RabbitMQ Reliability Guide](https://www.rabbitmq.com/docs/reliability)). 처리에 실패한 메시지는 dead letter exchange(DLX)로 보내 격리한다. 메시지가 dead-letter되는 경우는 소비자가 `requeue=false`로 reject/nack했을 때, 메시지별 TTL이 만료됐을 때, 큐 길이 제한을 넘었을 때, quorum 큐에서 delivery limit를 넘었을 때다([RabbitMQ Dead Letter Exchanges](https://www.rabbitmq.com/docs/dlx)). TTL이 지난 메시지는 DLX가 설정돼 있으면 dead-letter되고, 없으면 폐기된다([RabbitMQ TTL](https://www.rabbitmq.com/docs/ttl)). 처음 보완안에는 "TTL로 너무 오래된 메시지를 자동 폐기한다"고만 적었는데, DLX 설정 여부에 따라 결과가 달라진다. DLQ에 쌓인 메시지는 알림으로 감지하고, 실패 사유에 따라 수동으로 처리하거나 재처리용 큐로 옮겨 다시 보낸다.

Kafka는 파티션별 소비 위치를 offset 하나로 관리하고, 소비자는 이전 offset으로 되감아 다시 소비할 수 있다([Apache Kafka Design](https://kafka.apache.org/41/design/design/)). 실패한 메시지를 메인 흐름을 막지 않고 재시도하려면 retry 토픽과 DLT(Dead Letter Topic)를 따로 구성해야 하는데, Spring for Apache Kafka는 2.7부터 `@RetryableTopic`으로 이 구성을 지원한다([Spring for Apache Kafka, Non-Blocking Retries](https://docs.spring.io/spring-kafka/reference/retrytopic.html)).

MQ 없이 DB를 이벤트 저장소로 쓰는 경우에는 이벤트 테이블에 상태 컬럼을 두고 `PENDING`에서 `SUCCESS`로 전이시키며, 실패한 건은 재처리 배치로 다시 보낸다. 비즈니스 데이터를 바꾸는 트랜잭션 안에서 메시지를 DB에 함께 저장하고, 별도 프로세스가 그 메시지를 브로커로 보내는 구조를 Transactional Outbox 패턴이라고 부른다([microservices.io](https://microservices.io/patterns/data/transactional-outbox.html)). 어느 방식이든 재처리 과정에서 중복이 생길 수 있으므로 소비자를 멱등하게 만드는 것이 공통 전제다.

## 참고

- [Distributed Locks with Redis](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/) — Redis 공식 문서
- [INCR](https://redis.io/docs/latest/commands/incr/) — Redis 공식 문서
- [Pattern: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html) — microservices.io
- [Transaction-bound Events](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html) — Spring Framework Reference
- [JpaTransactionManager](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/orm/jpa/JpaTransactionManager.html) — Spring Framework Javadoc
- [ChainedTransactionManager](https://docs.spring.io/spring-data/commons/docs/current/api/org/springframework/data/transaction/ChainedTransactionManager.html) — Spring Data Commons Javadoc
- [Transactions](https://mybatis.org/spring/transactions.html) — MyBatis-Spring
- [LDAP Authentication](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/ldap.html) — Spring Security Reference
- [Non-Blocking Retries](https://docs.spring.io/spring-kafka/reference/retrytopic.html) — Spring for Apache Kafka
- [Design](https://kafka.apache.org/41/design/design/) — Apache Kafka 4.1 Documentation
- [Reliability Guide](https://www.rabbitmq.com/docs/reliability) — RabbitMQ
- [Dead Letter Exchanges](https://www.rabbitmq.com/docs/dlx) — RabbitMQ
- [Time-To-Live and Expiration](https://www.rabbitmq.com/docs/ttl) — RabbitMQ 공식 문서
- [EXPLAIN Output Format](https://dev.mysql.com/doc/refman/8.4/en/explain-output.html) — MySQL Docs
- [Locking Reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html) — MySQL 8.4 Reference Manual
- [Hibernate ORM 6.6 User Guide](https://docs.hibernate.org/orm/6.6/userguide/html_single/Hibernate_User_Guide.html) — Hibernate Docs: Locking, Batching 장
- [Troubleshooting Memory Leaks](https://docs.oracle.com/en/java/javase/21/troubleshoot/troubleshooting-memory-leaks.html) — Oracle Java SE 21 Troubleshooting Guide
- [Garbage-First (G1) Garbage Collector](https://docs.oracle.com/en/java/javase/21/gctuning/garbage-first-g1-garbage-collector1.html) — Oracle Java SE 21 GC Tuning Guide
- [JEP 248: Make G1 the Default Garbage Collector](https://openjdk.org/jeps/248) — OpenJDK
- [JEP 333: ZGC (Experimental)](https://openjdk.org/jeps/333) — OpenJDK
- [JEP 377: ZGC: A Scalable Low-Latency Garbage Collector (Production)](https://openjdk.org/jeps/377) — OpenJDK
- [ZGC](https://wiki.openjdk.org/display/zgc/Main) — OpenJDK Wiki
- [Efficiency](https://github.com/ben-manes/caffeine/wiki/Efficiency) — Caffeine Wiki
- [CircuitBreaker](https://resilience4j.readme.io/docs/circuitbreaker) — Resilience4j 문서
- [Hystrix README](https://github.com/Netflix/Hystrix) — GitHub: Netflix
- [HikariCP README](https://github.com/brettwooldridge/HikariCP) — GitHub: 설정 항목
- [Role Based Access Control](https://csrc.nist.gov/projects/role-based-access-control) — NIST CSRC
- [Cache-Aside pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside) — Azure Architecture Center
- [Caching strategies](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html) — Amazon ElastiCache 문서
- [Caching Data Sources](https://docs.oracle.com/en/middleware/standalone/coherence/14.1.1.2206/develop-applications/caching-data-sources.html) — Oracle Coherence 14.1.1 문서
- [ZooKeeper Recipes and Solutions](https://zookeeper.apache.org/doc/current/recipes.html) — Apache ZooKeeper
- [twitter-archive/snowflake](https://github.com/twitter-archive/snowflake) — GitHub: Twitter
- [RFC 9562: Universally Unique IDentifiers (UUIDs)](https://www.rfc-editor.org/rfc/rfc9562.html) — IETF
