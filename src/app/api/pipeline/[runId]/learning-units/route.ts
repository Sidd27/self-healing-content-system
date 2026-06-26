import { NextResponse } from 'next/server'
import { db } from '@/db'
import { learningUnits, learningUnitVersions, topics, pipelineRuns, sourceVersions } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params

  // Get sourceVersionId from the run
  const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId))
  if (!run || !run.sourceVersionId) {
    return NextResponse.json({ error: 'Run not found or no source version' }, { status: 404 })
  }

  // Get the sourceId from the sourceVersion
  const [sv] = await db.select().from(sourceVersions).where(eq(sourceVersions.id, run.sourceVersionId))
  if (!sv) {
    return NextResponse.json({ error: 'Source version not found' }, { status: 404 })
  }

  // Get all active learning unit versions for topics belonging to this run's source
  const results = await db
    .select({
      learningUnitId: learningUnits.id,
      topicId: learningUnits.topicId,
      topicName: topics.name,
      versionId: learningUnitVersions.id,
      question: learningUnitVersions.question,
      rationale: learningUnitVersions.rationale,
      lesson: learningUnitVersions.lesson,
      status: learningUnitVersions.status,
      createdAt: learningUnitVersions.createdAt,
    })
    .from(learningUnitVersions)
    .innerJoin(learningUnits, eq(learningUnitVersions.learningUnitId, learningUnits.id))
    .innerJoin(topics, eq(learningUnits.topicId, topics.id))
    .where(
      and(
        eq(topics.sourceId, sv.sourceId),
        eq(learningUnitVersions.status, 'active')
      )
    )

  return NextResponse.json({ learningUnits: results })
}
