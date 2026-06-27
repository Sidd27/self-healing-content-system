import { db } from '@/db'
import { topics, topicExtractions, driftItems } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { generateText, Output } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import { buildDriftPrompt } from '@/pipeline/prompts'
import { computeDriftLevel, computeRepairDecision } from './repair-decision'

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! })
const model = openrouter('google/gemini-2.0-flash-exp:free')

const DriftAnalysisSchema = z.object({
  changeType: z.enum([
    'NO_CHANGE', 'MINOR_EDIT', 'SEMANTIC_CHANGE', 'MAJOR_RESTRUCTURE', 'CONTENT_REMOVED'
  ]),
  driftScore: z.number().min(0).max(1),
  requiresRepair: z.boolean(),
  reason: z.string(),
})

export async function driftAnalysisStage(
  runId: string,
  affectedTopicIds: string[],
  sourceVersionId: string
): Promise<void> {
  for (const topicId of affectedTopicIds) {
    const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))

    const extractions = await db
      .select()
      .from(topicExtractions)
      .where(eq(topicExtractions.topicId, topicId))
      .orderBy(desc(topicExtractions.createdAt))
      .limit(2)

    // extractions[0] = new, extractions[1] = previous
    const newContent = extractions[0].extractedContent
    const oldContent = extractions[1].extractedContent

    const { output: object } = await generateText({
      model,
      output: Output.object({ schema: DriftAnalysisSchema }),
      prompt: buildDriftPrompt(topic.name, oldContent, newContent),
    })

    const driftLevel = computeDriftLevel(object.driftScore)
    const status = computeRepairDecision(object.driftScore)

    await db.insert(driftItems).values({
      pipelineRunId: runId,
      topicId,
      changeType: object.changeType,
      driftScore: object.driftScore,
      driftLevel,
      reason: object.reason,
      status,
    })
  }
}
