import { NextResponse } from 'next/server'
import { db } from '@/db'
import { learningUnits, learningUnitVersions } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const { topicId } = await params

  const units = await db
    .select({ unit: learningUnits, version: learningUnitVersions })
    .from(learningUnits)
    .innerJoin(
      learningUnitVersions,
      and(
        eq(learningUnitVersions.learningUnitId, learningUnits.id),
        eq(learningUnitVersions.status, 'active')
      )
    )
    .where(eq(learningUnits.topicId, topicId))
    .orderBy(desc(learningUnitVersions.createdAt))

  return NextResponse.json(units)
}
