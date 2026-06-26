import { NextResponse } from 'next/server'
import { db } from '@/db'
import { pipelineRuns, pipelineStages, driftItems, proposedTopics, topics } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, id))
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const stages = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineRunId, id))

  const drift = await db
    .select({ item: driftItems, topic: topics })
    .from(driftItems)
    .innerJoin(topics, eq(driftItems.topicId, topics.id))
    .where(eq(driftItems.pipelineRunId, id))

  const proposed = await db
    .select()
    .from(proposedTopics)
    .where(eq(proposedTopics.pipelineRunId, id))

  return NextResponse.json({ ...run, stages, driftItems: drift, proposedTopics: proposed })
}
