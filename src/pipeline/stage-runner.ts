import { db } from '@/db'
import { pipelineStages, pipelineRuns } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

type StageName = typeof pipelineStages.$inferInsert['stage']

export async function runStage<T>(
  pipelineRunId: string,
  stageName: StageName,
  fn: () => Promise<T>
): Promise<T> {
  await db.insert(pipelineStages).values({
    pipelineRunId,
    stage: stageName,
    status: 'running',
    startedAt: new Date(),
  })

  try {
    const result = await fn()
    await db
      .update(pipelineStages)
      .set({ status: 'completed', completedAt: new Date() })
      .where(
        and(
          eq(pipelineStages.pipelineRunId, pipelineRunId),
          eq(pipelineStages.stage, stageName)
        )
      )
    return result
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await db
      .update(pipelineStages)
      .set({ status: 'failed', completedAt: new Date(), error })
      .where(
        and(
          eq(pipelineStages.pipelineRunId, pipelineRunId),
          eq(pipelineStages.stage, stageName)
        )
      )
    await db
      .update(pipelineRuns)
      .set({ status: 'failed', completedAt: new Date() })
      .where(eq(pipelineRuns.id, pipelineRunId))
    throw err
  }
}

export async function skipStage(pipelineRunId: string, stageName: StageName) {
  await db.insert(pipelineStages).values({
    pipelineRunId,
    stage: stageName,
    status: 'skipped',
    startedAt: new Date(),
    completedAt: new Date(),
  })
}
