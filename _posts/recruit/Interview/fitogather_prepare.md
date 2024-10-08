# 웨어러블 헬스케어 F사 면접 준비

## 1차 면접 준비

### 내가 기여한 프로젝트

- 프로젝트에서 어떤 역할을 하였는가?
  - ...
- 이전 회사에서 어떤 일을 하였는가?
  - 주로 콘솔(백오피스) 개발을 하였는데, 커머스 백오피스에서는 고도몰 연동 작업을 약 한달간 진행하였고, 앱콘솔 백오피스에서는 가게의 입점비를 자동으로 결제하는 시스템을 개발했습니다. 그 외의 시간은 대부분 버그 수정 및 앱의 기능 추가 등을 진행하였습니다.
- 커머스 테이블 구조는 어떤지?
  - 크게는 점포 테이블이 있고, 상품 테이블이 이를 참조하여 일대다 관계로 연결됩니다. 아이템이라는 테이블은 주문 엔트리 테이블, 상품 테이블, 파트너 테이블과 모두 연관되며, 실제 주문 데이터에 들어가는 상품의 구체화된 데이터입니다. 즉, 옵션정보가 포함된 상품입니다. 원래는 옵션정보를 아이템 테이블에 한번에 갖고있었는데, 고도몰에 연동하면서 자유롭게 옵션을 생성할 필요가 있게되었고, 별도의 테이블로 분리하게 된 것입니다. 따라서 최종적으로는 저게 없어지고 상품 테이블에서 직접 주문 테이블에 연관되면서 옵션정보도 포함하는 형태가 바람직한것 같습니다.
- 공부는 주로 어떻게 하는가?
  - 주로 책과 인프런의 김영한님 강의를 통해서 공부하였습니다. 스프링은 토비의 스프링 3.1, JPA는 김영한님의 JPA책을 보고 학습합니다. 그리고 매일 TIL을 작성해서 오늘 학습한 내용을 정리하도록 노력합니다. 그리고 특정 주제에 대해서 제대로 정리할 필요가 있겠다 싶은것은 velog에 글을 작성하면서 정리하기도 합니다.
- 협업 방식은 보통 어떻게 진행하는가?
  - 깃허브에서 진행할 때는 다음과 같습니다. 우선 위키에 협업 규칙, 커밋 규칙, 브랜치 전략, 각종 문서를 작성해두고, 이슈에 작업할 사항을 추가해둡니다. 그리고 이슈별로 브랜치를 생성하여 작업한 후, 작업이 완료되면 PR로 올립니다. 그리고 모두가 리뷰를 하거나 검토한 후 과반수 이상이 assign을 하면 머지를 시킵니다.
  - 협업 도구로는 슬랙으로 소통하고, 트렐로를 통해 칸반보드로 진행사항을 확인합니다.

### 스프링 기본

- 스프링이 무엇이라고 생각하는가?
  - 주로 자바를 활용하여 객체 지향 프로그래밍과 테스트를 용이하게 하는 프레임워크 입니다. 이를 위해 객체지향 설계원칙과 디자인 패턴 핵심 원리를 담고 있는 IoC/DI를 프레임워크의 근간으로 삼고 있습니다.
- IoC가 무엇인가?
  - 제어의 역전이란, 간단한 자바 애플리케이션을 그냥 작성한다면, main 메서드에서 전체 프로그램의 실행흐름이 진행되는데, 이 프로그램의 시작과 끝 지점인 엔트리 포인트가 프레임워크에게 넘어가기 되는 것을 말합니다.
- DI가 무엇인가?
  - DI는 IoC를 일으키는 프레임워크, 스프링 프레임워크같은 것들이 직접 설정자를 통하여 각 클래스에서 필요한 빈들을 연결해주어야 하는데 이때 생성자나 setter 등을 통해 의존관계를 주입하는 것을 말합니다. 단, 이때 실행할 클래스의 코드는 인터페이스에만 의존해야하며, 런타임 시점의 의존관계는 컨테이너같은 설정자가 결정합니다.
- 디자인 패턴 아는것이 있는지?
  - 싱글톤 패턴, 빌더 패턴, 팩토리 메서드 패턴, 템플릿 메서드 패턴, 프록시 패턴 등 들어본것은 많지만 직접적으로 학습한적은 없습니다. 다만 스프링 프레임워크와 이펙티브 자바 스터디를 통해 싱글톤 패턴은 학습하게 되었고, 빌더 패턴도 이해하게 되었습니다.

- JPA에 대해 어느정도 이해하는지?
  - 엔티티 매니터 팩토리는 애플리케이션 당 하나만 생성해서 공유하고, 요청 당 엔티티 매니저를 생성합니다. 영속성 컨텍스트는 논리적인 개념으로 엔티티 매니저를 통해서 N대 1의 관계로 영속성 컨텍스트에 접근합니다. 엔티티는 JPA에 의해 관리되는 객체입니다. 이는 4가지 상태가 있습니다. 영속성 컨텍스트의 이점으로는 1차 캐시가 되고, 동일성이 보장되며, 트랜잭션을 지원하는 쓰기 지연, 더티 체킹, 레이지 로딩이 가능하다는 점이 있습니다. 영속성 컨텍스트의 변경내용을 DB에 반영할때는 엔티티 매니저의 flush명령어를 통하여 한번에 진행합니다.

### 면접 기출

PM + 인사, 깃허브 코드 많이 봄 -> 프로젝트 보고 어떤 걸 커밋했는지 보고 어떤 걸 기여했는지, 회사에서 어떤 역할을 했는지 로직, 역할, 어떤 장바구니 로그인 하고 등등 물어본다. 그중에 관심이 가는걸 물어본다. 장바구니 어떻게 구현했는지? 계산이 복잡할텐데 어떻게 구성하였지? STORE와 ITEM의 LIKE테이블을 공유하는데 단점을 알고 설계한 것인지? 테이블을 최소화해서 데이터관리를 쉽게 하려고 한 것 같다. 하지만 요구사항이 늘어나면서 로직이 복잡해진 것 같다. JPA 조회 시 항상 참조한 것 이 문제가 된 것 같다.

어떻게 공부해왔는지? 앞으로 같이 일할 때 성장을 할만한 사람인지, 개발 문화나 스터디 진행과정, 안 맞는 부분은 없었는지, 잘 맞다면 어떤게 좋았는지, 얻었던 점, 자바스크립트와 파이썬을 왜 공부한지, let, var, const 차이.. 협업 프로젝트 2년차개발자의 리딩으로 코드 컨벤션 등등 잘 되어있는 것을 봄, 개발습관 규칙, PR을 어떻게 날리고, 협업 방식을 물어봄

스프링 기본, 스프링이 무엇이라고 생각? 스프링 인터페이스를 언제 썼냐, JPA, 쿼리DSL, Spring Data JPA 어떨 때 이걸쓰냐, 디자인 패턴 어떤걸 썼냐, 테스트 코드를 어떻게 짜냐? 어떤걸 중요시하냐? 스프링은 토비 1장에서 DI와 테스트 코드에 대한 의존성을 없애고 캡슐화를 강조하는 프레임워크, 중요한건 DI 와 테스트이다. 추상화된 여러가지 다른기능을 붙이기 쉽게 만든 프레임워크다.

s3 이미지 업로드를 한 경험이 있다 -> 인프라 세팅 같은 것들 직접 했는지?