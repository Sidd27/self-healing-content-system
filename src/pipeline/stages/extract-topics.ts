import { db } from '@/db';
import { topics, topicExtractions, proposedTopics } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { normalizeText } from '@/lib/utils';
import { buildExtractPrompt, buildProposeTopicsPrompt } from '@/pipeline/prompts';
import { selectDriftedTopics } from '@/pipeline/extract-mapping';
import { log } from '@/lib/logger';
import { extractionAgent } from '@/mastra';

const ExtractSchema = z.object({
  existing: z.array(
    z.object({
      index: z.number().int(),
      extractedContent: z.string(),
      drifted: z.boolean(),
    })
  ),
  unmatched: z.array(z.object({ content: z.string() })),
});

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
  new: TopicSummary[];
  drifted: TopicSummary[];
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

  // Load each topic's latest prior extraction — the baseline the model needs to judge drift.
  const topicsWithPrior = await Promise.all(
    sourceTopics.map(async (t) => {
      const [prior] = await db
        .select({ extractedContent: topicExtractions.extractedContent })
        .from(topicExtractions)
        .where(eq(topicExtractions.topicId, t.id))
        .orderBy(desc(topicExtractions.createdAt))
        .limit(1);
      return { name: t.name, description: t.description, priorExtraction: prior?.extractedContent ?? '' };
    })
  );

  // One call: sort the new source against existing topics → existing[] + unmatched[]
  const { object: extracted } = await extractionAgent.generate(
    buildExtractPrompt(topicsWithPrior, normalizedContent),
    { structuredOutput: { schema: ExtractSchema } }
  );

  log.info('extract_topics', 'extract result', {
    existing: extracted.existing.length,
    drifted: extracted.existing.filter((e) => e.drifted).length,
    unmatched: extracted.unmatched.length,
  });

  if (extracted.existing.length < sourceTopics.length) {
    log.warn('extract_topics', 'LLM returned fewer existing entries than topics — some topics may be silently skipped', {
      expected: sourceTopics.length,
      received: extracted.existing.length,
    });
  }

  // Persist a new extraction only for drifted topics; unchanged topics keep their baseline.
  const driftedTopics = selectDriftedTopics(sourceTopics, extracted.existing);
  for (const t of driftedTopics) {
    await db.insert(topicExtractions).values({
      topicId: t.id,
      sourceVersionId,
      extractedContent: normalizeText(t.extractedContent),
    });
  }
  const drifted: TopicSummary[] = driftedTopics.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
  }));

  // Name unmatched content into proposed new topics (one call, only if any).
  const proposed: TopicSummary[] = [];
  const unmatched = extracted.unmatched.map((u) => u.content).filter((c) => c.trim() !== '');

  if (unmatched.length > 0) {
    const { object: llmProposed } = await extractionAgent.generate(
      buildProposeTopicsPrompt(unmatched),
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
        .returning({
          id: proposedTopics.id,
          name: proposedTopics.name,
          description: proposedTopics.description,
        });
      proposed.push(...inserted);
    }
  }

  log.info('extract_topics', 'complete', { new: proposed.length, drifted: drifted.length });

  return { new: proposed, drifted };
}
