import { NextResponse } from 'next/server'
import { db } from '@/db'
import { sources } from '@/db/schema'
import { asc } from 'drizzle-orm'

export async function GET() {
  const all = await db.select().from(sources).orderBy(asc(sources.createdAt))
  return NextResponse.json(all)
}

export async function POST(req: Request) {
  const body = await req.json() as { name: string; type: 'url' | 'pdf' | 'md'; url?: string }
  const [source] = await db
    .insert(sources)
    .values({ name: body.name, type: body.type, url: body.url ?? null })
    .returning()
  return NextResponse.json(source, { status: 201 })
}
