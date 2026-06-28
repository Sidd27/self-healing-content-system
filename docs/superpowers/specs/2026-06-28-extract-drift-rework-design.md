# Extract / Drift / New-Topic Rework — Design

**Date:** 2026-06-28
**Status:** Approved, ready for implementation plan

## Goal

Collapse the redundant per-topic extraction + drift work into a single extraction
call, remove dead weight (per-topic hash comparison), and make the
blast-radius contract explicit: a source change regenerates a learning unit
**only if that unit's topic actually drifted**.

## Why

Today `extract_topics` makes one LLM call per existing topic to pull its
content, then `drift_analysis` makes a second call per topic to score the
change. The drift call already has to understand the new content to score it —
so the two calls are redundant. On top of that, the per-topic content hash is
near-useless: ingest already hash-gates the whole source, and LLM extraction is
non-deterministic, so the same content never reproduces an identical string.

The topic abstraction exists to **contain the blast radius of change**: one edit
to a source should not regenerate every learning unit, only the units whose
topic changed. The drift verdict is what gates that, so the extraction and drift
detection belong together where the content is understood.

## Pipeline

Stage names are unchanged — no enum migration.

```
ingest → extract_topics → drift_analysis → repair_decision → generate
```

### `ingest` — unchanged

Fetch + normalize + whole-source hash gate. This hash is the only useful one and
stays: it stops the run when nothing changed since the last version.

### `extract_topics` — one extraction call, then naming

**One extraction call.** Input: every existing topic (each with its prior
extraction) + the new normalized source. Output:

```json
{
  "existing":  [{ "index": 1, "extractedContent": "...", "drifted": true }],
  "unmatched": [{ "content": "..." }]
}
```

The call sorts the new source against the existing topics:

- **existing** — each topic's content as it appears in the new source, plus a
  `drifted` boolean (did this topic's content change meaningfully vs its prior
  extraction).
- **unmatched** — leftover content that maps to no existing topic → candidate
  new topics.

Then, in code:

- **Persist a new `topicExtractions` row only for `drifted: true` topics.**
  Unchanged topics keep their existing baseline — no append-only churn, and the
  baseline stays meaningful for the next run's comparison. The drifted topics are
  collected and passed to `drift_analysis`.
- **If `unmatched` is non-empty, make one naming call** that turns the raw
  content blobs into structured `{ name, description, extractedContent }` objects,
  written to `proposedTopics` with status `pending_approval`. No deduplication is
  needed — this content is already the leftover that bound to no topic.

**ID safety.** The extraction prompt labels each topic with a positional `index`
(1, 2, 3…), not its UUID. The model returns the `index`; code maps index→topicId.
Models mangle UUIDs; they do not mangle "1".

### `drift_analysis` — unchanged structure, the precise gate

Runs only on the drifted topics (the run orchestrator already gates this stage on
`drifted.length > 0`). Per topic: old extraction vs new extraction →
`{ changeType, driftScore, reason }`.

**A `driftItem` is created only when `changeType != NO_CHANGE`.** This makes the
cheap `drifted` flag from extraction allowed to over-flag: the precise scorer
vetoes false positives. Two layers protect the blast radius — a topic only
reaches `generate` if both the extraction flagged it AND the scorer confirms a
real change.

### `repair_decision` — unchanged

Triage: `driftScore < 0.75` → `auto_applied`; `driftScore >= 0.75` →
`pending_review`. Proposed new topics always require human approval.

### `generate` — unchanged

Regeneration is scoped to `topicId`. A topic that did not drift keeps its
existing questions untouched — this is the blast-radius contract in effect.

## Blast-radius contract

A learning unit is tied to a topic (`learningUnits.topicId`), not to the source.
Therefore:

> A source change regenerates a learning unit **only if that unit's topic
> drifted.** A topic that did not change keeps its existing questions — no
> regeneration, no cost, no risk of corrupting stable content.

Two distinct gates, two distinct jobs:

- **`changeType == NO_CHANGE`** → the regeneration gate (regenerate this topic's
  unit, or leave it alone).
- **`driftScore >= 0.75`** → the triage gate (auto-apply vs human review).

## Cleanups (deletions)

- **Per-topic hash comparison** — removed, and the `topicExtractions.contentHash`
  column is **dropped** (migration `0002`). It was only ever used for the
  comparison, which is gone. `sourceVersions.contentHash` (the whole-source gate)
  stays.
- **`buildExtractPrompt`** (the single-topic verbatim extractor) — removed. On
  proposed-topic approval, seed the topic's first extraction **directly from
  `proposedTopics.extractedContent`** — the exact text the human reviewed and
  approved — instead of re-extracting. This removes an LLM call and eliminates
  the old false-drift-on-approval bug at its root (the seed baseline now matches
  what was approved).
- Embeddings — already removed in a prior change.

## Prompts and schemas

- **New** `buildExtractPrompt(topics, newSource)` (multi-topic) + an extract
  schema: `{ existing: [{ index, extractedContent, drifted }], unmatched: [{ content }] }`.
- **Refit** `buildProposeTopicsPrompt` to take only the unmatched content blobs
  and return named topic objects.
- `buildDriftPrompt` and `buildGeneratePrompt` — unchanged.

Note: the new multi-topic `buildExtractPrompt` replaces the old single-topic one
of the same name. All existing call sites are updated.

## Call budget per run

`1 extract + (#drifted scoring) + (1 naming if new topics found) + (#regen)`.

If nothing drifted and nothing new is found → **1 LLM call total**, down from
today's `2N + 1` (N = existing topic count).

## Scaling note

The single extraction call feeds every existing topic's prior extraction plus the
full source into one prompt. This is fine at the assignment's scale (3–8 topics
per source). If topic counts per source grow large, the call would need to be
chunked (batches of topics, or a retrieval pre-filter). Out of scope for now —
documented as the known ceiling.

## Out of scope

- Scheduler (still manual trigger).
- Vector store / semantic search.
- Topic↔source many-to-many.
- Rename/split detection (e.g. one topic splitting into two across versions) —
  handled approximately: the old topic drifts, and the genuinely new portion
  surfaces as unmatched. Not specially modeled.
