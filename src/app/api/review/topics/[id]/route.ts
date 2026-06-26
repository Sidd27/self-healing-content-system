import { NextResponse } from 'next/server'
import { db } from '@/db'
import { proposedTopics, topics, pipelineRuns } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateForTopic } from '@/pipeline/stages/generate'

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
    return NextResponse.json({ ok: true })
  }

  if (action === 'approve') {
    const [run] = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, proposed.pipelineRunId))

    // Create the topic
    const [newTopic] = await db
      .insert(topics)
      .values({
        sourceId: run.sourceId,
        name: proposed.name,
        description: proposed.description,
      })
      .returning()

    await db
      .update(proposedTopics)
      .set({ status: 'approved', reviewedAt: new Date() })
      .where(eq(proposedTopics.id, id))

    // Generate learning unit from the proposed content
    await generateForTopic(newTopic.id, proposed.sourceVersionId, null)

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
