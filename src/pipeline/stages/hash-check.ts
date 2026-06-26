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
