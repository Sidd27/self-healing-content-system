# Self-Healing Content System — Design Spec

**Date:** 2026-06-26  
**Assignment:** Memorang Full-Stack Engineer Skills Exercise B

---

## Overview

A system that keeps AI-generated learning content accurate as source materials change. Sources change (exam guides revised, docs restructured, products deprecated); downstream questions, rationales, and lessons go stale without anyone knowing. This system detects, triages, and repairs that staleness automatically — with human oversight proportional to the severity of the change.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend + Backend | Next.js 15 (App Router) |
| Language | TypeScript |
| UI | Shadcn + Tailwind |
| Database | Supabase (Postgres) |
| ORM | Drizzle |
| AI | OpenRouter |
| Agent Framework | Mastra |
| Deployment | Vercel |

Pipeline is **on-demand only** — triggered manually via UI button. No scheduler.

---

## Core Mental Model

```
Source → SourceVersion → NormalizedContent → Topics → LearningUnits
```

- **Source**: a document (URL, PDF, or Markdown file)
- **SourceVersion**: a snapshot of a source's content at a point in time
- **NormalizedContent**: deterministically cleaned text stored per version
- **Topics**: top-down, human-defined semantic domains (e.g. "Cloud Run Autoscaling")
- **TopicExtraction**: verbatim passages the LLM extracts from a source version for a topic
- **LearningUnit**: a question + rationale + lesson triple generated per topic

---

## Data Model

All version tables are **append-only — history is never deleted**.

```
sources
  id, name, type (url | pdf | md), url, created_at

source_versions
  id, source_id, content_hash, normalized_content,
  storage_path, created_at
  -- no version_number: latest version = ORDER BY created_at DESC LIMIT 1

topics
  id, source_id, name, description, created_at

topic_extractions                        ← append-only, full history
  id, topic_id, source_version_id,
  extracted_content, content_hash,
  created_at

proposed_topics                          ← LLM-suggested from new sections; awaits human approval
  id, source_version_id, pipeline_run_id,
  name, description, extracted_content,
  status (pending_approval | approved | rejected),
  created_at, reviewed_at

learning_units
  id, topic_id, created_at

learning_unit_versions                   ← append-only, full history
  id, learning_unit_id, source_version_id,
  question, rationale, lesson,
  drift_score,
  status (active | pending_review | archived),
  created_at

pipeline_runs
  id, source_version_id, triggered_at, completed_at,
  status (running | completed | failed | awaiting_review)

pipeline_stages
  id, pipeline_run_id,
  stage (ingest | normalize | hash_check | extract_topics | drift_analysis | repair_decision | generate),
  status (pending | running | completed | failed | skipped),
  started_at, completed_at, output_summary, error

drift_items                              ← one row per affected topic per run
  id, pipeline_run_id, topic_id,
  change_type, drift_score,
  drift_level (low | med | high),
  reason,
  status (auto_applied | pending_review | approved | rejected),
  created_at
```

### Hash pattern — consistent at every level

```
source_versions.content_hash        → did the source change?
topic_extractions.content_hash      → did this topic's relevant content change?
learning_unit_versions.status       → did the output change?
```

Each level only proceeds if its hash changed. Hashing uses **MD5** (Node built-in `crypto` module) — non-cryptographic use case, no new dependency needed.

---

## Pipeline Design

A **Mastra workflow** with 7 stages. Each stage writes its output to Supabase before passing control to the next. On failure, `pipeline_stages.error` captures it and the run is resumable from that stage.

### Stage 1 — Ingest
Each source type has its own extractor:
- **URL** → fetch HTML, strip tags, extract body text
- **PDF** → pdf-parse (or similar) to extract plain text from binary
- **MD** → strip markdown syntax, extract plain text

Content length is checked after extraction. If it exceeds a defined cap, the stage fails with a clear error surfaced in the UI — no silent failure.

Output: raw content string

### Stage 2 — Normalize
- Deterministic: strip HTML, normalize whitespace, lowercase
- Output: `normalized_content` (stored as-is, readable) + MD5 `content_hash`
- Hash input: `normalized_content` passed through an aggressive local formatter first — collapse all whitespace to single space, trim — before hashing. This intermediate form is never stored.
- Same two-step pattern (store readable, hash aggressively normalized) reused for topic extraction hashing in Stage 4.

### Stage 3 — Hash Check
```
query latest source_version for this source
├── no previous version → first run, create source_version row, proceed
├── same hash → STOP, pipeline_run = completed (no changes)
└── different hash → create new source_version row, proceed
```

### Stage 4 — Extract Topics
For each existing topic:
- LLM extracts **verbatim passages** relevant to the topic (`temperature=0`, no summarization)
- `normalize(extracted_content)` → MD5 hash
- Compare vs previous `topic_extractions.content_hash`
  - No previous extraction (first run) → skip drift analysis, go straight to Generate
  - Same → unaffected, skip
  - Different → affected, flag for drift analysis

Separately: LLM scans new/changed content for sections not covered by any existing topic → creates `proposed_topics` rows (`pending_approval`)

> ponytail: verbatim extraction + temp=0 keeps hashing deterministic. Upgrade to embedding cosine similarity if false negatives appear (semantic shifts not captured by verbatim extraction — e.g. added negation that changes meaning without changing surrounding text).

### Stage 5 — Drift Analysis
For each affected topic only:
- LLM receives: `old extracted_content` vs `new extracted_content`
- Response validated with Zod schema before proceeding — malformed output fails the stage cleanly with error captured in `pipeline_stages.error`
- Expected shape:
```json
{
  "changeType": "SEMANTIC_CHANGE",
  "driftScore": 0.87,
  "requiresRepair": true,
  "reason": "Maximum instance limit changed."
}
```
- Creates `drift_items` row with `drift_level` derived from `driftScore`

### Stage 6 — Repair Decision
```
drift_score < 0.75 → auto_applied → proceed to Generate
drift_score ≥ 0.75 → pending_review → pipeline suspends (Mastra step suspension)
any proposed_topics → pipeline_run.status = awaiting_review
```

### Stage 7 — Generate
For each `auto_applied` drift item:
- LLM generates `question + rationale + lesson` from new `extracted_content`
- New `learning_unit_versions` row (`status: active`)
- Previous version → `archived`

### Within-stage execution
Topics are processed sequentially within each stage. Stages 4 and 7 can later fan out per-topic in parallel (Mastra parallel steps) if topic count grows.

### Human review resume paths
```
Approve high-drift item  → trigger Generate for that drift_item (within same pipeline_run)
Approve proposed_topic   → topic created → spawns new pipeline_run (Extract + Generate only for that topic)
Reject either            → marked rejected, nothing generated
```

---

## Source Type Behaviour

| Type | How new content arrives | Change detection |
|---|---|---|
| URL | Re-fetch same URL on pipeline trigger | Hash compare — same hash stops pipeline |
| PDF | User uploads new file on pipeline trigger | Hash compare — same hash stops pipeline |
| MD | User uploads new file on pipeline trigger | Hash compare — same hash stops pipeline |

A different URL = a new source entirely, not a new version.

---

## UI Structure

Left nav, two sections, no auth required.

### Admin
| Screen | Purpose |
|---|---|
| Sources | List sources, add new (URL/PDF/MD), trigger pipeline per source |
| Source detail | Version history, topics list, pipeline run history |
| Pipeline run | Live stage progress, drift items per topic, repair decision status |
| Review queue | High-drift approvals + proposed topic approvals |

### Learner
| Screen | Purpose |
|---|---|
| Browse topics | Topics listed per source |
| Learning unit | Question → reveal rationale → reveal lesson; version badge showing source version |

Learner section shows only `active` learning unit versions.

---

## Human-in-the-Loop Design

The system is designed so human effort scales with change severity:

| Drift level | Score | Action |
|---|---|---|
| Low | < 0.50 | Auto-apply, no human needed |
| Medium | 0.50 – 0.74 | Auto-apply, no human needed |
| High | ≥ 0.75 | Human approves before Generate runs |
| New content | — | Human always approves proposed topics |

> ponytail: thresholds hardcoded as constants. Add a config table if they need per-source tuning.

The Review queue is the single surface for all human decisions. Each item shows the `reason` from the LLM output verbatim.

---

## Key Design Decisions

1. **Proportional blast radius** — only topics whose extracted content hash changed get drift analysis; only affected learning units get regenerated. A one-sentence change does not trigger a full rewrite.

2. **History preservation** — `topic_extractions` and `learning_unit_versions` are append-only. Changing a source never erases what existed before.

3. **Deterministic normalization** — the same function applied at source level and extraction level ensures hash comparisons are reliable.

4. **No chunking** — `topic_extractions` replaces source chunk tables. LLM extracts verbatim passages per topic, eliminating sliding window / boundary overlap problems.

5. **Top-down topics** — humans define topics, LLM grounds them into source content. New content sections surface as `proposed_topics` awaiting approval rather than auto-creating topics.

6. **Staged pipeline with checkpoints** — each stage persists before proceeding. UI shows live progress. Failures are inspectable and resumable.

7. **Topic granularity constraint** — topics are scoped by humans to fit comfortably within current frontier model context windows. This avoids the "lost in the middle" problem during drift analysis and generation. A topic that spans too much source content is a signal to split it, not to increase context.
