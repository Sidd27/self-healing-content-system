import { NextResponse } from 'next/server'
import { db } from '@/db'
import { topics, sources } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const all = await db
    .select({ topic: topics, source: sources })
    .from(topics)
    .innerJoin(sources, eq(topics.sourceId, sources.id))
    .orderBy(sources.name, topics.name)
  return NextResponse.json(all)
}
