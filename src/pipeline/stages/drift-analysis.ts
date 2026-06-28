import { db } from '@/db';
import { topics, topicExtractions, driftItems } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { buildDriftPrompt } from '@/pipeline/prompts';
import { computeDriftLevel, computeRepairDecision } from './repair-decision';
import { log } from '@/lib/logger';
import { driftAgent } from '@/mastra';

const DriftAnalysisSchema = z.object({
  changeType: z.enum([
    'NO_CHANGE',
    'MINOR_EDIT',
    'SEMANTIC_CHANGE',
    'MAJOR_RESTRUCTURE',
    'CONTENT_REMOVED',
  ]),
  driftScore: z.number().min(0).max(1),
  requiresRepair: z.boolean(),
  reason: z.string(),
});

export async function driftAnalysisStage(
  runId: string,
  affectedTopicIds: string[],
  sourceVersionId: string
): Promise<void> {
  for (const topicId of affectedTopicIds) {
    const [topic] = await db.select().from(topics).where(eq(topics.id, topicId));

    const extractions = await db
      .select()
      .from(topicExtractions)
      .where(eq(topicExtractions.topicId, topicId))
      .orderBy(desc(topicExtractions.createdAt))
      .limit(2);

    if (extractions.length < 2) {
      log.info('drift_analysis', 'skipping — fewer than 2 extractions', { topic: topic.name });
      continue;
    }

    // extractions[0] = new, extractions[1] = previous
    const newContent = extractions[0].extractedContent;
    const oldContent = extractions[1].extractedContent;

    const { object } = await driftAgent.generate(
      buildDriftPrompt(topic.name, oldContent, newContent),
      { structuredOutput: { schema: DriftAnalysisSchema } }
    );

    if (object.changeType === 'NO_CHANGE') {
      log.info('drift_analysis', 'scorer vetoed — no real change, skipping', {
        topic: topic.name,
      });
      continue;
    }

    const driftLevel = computeDriftLevel(object.driftScore);
    const status = computeRepairDecision(object.driftScore);

    log.info('drift_analysis', 'topic drift result', {
      topic: topic.name,
      changeType: object.changeType,
      driftScore: object.driftScore,
      driftLevel,
      status,
      reason: object.reason,
    });

    await db.insert(driftItems).values({
      pipelineRunId: runId,
      topicId,
      changeType: object.changeType,
      driftScore: object.driftScore,
      driftLevel,
      reason: object.reason,
      status,
    });
  }
}
