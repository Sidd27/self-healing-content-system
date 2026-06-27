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
  }

  // Only high-drift items block Generate — proposals are reviewed separately
  // (approved proposals spawn their own generate via the review API)
  return { paused: hasPendingReview }
}
