# Extract / Drift / New-Topic Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-topic extract+drift double call with a single multi-topic extraction call that sorts the new source into `existing` (with a `drifted` flag) and `unmatched` (candidate new topics), make drift scoring the precise regen gate, and remove the per-topic hash comparison and `buildExtractPrompt`.

**Architecture:** `extract_topics` makes one LLM call returning `{ existing[], unmatched[] }`. Drifted existing topics get a new extraction persisted and flow to `drift_analysis`, which creates a `driftItem` only when `changeType != NO_CHANGE`. Unmatched content is named into `proposedTopics` via one call. Stage names and DB schema are unchanged — no migration.

**Tech Stack:** TypeScript, Next.js 15, Drizzle + Supabase Postgres, Mastra agents, Vercel AI SDK v6, Zod, Vitest.

## Global Constraints

- LLM calls go through Mastra agents in `src/mastra/index.ts` (`extractionAgent`, `driftAgent`, `generationAgent`). Never call `createOpenRouter()` directly.
- Top-level Zod schemas for structured output must be an **object wrapping** any array (bare top-level `z.array` causes silent empty responses on small models).
- Append-only tables: never DELETE from `source_versions`, `topic_extractions`, or `learning_unit_versions`.
- The `topicExtractions.contentHash` column has been dropped (migration `0002`). Do not reintroduce it — never write or read it. `sourceVersions.contentHash` (whole-source gate) stays.
- Drift threshold unchanged: `driftScore < 0.75` → `auto_applied`, `>= 0.75` → `pending_review`.
- The model must never be asked to echo a topic UUID. Topics are identified to the LLM by a 1-based positional `index`; code maps index→topicId.
- Run `npx tsc --noEmit` and `npm run lint` clean before each commit.

---

### Task 1: Pure extract-result mapping helper

The single source of correctness risk is mapping the LLM's index-keyed `existing[]` back to real topics and deciding what to persist. Extract this as a pure, tested function so the stage rewrite stays mechanical.

**Files:**
- Create: `src/pipeline/extract-mapping.ts`
- Test: `tests/pipeline/extract-mapping.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  ```ts
  export type ExistingExtractResult = { index: number; extractedContent: string; drifted: boolean };
  export type TopicRef = { id: string; name: string; description: string };
  export type DriftedTopic = { id: string; name: string; description: string; extractedContent: string };

  // Maps 1-based index → topic, keeps only drifted entries with non-empty content.
  // Ignores entries whose index is out of range or duplicated (first wins).
  export function selectDriftedTopics(
    topics: TopicRef[],
    existing: ExistingExtractResult[]
  ): DriftedTopic[];
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { selectDriftedTopics } from '../../src/pipeline/extract-mapping';

const topics = [
  { id: 't1', name: 'A', description: 'da' },
  { id: 't2', name: 'B', description: 'db' },
  { id: 't3', name: 'C', description: 'dc' },
];

describe('selectDriftedTopics', () => {
  it('returns only drifted topics, mapped by 1-based index', () => {
    const result = selectDriftedTopics(topics, [
      { index: 1, extractedContent: 'new A', drifted: true },
      { index: 2, extractedContent: 'new B', drifted: false },
      { index: 3, extractedContent: 'new C', drifted: true },
    ]);
    expect(result).toEqual([
      { id: 't1', name: 'A', description: 'da', extractedContent: 'new A' },
      { id: 't3', name: 'C', description: 'dc', extractedContent: 'new C' },
    ]);
  });

  it('ignores out-of-range indices', () => {
    const result = selectDriftedTopics(topics, [
      { index: 0, extractedContent: 'x', drifted: true },
      { index: 9, extractedContent: 'y', drifted: true },
      { index: 2, extractedContent: 'new B', drifted: true },
    ]);
    expect(result).toEqual([
      { id: 't2', name: 'B', description: 'db', extractedContent: 'new B' },
    ]);
  });

  it('drops drifted entries with empty/whitespace content', () => {
    const result = selectDriftedTopics(topics, [
      { index: 1, extractedContent: '   ', drifted: true },
      { index: 2, extractedContent: 'real', drifted: true },
    ]);
    expect(result).toEqual([
      { id: 't2', name: 'B', description: 'db', extractedContent: 'real' },
    ]);
  });

  it('keeps first when an index is duplicated', () => {
    const result = selectDriftedTopics(topics, [
      { index: 1, extractedContent: 'first', drifted: true },
      { index: 1, extractedContent: 'second', drifted: true },
    ]);
    expect(result).toEqual([
      { id: 't1', name: 'A', description: 'da', extractedContent: 'first' },
    ]);
  });

  it('returns empty when nothing drifted', () => {
    expect(
      selectDriftedTopics(topics, [{ index: 1, extractedContent: 'x', drifted: false }])
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pipeline/extract-mapping.test.ts`
Expected: FAIL — module `extract-mapping` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
export type ExistingExtractResult = { index: number; extractedContent: string; drifted: boolean };
export type TopicRef = { id: string; name: string; description: string };
export type DriftedTopic = { id: string; name: string; description: string; extractedContent: string };

export function selectDriftedTopics(
  topics: TopicRef[],
  existing: ExistingExtractResult[]
): DriftedTopic[] {
  const seen = new Set<number>();
  const out: DriftedTopic[] = [];
  for (const e of existing) {
    if (!e.drifted) continue;
    if (e.index < 1 || e.index > topics.length) continue;
    if (seen.has(e.index)) continue;
    if (!e.extractedContent || e.extractedContent.trim() === '') continue;
    seen.add(e.index);
    const t = topics[e.index - 1];
    out.push({ id: t.id, name: t.name, description: t.description, extractedContent: e.extractedContent });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pipeline/extract-mapping.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/extract-mapping.ts tests/pipeline/extract-mapping.test.ts
git commit -m "feat: pure helper to map+filter drifted topics from extract output"
```

---

### Task 2: New prompts and extract schema

Replace the single-topic `buildExtractPrompt` with a multi-topic one, add the extract output schema, and refit `buildProposeTopicsPrompt` to take unmatched blobs only.

**Files:**
- Modify: `src/pipeline/prompts.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  // newSource sorted against existing topics (identified by 1-based index).
  // Each topic carries its prior extraction so the model can judge `drifted`.
  export function buildExtractPrompt(
    topics: { name: string; description: string; priorExtraction: string }[],
    newSource: string
  ): string;

  // structures leftover content into named topics
  export function buildProposeTopicsPrompt(unmatched: string[]): string;
  ```
  The extract output schema (defined in Task 3's stage file, not here) is:
  `{ existing: [{ index, extractedContent, drifted }], unmatched: [{ content }] }`.

- [ ] **Step 1: Replace `buildExtractPrompt`**

Replace the existing single-topic `buildExtractPrompt` (top of file) with the multi-topic version. Each topic includes its prior extraction — that is the baseline the model compares against to set `drifted`:

```ts
export function buildExtractPrompt(
  topics: { name: string; description: string; priorExtraction: string }[],
  newSource: string
): string {
  const topicList = topics
    .map(
      (t, i) =>
        `${i + 1}. ${t.name} — ${t.description}\n   Prior version content:\n   ${
          t.priorExtraction.trim() || '[no prior version]'
        }`
    )
    .join('\n\n');

  return `You are analyzing a source document against a set of known learning topics.

Known topics (referenced by number), each with its prior version content:
${topicList}

New source document:
---
${newSource}
---

Do two things:

1) For EACH known topic above, extract the passages from the NEW source relevant
   to it, VERBATIM (copy exactly — do not paraphrase). Set "drifted": true if the
   topic's content in the new source meaningfully differs from its prior version
   content shown above; set "drifted": false if it is essentially the same.

2) Identify any substantive content in the new source that does NOT belong to any
   of the known topics above. Return each such passage as an "unmatched" item.

Return a JSON object:
{
  "existing": [{ "index": <topic number>, "extractedContent": "<verbatim>", "drifted": <bool> }],
  "unmatched": [{ "content": "<verbatim passage not covered by any known topic>" }]
}

Include one "existing" entry per known topic, using its number as "index".
If nothing in the source is unmatched, return "unmatched": [].`;
}
```

- [ ] **Step 2: Refit `buildProposeTopicsPrompt`**

Replace the current `buildProposeTopicsPrompt(sourceContent, covered)` with a version that takes only the unmatched blobs:

```ts
export function buildProposeTopicsPrompt(unmatched: string[]): string {
  const blocks = unmatched.map((c, i) => `Passage ${i + 1}:\n${c}`).join('\n\n---\n\n');

  return `The following passages were found in a source document and do NOT belong
to any existing learning topic. Structure them into new learning topics for a
professional certification exam.

Unmatched passages:
===
${blocks}
===

Return a JSON object with a single key "topics" whose value is an array of objects,
each with:
- name: short topic name (3-6 words)
- description: one sentence describing what this topic covers
- extractedContent: the verbatim passage(s) relevant to this topic

Merge passages that describe the same concept into one topic. Drop any passage too
thin to be a real topic. If none qualify, return {"topics": []}.`;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `extract-topics.ts` and `review/topics/[id]/route.ts` (stale call sites — fixed in Tasks 3 and 5). No errors inside `prompts.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/pipeline/prompts.ts
git commit -m "feat: multi-topic extract prompt + unmatched-only propose prompt"
```

---

### Task 3: Rewrite `extract_topics` stage

Use one extraction call (returning `existing` + `unmatched`), persist new extractions only for drifted topics via the Task 1 helper, and name unmatched content into proposed topics with one more call.

**Files:**
- Modify: `src/pipeline/stages/extract-topics.ts`

**Interfaces:**
- Consumes: `selectDriftedTopics` (Task 1), `buildExtractPrompt`/`buildProposeTopicsPrompt` (Task 2), `extractionAgent`, `db`, `normalizeText`.
- Produces: unchanged signature — `extractTopicsStage(runId, sourceId, sourceVersionId, normalizedContent): Promise<{ new: TopicSummary[]; drifted: TopicSummary[] }>`.

- [ ] **Step 1: Replace the file body**

Replace the whole file with:

```ts
import { db } from '@/db';
import { topics, topicExtractions, proposedTopics } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { normalizeText } from '@/lib/utils';
import { buildExtractPrompt, buildProposeTopicsPrompt } from '@/pipeline/prompts';
import { selectDriftedTopics } from '@/pipeline/extract-mapping';
import { log } from '@/lib/logger';
import { extractionAgent } from '@/mastra';

const ExtractSchema = z.object({
  existing: z.array(
    z.object({
      index: z.number().int(),
      extractedContent: z.string(),
      drifted: z.boolean(),
    })
  ),
  unmatched: z.array(z.object({ content: z.string() })),
});

const ProposedTopicsSchema = z.object({
  topics: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      extractedContent: z.string(),
    })
  ),
});

type TopicSummary = { id: string; name: string; description: string };

export type ExtractTopicsResult = {
  new: TopicSummary[];
  drifted: TopicSummary[];
};

export async function extractTopicsStage(
  runId: string,
  sourceId: string,
  sourceVersionId: string,
  normalizedContent: string
): Promise<ExtractTopicsResult> {
  const sourceTopics = await db.select().from(topics).where(eq(topics.sourceId, sourceId));

  log.info('extract_topics', 'existing topics', {
    count: sourceTopics.length,
    names: sourceTopics.map((t) => t.name),
  });

  // Load each topic's latest prior extraction — the baseline the model needs to judge drift.
  const topicsWithPrior = await Promise.all(
    sourceTopics.map(async (t) => {
      const [prior] = await db
        .select({ extractedContent: topicExtractions.extractedContent })
        .from(topicExtractions)
        .where(eq(topicExtractions.topicId, t.id))
        .orderBy(desc(topicExtractions.createdAt))
        .limit(1);
      return { name: t.name, description: t.description, priorExtraction: prior?.extractedContent ?? '' };
    })
  );

  // One call: sort the new source against existing topics → existing[] + unmatched[]
  const { object: extracted } = await extractionAgent.generate(
    buildExtractPrompt(topicsWithPrior, normalizedContent),
    { structuredOutput: { schema: ExtractSchema } }
  );

  log.info('extract_topics', 'extract result', {
    existing: extracted.existing.length,
    drifted: extracted.existing.filter((e) => e.drifted).length,
    unmatched: extracted.unmatched.length,
  });

  // Persist a new extraction only for drifted topics; unchanged topics keep their baseline.
  const driftedTopics = selectDriftedTopics(sourceTopics, extracted.existing);
  for (const t of driftedTopics) {
    await db.insert(topicExtractions).values({
      topicId: t.id,
      sourceVersionId,
      extractedContent: normalizeText(t.extractedContent),
    });
  }
  const drifted: TopicSummary[] = driftedTopics.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
  }));

  // Name unmatched content into proposed new topics (one call, only if any).
  const proposed: TopicSummary[] = [];
  const unmatched = extracted.unmatched.map((u) => u.content).filter((c) => c.trim() !== '');

  if (unmatched.length > 0) {
    const { object: llmProposed } = await extractionAgent.generate(
      buildProposeTopicsPrompt(unmatched),
      { structuredOutput: { schema: ProposedTopicsSchema } }
    );

    log.info('extract_topics', 'proposed new topics', {
      count: llmProposed.topics.length,
      names: llmProposed.topics.map((p) => p.name),
    });

    if (llmProposed.topics.length > 0) {
      const inserted = await db
        .insert(proposedTopics)
        .values(
          llmProposed.topics.map((p) => ({
            sourceVersionId,
            pipelineRunId: runId,
            name: p.name,
            description: p.description,
            extractedContent: p.extractedContent,
            status: 'pending_approval' as const,
          }))
        )
        .returning({
          id: proposedTopics.id,
          name: proposedTopics.name,
          description: proposedTopics.description,
        });
      proposed.push(...inserted);
    }
  }

  log.info('extract_topics', 'complete', { new: proposed.length, drifted: drifted.length });

  return { new: proposed, drifted };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: errors ONLY remaining in `review/topics/[id]/route.ts` (fixed in Task 5). No errors in `extract-topics.ts`.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — existing tests + Task 1 tests still green (no behavioural test here; this stage is LLM/DB-bound and verified by typecheck + downstream integration).

- [ ] **Step 4: Commit**

```bash
git add src/pipeline/stages/extract-topics.ts
git commit -m "refactor: single extract call producing existing+unmatched, persist only drifted"
```

---

### Task 4: Drift analysis NO_CHANGE veto

Make `drift_analysis` the precise gate: create a `driftItem` only when `changeType != NO_CHANGE`, so a false-positive `drifted` flag from extraction does not trigger regeneration.

**Files:**
- Modify: `src/pipeline/stages/drift-analysis.ts`

**Interfaces:**
- Consumes: unchanged.
- Produces: unchanged signature `driftAnalysisStage(runId, affectedTopicIds, sourceVersionId): Promise<void>`.

- [ ] **Step 1: Add a safety guard for under-seeded topics**

Drift requires two extractions (new + previous). The invariant (every topic is
seeded at creation) guarantees this for drifted topics, but add a cheap guard so a
violated invariant logs and skips instead of throwing on `extractions[1]`. Right
after the `extractions` query and before reading `extractions[0]/[1]`:

```ts
    if (extractions.length < 2) {
      log.info('drift_analysis', 'skipping — fewer than 2 extractions', { topic: topic.name });
      continue;
    }
```

- [ ] **Step 2: Add the NO_CHANGE veto**

In the per-topic loop, after computing the drift object and before inserting the drift item, skip insertion on `NO_CHANGE`:

```ts
    if (object.changeType === 'NO_CHANGE') {
      log.info('drift_analysis', 'scorer vetoed — no real change, skipping', {
        topic: topic.name,
      });
      continue;
    }

    const driftLevel = computeDriftLevel(object.driftScore);
    const status = computeRepairDecision(object.driftScore);
```

(The `driftLevel`/`status`/`db.insert(driftItems)` block stays exactly as it is, just now after the veto.)

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the suite**

Run: `npx vitest run`
Expected: PASS (no new test; `repair-decision.test.ts` still green).

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/stages/drift-analysis.ts
git commit -m "feat: drift scorer vetoes NO_CHANGE + guards under-seeded topics"
```

---

### Task 5: Seed approved topics from their reviewed content

On proposed-topic approval, seed the first extraction directly from `proposedTopics.extractedContent` (the exact text the human approved) instead of re-extracting. Removes the last `buildExtractPrompt`/single-topic re-extraction call and fixes false-drift-on-approval at the root.

**Files:**
- Modify: `src/app/api/review/topics/[id]/route.ts`

**Interfaces:**
- Consumes: `proposedTopics.extractedContent`, `normalizeText`, `db`.
- Produces: unchanged route behaviour (idempotent topic create → seed extraction → generate → approve).

- [ ] **Step 1: Remove the re-extraction imports**

Delete these two imports (no longer used):

```ts
import { extractionAgent } from '@/mastra';
import { buildExtractPrompt } from '@/pipeline/prompts';
```

Also remove `sourceVersions` from the drizzle-table import if it becomes unused after Step 2 (verify with tsc).

- [ ] **Step 2: Seed from the proposed content**

Replace the seed block — the part that loads `version`, calls `extractionAgent.generate(buildExtractPrompt(...))`, and inserts the extraction — with a direct seed from the already-approved content:

```ts
    const [existingExtraction] = await db
      .select({ id: topicExtractions.id })
      .from(topicExtractions)
      .where(eq(topicExtractions.topicId, topic.id));
    if (!existingExtraction) {
      await db.insert(topicExtractions).values({
        topicId: topic.id,
        sourceVersionId: proposed.sourceVersionId,
        extractedContent: normalizeText(proposed.extractedContent),
      });
    }
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors anywhere. (If `sourceVersions` is now unused, remove it from the import to clear the lint/tsc warning.)

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: clean (no unused-import errors).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/review/topics/[id]/route.ts
git commit -m "refactor: seed approved topic from reviewed content, drop re-extraction"
```

---

### Task 6: Verify resume path and full green

Confirm the `extract_topics` `onResume` reconstruction in `run.ts` is still correct under the new "persist only drifted" rule, and that the whole suite + typecheck + lint pass.

**Files:**
- Read/verify: `src/pipeline/run.ts` (the `extract_topics` `onResume` block)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing — verification task.

- [ ] **Step 1: Confirm onResume logic holds**

Read the `extract_topics` `onResume` in `run.ts`. It reconstructs `drifted` as topics where `extractedThisVersion && hasPriorVersion`. Under the new rule, only drifted topics get an extraction this version — so this still yields exactly the drifted set. Confirm no code change is needed. If the logic no longer matches (e.g. it depended on every topic being extracted each run), update the comment and logic to: "a topic is drifted iff it has an extraction for this sourceVersionId AND an earlier one." No code change expected.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all green (normalize, hash-check, repair-decision, extract-mapping).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 5: Commit any verification fixes**

```bash
git add -A
git commit -m "chore: verify extract_topics resume path under persist-only-drifted rule"
```

(If Step 1 required no change and nothing else moved, skip the commit.)

---

## Notes for the implementer

- Do not change stage names, the `stageNameEnum`, or any DB column — this rework is code-only, no migration.
- `topicExtractions.contentHash` is gone (migration `0002`) — never write or read it.
- The `run.ts` orchestrator already gates `drift_analysis` on `drifted.length > 0` and routes proposals to human review via `repair_decision` — those do not change.
- There is no integration test harness for LLM/DB stages; correctness for those stages is carried by `tsc`, lint, the pure-function tests, and the existing documented-behaviour tests. Do not invent a DB/LLM mock harness for this plan.
