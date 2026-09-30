#!/usr/bin/env bash
# career-hub 의 이력서·포트폴리오를 이 블로그의 /resume/ · /portfolio/ 로 가져옵니다.
#
# 왜 PDF 가 아니라 HTML 인가:
#   두 문서는 이미 자체 완결형 HTML 입니다(스타일 내장, 외부 의존 없음). PDF 로 만들면 모바일에서
#   읽기 어렵고 링크가 죽습니다. 포트폴리오 쪽은 본문에 GitHub 링크가 30개 넘게 들어 있어 특히
#   그렇습니다.
#
# 왜 배포 자동화가 아니라 수동인가:
#   career-hub 는 private 이라 공개 저장소의 Actions 가 읽으려면 PAT 를 secret 으로 넣어야 하고,
#   토큰이 만료되는 날 블로그 배포가 이력서 때문에 깨집니다. 이력서는 자주 바뀌지 않습니다.
#
# 무엇을 검사하는가:
#   포트폴리오 원본에는 전화번호가 들어 있습니다. 여기서 지우고 **지워졌는지 확인**합니다. 확인에
#   실패하면 산출물을 지우고 중단합니다 - 패턴이 빗나갔을 때 조용히 공개되는 것이 가장 나쁩니다.
set -euo pipefail

CAREER_HUB="${CAREER_HUB:-$HOME/Documents/career-hub}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -d "$CAREER_HUB" ]; then
  echo "career-hub 를 찾지 못했습니다: $CAREER_HUB" >&2
  echo "  CAREER_HUB=<경로> $0" >&2
  exit 1
fi

# 본문이 산출물 HTML 보다 최신이면 옛 내용을 퍼갑니다.
if [ -f "$CAREER_HUB/content/resume-public.res.md" ]; then
  if ! (cd "$CAREER_HUB" && python3 scripts/build-resume.py content/resume-public.res.md --check >/dev/null 2>&1); then
    echo "resume-public 본문이 HTML 보다 최신입니다. 먼저 빌드하십시오:" >&2
    echo "  (cd $CAREER_HUB && python3 scripts/build-resume.py content/resume-public.res.md)" >&2
    exit 1
  fi
fi

python3 - "$CAREER_HUB" "$ROOT" <<'PY'
import pathlib, re, shutil, sys

hub, root = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])

BACK_LINK_CSS = """
/* 블로그로 돌아가는 길. 원본 문서에는 없고 여기서만 붙입니다 - 이 페이지는 사이트 내비게이션
   바깥에 있으므로, 없으면 방문자가 뒤로 가기 말고는 나갈 방법이 없습니다. */
.back-to-blog{position:fixed;top:14px;left:14px;z-index:99;display:inline-flex;align-items:center;
  gap:.4rem;padding:.4rem .8rem;border-radius:999px;border:1px solid var(--line,#DCE0E2);
  background:var(--bg-elevated,#fff);color:var(--ink-muted,#5B6472);font-size:.85rem;
  text-decoration:none;box-shadow:0 1px 3px rgba(20,24,32,.08)}
.back-to-blog:hover{color:var(--accent,#2454B0);border-color:var(--accent,#2454B0)}
@media print{.back-to-blog{display:none}}
@media (max-width:640px){.back-to-blog{position:static;margin:12px 0 0 12px}}
"""

DOCS = [
    {"src": "resume-public.html", "out": "resume", "title": "이력서 — 함승훈",
     "desc": "백엔드 엔지니어 함승훈의 이력서.", "assets": ["assets/profile.jpg"]},
    {"src": "portfolio.html", "out": "portfolio", "title": "포트폴리오 — 함승훈",
     "desc": "백엔드 엔지니어 함승훈의 프로젝트 포트폴리오.", "assets": []},
]

PHONE = re.compile(r"010[-\s]?\d{3,4}[-\s]?\d{4}|tel:")

def strip_phone(html):
    """연락처 줄에서 Tel 항목만 들어냅니다."""
    return re.sub(r"<span>\s*<span class=\"k\">Tel</span>\s*<a href=\"tel:[^\"]*\">[^<]*</a>\s*</span>",
                  "", html)

written = []
for doc in DOCS:
    src = hub / doc["src"]
    if not src.exists():
        sys.exit(f"원본이 없습니다: {src}")
    frag = src.read_text(errors="replace")

    frag = strip_phone(frag)
    # 조각에는 <html>/<head>/<body> 가 없습니다. 맨 앞 charset 과 첫 <style> 을 head 로 옮겨
    # 제대로 된 문서로 만듭니다 - 그래야 탭 제목·viewport·lang 이 붙습니다.
    frag = re.sub(r"^\s*<meta charset=[^>]*>\s*", "", frag, count=1)
    style = ""
    m = re.search(r"<style>.*?</style>", frag, re.S)
    if m:
        style = m.group(0)
        frag = frag[:m.start()] + frag[m.end():]

    page = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{doc['title']}</title>
<meta name="description" content="{doc['desc']}">
<link rel="canonical" href="https://polynomeer.github.io/{doc['out']}/">
<!-- career-hub 의 {doc['src']} 에서 scripts/sync-career-docs.sh 가 가져온 것입니다.
     이 파일을 직접 고치지 마십시오 - 다음 동기화에서 덮어써집니다. -->
{style}
<style>{BACK_LINK_CSS}</style>
</head>
<body>
<a class="back-to-blog" href="/">&larr; 블로그</a>
{frag}
</body>
</html>
"""
    # 검증이 먼저입니다. 실패하면 아무것도 쓰지 않습니다.
    hits = PHONE.findall(page)
    if hits:
        sys.exit(f"{doc['src']}: 전화번호가 남아 있습니다 {hits[:3]} — 아무것도 쓰지 않았습니다. "
                 f"연락처 마크업이 바뀌었는지 확인하십시오.")

    out_dir = root / doc["out"]
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "index.html").write_text(page)
    written.append(f"{doc['out']}/index.html ({len(page) // 1024}KB)")

    for rel in doc["assets"]:
        a = hub / rel
        if not a.exists():
            sys.exit(f"참조된 자산이 없습니다: {a}")
        dst = out_dir / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(a, dst)
        written.append(f"{doc['out']}/{rel}")

print("-- 가져왔습니다")
for w in written:
    print(f"   {w}")
PY

echo "-- 확인: /resume/ · /portfolio/ 로 서빙됩니다. 커밋하면 배포에 포함됩니다."
