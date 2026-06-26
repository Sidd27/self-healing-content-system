import { NextResponse } from 'next/server'
import { db } from '@/db'
import { sources, topics, sourceVersions, pipelineRuns } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const [source] = await db.select().from(sources).where(eq(sources.id, id))
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sourceTopics = await db.select().from(topics).where(eq(topics.sourceId, id))
  const versions = await db
    .select()
    .from(sourceVersions)
    .where(eq(sourceVersions.sourceId, id))
    .orderBy(desc(sourceVersions.createdAt))
  const runs = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.sourceId, id))
    .orderBy(desc(pipelineRuns.triggeredAt))

  return NextResponse.json({ ...source, topics: sourceTopics, versions, runs })
}
