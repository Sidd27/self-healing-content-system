# Self-Healing Content System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack system that detects when source materials change, analyzes drift per topic, and regenerates only the affected learning units — with human approval gating high-severity changes.

**Architecture:** A Next.js 15 App Router application with a 7-stage sequential pipeline (each stage persisted to Supabase before proceeding). LLM calls use the Vercel AI SDK with OpenRouter. The pipeline is triggered on-demand via a UI button; human review is a DB-level pause, not framework suspension.

**Tech Stack:** Next.js 15, TypeScript, Tailwind, Shadcn, Drizzle ORM, Supabase (Postgres), Vercel AI SDK + OpenRouter, Zod, pdf-parse, Vitest

## Global Constraints

- TypeScript strict mode throughout — no `any`
- All tables are append-only where spec says so — no DELETE on `source_versions`, `topic_extractions`, `learning_unit_versions`
- Hashing uses Node built-in `crypto` MD5 — no new hash library
- Drift threshold constants live in `src/lib/constants.ts` — never inlined
- `temperature: 0` on all extraction LLM calls for determinism
- LLM structured output always validated with Zod before use — malformed responses throw, caught by `stage-runner.ts`
- Content max length checked in Stage 1 before any processing
- No auth — left nav switches Admin / Learner sections
- Learner section shows only `status = 'active'` learning unit versions

---

## File Map

```
src/
├── app/
│   ├── layout.tsx                          # Root layout: left nav (Admin / Learner)
│   ├── page.tsx                            # Redirect → /admin/sources
│   ├── admin/
│   │   ├── sources/
│   │   │   ├── page.tsx                   # Sources list + add source
│   │   │   └── [id]/
│   │   │       ├── page.tsx               # Source detail: versions, topics, runs
│   │   │       └── topics/new/page.tsx    # Add topic form
│   │   ├── runs/[id]/page.tsx             # Pipeline run: live stage progress + drift items
│   │   └── review/page.tsx                # Review queue: high-drift + proposed topics
│   ├── learner/
│   │   ├── page.tsx                       # Browse topics (all sources)
│   │   └── topics/[id]/page.tsx           # Learning unit: Q → rationale → lesson
│   └── api/
│       ├── sources/
│       │   ├── route.ts                   # GET list, POST create
│       │   └── [id]/
│       │       ├── route.ts               # GET detail
│       │       └── pipeline/route.ts      # POST trigger pipeline
│       ├── topics/route.ts                # POST create topic
│       ├── runs/[id]/route.ts             # GET run + stages + drift items
│       ├── review/
│       │   ├── drift/[id]/route.ts        # POST approve | reject drift item
│       │   └── topics/[id]/route.ts       # POST approve | reject proposed topic
│       └── learning-units/[topicId]/
│           route.ts                        # GET active versions for topic
├── db/
│   ├── schema.ts                          # All Drizzle table definitions + enums
│   └── index.ts                           # Drizzle client (postgres-js)
├── lib/
│   ├── normalize.ts                       # normalizeContent() + hashContent()
│   ├── constants.ts                       # DRIFT_HIGH_THRESHOLD, CONTENT_MAX_CHARS
│   └── extractors/
│       ├── url.ts                         # fetchAndExtract(url): fetch + strip HTML
│       ├── pdf.ts                         # extractFromPdf(buffer): pdf-parse wrapper
│       └── md.ts                          # extractFromMd(text): strip markdown syntax
└── pipeline/
    ├── run.ts                             # runPipeline(runId): sequential orchestrator
    ├── stage-runner.ts                    # runStage(): logs start/end/error to DB
    ├── prompts.ts                         # All LLM prompt builder functions
    └── stages/
        ├── ingest.ts                      # Stage 1: extract raw text from source
        ├── normalize.ts                   # Stage 2: clean text + compute hash
        ├── hash-check.ts                  # Stage 3: compare hashes, stop or proceed
        ├── extract-topics.ts              # Stage 4: verbatim extraction per topic
        ├── drift-analysis.ts              # Stage 5: LLM drift score per affected topic
        ├── repair-decision.ts             # Stage 6: auto-apply or gate on threshold
        └── generate.ts                    # Stage 7: regenerate learning units
drizzle/migrations/
drizzle.config.ts
vitest.config.ts
tests/
├── lib/
│   ├── normalize.test.ts
│   └── extractors/md.test.ts
└── pipeline/
    ├── hash-check.test.ts
    └── repair-decision.test.ts
```

---

## Task 1: Project Bootstrap

**Files:**
- Create: `package.json` (via create-next-app)
- Create: `vitest.config.ts`
- Create: `.env.local`
- Create: `drizzle.config.ts`

**Interfaces:**
- Produces: runnable Next.js 15 dev server at `localhost:3000`

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd /Users/siddharthpandey/personal
npx create-next-app@latest self-healing-content-system \
  --typescript --tailwind --eslint --app --src-dir \
  --no-import-alias
cd self-healing-content-system
```

Expected: project created with `src/app/` structure.

- [ ] **Step 2: Install dependencies**

```bash
npm install drizzle-orm postgres
npm install -D drizzle-kit
npm install ai @openrouter/ai-sdk-provider
npm install zod
npm install pdf-parse
npm install -D @types/pdf-parse vitest @vitejs/plugin-react happy-dom
```

- [ ] **Step 3: Install Shadcn and add components**

```bash
npx shadcn@latest init --defaults
npx shadcn@latest add button card badge table dialog separator tabs
```

- [ ] **Step 4: Write vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
  },
})
```

- [ ] **Step 5: Write .env.local**

```bash
# .env.local
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
OPENROUTER_API_KEY=sk-or-...
```

- [ ] **Step 6: Write drizzle config**

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

- [ ] **Step 7: Verify dev server starts**

```bash
npm run dev
```

Expected: `ready on http://localhost:3000`

- [ ] **Step 8: Commit**

```bash
git init
git add .
git commit -m "feat: bootstrap Next.js 15 project with deps and tooling"
```

---

## Task 2: Database Schema + Migrations

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/index.ts`

**Interfaces:**
- Produces: `db` export from `src/db/index.ts` — Drizzle instance ready for all tasks
- Produces: all table exports from `src/db/schema.ts` used by every pipeline stage

- [ ] **Step 1: Write schema**

```typescript
// src/db/schema.ts
import {
  pgTable, pgEnum, uuid, text, timestamp, real, boolean
} from 'drizzle-orm/pg-core'

export const sourceTypeEnum = pgEnum('source_type', ['url', 'pdf', 'md'])
export const pipelineStatusEnum = pgEnum('pipeline_status', [
  'running', 'completed', 'failed', 'awaiting_review'
])
export const stageNameEnum = pgEnum('stage_name', [
  'ingest', 'normalize', 'hash_check', 'extract_topics',
  'drift_analysis', 'repair_decision', 'generate'
])
export const stageStatusEnum = pgEnum('stage_status', [
  'pending', 'running', 'completed', 'failed', 'skipped'
])
export const driftLevelEnum = pgEnum('drift_level', ['low', 'med', 'high'])
export const driftItemStatusEnum = pgEnum('drift_item_status', [
  'auto_applied', 'pending_review', 'approved', 'rejected'
])
export const proposedTopicStatusEnum = pgEnum('proposed_topic_status', [
  'pending_approval', 'approved', 'rejected'
])
export const learningUnitStatusEnum = pgEnum('learning_unit_status', [
  'active', 'pending_review', 'archived'
])

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: sourceTypeEnum('type').notNull(),
  url: text('url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const sourceVersions = pgTable('source_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => sources.id),
  contentHash: text('content_hash').notNull(),
  normalizedContent: text('normalized_content').notNull(),
  storagePath: text('storage_path'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const topics = pgTable('topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => sources.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const topicExtractions = pgTable('topic_extractions', {
  id: uuid('id').primaryKey().defaultRandom(),
  topicId: uuid('topic_id').notNull().references(() => topics.id),
  sourceVersionId: uuid('source_version_id').notNull().references(() => sourceVersions.id),
  extractedContent: text('extracted_content').notNull(),
  contentHash: text('content_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const proposedTopics = pgTable('proposed_topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceVersionId: uuid('source_version_id').notNull().references(() => sourceVersions.id),
  pipelineRunId: uuid('pipeline_run_id').notNull().references(() => pipelineRuns.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  extractedContent: text('extracted_content').notNull(),
  status: proposedTopicStatusEnum('status').notNull().default('pending_approval'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at'),
})

export const learningUnits = pgTable('learning_units', {
  id: uuid('id').primaryKey().defaultRandom(),
  topicId: uuid('topic_id').notNull().references(() => topics.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const learningUnitVersions = pgTable('learning_unit_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  learningUnitId: uuid('learning_unit_id').notNull().references(() => learningUnits.id),
  sourceVersionId: uuid('source_version_id').notNull().references(() => sourceVersions.id),
  question: text('question').notNull(),
  rationale: text('rationale').notNull(),
  lesson: text('lesson').notNull(),
  driftScore: real('drift_score'),
  status: learningUnitStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const pipelineRuns = pgTable('pipeline_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => sources.id),
  sourceVersionId: uuid('source_version_id').references(() => sourceVersions.id),
  triggeredAt: timestamp('triggered_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  status: pipelineStatusEnum('status').notNull().default('running'),
})

export const pipelineStages = pgTable('pipeline_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  pipelineRunId: uuid('pipeline_run_id').notNull().references(() => pipelineRuns.id),
  stage: stageNameEnum('stage').notNull(),
  status: stageStatusEnum('status').notNull().default('pending'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  outputSummary: text('output_summary'),
  error: text('error'),
})

export const driftItems = pgTable('drift_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  pipelineRunId: uuid('pipeline_run_id').notNull().references(() => pipelineRuns.id),
  topicId: uuid('topic_id').notNull().references(() => topics.id),
  changeType: text('change_type').notNull(),
  driftScore: real('drift_score').notNull(),
  driftLevel: driftLevelEnum('drift_level').notNull(),
  reason: text('reason').notNull(),
  status: driftItemStatusEnum('status').notNull().default('auto_applied'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

- [ ] **Step 2: Write DB client**

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const client = postgres(process.env.DATABASE_URL!)
export const db = drizzle(client, { schema })
```

- [ ] **Step 3: Generate and run migration**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Expected: migration files in `drizzle/migrations/`, all tables created in Supabase.

- [ ] **Step 4: Commit**

```bash
git add src/db/ drizzle/ drizzle.config.ts
git commit -m "feat: add drizzle schema and run initial migration"
```

---

## Task 3: Core Utilities — Normalize + Constants

**Files:**
- Create: `src/lib/constants.ts`
- Create: `src/lib/normalize.ts`
- Create: `tests/lib/normalize.test.ts`

**Interfaces:**
- Produces: `normalizeContent(raw: string): string`
- Produces: `hashContent(normalized: string): string`
- Produces: `DRIFT_HIGH_THRESHOLD`, `CONTENT_MAX_CHARS` from constants

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/normalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeContent, hashContent } from '../../src/lib/normalize'

describe('normalizeContent', () => {
  it('strips HTML tags', () => {
    expect(normalizeContent('<p>Hello <b>world</b></p>')).toBe('hello world')
  })

  it('collapses whitespace', () => {
    expect(normalizeContent('hello   \n\t  world')).toBe('hello world')
  })

  it('lowercases', () => {
    expect(normalizeContent('Cloud Run AUTOSCALING')).toBe('cloud run autoscaling')
  })

  it('trims', () => {
    expect(normalizeContent('  hello  ')).toBe('hello')
  })
})

describe('hashContent', () => {
  it('returns same hash for same content', () => {
    const a = hashContent('cloud run autoscaling supports 1000 instances')
    const b = hashContent('cloud run autoscaling supports 1000 instances')
    expect(a).toBe(b)
  })

  it('returns different hash for different content', () => {
    const a = hashContent('supports 1000 instances')
    const b = hashContent('supports 100 instances')
    expect(a).not.toBe(b)
  })

  it('is insensitive to extra whitespace before hashing', () => {
    const a = hashContent('hello  world')
    const b = hashContent('hello world')
    expect(a).toBe(b)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/lib/normalize.test.ts
```

Expected: FAIL — `normalizeContent` not found

- [ ] **Step 3: Write constants**

```typescript
// src/lib/constants.ts
export const DRIFT_HIGH_THRESHOLD = 0.75
export const CONTENT_MAX_CHARS = 500_000
```

- [ ] **Step 4: Write normalize utilities**

```typescript
// src/lib/normalize.ts
import { createHash } from 'crypto'

export function normalizeContent(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')   // strip HTML tags
    .toLowerCase()
    .replace(/\s+/g, ' ')        // collapse whitespace
    .trim()
}

export function hashContent(normalized: string): string {
  // aggressive local collapse before hashing — never stored
  const forHashing = normalized.replace(/\s+/g, ' ').trim()
  return createHash('md5').update(forHashing).digest('hex')
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run tests/lib/normalize.test.ts
```

Expected: PASS — 7 tests

- [ ] **Step 6: Commit**

```bash
git add src/lib/ tests/lib/normalize.test.ts
git commit -m "feat: add normalizeContent and hashContent utilities"
```

---

## Task 4: Source Extractors

**Files:**
- Create: `src/lib/extractors/url.ts`
- Create: `src/lib/extractors/pdf.ts`
- Create: `src/lib/extractors/md.ts`
- Create: `tests/lib/extractors/md.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `fetchAndExtract(url: string): Promise<string>`
  - `extractFromPdf(buffer: Buffer): Promise<string>`
  - `extractFromMd(content: string): string`

- [ ] **Step 1: Write failing test for MD extractor**

```typescript
// tests/lib/extractors/md.test.ts
import { describe, it, expect } from 'vitest'
import { extractFromMd } from '../../../src/lib/extractors/md'

describe('extractFromMd', () => {
  it('strips markdown headings', () => {
    expect(extractFromMd('## Cloud Run\n\nSome content')).toContain('Cloud Run')
    expect(extractFromMd('## Cloud Run\n\nSome content')).not.toContain('##')
  })

  it('strips bold and italic', () => {
    expect(extractFromMd('**bold** and _italic_')).toBe('bold and italic')
  })

  it('strips links but keeps text', () => {
    expect(extractFromMd('[Google](https://google.com)')).toBe('Google')
  })

  it('strips code fences', () => {
    expect(extractFromMd('```\ncode here\n```')).not.toContain('```')
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
npx vitest run tests/lib/extractors/md.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write MD extractor**

```typescript
// src/lib/extractors/md.ts
export function extractFromMd(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '')        // strip code fences
    .replace(/`[^`]+`/g, '')               // strip inline code
    .replace(/#{1,6}\s+/g, '')             // strip headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')    // strip bold
    .replace(/__([^_]+)__/g, '$1')        // strip bold alt
    .replace(/\*([^*]+)\*/g, '$1')        // strip italic
    .replace(/_([^_]+)_/g, '$1')          // strip italic alt
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip links, keep text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // strip images
    .replace(/^[-*+]\s+/gm, '')           // strip list markers
    .replace(/^\d+\.\s+/gm, '')           // strip ordered list markers
    .replace(/\n{3,}/g, '\n\n')           // collapse blank lines
    .trim()
}
```

- [ ] **Step 4: Write URL extractor**

```typescript
// src/lib/extractors/url.ts
export async function fetchAndExtract(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SelfHealingBot/1.0)' },
  })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`)
  const html = await res.text()
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')  // remove scripts
    .replace(/<style[\s\S]*?<\/style>/gi, '')     // remove styles
    .replace(/<[^>]+>/g, ' ')                     // strip tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
```

- [ ] **Step 5: Write PDF extractor**

```typescript
// src/lib/extractors/pdf.ts
import pdfParse from 'pdf-parse'

export async function extractFromPdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer)
  return data.text
}
```

- [ ] **Step 6: Run MD tests**

```bash
npx vitest run tests/lib/extractors/md.test.ts
```

Expected: PASS — 4 tests

- [ ] **Step 7: Commit**

```bash
git add src/lib/extractors/ tests/lib/extractors/
git commit -m "feat: add url, pdf, and markdown source extractors"
```

---

## Task 5: Pipeline Stage Runner + Prompts

**Files:**
- Create: `src/pipeline/stage-runner.ts`
- Create: `src/pipeline/prompts.ts`

**Interfaces:**
- Produces: `runStage(runId, stageName, fn): Promise<T>` — wraps any stage function with DB logging
- Produces: `buildExtractPrompt(topicName, description, sourceContent)` 
- Produces: `buildDriftPrompt(topicName, oldContent, newContent)`
- Produces: `buildGeneratePrompt(topicName, description, extractedContent)`
- Produces: `buildProposeTopicsPrompt(existingTopics, newContent)`

- [ ] **Step 1: Write stage runner**

```typescript
// src/pipeline/stage-runner.ts
import { db } from '@/db'
import { pipelineStages, pipelineRuns } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

type StageName = typeof pipelineStages.$inferInsert['stage']

export async function runStage<T>(
  pipelineRunId: string,
  stageName: StageName,
  fn: () => Promise<T>
): Promise<T> {
  await db.insert(pipelineStages).values({
    pipelineRunId,
    stage: stageName,
    status: 'running',
    startedAt: new Date(),
  })

  try {
    const result = await fn()
    await db
      .update(pipelineStages)
      .set({ status: 'completed', completedAt: new Date() })
      .where(
        and(
          eq(pipelineStages.pipelineRunId, pipelineRunId),
          eq(pipelineStages.stage, stageName)
        )
      )
    return result
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await db
      .update(pipelineStages)
      .set({ status: 'failed', completedAt: new Date(), error })
      .where(
        and(
          eq(pipelineStages.pipelineRunId, pipelineRunId),
          eq(pipelineStages.stage, stageName)
        )
      )
    await db
      .update(pipelineRuns)
      .set({ status: 'failed', completedAt: new Date() })
      .where(eq(pipelineRuns.id, pipelineRunId))
    throw err
  }
}

export async function skipStage(pipelineRunId: string, stageName: StageName) {
  await db.insert(pipelineStages).values({
    pipelineRunId,
    stage: stageName,
    status: 'skipped',
    startedAt: new Date(),
    completedAt: new Date(),
  })
}
```

- [ ] **Step 2: Write prompts**

```typescript
// src/pipeline/prompts.ts
export function buildExtractPrompt(
  topicName: string,
  description: string,
  sourceContent: string
): string {
  return `You are extracting verbatim content from a source document.

Topic: "${topicName}"
Topic description: "${description}"

Source document:
---
${sourceContent}
---

Extract ALL passages from the source that are directly relevant to this topic.
Copy the text VERBATIM — do not paraphrase, summarize, reorder, or add any words.
If a passage is relevant, copy it exactly as it appears.
If nothing in the source is relevant to this topic, return an empty string.

Return only the extracted passages, nothing else.`
}

export function buildDriftPrompt(
  topicName: string,
  oldContent: string,
  newContent: string
): string {
  return `You are analyzing how content about a specific topic has changed between two versions of a source document.

Topic: "${topicName}"

Previous version content:
---
${oldContent}
---

New version content:
---
${newContent}
---

Analyze the semantic difference. Return a JSON object with:
- changeType: one of "NO_CHANGE" | "MINOR_EDIT" | "SEMANTIC_CHANGE" | "MAJOR_RESTRUCTURE" | "CONTENT_REMOVED"
- driftScore: float 0.0 to 1.0 (0 = identical meaning, 1 = completely different)
- requiresRepair: boolean (true if learning content grounded in this topic needs updating)
- reason: one sentence explaining the most significant change`
}

export function buildGeneratePrompt(
  topicName: string,
  description: string,
  extractedContent: string
): string {
  return `You are generating a learning unit for a professional certification exam.

Topic: "${topicName}"
Description: "${description}"

Source content:
---
${extractedContent}
---

Generate a learning unit as JSON with exactly these fields:
- question: a multiple-choice or scenario-based exam question about this topic
- rationale: a detailed explanation of why the correct answer is correct, grounded in the source content
- lesson: a concise summary of the key concept a learner should understand from this topic

The question, rationale, and lesson must be grounded only in the provided source content.`
}

export function buildProposeTopicsPrompt(
  existingTopicNames: string[],
  newContent: string
): string {
  return `You are identifying new topics in source content that are not yet covered.

Existing topics already defined:
${existingTopicNames.map(n => `- ${n}`).join('\n')}

New/changed content:
---
${newContent}
---

Identify any significant topics in the above content that are NOT covered by the existing topics.
Return a JSON array. Each item must have:
- name: short topic name (3-6 words)
- description: one sentence describing what this topic covers
- extractedContent: verbatim passages from the content that are relevant to this topic

If no new topics are found, return an empty array.`
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pipeline/stage-runner.ts src/pipeline/prompts.ts
git commit -m "feat: add pipeline stage runner and LLM prompts"
```

---

## Task 6: Pipeline Stages 1–3 (Ingest, Normalize, Hash Check)

**Files:**
- Create: `src/pipeline/stages/ingest.ts`
- Create: `src/pipeline/stages/normalize.ts`
- Create: `src/pipeline/stages/hash-check.ts`
- Create: `tests/pipeline/hash-check.test.ts`

**Interfaces:**
- Consumes: `db`, `sources`, `sourceVersions` schema, `CONTENT_MAX_CHARS`
- Produces:
  - `ingestStage(runId, sourceId): Promise<{ rawContent: string }>`
  - `normalizeStage(runId, rawContent): Promise<{ normalized: string, hash: string }>`
  - `hashCheckStage(runId, sourceId, hash, normalized): Promise<{ stopped: boolean, sourceVersionId: string }>`

- [ ] **Step 1: Write failing test for hash check logic**

```typescript
// tests/pipeline/hash-check.test.ts
import { describe, it, expect } from 'vitest'
import { computeHashCheckResult } from '../../src/pipeline/stages/hash-check'

describe('computeHashCheckResult', () => {
  it('returns stopped=true when hashes match', () => {
    expect(computeHashCheckResult('abc123', 'abc123')).toEqual({ stopped: true })
  })

  it('returns stopped=false when hashes differ', () => {
    expect(computeHashCheckResult('abc123', 'def456')).toEqual({ stopped: false })
  })

  it('returns stopped=false when previousHash is null (first run)', () => {
    expect(computeHashCheckResult('abc123', null)).toEqual({ stopped: false })
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
npx vitest run tests/pipeline/hash-check.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write ingest stage**

```typescript
// src/pipeline/stages/ingest.ts
import { db } from '@/db'
import { sources } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { fetchAndExtract } from '@/lib/extractors/url'
import { extractFromPdf } from '@/lib/extractors/pdf'
import { extractFromMd } from '@/lib/extractors/md'
import { CONTENT_MAX_CHARS } from '@/lib/constants'

export async function ingestStage(
  _runId: string,
  sourceId: string,
  file?: { buffer: Buffer; type: 'pdf' | 'md'; content?: string }
): Promise<{ rawContent: string }> {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId))
  if (!source) throw new Error(`Source not found: ${sourceId}`)

  let rawContent: string

  if (source.type === 'url') {
    rawContent = await fetchAndExtract(source.url!)
  } else if (source.type === 'pdf') {
    if (!file?.buffer) throw new Error('PDF buffer required')
    rawContent = await extractFromPdf(file.buffer)
  } else {
    if (!file?.content) throw new Error('Markdown content required')
    rawContent = extractFromMd(file.content)
  }

  if (rawContent.length > CONTENT_MAX_CHARS) {
    throw new Error(
      `Content exceeds max length (${rawContent.length} > ${CONTENT_MAX_CHARS} chars). Split the source.`
    )
  }

  return { rawContent }
}
```

- [ ] **Step 4: Write normalize stage**

```typescript
// src/pipeline/stages/normalize.ts
import { normalizeContent, hashContent } from '@/lib/normalize'

export async function normalizeStage(
  _runId: string,
  rawContent: string
): Promise<{ normalized: string; hash: string }> {
  const normalized = normalizeContent(rawContent)
  const hash = hashContent(normalized)
  return { normalized, hash }
}
```

- [ ] **Step 5: Write hash check stage with extracted pure logic**

```typescript
// src/pipeline/stages/hash-check.ts
import { db } from '@/db'
import { sourceVersions, pipelineRuns } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export function computeHashCheckResult(
  newHash: string,
  previousHash: string | null
): { stopped: boolean } {
  return { stopped: previousHash !== null && newHash === previousHash }
}

export async function hashCheckStage(
  runId: string,
  sourceId: string,
  hash: string,
  normalized: string
): Promise<{ stopped: boolean; sourceVersionId: string }> {
  const [latest] = await db
    .select()
    .from(sourceVersions)
    .where(eq(sourceVersions.sourceId, sourceId))
    .orderBy(desc(sourceVersions.createdAt))
    .limit(1)

  const { stopped } = computeHashCheckResult(hash, latest?.contentHash ?? null)

  if (stopped) {
    await db
      .update(pipelineRuns)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(pipelineRuns.id, runId))
    return { stopped: true, sourceVersionId: latest!.id }
  }

  const [newVersion] = await db
    .insert(sourceVersions)
    .values({ sourceId, contentHash: hash, normalizedContent: normalized })
    .returning()

  await db
    .update(pipelineRuns)
    .set({ sourceVersionId: newVersion.id })
    .where(eq(pipelineRuns.id, runId))

  return { stopped: false, sourceVersionId: newVersion.id }
}
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/pipeline/hash-check.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/stages/ingest.ts src/pipeline/stages/normalize.ts \
  src/pipeline/stages/hash-check.ts tests/pipeline/hash-check.test.ts
git commit -m "feat: add pipeline stages 1-3 (ingest, normalize, hash-check)"
```

---

## Task 7: Pipeline Stage 4 — Extract Topics

**Files:**
- Create: `src/pipeline/stages/extract-topics.ts`

**Interfaces:**
- Consumes: `buildExtractPrompt`, `buildProposeTopicsPrompt` from `prompts.ts`; `db`; `hashContent`; `normalizeContent`
- Produces: `extractTopicsStage(runId, sourceId, sourceVersionId, normalizedContent): Promise<{ affectedTopicIds: string[], firstRunTopicIds: string[] }>`
  - `affectedTopicIds`: topics with a previous extraction that changed → need drift analysis
  - `firstRunTopicIds`: topics with no previous extraction → skip drift, go straight to Generate

- [ ] **Step 1: Write extract topics stage**

```typescript
// src/pipeline/stages/extract-topics.ts
import { db } from '@/db'
import { topics, topicExtractions, proposedTopics } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { generateText, generateObject } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import { normalizeContent, hashContent } from '@/lib/normalize'
import { buildExtractPrompt, buildProposeTopicsPrompt } from '@/pipeline/prompts'

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! })
const model = openrouter('google/gemini-2.0-flash-exp:free')

const ProposedTopicsSchema = z.array(z.object({
  name: z.string(),
  description: z.string(),
  extractedContent: z.string(),
}))

export async function extractTopicsStage(
  runId: string,
  sourceId: string,
  sourceVersionId: string,
  normalizedContent: string
): Promise<{ affectedTopicIds: string[] }> {
  const sourceTopics = await db
    .select()
    .from(topics)
    .where(eq(topics.sourceId, sourceId))

  const affectedTopicIds: string[] = []
  const firstRunTopicIds: string[] = []

  for (const topic of sourceTopics) {
    const { text: extracted } = await generateText({
      model,
      prompt: buildExtractPrompt(topic.name, topic.description, normalizedContent),
      temperature: 0,
    })

    const normalizedExtraction = normalizeContent(extracted)
    const extractionHash = hashContent(normalizedExtraction)

    const [previousExtraction] = await db
      .select()
      .from(topicExtractions)
      .where(eq(topicExtractions.topicId, topic.id))
      .orderBy(desc(topicExtractions.createdAt))
      .limit(1)

    await db.insert(topicExtractions).values({
      topicId: topic.id,
      sourceVersionId,
      extractedContent: normalizedExtraction,
      contentHash: extractionHash,
    })

    const isFirstRun = !previousExtraction
    const hasChanged = previousExtraction && extractionHash !== previousExtraction.contentHash

    if (isFirstRun) {
      firstRunTopicIds.push(topic.id)
    } else if (hasChanged) {
      affectedTopicIds.push(topic.id)
    }
  }

  // Propose new topics from content not covered by existing topics
  if (sourceTopics.length > 0) {
    const existingNames = sourceTopics.map(t => t.name)
    const { object: proposed } = await generateObject({
      model,
      schema: ProposedTopicsSchema,
      prompt: buildProposeTopicsPrompt(existingNames, normalizedContent),
      temperature: 0,
    })

    if (proposed.length > 0) {
      await db.insert(proposedTopics).values(
        proposed.map(p => ({
          sourceVersionId,
          pipelineRunId: runId,
          name: p.name,
          description: p.description,
          extractedContent: p.extractedContent,
          status: 'pending_approval' as const,
        }))
      )
    }
  }

  return { affectedTopicIds, firstRunTopicIds }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pipeline/stages/extract-topics.ts
git commit -m "feat: add pipeline stage 4 (extract topics)"
```

---

## Task 8: Pipeline Stages 5–6 — Drift Analysis + Repair Decision

**Files:**
- Create: `src/pipeline/stages/drift-analysis.ts`
- Create: `src/pipeline/stages/repair-decision.ts`
- Create: `tests/pipeline/repair-decision.test.ts`

**Interfaces:**
- Consumes: `buildDriftPrompt`, `DRIFT_HIGH_THRESHOLD`, `db`
- Produces:
  - `driftAnalysisStage(runId, affectedTopicIds, sourceVersionId): Promise<void>`
  - `repairDecisionStage(runId): Promise<{ paused: boolean }>`

- [ ] **Step 1: Write failing test for repair decision logic**

```typescript
// tests/pipeline/repair-decision.test.ts
import { describe, it, expect } from 'vitest'
import { computeDriftLevel, computeRepairDecision } from '../../src/pipeline/stages/repair-decision'

describe('computeDriftLevel', () => {
  it('returns low for score < 0.5', () => {
    expect(computeDriftLevel(0.3)).toBe('low')
    expect(computeDriftLevel(0.0)).toBe('low')
  })

  it('returns med for score 0.5 - 0.74', () => {
    expect(computeDriftLevel(0.5)).toBe('med')
    expect(computeDriftLevel(0.74)).toBe('med')
  })

  it('returns high for score >= 0.75', () => {
    expect(computeDriftLevel(0.75)).toBe('high')
    expect(computeDriftLevel(1.0)).toBe('high')
  })
})

describe('computeRepairDecision', () => {
  it('auto-applies low drift', () => {
    expect(computeRepairDecision(0.3)).toBe('auto_applied')
  })

  it('auto-applies medium drift', () => {
    expect(computeRepairDecision(0.6)).toBe('auto_applied')
  })

  it('gates high drift for review', () => {
    expect(computeRepairDecision(0.75)).toBe('pending_review')
    expect(computeRepairDecision(1.0)).toBe('pending_review')
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
npx vitest run tests/pipeline/repair-decision.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write Drift Analysis Schema**

```typescript
// src/pipeline/stages/drift-analysis.ts
import { db } from '@/db'
import { topics, topicExtractions, driftItems } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { generateObject } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import { buildDriftPrompt } from '@/pipeline/prompts'
import { computeDriftLevel, computeRepairDecision } from './repair-decision'

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! })
const model = openrouter('google/gemini-2.0-flash-exp:free')

const DriftAnalysisSchema = z.object({
  changeType: z.enum([
    'NO_CHANGE', 'MINOR_EDIT', 'SEMANTIC_CHANGE', 'MAJOR_RESTRUCTURE', 'CONTENT_REMOVED'
  ]),
  driftScore: z.number().min(0).max(1),
  requiresRepair: z.boolean(),
  reason: z.string(),
})

export async function driftAnalysisStage(
  runId: string,
  affectedTopicIds: string[],
  sourceVersionId: string
): Promise<void> {
  for (const topicId of affectedTopicIds) {
    const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
    
    const extractions = await db
      .select()
      .from(topicExtractions)
      .where(eq(topicExtractions.topicId, topicId))
      .orderBy(desc(topicExtractions.createdAt))
      .limit(2)

    // extractions[0] = new, extractions[1] = previous
    const newContent = extractions[0].extractedContent
    const oldContent = extractions[1].extractedContent

    const { object } = await generateObject({
      model,
      schema: DriftAnalysisSchema,
      prompt: buildDriftPrompt(topic.name, oldContent, newContent),
    })

    const driftLevel = computeDriftLevel(object.driftScore)
    const status = computeRepairDecision(object.driftScore)

    await db.insert(driftItems).values({
      pipelineRunId: runId,
      topicId,
      changeType: object.changeType,
      driftScore: object.driftScore,
      driftLevel,
      reason: object.reason,
      status,
    })
  }
}
```

- [ ] **Step 4: Write repair decision stage with exported pure functions**

```typescript
// src/pipeline/stages/repair-decision.ts
import { db } from '@/db'
import { driftItems, pipelineRuns, proposedTopics } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { DRIFT_HIGH_THRESHOLD } from '@/lib/constants'

export function computeDriftLevel(score: number): 'low' | 'med' | 'high' {
  if (score >= DRIFT_HIGH_THRESHOLD) return 'high'
  if (score >= 0.5) return 'med'
  return 'low'
}

export function computeRepairDecision(
  score: number
): 'auto_applied' | 'pending_review' {
  return score >= DRIFT_HIGH_THRESHOLD ? 'pending_review' : 'auto_applied'
}

export async function repairDecisionStage(
  runId: string
): Promise<{ paused: boolean }> {
  const runDriftItems = await db
    .select()
    .from(driftItems)
    .where(eq(driftItems.pipelineRunId, runId))

  const runProposedTopics = await db
    .select()
    .from(proposedTopics)
    .where(eq(proposedTopics.pipelineRunId, runId))

  const hasPendingReview = runDriftItems.some(d => d.status === 'pending_review')
  const hasPendingTopics = runProposedTopics.length > 0

  if (hasPendingReview || hasPendingTopics) {
    await db
      .update(pipelineRuns)
      .set({ status: 'awaiting_review' })
      .where(eq(pipelineRuns.id, runId))
    return { paused: true }
  }

  return { paused: false }
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/pipeline/repair-decision.test.ts
```

Expected: PASS — 6 tests

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/stages/drift-analysis.ts src/pipeline/stages/repair-decision.ts \
  tests/pipeline/repair-decision.test.ts
git commit -m "feat: add pipeline stages 5-6 (drift analysis, repair decision)"
```

---

## Task 9: Pipeline Stage 7 + Workflow Assembly

**Files:**
- Create: `src/pipeline/stages/generate.ts`
- Create: `src/pipeline/run.ts`

**Interfaces:**
- Consumes: all stages, `runStage`, `skipStage`
- Produces: `runPipeline(runId, sourceId, file?): Promise<void>` — the main entry point

- [ ] **Step 1: Write generate stage**

```typescript
// src/pipeline/stages/generate.ts
import { db } from '@/db'
import {
  driftItems, topicExtractions, topics, learningUnits,
  learningUnitVersions
} from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { generateObject } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import { buildGeneratePrompt } from '@/pipeline/prompts'

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! })
const model = openrouter('google/gemini-2.0-flash-exp:free')

const LearningUnitSchema = z.object({
  question: z.string(),
  rationale: z.string(),
  lesson: z.string(),
})

export async function generateStage(
  runId: string,
  sourceVersionId: string,
  firstRunTopicIds: string[] = []
): Promise<void> {
  // Generate for auto-applied drift items (changed topics)
  const autoAppliedItems = await db
    .select()
    .from(driftItems)
    .where(
      and(
        eq(driftItems.pipelineRunId, runId),
        eq(driftItems.status, 'auto_applied')
      )
    )

  for (const item of autoAppliedItems) {
    await generateForTopic(item.topicId, sourceVersionId, item.driftScore)
  }

  // Generate for first-run topics (no drift to compare, generate from scratch)
  for (const topicId of firstRunTopicIds) {
    await generateForTopic(topicId, sourceVersionId, null)
  }
}

export async function generateForTopic(
  topicId: string,
  sourceVersionId: string,
  driftScore: number | null = null
): Promise<void> {
  const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))

  const [latestExtraction] = await db
    .select()
    .from(topicExtractions)
    .where(eq(topicExtractions.topicId, topicId))
    .orderBy(desc(topicExtractions.createdAt))
    .limit(1)

  const { object } = await generateObject({
    model,
    schema: LearningUnitSchema,
    prompt: buildGeneratePrompt(
      topic.name,
      topic.description,
      latestExtraction.extractedContent
    ),
  })

  // Get or create learning unit for this topic
  let [unit] = await db
    .select()
    .from(learningUnits)
    .where(eq(learningUnits.topicId, topicId))
    .limit(1)

  if (!unit) {
    ;[unit] = await db
      .insert(learningUnits)
      .values({ topicId })
      .returning()
  }

  // Archive previous active version
  await db
    .update(learningUnitVersions)
    .set({ status: 'archived' })
    .where(
      and(
        eq(learningUnitVersions.learningUnitId, unit.id),
        eq(learningUnitVersions.status, 'active')
      )
    )

  // Insert new active version
  await db.insert(learningUnitVersions).values({
    learningUnitId: unit.id,
    sourceVersionId,
    question: object.question,
    rationale: object.rationale,
    lesson: object.lesson,
    driftScore,
    status: 'active',
  })
}
```

- [ ] **Step 2: Write pipeline orchestrator**

```typescript
// src/pipeline/run.ts
import { db } from '@/db'
import { pipelineRuns } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runStage, skipStage } from './stage-runner'
import { ingestStage } from './stages/ingest'
import { normalizeStage } from './stages/normalize'
import { hashCheckStage } from './stages/hash-check'
import { extractTopicsStage } from './stages/extract-topics'
import { driftAnalysisStage } from './stages/drift-analysis'
import { repairDecisionStage } from './stages/repair-decision'
import { generateStage } from './stages/generate'

type PipelineFile = { buffer: Buffer; type: 'pdf' | 'md'; content?: string }

export async function runPipeline(
  runId: string,
  sourceId: string,
  file?: PipelineFile
): Promise<void> {
  const { rawContent } = await runStage(runId, 'ingest', () =>
    ingestStage(runId, sourceId, file)
  )

  const { normalized, hash } = await runStage(runId, 'normalize', () =>
    normalizeStage(runId, rawContent)
  )

  const { stopped, sourceVersionId } = await runStage(runId, 'hash_check', () =>
    hashCheckStage(runId, sourceId, hash, normalized)
  )

  if (stopped) {
    await skipStage(runId, 'extract_topics')
    await skipStage(runId, 'drift_analysis')
    await skipStage(runId, 'repair_decision')
    await skipStage(runId, 'generate')
    return
  }

  const { affectedTopicIds, firstRunTopicIds } = await runStage(runId, 'extract_topics', () =>
    extractTopicsStage(runId, sourceId, sourceVersionId, normalized)
  )

  if (affectedTopicIds.length === 0) {
    await skipStage(runId, 'drift_analysis')
    await skipStage(runId, 'repair_decision')
    // First-run topics go straight to generate (no drift to analyze)
    await runStage(runId, 'generate', () =>
      generateStage(runId, sourceVersionId, firstRunTopicIds)
    )
  } else {
    await runStage(runId, 'drift_analysis', () =>
      driftAnalysisStage(runId, affectedTopicIds, sourceVersionId)
    )

    const { paused } = await runStage(runId, 'repair_decision', () =>
      repairDecisionStage(runId)
    )

    if (paused) return

    // auto_applied drift items + any first-run topics in same pass
    await runStage(runId, 'generate', () =>
      generateStage(runId, sourceVersionId, firstRunTopicIds)
    )
  }

  await db
    .update(pipelineRuns)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(pipelineRuns.id, runId))
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pipeline/stages/generate.ts src/pipeline/run.ts
git commit -m "feat: add stage 7 (generate) and pipeline orchestrator"
```

---

## Task 10: API Routes — Pipeline Trigger + Run Status + Review

**Files:**
- Create: `src/app/api/sources/route.ts`
- Create: `src/app/api/sources/[id]/route.ts`
- Create: `src/app/api/sources/[id]/pipeline/route.ts`
- Create: `src/app/api/topics/route.ts`
- Create: `src/app/api/runs/[id]/route.ts`
- Create: `src/app/api/review/drift/[id]/route.ts`
- Create: `src/app/api/review/topics/[id]/route.ts`
- Create: `src/app/api/learning-units/[topicId]/route.ts`

**Interfaces:**
- Produces all REST endpoints consumed by the UI

- [ ] **Step 1: Write sources API**

```typescript
// src/app/api/sources/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { sources } from '@/db/schema'

export async function GET() {
  const all = await db.select().from(sources).orderBy(sources.createdAt)
  return NextResponse.json(all)
}

export async function POST(req: Request) {
  const body = await req.json()
  const [source] = await db
    .insert(sources)
    .values({ name: body.name, type: body.type, url: body.url ?? null })
    .returning()
  return NextResponse.json(source, { status: 201 })
}
```

```typescript
// src/app/api/sources/[id]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { sources, topics, sourceVersions, pipelineRuns } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const [source] = await db.select().from(sources).where(eq(sources.id, params.id))
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sourceTopics = await db.select().from(topics).where(eq(topics.sourceId, params.id))
  const versions = await db
    .select()
    .from(sourceVersions)
    .where(eq(sourceVersions.sourceId, params.id))
    .orderBy(desc(sourceVersions.createdAt))
  const runs = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.sourceId, params.id))
    .orderBy(desc(pipelineRuns.triggeredAt))

  return NextResponse.json({ ...source, topics: sourceTopics, versions, runs })
}
```

- [ ] **Step 2: Write pipeline trigger API**

```typescript
// src/app/api/sources/[id]/pipeline/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { pipelineRuns } from '@/db/schema'
import { runPipeline } from '@/pipeline/run'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const [run] = await db
    .insert(pipelineRuns)
    .values({ sourceId: params.id })
    .returning()

  // Fire and forget — client polls /api/runs/[id] for status
  runPipeline(run.id, params.id).catch(console.error)

  return NextResponse.json({ runId: run.id }, { status: 202 })
}
```

- [ ] **Step 3: Write topics API**

```typescript
// src/app/api/topics/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { topics } from '@/db/schema'

export async function POST(req: Request) {
  const body = await req.json()
  const [topic] = await db
    .insert(topics)
    .values({ sourceId: body.sourceId, name: body.name, description: body.description })
    .returning()
  return NextResponse.json(topic, { status: 201 })
}
```

- [ ] **Step 4: Write runs status API**

```typescript
// src/app/api/runs/[id]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { pipelineRuns, pipelineStages, driftItems, proposedTopics, topics } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, params.id))
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const stages = await db.select().from(pipelineStages).where(eq(pipelineStages.pipelineRunId, params.id))
  const drift = await db.select({ item: driftItems, topic: topics })
    .from(driftItems)
    .innerJoin(topics, eq(driftItems.topicId, topics.id))
    .where(eq(driftItems.pipelineRunId, params.id))
  const proposed = await db.select().from(proposedTopics).where(eq(proposedTopics.pipelineRunId, params.id))

  return NextResponse.json({ ...run, stages, driftItems: drift, proposedTopics: proposed })
}
```

- [ ] **Step 5: Write review APIs**

```typescript
// src/app/api/review/drift/[id]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { driftItems, pipelineRuns, sourceVersions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateForTopic } from '@/pipeline/stages/generate'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { action } = await req.json() // action: 'approve' | 'reject'

  const [item] = await db.select().from(driftItems).where(eq(driftItems.id, params.id))
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'reject') {
    await db.update(driftItems).set({ status: 'rejected' }).where(eq(driftItems.id, params.id))
    return NextResponse.json({ ok: true })
  }

  await db.update(driftItems).set({ status: 'approved' }).where(eq(driftItems.id, params.id))

  const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, item.pipelineRunId))
  await generateForTopic(item.topicId, run.sourceVersionId!, item.driftScore)

  return NextResponse.json({ ok: true })
}
```

```typescript
// src/app/api/review/topics/[id]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { proposedTopics, topics, pipelineRuns } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateForTopic } from '@/pipeline/stages/generate'
import { runPipeline } from '@/pipeline/run'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { action } = await req.json()

  const [proposed] = await db.select().from(proposedTopics).where(eq(proposedTopics.id, params.id))
  if (!proposed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'reject') {
    await db.update(proposedTopics).set({ status: 'rejected', reviewedAt: new Date() }).where(eq(proposedTopics.id, params.id))
    return NextResponse.json({ ok: true })
  }

  // Approve: create topic, spawn new pipeline run (Extract + Generate only)
  const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, proposed.pipelineRunId))

  const [newTopic] = await db.insert(topics).values({
    sourceId: run.sourceId,
    name: proposed.name,
    description: proposed.description,
  }).returning()

  await db.update(proposedTopics).set({ status: 'approved', reviewedAt: new Date() }).where(eq(proposedTopics.id, params.id))

  // Generate learning unit directly from proposed content
  await generateForTopic(newTopic.id, proposed.sourceVersionId, null)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Write learning units API**

```typescript
// src/app/api/learning-units/[topicId]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { learningUnits, learningUnitVersions } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'

export async function GET(_req: Request, { params }: { params: { topicId: string } }) {
  const units = await db
    .select({ unit: learningUnits, version: learningUnitVersions })
    .from(learningUnits)
    .innerJoin(
      learningUnitVersions,
      and(
        eq(learningUnitVersions.learningUnitId, learningUnits.id),
        eq(learningUnitVersions.status, 'active')
      )
    )
    .where(eq(learningUnits.topicId, params.topicId))
    .orderBy(desc(learningUnitVersions.createdAt))

  return NextResponse.json(units)
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/
git commit -m "feat: add all API routes (sources, topics, pipeline, runs, review, learning-units)"
```

---

## Task 11: App Layout + Navigation

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/app/page.tsx`

**Interfaces:**
- Produces: left nav with Admin / Learner sections, accessible at all routes

- [ ] **Step 1: Write root layout with left nav**

```typescript
// src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'
import Link from 'next/link'
import { Separator } from '@/components/ui/separator'

export const metadata: Metadata = { title: 'Self-Healing Content System' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-screen bg-background">
        <nav className="w-56 flex-shrink-0 border-r p-4 flex flex-col gap-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Admin
          </p>
          <Link href="/admin/sources" className="text-sm px-2 py-1.5 rounded hover:bg-accent">
            Sources
          </Link>
          <Link href="/admin/review" className="text-sm px-2 py-1.5 rounded hover:bg-accent">
            Review Queue
          </Link>
          <Separator className="my-3" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Learner
          </p>
          <Link href="/learner" className="text-sm px-2 py-1.5 rounded hover:bg-accent">
            Browse Topics
          </Link>
        </nav>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </body>
    </html>
  )
}
```

```typescript
// src/app/page.tsx
import { redirect } from 'next/navigation'
export default function Home() {
  redirect('/admin/sources')
}
```

- [ ] **Step 2: Verify in browser**

```bash
npm run dev
```

Navigate to `http://localhost:3000` — should redirect to `/admin/sources` with left nav visible.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx
git commit -m "feat: add root layout with admin/learner left nav"
```

---

## Task 12: Admin — Sources Pages

**Files:**
- Create: `src/app/admin/sources/page.tsx`
- Create: `src/app/admin/sources/[id]/page.tsx`
- Create: `src/app/admin/sources/[id]/topics/new/page.tsx`

**Interfaces:**
- Consumes: `GET /api/sources`, `POST /api/sources`, `GET /api/sources/[id]`, `POST /api/topics`, `POST /api/sources/[id]/pipeline`

- [ ] **Step 1: Write sources list page**

```typescript
// src/app/admin/sources/page.tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

type Source = { id: string; name: string; type: string; url: string | null; createdAt: string }

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'url', url: '' })

  useEffect(() => {
    fetch('/api/sources').then(r => r.json()).then(setSources)
  }, [])

  async function addSource(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setOpen(false)
    fetch('/api/sources').then(r => r.json()).then(setSources)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sources</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add Source</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Source</DialogTitle></DialogHeader>
            <form onSubmit={addSource} className="space-y-3">
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              >
                <option value="url">URL</option>
                <option value="pdf">PDF</option>
                <option value="md">Markdown</option>
              </select>
              {form.type === 'url' && (
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="https://..."
                  value={form.url}
                  onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                />
              )}
              <Button type="submit" className="w-full">Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {sources.map(s => (
          <Link key={s.id} href={`/admin/sources/${s.id}`}>
            <Card className="hover:bg-accent/50 cursor-pointer transition-colors">
              <CardContent className="flex items-center justify-between py-4">
                <span className="font-medium">{s.name}</span>
                <Badge variant="outline">{s.type}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {sources.length === 0 && (
          <p className="text-muted-foreground text-sm">No sources yet. Add one above.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write source detail page**

```typescript
// src/app/admin/sources/[id]/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type SourceDetail = {
  id: string; name: string; type: string
  topics: { id: string; name: string; description: string }[]
  runs: { id: string; status: string; triggeredAt: string }[]
  versions: { id: string; contentHash: string; createdAt: string }[]
}

export default function SourceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [source, setSource] = useState<SourceDetail | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    fetch(`/api/sources/${id}`).then(r => r.json()).then(setSource)
  }, [id])

  async function triggerPipeline() {
    setRunning(true)
    const res = await fetch(`/api/sources/${id}/pipeline`, { method: 'POST' })
    const { runId } = await res.json()
    router.push(`/admin/runs/${runId}`)
  }

  if (!source) return <p className="text-muted-foreground">Loading...</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{source.name}</h1>
          <Badge variant="outline" className="mt-1">{source.type}</Badge>
        </div>
        <Button onClick={triggerPipeline} disabled={running}>
          {running ? 'Triggering...' : 'Run Pipeline'}
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Topics</CardTitle>
          <Link href={`/admin/sources/${id}/topics/new`}>
            <Button variant="outline" size="sm">Add Topic</Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {source.topics.map(t => (
            <div key={t.id} className="flex flex-col border rounded p-3">
              <span className="font-medium text-sm">{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.description}</span>
            </div>
          ))}
          {source.topics.length === 0 && (
            <p className="text-sm text-muted-foreground">No topics yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pipeline Runs</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {source.runs.map(r => (
            <Link key={r.id} href={`/admin/runs/${r.id}`}>
              <div className="flex items-center justify-between border rounded p-3 hover:bg-accent/50">
                <span className="text-xs text-muted-foreground font-mono">{r.id.slice(0, 8)}</span>
                <Badge variant={r.status === 'completed' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}>
                  {r.status}
                </Badge>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Write add topic page**

```typescript
// src/app/admin/sources/[id]/topics/new/page.tsx
'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function NewTopicPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [form, setForm] = useState({ name: '', description: '' })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: id, ...form }),
    })
    router.push(`/admin/sources/${id}`)
  }

  return (
    <Card className="max-w-lg">
      <CardHeader><CardTitle>Add Topic</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Topic name (e.g. Cloud Run Autoscaling)"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
          />
          <textarea
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Description — what does this topic cover?"
            rows={3}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            required
          />
          <Button type="submit" className="w-full">Add Topic</Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/sources/
git commit -m "feat: add admin sources list, source detail, and add topic pages"
```

---

## Task 13: Admin — Pipeline Run Page

**Files:**
- Create: `src/app/admin/runs/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/runs/[id]` (polls every 2s while running)

- [ ] **Step 1: Write pipeline run page**

```typescript
// src/app/admin/runs/[id]/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Stage = { stage: string; status: string; error: string | null; outputSummary: string | null }
type DriftEntry = { item: { driftScore: number; driftLevel: string; reason: string; changeType: string; status: string }; topic: { name: string } }
type ProposedTopic = { id: string; name: string; description: string; status: string }
type RunDetail = {
  id: string; status: string
  stages: Stage[]
  driftItems: DriftEntry[]
  proposedTopics: ProposedTopic[]
}

const STAGE_ORDER = ['ingest', 'normalize', 'hash_check', 'extract_topics', 'drift_analysis', 'repair_decision', 'generate']

const statusColor = (s: string) =>
  s === 'completed' ? 'default' : s === 'failed' ? 'destructive' : s === 'running' ? 'secondary' : 'outline'

export default function RunPage() {
  const { id } = useParams<{ id: string }>()
  const [run, setRun] = useState<RunDetail | null>(null)

  useEffect(() => {
    const load = () => fetch(`/api/runs/${id}`).then(r => r.json()).then(setRun)
    load()
    const interval = setInterval(() => {
      if (run && ['completed', 'failed'].includes(run.status)) return
      load()
    }, 2000)
    return () => clearInterval(interval)
  }, [id, run?.status])

  if (!run) return <p className="text-muted-foreground">Loading...</p>

  const stageMap = Object.fromEntries(run.stages.map(s => [s.stage, s]))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Pipeline Run</h1>
        <Badge variant={statusColor(run.status)}>{run.status}</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Stages</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {STAGE_ORDER.map(name => {
            const stage = stageMap[name]
            return (
              <div key={name} className="flex items-center justify-between border rounded px-3 py-2">
                <span className="text-sm font-mono">{name}</span>
                <div className="flex items-center gap-2">
                  {stage?.error && (
                    <span className="text-xs text-destructive">{stage.error}</span>
                  )}
                  <Badge variant={stage ? statusColor(stage.status) : 'outline'}>
                    {stage?.status ?? 'pending'}
                  </Badge>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {run.driftItems.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Drift Items</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {run.driftItems.map((entry, i) => (
              <div key={i} className="border rounded p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{entry.topic.name}</span>
                  <div className="flex gap-2">
                    <Badge variant="outline">{entry.item.changeType}</Badge>
                    <Badge variant={entry.item.driftLevel === 'high' ? 'destructive' : 'secondary'}>
                      {entry.item.driftLevel} {(entry.item.driftScore * 100).toFixed(0)}%
                    </Badge>
                    <Badge>{entry.item.status}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{entry.item.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/runs/
git commit -m "feat: add pipeline run detail page with live polling"
```

---

## Task 14: Admin — Review Queue

**Files:**
- Create: `src/app/admin/review/page.tsx`
- Create: `src/app/api/review/queue/route.ts`

**Interfaces:**
- Consumes: review queue API, `POST /api/review/drift/[id]`, `POST /api/review/topics/[id]`

- [ ] **Step 1: Write review queue API**

```typescript
// src/app/api/review/queue/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { driftItems, proposedTopics, topics, pipelineRuns } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const pendingDrift = await db
    .select({ item: driftItems, topic: topics, run: pipelineRuns })
    .from(driftItems)
    .innerJoin(topics, eq(driftItems.topicId, topics.id))
    .innerJoin(pipelineRuns, eq(driftItems.pipelineRunId, pipelineRuns.id))
    .where(eq(driftItems.status, 'pending_review'))

  const pendingTopics = await db
    .select()
    .from(proposedTopics)
    .where(eq(proposedTopics.status, 'pending_approval'))

  return NextResponse.json({ pendingDrift, pendingTopics })
}
```

- [ ] **Step 2: Write review queue page**

```typescript
// src/app/admin/review/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type DriftEntry = { item: { id: string; driftScore: number; reason: string; changeType: string }; topic: { name: string }; run: { id: string } }
type ProposedTopic = { id: string; name: string; description: string }
type Queue = { pendingDrift: DriftEntry[]; pendingTopics: ProposedTopic[] }

export default function ReviewQueuePage() {
  const [queue, setQueue] = useState<Queue>({ pendingDrift: [], pendingTopics: [] })

  const load = () => fetch('/api/review/queue').then(r => r.json()).then(setQueue)
  useEffect(() => { load() }, [])

  async function reviewDrift(id: string, action: 'approve' | 'reject') {
    await fetch(`/api/review/drift/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    load()
  }

  async function reviewTopic(id: string, action: 'approve' | 'reject') {
    await fetch(`/api/review/topics/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    load()
  }

  const total = queue.pendingDrift.length + queue.pendingTopics.length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Review Queue</h1>
        {total > 0 && <Badge variant="destructive">{total}</Badge>}
      </div>

      {queue.pendingDrift.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">High-Drift Items</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {queue.pendingDrift.map((entry) => (
              <div key={entry.item.id} className="border rounded p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{entry.topic.name}</span>
                  <Badge variant="outline">{entry.item.changeType}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{entry.item.reason}</p>
                <p className="text-xs text-muted-foreground">
                  Drift score: {(entry.item.driftScore * 100).toFixed(0)}%
                </p>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => reviewDrift(entry.item.id, 'approve')}>
                    Approve & Repair
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => reviewDrift(entry.item.id, 'reject')}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {queue.pendingTopics.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Proposed New Topics</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {queue.pendingTopics.map((t) => (
              <div key={t.id} className="border rounded p-4 space-y-2">
                <span className="font-medium">{t.name}</span>
                <p className="text-sm text-muted-foreground">{t.description}</p>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => reviewTopic(t.id, 'approve')}>
                    Approve & Generate
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => reviewTopic(t.id, 'reject')}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {total === 0 && (
        <p className="text-muted-foreground text-sm">Nothing to review.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/review/ src/app/api/review/queue/
git commit -m "feat: add review queue page with approve/reject for drift items and proposed topics"
```

---

## Task 15: Learner UI

**Files:**
- Create: `src/app/learner/page.tsx`
- Create: `src/app/learner/topics/[id]/page.tsx`
- Create: `src/app/api/topics/all/route.ts`

**Interfaces:**
- Consumes: topics list API, `GET /api/learning-units/[topicId]`

- [ ] **Step 1: Write all-topics API**

```typescript
// src/app/api/topics/all/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { topics, sources } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const all = await db
    .select({ topic: topics, source: sources })
    .from(topics)
    .innerJoin(sources, eq(topics.sourceId, sources.id))
    .orderBy(sources.name, topics.name)
  return NextResponse.json(all)
}
```

- [ ] **Step 2: Write learner browse page**

```typescript
// src/app/learner/page.tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type TopicEntry = { topic: { id: string; name: string; description: string }; source: { name: string; type: string } }

export default function LearnerPage() {
  const [topics, setTopics] = useState<TopicEntry[]>([])

  useEffect(() => {
    fetch('/api/topics/all').then(r => r.json()).then(setTopics)
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Topics</h1>
      <div className="grid gap-3">
        {topics.map(({ topic, source }) => (
          <Link key={topic.id} href={`/learner/topics/${topic.id}`}>
            <Card className="hover:bg-accent/50 cursor-pointer transition-colors">
              <CardContent className="py-4 flex items-start justify-between">
                <div>
                  <p className="font-medium">{topic.name}</p>
                  <p className="text-sm text-muted-foreground">{topic.description}</p>
                </div>
                <Badge variant="outline" className="ml-4 flex-shrink-0">{source.name}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {topics.length === 0 && (
          <p className="text-sm text-muted-foreground">No topics yet. Add sources and topics in Admin.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write learning unit view**

```typescript
// src/app/learner/topics/[id]/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type UnitEntry = {
  unit: { id: string }
  version: { question: string; rationale: string; lesson: string; driftScore: number | null; createdAt: string }
}

export default function TopicLearnerPage() {
  const { id } = useParams<{ id: string }>()
  const [units, setUnits] = useState<UnitEntry[]>([])
  const [revealed, setRevealed] = useState<Record<string, { rationale: boolean; lesson: boolean }>>({})

  useEffect(() => {
    fetch(`/api/learning-units/${id}`).then(r => r.json()).then(setUnits)
  }, [id])

  function toggle(unitId: string, field: 'rationale' | 'lesson') {
    setRevealed(r => ({
      ...r,
      [unitId]: { ...(r[unitId] ?? { rationale: false, lesson: false }), [field]: !r[unitId]?.[field] }
    }))
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold">Learning Units</h1>
      {units.map(({ unit, version }) => (
        <Card key={unit.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Question</CardTitle>
              {version.driftScore !== null && (
                <Badge variant="outline" className="text-xs">
                  drift {(version.driftScore * 100).toFixed(0)}%
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{version.question}</p>

            <Button
              variant="outline"
              size="sm"
              onClick={() => toggle(unit.id, 'rationale')}
            >
              {revealed[unit.id]?.rationale ? 'Hide' : 'Show'} Rationale
            </Button>
            {revealed[unit.id]?.rationale && (
              <p className="text-sm text-muted-foreground border-l-2 pl-3">{version.rationale}</p>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => toggle(unit.id, 'lesson')}
            >
              {revealed[unit.id]?.lesson ? 'Hide' : 'Show'} Lesson
            </Button>
            {revealed[unit.id]?.lesson && (
              <p className="text-sm text-muted-foreground border-l-2 pl-3">{version.lesson}</p>
            )}
          </CardContent>
        </Card>
      ))}
      {units.length === 0 && (
        <p className="text-sm text-muted-foreground">No learning units yet. Run the pipeline to generate them.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/learner/ src/app/api/topics/all/
git commit -m "feat: add learner UI — browse topics and learning unit reveal view"
```

---

## Task 16: Final Wiring + Vercel Deploy

**Files:**
- Create: `next.config.ts` (if not exists)
- Create: `README.md`

- [ ] **Step 1: Ensure env vars are set in Vercel**

In Vercel dashboard: add `DATABASE_URL` and `OPENROUTER_API_KEY` to project environment variables.

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: no TypeScript errors, build succeeds.

- [ ] **Step 4: Deploy**

```bash
npx vercel --prod
```

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: production deploy ready"
```
