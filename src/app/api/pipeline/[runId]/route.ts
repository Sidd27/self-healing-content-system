import { NextResponse } from 'next/server';
import { db } from '@/db';
import { pipelineRuns, pipelineStages, driftItems, proposedTopics, topics } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId));
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const stages = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineRunId, runId));

  const drift = await db
    .select({ item: driftItems, topic: topics })
    .from(driftItems)
    .innerJoin(topics, eq(driftItems.topicId, topics.id))
    .where(eq(driftItems.pipelineRunId, runId));

  const proposed = await db
    .select()
    .from(proposedTopics)
    .where(eq(proposedTopics.pipelineRunId, runId));

  return NextResponse.json({ ...run, stages, driftItems: drift, proposedTopics: proposed });
}
