import { db } from '@/db'
import {
  driftItems, topicExtractions, topics, learningUnits,
  learningUnitVersions
} from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { buildGeneratePrompt } from '@/pipeline/prompts'
import { llmModel } from '@/lib/llm'
import { LLM_TIMEOUT_MS } from '@/lib/constants'

const LearningUnitSchema = z.object({
  question: z.string(),
  rationale: z.string(),
  lesson: z.string(),
})

export async function generateStage(
  runId: string,
  sourceVersionId: string,
  firstRunTopicIds: string[] = []
): Promise<void> {
  // Generate for auto-applied drift items (changed topics)
  const autoAppliedItems = await db
    .select()
    .from(driftItems)
    .where(
      and(
        eq(driftItems.pipelineRunId, runId),
        eq(driftItems.status, 'auto_applied')
      )
    )

  for (const item of autoAppliedItems) {
    await generateForTopic(item.topicId, sourceVersionId, item.driftScore)
  }

  // Generate for first-run topics (no drift to compare, generate from scratch)
  for (const topicId of firstRunTopicIds) {
    await generateForTopic(topicId, sourceVersionId, null)
  }
}

export async function generateForTopic(
  topicId: string,
  sourceVersionId: string,
  driftScore: number | null = null
): Promise<void> {
  const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))

  const [latestExtraction] = await db
    .select()
    .from(topicExtractions)
    .where(eq(topicExtractions.topicId, topicId))
    .orderBy(desc(topicExtractions.createdAt))
    .limit(1)

  const { output: object } = await generateText({
    model: llmModel,
    output: Output.object({ schema: LearningUnitSchema }),
    prompt: buildGeneratePrompt(topic.name, topic.description, latestExtraction.extractedContent),
    abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  })

  // Get or create learning unit for this topic
  let [unit] = await db
    .select()
    .from(learningUnits)
    .where(eq(learningUnits.topicId, topicId))
    .limit(1)

  if (!unit) {
    ;[unit] = await db
      .insert(learningUnits)
      .values({ topicId })
      .returning()
  }

  // Archive previous active version
  await db
    .update(learningUnitVersions)
    .set({ status: 'archived' })
    .where(
      and(
        eq(learningUnitVersions.learningUnitId, unit.id),
        eq(learningUnitVersions.status, 'active')
      )
    )

  // Insert new active version
  await db.insert(learningUnitVersions).values({
    learningUnitId: unit.id,
    sourceVersionId,
    question: object.question,
    rationale: object.rationale,
    lesson: object.lesson,
    driftScore,
    status: 'active',
  })
}
