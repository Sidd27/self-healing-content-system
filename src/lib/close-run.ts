import { db } from '@/db';
import { driftItems, proposedTopics, pipelineRuns } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * After each review action, check if all pending items for the run are resolved.
 * If so, mark the run completed.
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

  await db
    .update(pipelineRuns)
    .set({ status: 'completed', completedAt: new Date() })
    .where(and(eq(pipelineRuns.id, runId), eq(pipelineRuns.status, 'awaiting_review')));
}
