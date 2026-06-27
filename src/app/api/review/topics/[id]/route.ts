import { NextResponse } from 'next/server'
import { db } from '@/db'
import { proposedTopics, topics, pipelineRuns, topicExtractions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateForTopic } from '@/pipeline/stages/generate'
import { normalizeContent, hashContent } from '@/lib/normalize'
import { tryCompleteRun } from '@/lib/close-run'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { action } = await req.json() as { action: 'approve' | 'reject' }

  const [proposed] = await db.select().from(proposedTopics).where(eq(proposedTopics.id, id))
  if (!proposed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'reject') {
    await db
      .update(proposedTopics)
      .set({ status: 'rejected', reviewedAt: new Date() })
      .where(eq(proposedTopics.id, id))
    await tryCompleteRun(proposed.pipelineRunId)
    return NextResponse.json({ ok: true })
  }

  if (action === 'approve') {
    const [run] = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, proposed.pipelineRunId))
    if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

    // Create the topic
    const [newTopic] = await db
      .insert(topics)
      .values({
        sourceId: run.sourceId,
        name: proposed.name,
        description: proposed.description,
      })
      .returning()

    // Seed topicExtractions so generateForTopic can find content for this brand-new topic
    const normalized = normalizeContent(proposed.extractedContent)
    await db.insert(topicExtractions).values({
      topicId: newTopic.id,
      sourceVersionId: proposed.sourceVersionId,
      extractedContent: normalized,
      contentHash: hashContent(normalized),
    })

    await db
      .update(proposedTopics)
      .set({ status: 'approved', reviewedAt: new Date() })
      .where(eq(proposedTopics.id, id))

    // Generate learning unit from the proposed content
    await generateForTopic(newTopic.id, proposed.sourceVersionId, null)
    await tryCompleteRun(proposed.pipelineRunId)

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
