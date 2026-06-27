import { NextResponse } from 'next/server'
import { db } from '@/db'
import { pipelineRuns, sources } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET() {
  const runs = await db
    .select({
      id: pipelineRuns.id,
      status: pipelineRuns.status,
      triggeredAt: pipelineRuns.triggeredAt,
      completedAt: pipelineRuns.completedAt,
      sourceId: pipelineRuns.sourceId,
      sourceName: sources.name,
    })
    .from(pipelineRuns)
    .innerJoin(sources, eq(pipelineRuns.sourceId, sources.id))
    .orderBy(desc(pipelineRuns.triggeredAt))

  return NextResponse.json({ runs })
}
