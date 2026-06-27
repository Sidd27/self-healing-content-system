import { db } from '@/db'
import { topics, topicExtractions, proposedTopics, driftItems } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { normalizeContent, hashContent } from '@/lib/normalize'
import { buildExtractPrompt, buildProposeTopicsPrompt } from '@/pipeline/prompts'
import { llmModel } from '@/lib/llm'
import { LLM_TIMEOUT_MS } from '@/lib/constants'
import { computeDriftLevel } from './repair-decision'

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
): Promise<{ affectedTopicIds: string[]; firstRunTopicIds: string[]; proposedCount: number }> {
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
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
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
      // Create a pending_review drift item so repair_decision pauses for human approval
      await db.insert(driftItems).values({
        pipelineRunId: runId,
        topicId: topic.id,
        changeType: 'FIRST_EXTRACTION',
        driftScore: 0.0,
        driftLevel: computeDriftLevel(0.0),
        reason: 'First extraction — requires human approval before generating learning unit.',
        status: 'pending_review',
      })
    } else {
      affectedTopicIds.push(topic.id)
    }
  }

  // Always scan for topics not covered by existing ones (existingNames=[] means propose for all content)
  let proposedCount = 0
  const existingNames = sourceTopics.map(t => t.name)
  const { output: proposed } = await generateText({
    model: llmModel,
    output: Output.object({ schema: ProposedTopicsSchema }),
    prompt: buildProposeTopicsPrompt(existingNames, normalizedContent),
    abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  })

  if (proposed.length > 0) {
    proposedCount = proposed.length
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

  return { affectedTopicIds, firstRunTopicIds, proposedCount }
}
