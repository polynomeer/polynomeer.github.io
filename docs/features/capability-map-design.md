# Capability Map Graph Redesign

## Goal

Renew the capability map so visitors can understand not only the list of strengths, but also how those strengths connect.

The redesigned page should answer:

- which engineering strengths are central
- how one capability relates to another
- what evidence supports each capability
- where a reader should go next after selecting a node

## Why The Existing Card Grid Is Not Enough

The current capability map is readable, but it treats every capability as an isolated card.

That weakens two important signals:

- structural relationships between strengths
- the difference between core capabilities and supporting capabilities

For a recruiter or first-time visitor, a graph makes the model easier to grasp:

- database internals can connect to architecture judgment
- Spring backend can connect to architecture and hiring readiness
- a central capability can visually anchor the rest of the map

## Recommended UX Model

Use a two-column interaction model:

1. graph canvas
2. detail panel

### Graph canvas

Show:

- one node per capability
- connecting lines between related capabilities
- compact labels and icons
- active, connected, and dimmed states

The graph should look closer to an Obsidian knowledge view than a dashboard chart, but remain curated and readable.

### Detail panel

When a node is selected, show:

- title
- short summary
- why it matters
- representative posts
- related series or follow-up links
- connected capabilities

The graph is the discovery surface. The detail panel is the reading surface.

## Information Architecture

### Page role

`/capabilities/` should become a graph-based overview page.

It should no longer render all capabilities as equal-height cards in one long grid.

### Default state

- first capability is selected by default
- its node is highlighted
- directly connected nodes remain emphasized
- unrelated nodes are slightly dimmed

### Interaction

- click a node to update the detail panel
- click another node to move focus
- on mobile, keep the same behavior but stack the detail panel below the graph

## Data Model

Keep one dedicated source of truth:

- `_data/capability_map.yml`

Recommended structure:

```yaml
enabled: true
default_focus: architecture-judgment

nodes:
  - id: architecture-judgment
    cluster: core
    x: 56
    y: 34
    icon: "fas fa-sitemap"
    tone: "violet"
    title:
      ko-KR: "아키텍처와 의사결정"
      en: "Architecture and Decision Making"
    summary:
      ko-KR: "트레이드오프와 운영 결과를 연결하는 판단 능력"
      en: "Engineering judgment that connects tradeoffs to operational outcomes."
    why_it_matters:
      ko-KR: "단순 기술 사용이 아니라 설계 판단의 질을 보여주는 중심 축입니다."
      en: "Acts as a central proof of design judgment rather than surface tool usage."
    representative_posts:
      - "_posts/notes/common/2026-03-20-architectural-decisions.md"
    related_series:
      - id: authentication-basics

edges:
  - from: database-internals
    to: architecture-judgment
    strength: strong
    label:
      ko-KR: "정합성 판단"
      en: "Consistency decisions"
```

## Field Guidance

### `nodes`

Each node should define:

- `id`
- `title`
- `summary`
- `icon`
- `x`, `y`

Optional but recommended:

- `cluster`
- `tone`
- `why_it_matters`
- `representative_posts`
- `related_series`
- `supporting_links`

### `edges`

Each edge should define:

- `from`
- `to`

Optional:

- `strength`: `strong`, `medium`, `light`
- `label`

### `default_focus`

Defines which node is selected when the page loads.

## Rendering Model

### Layout

Recommended structure:

- hero
- graph shell
- graph panel
- detail panel

### Graph rendering

Implementation should stay fully static-hosting compatible.

Recommended approach:

- SVG lines for edges
- positioned HTML buttons for nodes
- light client-side JavaScript to switch selected state

Avoid:

- heavy graph libraries
- force simulations that cause layout instability
- server-backed graph generation

### Detail rendering

Render node details from server-side templates and switch them client-side.

Preferred implementation:

- pre-render hidden templates per node
- replace detail panel content on node click

This keeps the page static and localization-friendly.

## Visual Direction

The graph should feel intentional and editorial rather than analytical.

Recommended cues:

- slightly atmospheric background
- soft grid or constellation-style overlay
- colored node halos by cluster or tone
- active edges brighter than inactive ones
- detail panel styled as a compact dossier

Do not turn it into a noisy network chart.

## Cluster Model

Use a small number of curated cluster labels if helpful.

Suggested examples:

- `core`
- `platform`
- `delivery`
- `career`

Clusters should influence color and legend treatment, not filtering logic in the first iteration.

## Content Rules

- Keep node count small, ideally 4 to 8.
- Prefer broad strengths over narrow keywords.
- Every node should have direct evidence.
- Every edge should reflect a real conceptual relationship, not decorative linkage.

## Non-Goals

- Do not auto-build the graph from tags or categories.
- Do not render every post as a node.
- Do not add free-form zoom and pan in the first iteration.
- Do not introduce backend services.

## Risks

### Visual complexity

Risk:

- a graph can become harder to read than cards

Mitigation:

- keep node count low
- curate positions manually
- use a strong default focus state

### Weak relationships

Risk:

- arbitrary edges reduce trust

Mitigation:

- connect only capabilities with a clear explanatory relationship
- allow sparse graphs

### Mobile compression

Risk:

- graph layouts can collapse poorly on narrow screens

Mitigation:

- use a fixed aspect-ratio canvas
- stack the detail panel below
- allow horizontal overflow only as a last resort

## Recommended Rollout

### Phase 1

- define node and edge schema
- rewrite the capability map data file
- redesign the page as graph plus detail panel

### Phase 2

- improve visual highlighting for adjacent nodes
- add cluster legend
- add supporting links such as related series

### Phase 3

- consider card/list toggle if some readers prefer a non-graph view

## Validation

After implementation:

1. confirm the graph renders without JavaScript errors
2. confirm default node selection works
3. confirm detail panel updates when clicking another node
4. confirm representative post links still resolve
5. confirm mobile layout remains readable
