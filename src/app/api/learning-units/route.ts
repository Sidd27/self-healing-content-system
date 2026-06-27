import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { learningUnits, learningUnitVersions, topics } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const topicId = request.nextUrl.searchParams.get('topicId')

  const conditions = [eq(learningUnitVersions.status, 'active')]
  if (topicId) conditions.push(eq(learningUnits.topicId, topicId))

  const results = await db
    .select({
      learningUnitId: learningUnits.id,
      topicId: learningUnits.topicId,
      topicName: topics.name,
      versionId: learningUnitVersions.id,
      lesson: learningUnitVersions.lesson,
      questions: learningUnitVersions.questions,
      createdAt: learningUnitVersions.createdAt,
    })
    .from(learningUnitVersions)
    .innerJoin(learningUnits, eq(learningUnitVersions.learningUnitId, learningUnits.id))
    .innerJoin(topics, eq(learningUnits.topicId, topics.id))
    .where(and(...conditions))

  return NextResponse.json({ learningUnits: results })
}
