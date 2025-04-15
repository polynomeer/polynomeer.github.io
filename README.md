기술 블로그 저장소의 `README.md`는 **방문자에게 이 블로그의 목적, 구성, 사용기술, 주요 링크** 등을 전달하는 역할을 해요. 비록 실제 블로그에서는 보여지지 않더라도, GitHub에서 저장소를 방문하는 사람이나 본인의 포트폴리오 링크에 포함될 수 있기 때문에 **전문적이고 간결하게 작성**해두는 게 좋아요.

---

### ✅ 기술 블로그용 `README.md` 구성 예시

```markdown
# polynomeer.github.io

🧠 **Make Non-Polynomial Polynomial**  
복잡한 문제를 명확한 구조와 정책으로 해결하려는 개발자의 기술 블로그입니다.

## ✨ 블로그 소개

이 블로그는 주로 다음과 같은 주제를 다룹니다:

- 백엔드 개발 (Java, Spring Boot, JPA, MySQL, Redis 등)
- 시스템 아키텍처 및 성능 최적화
- 배치 처리 및 대용량 데이터 처리
- 이벤트 기반 시스템 및 메시지 큐
- DevOps, CI/CD, 로그 수집 및 모니터링

## 📌 기술 스택

이 블로그는 [Jekyll](https://jekyllrb.com/) 기반의 GitHub Pages 정적 사이트로 구축되었으며, 다음 기술을 활용합니다:

- **Jekyll** + **GitHub Pages**
- **SCSS** 커스터마이징을 통한 테마 수정
- **Markdown** 기반 포스팅
- **VSCode** + **Live Preview** 환경에서 작성

## 🔗 주요 링크

- 👉 [블로그 바로가기](https://polynomeer.github.io)
- 📝 [글 목록 전체 보기](https://polynomeer.github.io/archive/)
- 📬 Contact: [polynomeer@gmail.com](mailto:polynomeer@gmail.com)

## 🗂️ 디렉토리 구조

```
├── _posts/            # 블로그 포스트
├── _layouts/          # HTML 레이아웃 템플릿
├── _includes/         # 재사용 가능한 HTML 조각
├── assets/            # 이미지, SCSS 등 정적 리소스
├── _config.yml        # Jekyll 설정 파일
└── theme.scss         # 사용자 정의 스타일
```

## 🛠️ 로컬 개발 (선택 사항)

```bash
# 로컬에서 실행하려면 Jekyll 설치 필요
bundle install
bundle exec jekyll serve
```

---

이 저장소는 기술적 고민과 해결 과정, 그리고 아키텍처 설계 및 코드의 맥락을 기록하고 공유하기 위한 공간입니다.
```
