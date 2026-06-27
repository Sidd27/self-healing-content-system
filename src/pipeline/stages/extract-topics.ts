import { db } from '@/db'
import { topics, topicExtractions, proposedTopics } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { normalizeContent, hashContent } from '@/lib/normalize'
import { buildExtractPrompt, buildProposeTopicsPrompt } from '@/pipeline/prompts'
import { llmModel } from '@/lib/llm'

const ProposedTopicsSchema = z.array(z.object({
  name: z.string(),
  description: z.string(),
  extractedContent: z.string(),
}))

export async function extractTopicsStage(
  runId: string,
  sourceId: string,
  sourceVersionId: string,
  normalizedContent: string
): Promise<{ affectedTopicIds: string[]; firstRunTopicIds: string[] }> {
  const sourceTopics = await db
    .select()
    .from(topics)
    .where(eq(topics.sourceId, sourceId))

  const affectedTopicIds: string[] = []
  const firstRunTopicIds: string[] = []

  for (const topic of sourceTopics) {
    const [previousExtraction] = await db
      .select()
      .from(topicExtractions)
      .where(eq(topicExtractions.topicId, topic.id))
      .orderBy(desc(topicExtractions.createdAt))
      .limit(1)

    const { text: extracted } = await generateText({
      model: llmModel,
      prompt: buildExtractPrompt(topic.name, topic.description, normalizedContent),
      temperature: 0,
    })

    const normalizedExtraction = normalizeContent(extracted)
    const extractionHash = hashContent(normalizedExtraction)

    // Skip if hash unchanged from previous extraction
    if (previousExtraction && extractionHash === previousExtraction.contentHash) {
      continue
    }

    await db.insert(topicExtractions).values({
      topicId: topic.id,
      sourceVersionId,
      extractedContent: normalizedExtraction,
      contentHash: extractionHash,
    })

    if (!previousExtraction) {
      firstRunTopicIds.push(topic.id)
    } else {
      affectedTopicIds.push(topic.id)
    }
  }

  // Propose new topics from content not covered by existing topics
  if (sourceTopics.length > 0) {
    const existingNames = sourceTopics.map(t => t.name)
    const { output: proposed } = await generateText({
      model: llmModel,
      output: Output.object({ schema: ProposedTopicsSchema }),
      prompt: buildProposeTopicsPrompt(existingNames, normalizedContent),
    })

    if (proposed.length > 0) {
      await db.insert(proposedTopics).values(
        proposed.map(p => ({
          sourceVersionId,
          pipelineRunId: runId,
          name: p.name,
          description: p.description,
          extractedContent: p.extractedContent,
          status: 'pending_approval' as const,
        }))
      )
    }
  }

  return { affectedTopicIds, firstRunTopicIds }
}
