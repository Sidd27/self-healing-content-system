# Architecture & Technical Decisions

## System Overview

Self-Healing Content System keeps AI-generated learning content accurate as source materials change. When a source document (URL, PDF, or Markdown) is updated, the system detects what changed, scores the semantic drift, and either auto-repairs or queues affected content for human review.

---

## System Design Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SOURCES                                       │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐                │
│  │  URL     │   │  PDF     │   │  Markdown        │                │
│  └────┬─────┘   └────┬─────┘   └────────┬─────────┘                │
└───────┼──────────────┼─────────────────┼────────────────────────────┘
        │              │                  │
        ▼              ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PIPELINE (7 stages)                               │
│                                                                      │
│  [1] INGEST ──► [2] NORMALIZE ──► [3] HASH CHECK                   │
│                                         │                            │
│                              no change ─┤                            │
│                              (skip)     │ content changed            │
│                                         ▼                            │
│                              [4] EXTRACT TOPICS                      │
│                                    │                                 │
│                         first run ─┤ re-run (topics exist)          │
│                                    ▼                                 │
│                              [5] DRIFT ANALYSIS                      │
│                                    │                                 │
│                         score<0.75 ─┤ score≥0.75                    │
│                         (auto)      ▼ (needs review)                 │
│                              [6] REPAIR DECISION ──► PAUSE           │
│                                    │                  │              │
│                                    │           ┌──────┘              │
│                                    ▼           ▼                     │
│                              [7] GENERATE   REVIEW QUEUE             │
│                                    │           │                     │
│                                    │     Admin approves/rejects      │
│                                    │     per proposed topic          │
│                                    ▼                                 │
│                            LEARNING UNITS                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        DATA MODEL                                    │
│                                                                      │
│  sources ──► source_versions (append-only, MD5 hash gating)        │
│      │                                                               │
│      └──► topics ──► topic_extractions (append-only, per version)  │
│               │                                                      │
│               └──► learning_units ──► learning_unit_versions        │
│                                        (active / archived / review) │
│                                                                      │
│  pipeline_runs ──► pipeline_stages (per-stage status tracking)     │
│       │                                                              │
│       └──► drift_items (per-topic, scored 0-1)                     │
│       └──► proposed_topics (new topics suggested by LLM)           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Map

| Layer                     | Files                          | Responsibility                                  |
| ------------------------- | ------------------------------ | ----------------------------------------------- |
| **Pipeline orchestrator** | `src/pipeline/run.ts`          | Chains 7 stages, handles branching              |
| **Stage runner**          | `src/pipeline/stage-runner.ts` | Wraps each stage with DB checkpointing          |
| **Stages**                | `src/pipeline/stages/*.ts`     | Individual stage logic                          |
| **LLM agents**            | `src/mastra/index.ts`          | Mastra agents (extraction, drift, generation)   |
| **LLM config**            | `src/lib/llm.ts`               | Centralized model factory — Ollama ↔ OpenRouter |
| **DB client**             | `src/db/index.ts`              | Drizzle ORM + postgres-js (SSL required)        |
| **Schema**                | `src/db/schema.ts`             | All table + enum definitions                    |
| **API routes**            | `src/app/api/`                 | Pipeline trigger, review, sources, topics, LUs  |
| **Admin UI**              | `src/app/admin/`               | Sources, pipeline monitor, review queue         |
| **Learner UI**            | `src/app/learner/`             | Topic browser, progressive reveal               |

---

## Key Technical Decisions

### 1. Hashing at three levels

- **Source level**: MD5 of normalized source content → skip pipeline if unchanged
- **Topic extraction level**: MD5 of extracted topic content → skip generation if unchanged
- **Drift score**: 0–1 float from LLM → < 0.75 auto-apply, ≥ 0.75 human review

Normalization for hashing uses aggressive whitespace collapse (Unicode-aware) to avoid false positives from formatting-only changes.

### 2. Append-only history tables

`source_versions`, `topic_extractions`, and `learning_unit_versions` are append-only — no rows are deleted. This preserves full change history and enables drift analysis between any two versions.

### 3. LLM abstraction via Mastra

All LLM calls go through Mastra agents (`extractionAgent`, `driftAgent`, `generationAgent`) defined in `src/mastra/index.ts`. The underlying model is configured once in `src/lib/llm.ts` using three env vars:

```
OPENAI_BASE_URL   # Ollama: http://localhost:11434/v1  |  OpenRouter: https://openrouter.ai/api/v1
LLM_MODEL_NAME    # Ollama: qwen3.5:latest             |  OpenRouter: google/gemini-2.0-flash-exp:free
LLM_API_KEY       # Ollama: ollama (dummy)             |  OpenRouter: sk-or-...
```

This uses `@ai-sdk/openai` with a custom `baseURL` — Ollama exposes an OpenAI-compatible `/v1` endpoint, so no Ollama-specific SDK is needed.

### 4. PDF extraction via unpdf

`pdf-parse` was replaced with `unpdf` (which wraps Mozilla PDF.js with all canvas dependencies stripped). This fixes the `DOMMatrix is not defined` / `@napi-rs/canvas` errors in the Next.js server runtime. `unpdf` works identically in Node.js, Bun, Deno, and Cloudflare Workers.

### 5. ESM / env loading in scripts

`drizzle-kit` and seed scripts don't auto-load `.env.local`. Both use `loadEnvConfig` from `@next/env` at the top. The DB client in scripts is created inline (not imported from `src/db`) to avoid ESM hoisting executing `postgres()` before env vars are populated.

### 6. Supabase pooler requires SSL

The postgres-js client is initialized with `{ ssl: 'require' }`. The Supabase Transaction pooler (port 6543) requires SSL — without it you get `ECONNREFUSED` even though TCP connectivity is fine.

### 7. Next.js 15 params are Promises

All route handlers use `await params` before destructuring, per the Next.js 15 breaking change:

```typescript
export async function GET(req, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
```

---

## Drift Scoring

| Score       | Level | Action                                                           |
| ----------- | ----- | ---------------------------------------------------------------- |
| 0.0 – 0.49  | low   | `auto_applied` — learning unit regenerated immediately           |
| 0.50 – 0.74 | med   | `auto_applied` — learning unit regenerated immediately           |
| 0.75 – 1.0  | high  | `pending_review` — queued for human approval before regeneration |

---

## LLM Structured Output Pattern

All structured LLM calls use Mastra's agent `generate()` with a Zod schema passed as `output`:

```typescript
const { object } = await agent.generate(prompt, { output: MyZodSchema });
// object is fully typed as z.infer<typeof MyZodSchema>
```

Internally Mastra uses the Vercel AI SDK's `generateObject` (or `generateText + Output.object`) to produce validated JSON.

---

## Environment Setup

See `.env.local.example` for all required variables. Copy it to `.env.local` and fill in values before running `npm run dev` or migrations.

```bash
cp .env.local.example .env.local
# edit .env.local with your Supabase URL and LLM credentials
npx drizzle-kit migrate   # apply migrations
npx tsx scripts/seed.ts   # seed initial sources + topics
npm run dev
```
