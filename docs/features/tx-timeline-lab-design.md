# Interleaved-Transaction Lab

## Goal

Let a post be operated, not only read.

A concurrency post is a sequence of states, and prose has to serialize it: a
table of which anomaly each isolation level forbids, then a code block of two
interleaved sessions, then a paragraph explaining that the same level behaves
differently in PostgreSQL and MySQL. The reader has to hold all three in their
head at once. The widget puts them on one surface: the interleaving is fixed,
the engine and the isolation level are the dials, and the outcome moves.

The first one sits in
[격리 수준과 이상 현상](/posts/isolation-levels-and-anomalies/), right after
the PostgreSQL RR / MySQL RR comparison table, which is where the post's claim
lands.

## Honesty constraint

The widget does not simulate a database. Every cell is an outcome the post
already states, or that the engine documentation it cites states. The data
file says so at the top, and where a cell would require extrapolation the note
says what the limit is rather than inventing a result. A widget that guessed
would be worse than the table it replaces, because it looks like evidence.

## Data

`_data/tx_timelines.yml`, keyed by lab id. One lab carries:

- `row`: the starting state, shown once
- `engines` and `levels`: the axes of the outcome grid (levels carry a `short`
  label for the phone header)
- `scenarios`: each with `steps` and an `outcomes` map of engine → level → cell

A step is `{tx, sql, note, reads}`. `reads: first` or `reads: later` marks a
statement whose result depends on the selected cell; the cell supplies
`first_read` and `later_read`.

A cell's `verdict` is one of `anomaly`, `safe`, `blocked` or `aborted`, which
drives both the colour and how far the timeline runs: a `blocked` or `aborted`
scenario stops one step short, because that is where it stops.

`first` cannot be a key in either place. Liquid reserves it as an accessor on
a hash, so `step.first` returns the hash's first key/value pair — always
truthy — and `cell.first` renders as `verdictanomaly`. That is why the keys
are `first_read` and `later_read`.

## Rendering

`_includes/lab/tx-timeline.html` renders every scenario, the whole outcome
grid and every note as plain markup:

```liquid
{% include lab/tx-timeline.html id="isolation-anomalies" %}
```

Without JavaScript the section reads as a set of tables, which is what the
post would have contained anyway.

`_javascript/modules/components/tx-timeline.js` turns the same markup into
something to operate: the scenario buttons become tabs, a grid cell selects an
engine and level (showing only that cell's note and filling in what each
SELECT returns), and a step control walks the timeline one statement at a
time. The first statement stays visible so an untouched scenario does not read
as disabled text.

The grid is a plain `<table>` in the post body, so Chirpy's
`refactor-content.html` wraps it in `.table-wrapper` and it scrolls sideways
on a phone exactly like the post's other tables.

Strings live under `tx_lab` in the locale files; styles in
`_sass/layout/tx-timeline.scss`.

## Adding another

Add a key to `_data/tx_timelines.yml` and one include line to the post. No
markup, style or script changes are needed as long as the new lab fits the
shape of two actors, a fixed interleaving and a grid of outcomes. Lock waits
and Kafka consumer offsets fit it; something with a continuous variable would
not.
