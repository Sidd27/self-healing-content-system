import { NextResponse } from 'next/server';
import { db } from '@/db';
import { driftItems, proposedTopics, topics, pipelineRuns } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const pendingDrift = await db
    .select({ item: driftItems, topic: topics, run: pipelineRuns })
    .from(driftItems)
    .innerJoin(topics, eq(driftItems.topicId, topics.id))
    .innerJoin(pipelineRuns, eq(driftItems.pipelineRunId, pipelineRuns.id))
    .where(eq(driftItems.status, 'pending_review'));

  const pendingTopics = await db
    .select()
    .from(proposedTopics)
    .where(eq(proposedTopics.status, 'pending_approval'));

  return NextResponse.json({ pendingDrift, pendingTopics });
}
