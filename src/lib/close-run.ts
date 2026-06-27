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
  await db.transaction(async (tx) => {
    // Lock the run row first — serializes concurrent tryCompleteRun calls so only
    // one thread can observe "no pending items" and drive to completion.
    const [run] = await tx
      .select({ status: pipelineRuns.status })
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, runId))
      .for('update');
    if (!run || run.status !== 'awaiting_review') return;

    const [pendingDrift] = await tx
      .select({ id: driftItems.id })
      .from(driftItems)
      .where(and(eq(driftItems.pipelineRunId, runId), eq(driftItems.status, 'pending_review')))
      .limit(1);
    if (pendingDrift) return;

    const [pendingTopic] = await tx
      .select({ id: proposedTopics.id })
      .from(proposedTopics)
      .where(and(eq(proposedTopics.pipelineRunId, runId), eq(proposedTopics.status, 'pending_approval')))
      .limit(1);
    if (pendingTopic) return;

    // All items resolved — upsert generate stage then close the run.
    const [existingGenerate] = await tx
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(and(eq(pipelineStages.pipelineRunId, runId), eq(pipelineStages.stage, 'generate')));

    if (existingGenerate) {
      await tx
        .update(pipelineStages)
        .set({ status: 'completed', completedAt: new Date() })
        .where(and(eq(pipelineStages.pipelineRunId, runId), eq(pipelineStages.stage, 'generate')));
    } else {
      await tx.insert(pipelineStages).values({
        pipelineRunId: runId,
        stage: 'generate',
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
      });
    }

    await tx
      .update(pipelineRuns)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(pipelineRuns.id, runId));
  });
}
