#!/usr/bin/env python3
"""소개 페이지의 활동 지표를 모아 _data/about_activity.yml 로 씁니다.

왜 스크립트인가: Jekyll 빌드는 이 저장소 밖을 읽지 못합니다. 저장소 커밋 수도, AI 도구 세션도
전부 바깥에 있으므로 여기서 세어 데이터 파일로 남기고, 그 파일을 커밋합니다. 그러면 빌드는
재현 가능하고 배포 환경에 원본이 없어도 됩니다.

무엇을 세지 않는가: 통계 페이지(/stats/)가 이미 다루는 글쓰기 지표는 여기서 다시 세지 않습니다.
이 파일은 글이 아니라 코드와 도구 쪽 활동만 봅니다.

실행: python3 scripts/collect-activity.py
"""

import json
import os
import pathlib
import re
import subprocess
import sys
from collections import Counter
from fnmatch import fnmatch

ROOT = pathlib.Path(__file__).resolve().parent.parent
HOME = pathlib.Path.home()
PROJECTS = HOME / "Projects"

TEST_PATTERNS = ("*Test.java", "*Tests.java", "*IT.java", "*.test.ts", "*.test.tsx",
                 "*.spec.ts", "*.spec.tsx", "test_*.py", "*_test.py", "*.test.js")
# 남의 코드는 세지 않습니다. monticker 의 .claude/skills 에 벤더링된 서드파티 스킬 하나가
# 파이썬 테스트 1,156개를 들고 있어서, 넣고 세면 이 사람이 쓴 테스트가 1,397개로 보고됩니다.
SKIP_DIRS = {"node_modules", "build", "target", ".git", "dist", ".gradle", ".venv", "_site",
             ".claude", ".codex", "vendor", "third_party", "vendor_imports", "site-packages"}


def sh(args, cwd):
    try:
        out = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=60)
        return out.stdout.strip() if out.returncode == 0 else ""
    except Exception:
        return ""


def repo_stats(path):
    if not (path / ".git").exists():
        return None
    commits = sh(["git", "rev-list", "--count", "HEAD"], path)
    # --reverse 와 -1 을 같이 주면 git 이 먼저 자르고 뒤집어 최신 커밋을 돌려줍니다. 그래서
    # 모든 저장소의 시작월이 마지막월과 같게 나왔습니다. 루트 커밋을 직접 집습니다.
    first = sh(["git", "log", "--max-parents=0", "--format=%ad", "--date=format:%Y.%m"], path)
    first = first.splitlines()[-1] if first else ""
    last = sh(["git", "log", "-1", "--format=%ad", "--date=format:%Y.%m"], path)
    # os.walk 로 훑으면서 node_modules 같은 디렉터리는 들어가기 전에 잘라냅니다. rglob 으로
    # 전부 순회한 뒤 거르면 node_modules 가 있는 저장소에서 10분이 넘게 걸립니다.
    tests = 0
    for dirpath, dirnames, filenames in os.walk(path):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if any(fnmatch(fn, pat) for pat in TEST_PATTERNS):
                tests += 1
    return {"commits": int(commits) if commits.isdigit() else 0,
            "tests": tests, "first": first, "last": last}


def ai_usage():
    """세션 수와 모델이 생성한 토큰만 셉니다.

    캐시 재읽기(claude-code 61.6B, codex 6.4B)는 빼고 냅니다. 긴 세션에서 같은 맥락을 다시 읽은
    양이라 작업량이 아니고, 그것을 합계로 내면 수치가 두 자릿수 배 부풀려집니다.
    """
    out = {}

    # 줄마다 json.loads 하면 242개 파일에 10분이 넘으므로, output_tokens 가 들어 있는 줄만
    # 골라 파싱합니다.
    #
    # 정규식으로 숫자만 긁으면 안 됩니다. 한 줄에 output_tokens 가 두 번 나옵니다 -
    # usage 안에 한 번, iterations[] 안에 같은 값이 또 한 번. 그렇게 세면 정확히 2배가 되고,
    # 실제로 115M 을 231M 으로 보고했습니다. 세는 곳은 message.usage 하나입니다.
    sessions, produced = 0, 0
    for f in (HOME / ".claude/projects").rglob("*.jsonl"):
        sessions += 1
        try:
            for line in f.open(errors="replace"):
                if '"output_tokens"' not in line:
                    continue
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                u = (d.get("message") or {}).get("usage") or {}
                produced += u.get("output_tokens") or 0
        except OSError:
            continue
    if sessions:
        out["claude-code"] = {"sessions": sessions, "produced": produced}

    # codex 는 세션마다 누적값을 계속 다시 적으므로 마지막 total_token_usage 하나만 씁니다.
    codex_block = re.compile(rb'"total_token_usage":\s*\{[^}]*?"output_tokens":\s*(\d+)')
    sessions, produced = 0, 0
    for f in (HOME / ".codex/sessions").rglob("*.jsonl"):
        try:
            hits = codex_block.findall(f.read_bytes())
        except OSError:
            continue
        if hits:
            sessions += 1
            produced += int(hits[-1])
    if sessions:
        out["codex"] = {"sessions": sessions, "produced": produced}
    return out


def main():
    # 어느 저장소를 셀지는 이미 공개된 목록에서 가져옵니다. 여기에 손으로 적으면 포트폴리오와
    # 어긋납니다.
    portfolio = (ROOT / "_data/portfolio.yml").read_text()
    repos = re.findall(r"repo: https://github\.com/polynomeer/([\w.-]+)", portfolio)
    experiments = (ROOT / "_data/experiments.yml").read_text()
    repos += re.findall(r"repo: https://github\.com/polynomeer/([\w.-]+)", experiments)
    seen, ordered = set(), []
    for r in repos:
        if r not in seen:
            seen.add(r)
            ordered.append(r)

    rows, missing = [], []
    for name in ordered:
        path = PROJECTS / name
        stats = repo_stats(path) if path.exists() else None
        if not stats:
            missing.append(name)
            continue
        rows.append({"name": name, **stats})
    rows.sort(key=lambda r: -r["commits"])

    # 기술 스택 빈도. Liquid 의 where_exp 안에서는 루프 변수가 잡히지 않아 칩이 하나만
    # 그려졌습니다. 세는 일은 여기서 하고 템플릿은 그리기만 합니다.
    tech = Counter()
    for block in re.findall(r"tech: \[([^\]]+)\]", portfolio):
        for t in block.split(","):
            t = t.strip()
            if t:
                tech[t] += 1
    stack = [(name, n) for name, n in tech.most_common() if n > 1]

    usage = ai_usage()
    lines = [
        "# 생성 파일입니다. 손으로 고치지 마십시오 - scripts/collect-activity.py 가 덮어씁니다.",
        "#",
        "# 글쓰기 지표는 여기 없습니다. /stats/ 가 이미 다룹니다.",
        f"# 마지막 수집: {sh(['date', '+%Y-%m-%d'], ROOT)}",
        "",
        "repos:",
    ]
    for r in rows:
        lines.append(f"  - name: {r['name']}")
        lines.append(f"    commits: {r['commits']}")
        lines.append(f"    tests: {r['tests']}")
        lines.append(f"    span: \"{r['first']} – {r['last']}\"")
    lines += ["", "totals:",
              f"  commits: {sum(r['commits'] for r in rows)}",
              f"  tests: {sum(r['tests'] for r in rows)}",
              f"  repos: {len(rows)}", ""]
    if stack:
        lines.append("# 두 개 이상의 프로젝트에 쓴 기술만. 숫자는 그 기술을 쓴 프로젝트 수입니다.")
        lines.append("stack:")
        for name, n in stack:
            lines.append(f"  - {{ name: \"{name}\", projects: {n} }}")
        lines.append("")

    if usage:
        lines.append("# 세션 수와 모델이 생성한 토큰만입니다. 캐시 재읽기는 작업량이 아니라 뺐습니다.")
        lines.append("ai:")
        for tool, v in usage.items():
            lines.append(f"  - tool: {tool}")
            lines.append(f"    sessions: {v['sessions']}")
            lines.append(f"    produced: {v['produced']}")
        lines.append("")

    (ROOT / "_data/about_activity.yml").write_text("\n".join(lines))
    print(f"저장소 {len(rows)}개 · 커밋 {sum(r['commits'] for r in rows):,} · "
          f"테스트 {sum(r['tests'] for r in rows):,}")
    for tool, v in usage.items():
        print(f"{tool}: 세션 {v['sessions']} · 생성 {v['produced']:,}")
    if missing:
        print(f"로컬에 없어 건너뜀: {', '.join(missing)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
