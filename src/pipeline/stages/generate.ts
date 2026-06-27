import { db } from '@/db';
import {
  driftItems,
  topicExtractions,
  topics,
  learningUnits,
  learningUnitVersions,
  type McqQuestion,
} from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { buildGeneratePrompt } from '@/pipeline/prompts';
import { log } from '@/lib/logger';
import { generationAgent } from '@/mastra';

const McqSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  rationale: z.string(),
});

const LearningUnitSchema = z.object({
  lesson: z.string(),
  questions: z.array(McqSchema),
});

export async function generateStage(
  runId: string,
  sourceVersionId: string,
  firstRunTopicIds: string[] = []
): Promise<void> {
  const autoAppliedItems = await db
    .select()
    .from(driftItems)
    .where(and(eq(driftItems.pipelineRunId, runId), eq(driftItems.status, 'auto_applied')));

  log.info('generate', 'starting', {
    autoApplied: autoAppliedItems.length,
    firstRun: firstRunTopicIds.length,
  });

  for (const item of autoAppliedItems) {
    await generateForTopic(item.topicId, sourceVersionId, item.driftScore);
  }

  for (const topicId of firstRunTopicIds) {
    await generateForTopic(topicId, sourceVersionId, null);
  }
}

export async function generateForTopic(
  topicId: string,
  sourceVersionId: string,
  driftScore: number | null = null
): Promise<void> {
  const [topic] = await db.select().from(topics).where(eq(topics.id, topicId));

  const [latestExtraction] = await db
    .select()
    .from(topicExtractions)
    .where(eq(topicExtractions.topicId, topicId))
    .orderBy(desc(topicExtractions.createdAt))
    .limit(1);

  log.info('generate', 'generating learning unit', { topic: topic.name, driftScore });

  const { object } = await generationAgent.generate(
    buildGeneratePrompt(topic.name, topic.description, latestExtraction.extractedContent),
    { structuredOutput: { schema: LearningUnitSchema } }
  );

  log.info('generate', 'LLM generated unit', {
    topic: topic.name,
    questions: object.questions.length,
  });

  let [unit] = await db
    .select()
    .from(learningUnits)
    .where(eq(learningUnits.topicId, topicId))
    .limit(1);
  if (!unit) {
    [unit] = await db.insert(learningUnits).values({ topicId }).returning();
  }

  await db
    .update(learningUnitVersions)
    .set({ status: 'archived' })
    .where(
      and(
        eq(learningUnitVersions.learningUnitId, unit.id),
        eq(learningUnitVersions.status, 'active')
      )
    );

  await db.insert(learningUnitVersions).values({
    learningUnitId: unit.id,
    sourceVersionId,
    lesson: object.lesson,
    questions: object.questions as McqQuestion[],
    driftScore,
    status: 'active',
  });
}
