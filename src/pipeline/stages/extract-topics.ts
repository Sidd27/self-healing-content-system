import { db } from '@/db';
import { topics, topicExtractions, proposedTopics } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { normalizeText, hashContent } from '@/lib/utils';
import { buildExtractPrompt, buildProposeTopicsPrompt } from '@/pipeline/prompts';
import { embed } from 'ai';
import { embeddingModel } from '@/lib/llm';
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
    const extractionHash = hashContent(normalizedExtraction);

    if (previousExtraction && extractionHash === previousExtraction.contentHash) {
      log.info('extract_topics', 'topic unchanged', { topic: topic.name });
      continue;
    }

    await db.insert(topicExtractions).values({
      topicId: topic.id,
      sourceVersionId,
      extractedContent: normalizedExtraction,
      contentHash: extractionHash,
    });

    if (!previousExtraction) {
      // No prior extraction to diff against — seed the record, defer to next run
      log.info('extract_topics', 'topic seeded (no prior extraction)', { topic: topic.name });
      continue;
    }

    log.info('extract_topics', 'content changed — queued for drift analysis', { topic: topic.name });
    drifted.push({ id: topic.id, name: topic.name, description: topic.description });
  }

  // Step 1: propose all candidate topics unconstrained
  const proposed: TopicSummary[] = [];

  log.info('extract_topics', 'proposing candidate topics', { existingCount: sourceTopics.length });

  const { object: llmProposed } = await extractionAgent.generate(
    buildProposeTopicsPrompt(normalizedContent),
    { structuredOutput: { schema: ProposedTopicsSchema } }
  );

  log.info('extract_topics', 'LLM candidate topics', {
    count: llmProposed.topics.length,
    names: llmProposed.topics.map((p) => p.name),
  });

  // Step 2: deterministic semantic dedup via embedding cosine similarity.
  // Embed each existing topic (name + description) and each candidate, then reject
  // any candidate whose max cosine similarity to an existing topic exceeds 0.75.
  let toInsert = llmProposed.topics;

  if (sourceTopics.length > 0 && llmProposed.topics.length > 0) {
    const cosine = (a: number[], b: number[]) => {
      let dot = 0, nA = 0, nB = 0;
      for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; nA += a[i] ** 2; nB += b[i] ** 2; }
      return dot / (Math.sqrt(nA) * Math.sqrt(nB));
    };

    const existingEmbeddings = await Promise.all(
      sourceTopics.map((t) => embed({ model: embeddingModel, value: `${t.name}: ${t.description}` }).then((r) => r.embedding))
    );

    const filtered: typeof llmProposed.topics = [];
    for (const candidate of llmProposed.topics) {
      const { embedding: ce } = await embed({ model: embeddingModel, value: `${candidate.name}: ${candidate.description}` });
      const maxSim = Math.max(...existingEmbeddings.map((e) => cosine(ce, e)));
      if (maxSim < 0.75) filtered.push(candidate);
    }
    toInsert = filtered;
  }

  log.info('extract_topics', 'dedup result', {
    candidates: llmProposed.topics.length,
    kept: toInsert.length,
    rejected: llmProposed.topics.map((p) => p.name).filter((n) => !toInsert.find((t) => t.name === n)),
  });

  if (toInsert.length > 0) {
    const inserted = await db
      .insert(proposedTopics)
      .values(
        toInsert.map((p) => ({
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
