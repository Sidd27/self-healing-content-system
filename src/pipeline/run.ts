import { db } from '@/db';
import { pipelineRuns, topics, topicExtractions } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { runStage, skipStage } from './stage-runner';
import { ingestStage } from './stages/ingest';
import { normalizeStage } from './stages/normalize';
import { hashCheckStage } from './stages/hash-check';
import { extractTopicsStage } from './stages/extract-topics';
import { driftAnalysisStage } from './stages/drift-analysis';
import { repairDecisionStage } from './stages/repair-decision';
import { generateStage } from './stages/generate';

export async function runPipeline(runId: string, sourceId: string): Promise<void> {
  // ── Ingest ────────────────────────────────────────────────────────────────
  const { rawContent, sourceType } = await runStage(
    runId,
    'ingest',
    () => ingestStage(runId, sourceId),
    { onResume: () => ingestStage(runId, sourceId) }
  );

  // ── Normalize ─────────────────────────────────────────────────────────────
  const { normalized } = await runStage(
    runId,
    'normalize',
    () => normalizeStage(runId, rawContent, sourceType),
    { onResume: () => normalizeStage(runId, rawContent, sourceType) }
  );

  // ── Hash Check ────────────────────────────────────────────────────────────
  const { stopped, sourceVersionId } = await runStage(
    runId,
    'hash_check',
    () => hashCheckStage(runId, sourceId, normalized),
    {
      onResume: async () => {
        const [run] = await db
          .select({ sourceVersionId: pipelineRuns.sourceVersionId })
          .from(pipelineRuns)
          .where(eq(pipelineRuns.id, runId));
        if (!run?.sourceVersionId)
          throw new Error(`sourceVersionId missing after hash_check for run ${runId}`);
        return { stopped: false, sourceVersionId: run.sourceVersionId };
      },
    }
  );

  if (stopped) {
    await skipStage(runId, 'extract_topics');
    await skipStage(runId, 'drift_analysis');
    await skipStage(runId, 'repair_decision');
    await skipStage(runId, 'generate');
    return;
  }

  // ── Extract Topics ────────────────────────────────────────────────────────
  const { affectedTopicIds, firstRunTopicIds } = await runStage(
    runId,
    'extract_topics',
    () => extractTopicsStage(runId, sourceId, sourceVersionId, normalized),
    {
      onResume: async () => {
        // Reconstruct from topicExtractions — works even if drift_analysis never ran
        const sourceTopics = await db.select().from(topics).where(eq(topics.sourceId, sourceId));
        const firstRunTopicIds: string[] = [];
        const affectedTopicIds: string[] = [];
        for (const topic of sourceTopics) {
          const extractions = await db
            .select()
            .from(topicExtractions)
            .where(eq(topicExtractions.topicId, topic.id))
            .orderBy(desc(topicExtractions.createdAt));
          const wasExtractedThisVersion = extractions.some(
            (e) => e.sourceVersionId === sourceVersionId
          );
          if (!wasExtractedThisVersion) continue;
          const hadPriorVersion = extractions.some((e) => e.sourceVersionId !== sourceVersionId);
          if (hadPriorVersion) {
            affectedTopicIds.push(topic.id);
          } else {
            firstRunTopicIds.push(topic.id);
          }
        }
        return { affectedTopicIds, firstRunTopicIds, proposedCount: 0 };
      },
    }
  );

  if (affectedTopicIds.length === 0) {
    await skipStage(runId, 'drift_analysis');
    const { paused } = await runStage(runId, 'repair_decision', () => repairDecisionStage(runId), {
      onResume: () => repairDecisionStage(runId),
    });
    if (paused) {
      await skipStage(runId, 'generate');
    } else {
      await runStage(
        runId,
        'generate',
        () => generateStage(runId, sourceVersionId, firstRunTopicIds),
        { onResume: async () => {} }
      );
    }
  } else {
    await runStage(
      runId,
      'drift_analysis',
      () => driftAnalysisStage(runId, affectedTopicIds, sourceVersionId),
      { onResume: async () => {} }
    );
    const { paused } = await runStage(runId, 'repair_decision', () => repairDecisionStage(runId), {
      onResume: () => repairDecisionStage(runId),
    });
    if (paused) {
      await skipStage(runId, 'generate');
    } else {
      await runStage(
        runId,
        'generate',
        () => generateStage(runId, sourceVersionId, firstRunTopicIds),
        { onResume: async () => {} }
      );
    }
  }

  // Only mark completed if repair_decision didn't already set awaiting_review
  const [current] = await db
    .select({ status: pipelineRuns.status })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.id, runId));
  if (current?.status === 'running') {
    await db
      .update(pipelineRuns)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(pipelineRuns.id, runId));
  } else {
    await db
      .update(pipelineRuns)
      .set({ completedAt: new Date() })
      .where(eq(pipelineRuns.id, runId));
  }
}
