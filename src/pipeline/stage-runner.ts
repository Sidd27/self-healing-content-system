import { db } from '@/db';
import { pipelineStages, pipelineRuns } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { log } from '@/lib/logger';

type StageName = (typeof pipelineStages.$inferInsert)['stage'];

export async function runStage<T>(
  pipelineRunId: string,
  stageName: StageName,
  fn: () => Promise<T>,
  opts?: { onResume: () => Promise<T> }
): Promise<T> {
  // Idempotency: if this stage already completed (resume case), skip re-running
  if (opts?.onResume) {
    const [existing] = await db
      .select({ status: pipelineStages.status })
      .from(pipelineStages)
      .where(
        and(eq(pipelineStages.pipelineRunId, pipelineRunId), eq(pipelineStages.stage, stageName))
      );
    if (existing?.status === 'completed') {
      return opts.onResume();
    }
  }

  await db.insert(pipelineStages).values({
    pipelineRunId,
    stage: stageName,
    status: 'running',
    startedAt: new Date(),
  });

  log.info(stageName, 'started', { runId: pipelineRunId });
  const t0 = Date.now();

  try {
    const result = await fn();
    await db
      .update(pipelineStages)
      .set({ status: 'completed', completedAt: new Date() })
      .where(
        and(eq(pipelineStages.pipelineRunId, pipelineRunId), eq(pipelineStages.stage, stageName))
      );
    log.info(stageName, 'completed', { ms: Date.now() - t0 });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db
      .update(pipelineStages)
      .set({ status: 'failed', completedAt: new Date(), error })
      .where(
        and(eq(pipelineStages.pipelineRunId, pipelineRunId), eq(pipelineStages.stage, stageName))
      );
    await db
      .update(pipelineRuns)
      .set({ status: 'failed', completedAt: new Date() })
      .where(eq(pipelineRuns.id, pipelineRunId));
    log.error(stageName, error, err);
    throw err;
  }
}

export async function skipStage(pipelineRunId: string, stageName: StageName) {
  // Idempotency: don't insert duplicate skipped record on resume
  const [existing] = await db
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(
      and(eq(pipelineStages.pipelineRunId, pipelineRunId), eq(pipelineStages.stage, stageName))
    );
  if (existing) return;

  await db.insert(pipelineStages).values({
    pipelineRunId,
    stage: stageName,
    status: 'skipped',
    startedAt: new Date(),
    completedAt: new Date(),
  });
}
