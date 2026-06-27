import { db } from '@/db';
import { topics, topicExtractions, proposedTopics, driftItems } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { normalizeText, hashContent } from '@/lib/utils';
import { buildExtractPrompt, buildProposeTopicsPrompt } from '@/pipeline/prompts';
import { computeDriftLevel } from './repair-decision';
import { log } from '@/lib/logger';
import { extractionAgent } from '@/mastra';

// Wrapped in an object — bare z.array at the top level causes silent empty
// responses from smaller models with structured output
const ProposedTopicsSchema = z.object({
  topics: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      extractedContent: z.string(),
    })
  ),
});

export async function extractTopicsStage(
  runId: string,
  sourceId: string,
  sourceVersionId: string,
  normalizedContent: string
): Promise<{
  affectedTopicIds: string[];
  firstRunTopicIds: string[];
  proposedCount: number;
}> {
  const sourceTopics = await db.select().from(topics).where(eq(topics.sourceId, sourceId));

  log.info('extract_topics', 'existing topics', {
    count: sourceTopics.length,
    names: sourceTopics.map((t) => t.name),
  });

  const affectedTopicIds: string[] = [];
  const firstRunTopicIds: string[] = [];

  for (const topic of sourceTopics) {
    const [previousExtraction] = await db
      .select()
      .from(topicExtractions)
      .where(eq(topicExtractions.topicId, topic.id))
      .orderBy(desc(topicExtractions.createdAt))
      .limit(1);

    const { text: extracted } = await extractionAgent.generate(
      buildExtractPrompt(topic.name, topic.description, normalizedContent)
    );

    const normalizedExtraction = normalizeText(extracted);
    const extractionHash = hashContent(normalizedExtraction);

    // Skip if hash unchanged from previous extraction
    if (previousExtraction && extractionHash === previousExtraction.contentHash) {
      log.info('extract_topics', 'topic unchanged — skipping', {
        topic: topic.name,
      });
      continue;
    }

    await db.insert(topicExtractions).values({
      topicId: topic.id,
      sourceVersionId,
      extractedContent: normalizedExtraction,
      contentHash: extractionHash,
    });

    if (!previousExtraction) {
      log.info('extract_topics', 'first extraction', { topic: topic.name });
      firstRunTopicIds.push(topic.id);
      // Create a pending_review drift item so repair_decision pauses for human approval
      await db.insert(driftItems).values({
        pipelineRunId: runId,
        topicId: topic.id,
        changeType: 'FIRST_EXTRACTION',
        driftScore: 0.0,
        driftLevel: computeDriftLevel(0.0),
        reason: 'First extraction — requires human approval before generating learning unit.',
        status: 'pending_review',
      });
    } else {
      log.info('extract_topics', 'content changed — queued for drift analysis', {
        topic: topic.name,
      });
      affectedTopicIds.push(topic.id);
    }
  }

  log.info('extract_topics', 'calling LLM to propose new topics', {
    existingCount: sourceTopics.length,
  });

  // Always scan for topics not covered by existing ones (existingNames=[] means propose for all content)
  let proposedCount = 0;
  const existingNames = sourceTopics.map((t) => t.name);
  const { object: proposed } = await extractionAgent.generate(
    buildProposeTopicsPrompt(existingNames, normalizedContent),
    { structuredOutput: { schema: ProposedTopicsSchema } }
  );

  log.info('extract_topics', 'LLM proposed topics', {
    count: proposed.topics.length,
    names: proposed.topics.map((p) => p.name),
  });

  if (proposed.topics.length > 0) {
    proposedCount = proposed.topics.length;
    await db.insert(proposedTopics).values(
      proposed.topics.map((p) => ({
        sourceVersionId,
        pipelineRunId: runId,
        name: p.name,
        description: p.description,
        extractedContent: p.extractedContent,
        status: 'pending_approval' as const,
      }))
    );
  }

  return { affectedTopicIds, firstRunTopicIds, proposedCount };
}
