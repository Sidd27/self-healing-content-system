import { NextResponse } from 'next/server';
import { db } from '@/db';
import { topics } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const sourceId = req.nextUrl.searchParams.get('sourceId');

  const rows = sourceId
    ? await db.select().from(topics).where(eq(topics.sourceId, sourceId))
    : await db.select().from(topics);

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = (await req.json()) as { sourceId: string; name: string; description: string };
  const [topic] = await db
    .insert(topics)
    .values({ sourceId: body.sourceId, name: body.name, description: body.description })
    .returning();
  return NextResponse.json(topic, { status: 201 });
}
