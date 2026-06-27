# Approval Gate + Pipeline Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add human approval gate after topic extraction (both LLM-extracted and manually-added topics), and allow failed pipeline runs to be resumed in-place instead of spawning a new run.

**Architecture:**

- First-run extractions create `drift_items` with `changeType: 'FIRST_EXTRACTION'` and `status: 'pending_review'`, plugging directly into the existing repair-decision → review → generate flow with zero new DB columns.
- Human-added topics trigger extraction + approval in a single lightweight endpoint that reuses `extractForTopic` and `generateForTopic`.
- Pipeline resume: `runStage` gains an idempotency check (skips stages already `completed`), and a new `/api/pipeline/[runId]/resume` endpoint resets only the failed stage before re-calling `runPipeline`.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, Postgres (Supabase), TypeScript, `ai` SDK (Vercel), Ollama / OpenRouter via `createOpenAI`.

## Global Constraints

- `params` in route handlers is a `Promise` — always `await params` before destructuring.
- Never DELETE from `source_versions`, `topic_extractions`, or `learning_unit_versions`.
- `db` client comes from `@/db`, never instantiate postgres inline in route handlers.
- `drift_score` in `drift_items` is `real` (NOT NULL) — use `0.0` for first-extraction items.
- `DRIFT_HIGH_THRESHOLD = 0.75` from `@/lib/constants`.
- All LLM calls must include `abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS)`.
- Status flow: `pending_review` drift items → `repair_decision` returns `paused: true` → run status `awaiting_review`.
- `repair_decision` already handles `hasPendingReview` — do not change that logic, only feed it the right data.

---

## File Map

| File                                           | Change                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/pipeline/stages/extract-topics.ts`        | Insert `drift_items` for `firstRunTopicIds` with `FIRST_EXTRACTION` changeType         |
| `src/pipeline/stage-runner.ts`                 | Add `onResume` option: skip fn + reconstruct return value if stage already `completed` |
| `src/pipeline/run.ts`                          | Pass `onResume` reconstructors for each stage                                          |
| `src/app/api/pipeline/[runId]/resume/route.ts` | **New** — reset failed stage, reset run to `running`, re-call `runPipeline`            |
| `src/app/api/sources/[id]/topics/route.ts`     | **New** — create topic + extract + create FIRST_EXTRACTION drift item                  |
| `src/app/admin/pipeline/[runId]/page.tsx`      | Re-run button calls `/resume` instead of `/pipeline`                                   |

---

## Task 1: First-run approval gate (insert FIRST_EXTRACTION drift items)

**Files:**

- Modify: `src/pipeline/stages/extract-topics.ts`

**Interfaces:**

- Produces: same `{ affectedTopicIds, firstRunTopicIds, proposedCount }` — no signature change
- `firstRunTopicIds` are now also represented as `drift_items` with `status: 'pending_review'` for `repairDecisionStage` to find

- [ ] **Step 1: Understand the current insert**

  Read `src/pipeline/stages/extract-topics.ts` lines 61–66:

  ```typescript
  if (!previousExtraction) {
    firstRunTopicIds.push(topic.id);
  } else {
    affectedTopicIds.push(topic.id);
  }
  ```

  The `firstRunTopicIds` array is returned to `run.ts` and passed directly to `generateStage` — bypassing the review gate entirely.

- [ ] **Step 2: Import `driftItems` and `computeDriftLevel` / `computeRepairDecision`**

  At the top of `src/pipeline/stages/extract-topics.ts`, add to existing imports:

  ```typescript
  import { topics, topicExtractions, proposedTopics, driftItems } from '@/db/schema';
  import { computeDriftLevel } from './repair-decision';
  ```

  (`computeDriftLevel` is already exported from `repair-decision.ts` — no new export needed.)

- [ ] **Step 3: Insert FIRST_EXTRACTION drift item instead of pushing to firstRunTopicIds directly**

  Replace the block after the `topicExtractions` insert (lines 54–66):

  ```typescript
  // BEFORE:
  if (!previousExtraction) {
    firstRunTopicIds.push(topic.id);
  } else {
    affectedTopicIds.push(topic.id);
  }
  ```

  With:

  ```typescript
  if (!previousExtraction) {
    firstRunTopicIds.push(topic.id);
    // Create a pending_review drift item so repair_decision pauses for human approval
    await db.insert(driftItems).values({
      pipelineRunId: runId,
      topicId: topic.id,
      changeType: 'FIRST_EXTRACTION',
      driftScore: 0.0,
      driftLevel: 'low',
      reason: 'First extraction — requires human approval before generating learning unit.',
      status: 'pending_review',
    });
  } else {
    affectedTopicIds.push(topic.id);
  }
  ```

- [ ] **Step 4: Verify repair_decision will pause**

  Open `src/pipeline/stages/repair-decision.ts` and confirm:

  ```typescript
  const hasPendingReview = runDriftItems.some((d) => d.status === 'pending_review');
  // ...
  return { paused: hasPendingReview };
  ```

  No change needed — `FIRST_EXTRACTION` items with `pending_review` will be found by the existing query.

- [ ] **Step 5: Verify generate stage is skipped**

  Open `src/pipeline/run.ts` and confirm the `paused` branch skips generate for BOTH paths (affectedTopicIds=0 and affectedTopicIds>0). No change needed here either.

- [ ] **Step 6: Smoke-test with clean DB**

  ```bash
  npx tsx scripts/clean-db.ts && npx tsx scripts/seed.ts
  ```

  Then start dev server and run pipeline on Source A with `cloud-run-v1.pdf`. Expected outcome:
  - Stages 1–6 complete (Extract Topics + Repair Decision show completed)
  - Stage 7 (Generate) shows **Skipped**
  - Run status: **Awaiting Review**
  - Drift items section shows 2 entries with `FIRST_EXTRACTION` changeType

- [ ] **Step 7: Commit**

  ```bash
  git add src/pipeline/stages/extract-topics.ts
  git commit -m "feat: first-run extractions require human approval before generate

  Insert FIRST_EXTRACTION drift items with pending_review status so
  repair_decision pauses the pipeline. Human approves via review queue
  which triggers generateForTopic directly."
  ```

---

## Task 2: Make pipeline resume idempotent (stage-runner + run.ts)

**Files:**

- Modify: `src/pipeline/stage-runner.ts`
- Modify: `src/pipeline/run.ts`

**Interfaces:**

- `runStage<T>(runId, stageName, fn, opts?: { onResume: () => Promise<T> }): Promise<T>`
- If stage already `completed`, calls `opts.onResume()` and returns its result without calling `fn` or inserting a new stage record.

- [ ] **Step 1: Update `runStage` signature and add idempotency check**

  Replace the contents of `src/pipeline/stage-runner.ts` with:

  ```typescript
  import { db } from '@/db';
  import { pipelineStages, pipelineRuns } from '@/db/schema';
  import { eq, and } from 'drizzle-orm';

  type StageName = (typeof pipelineStages.$inferInsert)['stage'];

  export async function runStage<T>(
    pipelineRunId: string,
    stageName: StageName,
    fn: () => Promise<T>,
    opts?: { onResume: () => Promise<T> }
  ): Promise<T> {
    // Idempotency: if this stage already completed (resume case), skip re-running
    if (opts?.onResume) {
      const [existing] = await db
        .select({ status: pipelineStages.status })
        .from(pipelineStages)
        .where(
          and(eq(pipelineStages.pipelineRunId, pipelineRunId), eq(pipelineStages.stage, stageName))
        );
      if (existing?.status === 'completed') {
        return opts.onResume();
      }
    }

    await db.insert(pipelineStages).values({
      pipelineRunId,
      stage: stageName,
      status: 'running',
      startedAt: new Date(),
    });

    try {
      const result = await fn();
      await db
        .update(pipelineStages)
        .set({ status: 'completed', completedAt: new Date() })
        .where(
          and(eq(pipelineStages.pipelineRunId, pipelineRunId), eq(pipelineStages.stage, stageName))
        );
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await db
        .update(pipelineStages)
        .set({ status: 'failed', completedAt: new Date(), error })
        .where(
          and(eq(pipelineStages.pipelineRunId, pipelineRunId), eq(pipelineStages.stage, stageName))
        );
      await db
        .update(pipelineRuns)
        .set({ status: 'failed', completedAt: new Date() })
        .where(eq(pipelineRuns.id, pipelineRunId));
      throw err;
    }
  }

  export async function skipStage(pipelineRunId: string, stageName: StageName) {
    // Idempotency: don't insert duplicate skipped record on resume
    const [existing] = await db
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(
        and(eq(pipelineStages.pipelineRunId, pipelineRunId), eq(pipelineStages.stage, stageName))
      );
    if (existing) return;

    await db.insert(pipelineStages).values({
      pipelineRunId,
      stage: stageName,
      status: 'skipped',
      startedAt: new Date(),
      completedAt: new Date(),
    });
  }
  ```

- [ ] **Step 2: Add `onResume` reconstructors to `run.ts`**

  Replace the contents of `src/pipeline/run.ts` with:

  ```typescript
  import { db } from '@/db';
  import { pipelineRuns, sourceVersions, driftItems, topicExtractions, topics } from '@/db/schema';
  import { eq, and, desc } from 'drizzle-orm';
  import { runStage, skipStage } from './stage-runner';
  import { ingestStage } from './stages/ingest';
  import { normalizeStage } from './stages/normalize';
  import { hashCheckStage } from './stages/hash-check';
  import { extractTopicsStage } from './stages/extract-topics';
  import { driftAnalysisStage } from './stages/drift-analysis';
  import { repairDecisionStage } from './stages/repair-decision';
  import { generateStage } from './stages/generate';

  export async function runPipeline(runId: string, sourceId: string): Promise<void> {
    // ── Ingest ────────────────────────────────────────────────────────────────
    const { rawContent } = await runStage(runId, 'ingest', () => ingestStage(runId, sourceId), {
      onResume: async () => {
        // rawContent only needed by normalize; if normalize also completed,
        // this value is unused. Re-read from storage is safe (idempotent read).
        return ingestStage(runId, sourceId);
      },
    });

    // ── Normalize ─────────────────────────────────────────────────────────────
    const { normalized, hash } = await runStage(
      runId,
      'normalize',
      () => normalizeStage(runId, rawContent),
      {
        onResume: async () => {
          const [run] = await db
            .select({ sourceVersionId: pipelineRuns.sourceVersionId })
            .from(pipelineRuns)
            .where(eq(pipelineRuns.id, runId));
          const [sv] = await db
            .select()
            .from(sourceVersions)
            .where(eq(sourceVersions.id, run.sourceVersionId!));
          return { normalized: sv.normalizedContent, hash: sv.contentHash };
        },
      }
    );

    // ── Hash Check ────────────────────────────────────────────────────────────
    const { stopped, sourceVersionId } = await runStage(
      runId,
      'hash_check',
      () => hashCheckStage(runId, sourceId, hash, normalized),
      {
        onResume: async () => {
          const [run] = await db
            .select({ sourceVersionId: pipelineRuns.sourceVersionId })
            .from(pipelineRuns)
            .where(eq(pipelineRuns.id, runId));
          return { stopped: false, sourceVersionId: run.sourceVersionId! };
        },
      }
    );

    if (stopped) {
      await skipStage(runId, 'extract_topics');
      await skipStage(runId, 'drift_analysis');
      await skipStage(runId, 'repair_decision');
      await skipStage(runId, 'generate');
      return;
    }

    // ── Extract Topics ────────────────────────────────────────────────────────
    const { affectedTopicIds, firstRunTopicIds } = await runStage(
      runId,
      'extract_topics',
      () => extractTopicsStage(runId, sourceId, sourceVersionId, normalized),
      {
        onResume: async () => {
          // Reconstruct from drift_items created during original extract run
          const items = await db
            .select()
            .from(driftItems)
            .where(eq(driftItems.pipelineRunId, runId));
          const firstRunIds = items
            .filter((d) => d.changeType === 'FIRST_EXTRACTION')
            .map((d) => d.topicId);
          const affectedIds = items
            .filter((d) => d.changeType !== 'FIRST_EXTRACTION')
            .map((d) => d.topicId);
          return { affectedTopicIds: affectedIds, firstRunTopicIds: firstRunIds, proposedCount: 0 };
        },
      }
    );

    if (affectedTopicIds.length === 0) {
      await skipStage(runId, 'drift_analysis');
      const { paused } = await runStage(runId, 'repair_decision', () => repairDecisionStage(runId));
      if (paused) {
        await skipStage(runId, 'generate');
      } else {
        await runStage(runId, 'generate', () =>
          generateStage(runId, sourceVersionId, firstRunTopicIds)
        );
      }
    } else {
      await runStage(runId, 'drift_analysis', () =>
        driftAnalysisStage(runId, affectedTopicIds, sourceVersionId)
      );
      const { paused } = await runStage(runId, 'repair_decision', () => repairDecisionStage(runId));
      if (paused) {
        await skipStage(runId, 'generate');
      } else {
        await runStage(runId, 'generate', () =>
          generateStage(runId, sourceVersionId, firstRunTopicIds)
        );
      }
    }

    // Only mark completed if repair_decision didn't already set awaiting_review
    const [current] = await db
      .select({ status: pipelineRuns.status })
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, runId));
    if (current?.status === 'running') {
      await db
        .update(pipelineRuns)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(pipelineRuns.id, runId));
    } else {
      await db
        .update(pipelineRuns)
        .set({ completedAt: new Date() })
        .where(eq(pipelineRuns.id, runId));
    }
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/pipeline/stage-runner.ts src/pipeline/run.ts
  git commit -m "feat: make pipeline stages idempotent for resume support

  runStage checks for existing completed stage record and calls onResume
  reconstructor instead of re-running fn. skipStage is also idempotent.
  Each stage in run.ts provides an onResume that reads state from DB."
  ```

---

## Task 3: Resume endpoint + UI button fix

**Files:**

- Create: `src/app/api/pipeline/[runId]/resume/route.ts`
- Modify: `src/app/admin/pipeline/[runId]/page.tsx`

**Interfaces:**

- `POST /api/pipeline/[runId]/resume` → `200 { ok: true }` or `400/404/409` with `{ error: string }`
- UI Re-run button changes call from `POST /api/sources/{sourceId}/pipeline` to `POST /api/pipeline/{runId}/resume`

- [ ] **Step 1: Create resume route**

  Create `src/app/api/pipeline/[runId]/resume/route.ts`:

  ```typescript
  import { NextResponse } from 'next/server';
  import { db } from '@/db';
  import { pipelineRuns, pipelineStages } from '@/db/schema';
  import { eq, and } from 'drizzle-orm';
  import { runPipeline } from '@/pipeline/run';

  export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
    const { runId } = await params;

    const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId));
    if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (run.status !== 'failed') {
      return NextResponse.json({ error: `Run is ${run.status}, not failed` }, { status: 409 });
    }

    // Delete the failed stage record so runPipeline can re-insert it cleanly
    await db
      .delete(pipelineStages)
      .where(and(eq(pipelineStages.pipelineRunId, runId), eq(pipelineStages.status, 'failed')));

    // Reset run status to running (clears failed + completedAt)
    await db
      .update(pipelineRuns)
      .set({ status: 'running', completedAt: null })
      .where(eq(pipelineRuns.id, runId));

    // Re-run in background — already-completed stages are skipped by runStage idempotency
    runPipeline(run.id, run.sourceId).catch(console.error);

    return NextResponse.json({ ok: true });
  }
  ```

- [ ] **Step 2: Update Re-run button in pipeline UI**

  In `src/app/admin/pipeline/[runId]/page.tsx`, change the `rerun` function from:

  ```typescript
  async function rerun() {
    if (!run) return;
    setRerunning(true);
    try {
      const res = await fetch(`/api/sources/${run.sourceId}/pipeline`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const { runId: newRunId } = await res.json();
      router.push(`/admin/pipeline/${newRunId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Re-run failed');
      setRerunning(false);
    }
  }
  ```

  To:

  ```typescript
  async function rerun() {
    if (!run) return;
    setRerunning(true);
    try {
      const res = await fetch(`/api/pipeline/${run.id}/resume`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      // Stay on the same page — polling will pick up the resumed run
      setRerunning(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Resume failed');
      setRerunning(false);
    }
  }
  ```

  Also remove the `useRouter` import and `router` usage if no longer needed elsewhere.

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/pipeline/[runId]/resume/route.ts src/app/admin/pipeline/[runId]/page.tsx
  git commit -m "feat: resume failed pipeline in-place instead of creating new run

  POST /api/pipeline/[runId]/resume resets only the failed stage record
  and run status, then re-calls runPipeline. Completed stages are skipped
  via idempotency in runStage. UI Re-run button stays on same run page."
  ```

---

## Task 4: Human-add topic → LLM extract → approval gate

**Files:**

- Create: `src/app/api/sources/[id]/topics/route.ts`

**Interfaces:**

- `POST /api/sources/[id]/topics` body: `{ name: string, description: string }`
- Response `202 { topicId, driftItemId }` — topic created, extraction running, drift item pending_review
- Requires at least one completed pipeline run on the source (needs a `source_version`)

- [ ] **Step 1: Create the route**

  Create `src/app/api/sources/[id]/topics/route.ts`:

  ```typescript
  import { NextResponse } from 'next/server';
  import { db } from '@/db';
  import {
    sources,
    topics,
    sourceVersions,
    topicExtractions,
    driftItems,
    pipelineRuns,
  } from '@/db/schema';
  import { eq, desc } from 'drizzle-orm';
  import { generateText } from 'ai';
  import { buildExtractPrompt } from '@/pipeline/prompts';
  import { llmModel } from '@/lib/llm';
  import { normalizeContent, hashContent } from '@/lib/normalize';
  import { LLM_TIMEOUT_MS } from '@/lib/constants';

  export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { name, description } = (await req.json()) as { name: string; description: string };

    if (!name?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'name and description are required' }, { status: 400 });
    }

    const [source] = await db.select().from(sources).where(eq(sources.id, id));
    if (!source) return NextResponse.json({ error: 'Source not found' }, { status: 404 });

    // Need a completed pipeline run to have normalized content to extract from
    const [latestRun] = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.sourceId, id))
      .orderBy(desc(pipelineRuns.triggeredAt))
      .limit(1);

    if (!latestRun?.sourceVersionId) {
      return NextResponse.json(
        {
          error:
            'No completed pipeline run found. Run the pipeline first to ingest source content.',
        },
        { status: 409 }
      );
    }

    const [sv] = await db
      .select()
      .from(sourceVersions)
      .where(eq(sourceVersions.id, latestRun.sourceVersionId));
    if (!sv) return NextResponse.json({ error: 'Source version not found' }, { status: 500 });

    // Create the topic
    const [topic] = await db
      .insert(topics)
      .values({ sourceId: id, name: name.trim(), description: description.trim() })
      .returning();

    // Run extraction in background, create pending_review drift item
    (async () => {
      try {
        const { text: extracted } = await generateText({
          model: llmModel,
          prompt: buildExtractPrompt(topic.name, topic.description, sv.normalizedContent),
          temperature: 0,
          abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        });

        const normalizedExtraction = normalizeContent(extracted);
        const extractionHash = hashContent(normalizedExtraction);

        await db.insert(topicExtractions).values({
          topicId: topic.id,
          sourceVersionId: sv.id,
          extractedContent: normalizedExtraction,
          contentHash: extractionHash,
        });

        await db.insert(driftItems).values({
          pipelineRunId: latestRun.id,
          topicId: topic.id,
          changeType: 'FIRST_EXTRACTION',
          driftScore: 0.0,
          driftLevel: 'low',
          reason:
            'Manually added topic — extracted content requires human approval before generating learning unit.',
          status: 'pending_review',
        });
      } catch (err) {
        console.error('Topic extraction failed for', topic.id, err);
      }
    })();

    return NextResponse.json({ topicId: topic.id }, { status: 202 });
  }
  ```

- [ ] **Step 2: Verify review queue picks up the new drift item**

  The drift item is linked to `latestRun.id`. The review queue at `/api/review/queue` should already return it. Open `src/app/api/review/queue/route.ts` and confirm it queries `drift_items` with `status: 'pending_review'` regardless of `changeType`. If it filters by changeType, remove that filter.

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/sources/[id]/topics/route.ts
  git commit -m "feat: POST /api/sources/[id]/topics — human adds topic, LLM extracts, awaits review

  Creates topic, runs LLM extraction against latest source version content,
  inserts FIRST_EXTRACTION drift item with pending_review status.
  Human approves via review queue which triggers generateForTopic."
  ```

---

## Task 5: End-to-end smoke test

- [ ] **Step 1: Clean DB and re-seed**

  ```bash
  npx tsx scripts/clean-db.ts && npx tsx scripts/seed.ts
  ```

- [ ] **Step 2: Test approval gate (first run)**

  1. Start dev server: `npm run dev`
  2. Open Source A → upload `cloud-run-v1.pdf` → Run Pipeline
  3. Verify: Generate is **Skipped**, run status **Awaiting Review**, drift items show 2 `FIRST_EXTRACTION` entries
  4. Go to Review Queue → approve both → verify learning units are generated

- [ ] **Step 3: Test resume (simulate failure)**

  1. Run pipeline on Source B → upload `cloud-run-v1.pdf`
  2. While pipeline is running, use `scripts/clean-db.ts` is too nuclear — instead use Supabase console or psql to manually set one stage to `failed` and run status to `failed`
  3. Alternatively: temporarily throw in a stage to force failure, verify Re-run stays on same page and resumes

- [ ] **Step 4: Test human-add topic**

  ```bash
  # Add a topic manually via API (after Source A has a completed run)
  curl -X POST http://localhost:3000/api/sources/<SOURCE_A_ID>/topics \
    -H 'Content-Type: application/json' \
    -d '{"name":"Pricing","description":"Cloud Run pricing model: CPU, memory, request charges and free tier limits."}'
  ```

  Verify: topic appears, after ~5s a drift item appears in review queue → approve → learning unit generated.

- [ ] **Step 5: Test second run (drift path)**

  1. Upload `cloud-run-v2-low-drift.pdf` on Source A → Run Pipeline
  2. Verify: drift items with non-FIRST_EXTRACTION changeType, auto-applied ones go to generate, high-drift ones go to review

---

## Self-Review

**Spec coverage:**

- ✅ First-run approval gate: FIRST_EXTRACTION drift items → repair_decision pauses → review → generate
- ✅ Human-added topic flow: POST /api/sources/[id]/topics → extract → FIRST_EXTRACTION drift item → review → generate
- ✅ Resume failed run: `/resume` endpoint + idempotent runStage + same run ID in UI

**Placeholder scan:** None found.

**Type consistency:**

- `runStage<T>(..., opts?: { onResume: () => Promise<T> })` — used consistently in run.ts with matching generic T
- `driftItems` insert uses `changeType: 'FIRST_EXTRACTION'` (text column, no enum) — consistent across extract-topics.ts and topics/route.ts
