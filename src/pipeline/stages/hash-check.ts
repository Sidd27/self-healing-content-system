import { db } from '@/db'
import { sourceVersions, pipelineRuns } from '@/db/schema'
import { eq, desc, and } from 'drizzle-orm'

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
    // Same content — only stop if a prior run actually completed successfully with this version.
    // If all prior runs failed mid-pipeline, re-run the downstream stages using the existing version.
    const [successfulRun] = await db
      .select()
      .from(pipelineRuns)
      .where(and(eq(pipelineRuns.sourceVersionId, latest.id), eq(pipelineRuns.status, 'completed')))
      .limit(1)

    if (successfulRun) {
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
