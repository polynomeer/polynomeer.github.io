---
description: Scaffold a new blog post with valid front matter
argument-hint: <content-type> <slug or topic>
---

Create a new post skeleton for: $ARGUMENTS

Steps:

1. Decide the content type from the first argument and match it against `_content_types/` (`notes`, `til`, `lecture`, `book`, `conference`, `problemsolving`, `recruit`, `reference`). If it is ambiguous, ask before creating anything.
2. Look at 2-3 recent existing posts of the same type under `_posts/` to match directory layout, category values, and tag vocabulary. Do not invent new taxonomy values.
3. Create the file at `_posts/<type>/<...>/YYYY-MM-DD-<slug>.md` using today's date.
4. Write front matter following the contract in `CLAUDE.md`: quoted `title`, `date`, `status: draft`, array `categories` and `tags`. Add `series`, `series_title`, `series_order`, `series_description` only if this post joins a series — then check the existing series entries so `series_order` does not collide.
5. Add a short outline of headings only. Do not write filler body copy, and do not use emoji.
6. Report the created path and the front matter you used. Do not commit.
