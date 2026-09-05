---
description: Audit changed posts for front matter and writing-style violations
---

Audit the posts changed in the working tree (`git status --short -- _posts`), or the paths given in $ARGUMENTS if any.

For each post, check against `AGENTS.md` and `docs/guides/content-writing-style-guide.md`:

- front matter: single valid `---` block, quoted title where YAML requires it, array `categories`/`tags`, valid `date`, `status` is one of `draft` / `published` / `archived`, no `draft:` or `published:` keys, coherent `series` fields
- taxonomy: categories and tags match values already used in the repository; `Notes` instead of legacy `Archive`
- leftover assistant text or prompt-response scaffolding
- assistant phrasing ("물론입니다", "좋습니다", "원하시면 이어서", "다음으로 바로", "필요하시면 추가해드릴게요")
- emoji in titles, headings, callouts, or body
- vague or decorative headings, salesy or inflated language
- title and series naming consistency across the series

Report findings as a per-file list with line numbers. Do not edit anything unless I ask — these are drafts in progress.
