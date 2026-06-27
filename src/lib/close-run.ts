import { db } from '@/db';
import { driftItems, proposedTopics, pipelineRuns, pipelineStages } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Called before each individual generateForTopic in the review APIs.
 * Transitions the generate stage from pending → running on first call.
 */
export async function markGenerateRunning(runId: string): Promise<void> {
  const [existing] = await db
    .select({ status: pipelineStages.status })
    .from(pipelineStages)
    .where(and(eq(pipelineStages.pipelineRunId, runId), eq(pipelineStages.stage, 'generate')));

  if (!existing) {
    await db.insert(pipelineStages).values({
      pipelineRunId: runId,
      stage: 'generate',
      status: 'running',
      startedAt: new Date(),
    });
  } else if (existing.status === 'pending') {
    await db
      .update(pipelineStages)
      .set({ status: 'running', startedAt: new Date() })
      .where(and(eq(pipelineStages.pipelineRunId, runId), eq(pipelineStages.stage, 'generate')));
  }
}

/**
 * After each review action, check if all pending items for the run are resolved.
 * If so, mark the generate stage and the run itself as completed.
 */
export async function tryCompleteRun(runId: string): Promise<void> {
  const [pendingDrift] = await db
    .select({ id: driftItems.id })
    .from(driftItems)
    .where(and(eq(driftItems.pipelineRunId, runId), eq(driftItems.status, 'pending_review')))
    .limit(1);
  if (pendingDrift) return;

  const [pendingTopic] = await db
    .select({ id: proposedTopics.id })
    .from(proposedTopics)
    .where(
      and(eq(proposedTopics.pipelineRunId, runId), eq(proposedTopics.status, 'pending_approval'))
    )
    .limit(1);
  if (pendingTopic) return;

  // All items resolved — close out the generate stage and the run.
  // Upsert: the row may not exist if all items were rejected (markGenerateRunning never called).
  const [existingGenerate] = await db
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(and(eq(pipelineStages.pipelineRunId, runId), eq(pipelineStages.stage, 'generate')));

  if (existingGenerate) {
    await db
      .update(pipelineStages)
      .set({ status: 'completed', completedAt: new Date() })
      .where(and(eq(pipelineStages.pipelineRunId, runId), eq(pipelineStages.stage, 'generate')));
  } else {
    await db.insert(pipelineStages).values({
      pipelineRunId: runId,
      stage: 'generate',
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
    });
  }

  await db
    .update(pipelineRuns)
    .set({ status: 'completed', completedAt: new Date() })
    .where(and(eq(pipelineRuns.id, runId), eq(pipelineRuns.status, 'awaiting_review')));
}
