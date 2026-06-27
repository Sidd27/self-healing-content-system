import { db } from '@/db'
import { pipelineRuns, sourceVersions, driftItems, topicExtractions, topics } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { runStage, skipStage } from './stage-runner'
import { ingestStage } from './stages/ingest'
import { normalizeStage } from './stages/normalize'
import { hashCheckStage } from './stages/hash-check'
import { extractTopicsStage } from './stages/extract-topics'
import { driftAnalysisStage } from './stages/drift-analysis'
import { repairDecisionStage } from './stages/repair-decision'
import { generateStage } from './stages/generate'

export async function runPipeline(
  runId: string,
  sourceId: string
): Promise<void> {
  // ── Ingest ────────────────────────────────────────────────────────────────
  const { rawContent } = await runStage(
    runId, 'ingest',
    () => ingestStage(runId, sourceId),
    {
      onResume: async () => {
        // rawContent only needed by normalize; if normalize also completed,
        // this value is unused. Re-read from storage is safe (idempotent read).
        return ingestStage(runId, sourceId)
      },
    }
  )

  // ── Normalize ─────────────────────────────────────────────────────────────
  const { normalized, hash } = await runStage(
    runId, 'normalize',
    () => normalizeStage(runId, rawContent),
    {
      onResume: async () => {
        const [run] = await db.select({ sourceVersionId: pipelineRuns.sourceVersionId })
          .from(pipelineRuns).where(eq(pipelineRuns.id, runId))
        const [sv] = await db.select().from(sourceVersions)
          .where(eq(sourceVersions.id, run.sourceVersionId!))
        return { normalized: sv.normalizedContent, hash: sv.contentHash }
      },
    }
  )

  // ── Hash Check ────────────────────────────────────────────────────────────
  const { stopped, sourceVersionId } = await runStage(
    runId, 'hash_check',
    () => hashCheckStage(runId, sourceId, hash, normalized),
    {
      onResume: async () => {
        const [run] = await db.select({ sourceVersionId: pipelineRuns.sourceVersionId })
          .from(pipelineRuns).where(eq(pipelineRuns.id, runId))
        return { stopped: false, sourceVersionId: run.sourceVersionId! }
      },
    }
  )

  if (stopped) {
    await skipStage(runId, 'extract_topics')
    await skipStage(runId, 'drift_analysis')
    await skipStage(runId, 'repair_decision')
    await skipStage(runId, 'generate')
    return
  }

  // ── Extract Topics ────────────────────────────────────────────────────────
  const { affectedTopicIds, firstRunTopicIds } = await runStage(
    runId, 'extract_topics',
    () => extractTopicsStage(runId, sourceId, sourceVersionId, normalized),
    {
      onResume: async () => {
        // Reconstruct from drift_items created during original extract run
        const items = await db.select().from(driftItems)
          .where(eq(driftItems.pipelineRunId, runId))
        const firstRunIds = items
          .filter(d => d.changeType === 'FIRST_EXTRACTION')
          .map(d => d.topicId)
        const affectedIds = items
          .filter(d => d.changeType !== 'FIRST_EXTRACTION')
          .map(d => d.topicId)
        return { affectedTopicIds: affectedIds, firstRunTopicIds: firstRunIds, proposedCount: 0 }
      },
    }
  )

  if (affectedTopicIds.length === 0) {
    await skipStage(runId, 'drift_analysis')
    const { paused } = await runStage(runId, 'repair_decision', () =>
      repairDecisionStage(runId)
    )
    if (paused) {
      await skipStage(runId, 'generate')
    } else {
      await runStage(runId, 'generate', () =>
        generateStage(runId, sourceVersionId, firstRunTopicIds)
      )
    }
  } else {
    await runStage(runId, 'drift_analysis', () =>
      driftAnalysisStage(runId, affectedTopicIds, sourceVersionId)
    )
    const { paused } = await runStage(runId, 'repair_decision', () =>
      repairDecisionStage(runId)
    )
    if (paused) {
      await skipStage(runId, 'generate')
    } else {
      await runStage(runId, 'generate', () =>
        generateStage(runId, sourceVersionId, firstRunTopicIds)
      )
    }
  }

  // Only mark completed if repair_decision didn't already set awaiting_review
  const [current] = await db.select({ status: pipelineRuns.status })
    .from(pipelineRuns).where(eq(pipelineRuns.id, runId))
  if (current?.status === 'running') {
    await db.update(pipelineRuns)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(pipelineRuns.id, runId))
  } else {
    await db.update(pipelineRuns)
      .set({ completedAt: new Date() })
      .where(eq(pipelineRuns.id, runId))
  }
}
