---
description: Build the site and report failures
allowed-tools: Bash(bundle exec jekyll build:*), Bash(npm run lint:scss), Read, Grep, Glob
---

Verify the site still builds.

1. Run `bundle exec jekyll build`.
2. If SCSS was touched in the working tree, also run `npm run lint:scss`.
3. Report the real outcome: pass, or the failing file and error with the relevant output quoted. Do not claim success on a non-zero exit.
4. If a post fails to build, the usual cause is invalid front matter YAML — an unquoted title with `:`, a duplicated `---` block, or a malformed date. Point at the exact file and line.
5. Do not "fix" unrelated posts that happen to warn.
