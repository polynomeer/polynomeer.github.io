# Content Type Separation Design

## Goal

Separate the blog into clearer content types so readers can distinguish between:

- `TIL`
- `Notes`
- `Article`

This improves discovery and helps users understand what kind of content they are reading before they commit time.

## Why This Feature Fits This Repository

The repository contains multiple kinds of writing:

- short iterative notes under `_posts/TIL`
- curated evergreen technical content under `_posts/notes`
- broader long-form content such as books, lectures, references, conference notes, and interview material

Right now, these all flow through the same global post system.

That makes the site rich, but it also makes the content model harder to understand at a glance.

## Design Principles

- Use repository structure before introducing new per-post metadata.
- Avoid bulk editing existing posts.
- Keep the model simple and transparent.
- Add UI hints in the homepage, post page, and dedicated type pages.

## Type Model

Recommended first rollout:

- `til`: posts under `_posts/TIL`
- `notes`: posts under `_posts/notes`
- `article`: all remaining posts under `_posts` that are not TIL or notes

This aligns with the current directory structure and avoids migration effort.

## Data Source

Store display metadata in `_data/content_types.yml`.

Recommended shape:

```yaml
til:
  title: "TIL"
  description: "Short, iterative notes and daily learning records."
  icon: "fas fa-pencil"
  order: 1

notes:
  title: "Notes"
  description: "More evergreen technical notes organized for long-term reference."
  icon: "fas fa-box-archive"
  order: 2

article:
  title: "Article"
  description: "Long-form content such as lectures, books, references, and conference notes."
  icon: "fas fa-newspaper"
  order: 3
```

## Rendering Model

### 1. Type directory page

Add a `/types/` page that explains and links to each content type.

Each card should show:

- title
- description
- approximate post count

### 2. Type detail pages

Add one page per content type:

- `/types/til/`
- `/types/notes/`
- `/types/article/`

Each page should show:

- content type description
- post list for that type

### 3. Post badge

Each post page should display its content type near post metadata.

This helps users understand whether the current page is:

- a quick note
- a curated technical note
- a broader article or study note

### 4. Homepage integration

Homepage cards should show a small content type badge.

This makes the feed easier to scan.

## Classification Rules

### TIL

A post is `til` when:

- `post.path` contains `/_posts/TIL/`

### Notes

A post is `notes` when:

- `post.path` contains `/_posts/notes/`

### Article

A post is `article` when:

- it is under `_posts`
- and it does not match TIL or notes

## Non-Goals

- Do not redesign the entire taxonomy around types.
- Do not replace categories, tags, topic hubs, series, or roadmaps.
- Do not force all older posts to add explicit front matter fields.

## Risks

### Overgeneralization

Risk:

- some posts may conceptually fit multiple types

Mitigation:

- use path-based type as a first stable system
- add optional override metadata only later if needed

### Too many navigation surfaces

Risk:

- adding type pages may create navigation overload

Mitigation:

- keep the types page compact
- position types as a complementary browsing mode

## Recommended First Implementation

Implement:

1. `_data/content_types.yml`
2. `/types/` directory page
3. individual type pages
4. content type badge in post pages and homepage feed

This gives immediate clarity without requiring content migration.
