import { db } from '@/db';
import { pipelineRuns, sourceVersions, topics, topicExtractions, driftItems } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { runStage, skipStage } from './stage-runner';
import { ingestStage } from './stages/ingest';
import { extractTopicsStage } from './stages/extract-topics';
import { driftAnalysisStage } from './stages/drift-analysis';
import { repairDecisionStage } from './stages/repair-decision';
import { generateStage } from './stages/generate';

export async function runPipeline(runId: string, sourceId: string): Promise<void> {
  // ── Ingest (fetch + normalize + hash check) ───────────────────────────────
  const { stopped, sourceVersionId, normalized } = await runStage(
    runId,
    'ingest',
    () => ingestStage(runId, sourceId),
    {
      onResume: async () => {
        const [run] = await db
          .select({ sourceVersionId: pipelineRuns.sourceVersionId })
          .from(pipelineRuns)
          .where(eq(pipelineRuns.id, runId));
        if (!run?.sourceVersionId)
          throw new Error(`sourceVersionId missing after ingest for run ${runId}`);
        const [version] = await db
          .select({ normalizedContent: sourceVersions.normalizedContent })
          .from(sourceVersions)
          .where(eq(sourceVersions.id, run.sourceVersionId));
        return { stopped: false, sourceVersionId: run.sourceVersionId, normalized: version.normalizedContent };
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
  const { drifted } = await runStage(
    runId,
    'extract_topics',
    () => extractTopicsStage(runId, sourceId, sourceVersionId, normalized),
    {
      onResume: async () => {
        // Reconstruct drifted list from DB: existing topics extracted this version with a prior extraction
        const sourceTopics = await db.select().from(topics).where(eq(topics.sourceId, sourceId));
        const drifted: { id: string; name: string; description: string }[] = [];
        for (const topic of sourceTopics) {
          const extractions = await db
            .select()
            .from(topicExtractions)
            .where(eq(topicExtractions.topicId, topic.id))
            .orderBy(desc(topicExtractions.createdAt));
          const extractedThisVersion = extractions.some((e) => e.sourceVersionId === sourceVersionId);
          const hasPriorVersion = extractions.some((e) => e.sourceVersionId !== sourceVersionId);
          if (extractedThisVersion && hasPriorVersion) {
            drifted.push({ id: topic.id, name: topic.name, description: topic.description });
          }
        }
        return { new: [], drifted };
      },
    }
  );

  if (drifted.length > 0) {
    await runStage(
      runId,
      'drift_analysis',
      () => driftAnalysisStage(runId, drifted.map((t) => t.id), sourceVersionId),
      { onResume: async () => {} }
    );
  } else {
    await skipStage(runId, 'drift_analysis');
  }

  const { paused } = await runStage(runId, 'repair_decision', () => repairDecisionStage(runId), {
    onResume: async () => {
      // Read current pending state — don't re-run the stage (avoids resetting run status)
      const [pendingDrift] = await db
        .select({ id: driftItems.id })
        .from(driftItems)
        .where(and(eq(driftItems.pipelineRunId, runId), eq(driftItems.status, 'pending_review')))
        .limit(1);
      return { paused: !!pendingDrift };
    },
  });
  if (paused) {
    // Leave generate as pending — it will run as high-drift items are approved via review API
  } else {
    await runStage(runId, 'generate', () => generateStage(runId, sourceVersionId), {
      onResume: async () => {},
    });
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
