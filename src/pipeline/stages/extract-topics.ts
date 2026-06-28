import { db } from '@/db';
import { topics, topicExtractions, proposedTopics } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { normalizeText } from '@/lib/utils';
import { buildExtractPrompt, buildProposeTopicsPrompt } from '@/pipeline/prompts';
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

type TopicSummary = { id: string; name: string; description: string };

export type ExtractTopicsResult = {
  new: TopicSummary[];     // proposed topics pending human approval
  drifted: TopicSummary[]; // existing topics with changed content → drift analysis
};

export async function extractTopicsStage(
  runId: string,
  sourceId: string,
  sourceVersionId: string,
  normalizedContent: string
): Promise<ExtractTopicsResult> {
  const sourceTopics = await db.select().from(topics).where(eq(topics.sourceId, sourceId));

  log.info('extract_topics', 'existing topics', {
    count: sourceTopics.length,
    names: sourceTopics.map((t) => t.name),
  });

  const drifted: TopicSummary[] = [];
  // Collect current extraction per topic to inform the proposer what's already covered
  const coveredExtractions: { name: string; content: string }[] = [];

  // Extract content for each existing topic and queue changed ones for drift analysis
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

    coveredExtractions.push({ name: topic.name, content: normalizedExtraction });

    if (previousExtraction && previousExtraction.extractedContent === normalizedExtraction) {
      log.info('extract_topics', 'topic unchanged', { topic: topic.name });
      continue;
    }

    await db.insert(topicExtractions).values({
      topicId: topic.id,
      sourceVersionId,
      extractedContent: normalizedExtraction,
    });

    if (!previousExtraction) {
      // No prior extraction to diff against — seed the record, defer to next run
      log.info('extract_topics', 'topic seeded (no prior extraction)', { topic: topic.name });
      continue;
    }

    log.info('extract_topics', 'content changed — queued for drift analysis', { topic: topic.name });
    drifted.push({ id: topic.id, name: topic.name, description: topic.description });
  }

  // Propose new topics from content not already covered by existing extractions.
  // No embedding dedup needed — the proposer sees exactly what's already extracted.
  const proposed: TopicSummary[] = [];

  log.info('extract_topics', 'proposing new topics from uncovered content', { existingCount: sourceTopics.length });

  const { object: llmProposed } = await extractionAgent.generate(
    buildProposeTopicsPrompt(normalizedContent, coveredExtractions),
    { structuredOutput: { schema: ProposedTopicsSchema } }
  );

  log.info('extract_topics', 'proposed new topics', {
    count: llmProposed.topics.length,
    names: llmProposed.topics.map((p) => p.name),
  });

  if (llmProposed.topics.length > 0) {
    const inserted = await db
      .insert(proposedTopics)
      .values(
        llmProposed.topics.map((p) => ({
          sourceVersionId,
          pipelineRunId: runId,
          name: p.name,
          description: p.description,
          extractedContent: p.extractedContent,
          status: 'pending_approval' as const,
        }))
      )
      .returning({ id: proposedTopics.id, name: proposedTopics.name, description: proposedTopics.description });

    proposed.push(...inserted);
  }

  log.info('extract_topics', 'complete', { new: proposed.length, drifted: drifted.length });

  return { new: proposed, drifted };
}
