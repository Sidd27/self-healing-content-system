import { db } from '@/db'
import { sourceVersions, pipelineRuns } from '@/db/schema'
import { eq, desc, and, inArray } from 'drizzle-orm'

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

  if (latest && latest.contentHash === hash) {
    // Stop if a prior run with this content version already completed or is awaiting review.
    // Only continue if all prior runs failed (content processed but pipeline errored out).
    const [priorRun] = await db
      .select()
      .from(pipelineRuns)
      .where(and(
        eq(pipelineRuns.sourceVersionId, latest.id),
        inArray(pipelineRuns.status, ['completed', 'awaiting_review'])
      ))
      .limit(1)

    if (priorRun) {
      await db
        .update(pipelineRuns)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(pipelineRuns.id, runId))
      return { stopped: true, sourceVersionId: latest.id }
    }

    // Prior run(s) failed — reuse existing version, continue pipeline
    await db
      .update(pipelineRuns)
      .set({ sourceVersionId: latest.id })
      .where(eq(pipelineRuns.id, runId))
    return { stopped: false, sourceVersionId: latest.id }
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
