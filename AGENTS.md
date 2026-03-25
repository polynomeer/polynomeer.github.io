# AGENTS.md

This file defines the working rules for human contributors and AI agents in this repository.

## Scope

- This repository is a customized Jekyll blog based on `jekyll-theme-chirpy`.
- Prefer repository-local conventions over upstream theme defaults when they conflict.
- Do not overwrite or revert unrelated user changes.

## Core Rules

- Keep changes small, explicit, and easy to review.
- Preserve the existing content structure under `_posts`, `_tabs`, `_layouts`, `_includes`, `_sass`, and `assets`.
- Prefer extending the current theme structure instead of replacing upstream Chirpy patterns wholesale.
- Avoid broad refactors unless explicitly requested.
- When editing styles, favor variable-driven updates in `_sass/colors` before changing layout structure.
- When adding new features, keep them compatible with static hosting on GitHub Pages style deployments.

## Content Safety

- Do not rewrite existing posts unless the task explicitly asks for content edits.
- Treat untracked and modified post files as user work in progress.
- Do not rename, move, or delete posts, images, or tabs without explicit approval.
- Preserve front matter fields unless the task requires changing them.

## Jekyll and Theme Conventions

- Reuse existing layouts and includes before creating new ones.
- Put reusable view fragments in `_includes`.
- Put page-level structures in `_layouts`.
- Put dark theme palette changes in `_sass/colors/typography-dark.scss` and `_sass/colors/syntax-dark.scss`.
- Put shared styling in `_sass/addon` or `_sass/layout` depending on scope.
- Keep generated output out of commits unless explicitly requested.

## Local Verification

- Preferred verification commands:
  - `bundle exec jekyll build`
  - `bundle exec jekyll serve --incremental`
- If build performance is relevant, check custom plugins and archive generation before changing architecture.
- If a build command is slow, report the likely cause and avoid speculative optimization claims.

## Commit Rules

Use Conventional Commits.

Format:

```text
type(scope): summary
```

Rules:

- Use lowercase for `type` and `scope`.
- Keep the summary imperative and concise.
- Do not end the summary with a period.
- Prefer one logical change per commit.
- Stage only files relevant to the requested task.

Recommended types:

- `feat`: new user-facing feature
- `fix`: bug fix
- `refactor`: code change without feature or bug behavior change
- `style`: formatting or non-behavioral style-only update
- `docs`: documentation-only change
- `chore`: maintenance work
- `perf`: performance improvement
- `test`: test-related change

Examples:

- `feat(theme): add IntelliJ Dracula dark palette`
- `fix(search): prevent empty query rendering`
- `docs(agent): add repository workflow guide`

## Pull Request Expectations

- Explain what changed and why.
- Call out any user-visible impact.
- Mention verification status.
- Mention unresolved risks or follow-up work if applicable.

## Agent Workflow

1. Read the relevant layout, include, style, and config files before editing.
2. Check `git status` before making changes.
3. Edit only the files required for the task.
4. Verify with a local build when feasible.
5. Commit only the task-specific files using Conventional Commits.

