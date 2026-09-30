#!/usr/bin/env bash
# career-hub 의 이력서를 PDF 로 뽑아 이 저장소의 assets/files/ 에 넣습니다.
#
# 왜 자동이 아니라 수동인가:
#   career-hub 는 private 이라 배포 파이프라인이 읽으려면 PAT 를 공개 저장소의 secret 으로 넣어야
#   합니다. 그렇게 하면 토큰이 만료되는 날 블로그 배포가 이력서 때문에 깨지거나, 조용히 이력서 없이
#   나갑니다. 이력서는 자주 바뀌지 않으므로 그 대가가 이득보다 큽니다.
#
# 어느 파일을 쓰는가:
#   career-hub/content/resume-public.res.md 를 빌드한 resume-public.html 입니다.
#
#   resume.html(범용 마스터)은 9쪽이라 RESUME_GUIDE 의 "3페이지 안팎"을 넘고, versions/*.html 은
#   회사별 맞춤본이라 공개 블로그에 올리면 다른 회사 검토자가 보게 됩니다. resume-public 은
#   resume-simple 과 본문이 같고 연락처에서 전화번호만 뺀 것입니다 - 공개 페이지의 전화번호는
#   크롤러가 수집하고 한번 색인되면 회수하기 어렵습니다.
#
# 파일이 없으면 About 의 이력서 버튼은 그냥 나오지 않습니다. 깨진 링크가 되지 않으므로, 이 스크립트를
# 안 돌린 상태로 배포해도 안전합니다.
set -euo pipefail

CAREER_HUB="${CAREER_HUB:-$HOME/Documents/career-hub}"
SOURCE="${SOURCE:-resume-public.html}"
DEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/assets/files"
DEST="$DEST_DIR/polynomeer-resume.pdf"

if [ ! -d "$CAREER_HUB" ]; then
  echo "career-hub 를 찾지 못했습니다: $CAREER_HUB" >&2
  echo "  git clone git@github.com:polynomeer/career-hub.git ~/Documents/career-hub" >&2
  echo "  또는 CAREER_HUB=<경로> $0" >&2
  exit 1
fi

if [ ! -f "$CAREER_HUB/$SOURCE" ]; then
  echo "이력서 원본이 없습니다: $CAREER_HUB/$SOURCE" >&2
  exit 1
fi

if [ ! -x "$CAREER_HUB/scripts/export-pdf.sh" ]; then
  echo "export-pdf.sh 를 찾지 못했습니다: $CAREER_HUB/scripts/export-pdf.sh" >&2
  exit 1
fi

CONTENT="${CONTENT:-content/resume-public.res.md}"
if [ -f "$CAREER_HUB/$CONTENT" ]; then
  echo "-- 본문과 HTML 이 일치하는지 확인합니다"
  if ! (cd "$CAREER_HUB" && python3 scripts/build-resume.py "$CONTENT" --check >/dev/null 2>&1); then
    echo "   본문이 HTML 보다 최신입니다. 먼저 빌드하십시오:" >&2
    echo "   (cd $CAREER_HUB && python3 scripts/build-resume.py $CONTENT --pdf)" >&2
    exit 1
  fi
fi

mkdir -p "$DEST_DIR"

echo "-- $SOURCE 를 PDF 로 추출합니다"
(cd "$CAREER_HUB" && ./scripts/export-pdf.sh "$SOURCE" --output "$DEST")

if [ ! -f "$DEST" ]; then
  echo "PDF 가 생성되지 않았습니다: $DEST" >&2
  exit 1
fi

echo "-- 완료: assets/files/$(basename "$DEST") ($(du -h "$DEST" | cut -f1))"
echo "   About 의 이력서 버튼은 이 파일이 있을 때만 나옵니다. 커밋하면 배포에 포함됩니다."
