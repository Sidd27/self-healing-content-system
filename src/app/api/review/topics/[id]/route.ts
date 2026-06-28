import { NextResponse } from 'next/server';
import { db } from '@/db';
import { proposedTopics, topics, pipelineRuns, topicExtractions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateForTopic } from '@/pipeline/stages/generate';
import { normalizeText } from '@/lib/utils';
import { markGenerateRunning, tryCompleteRun } from '@/lib/close-run';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = (await req.json()) as { action: 'approve' | 'reject' };

  const [proposed] = await db.select().from(proposedTopics).where(eq(proposedTopics.id, id));
  if (!proposed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'reject') {
    await db
      .update(proposedTopics)
      .set({ status: 'rejected', reviewedAt: new Date() })
      .where(eq(proposedTopics.id, id));
    await tryCompleteRun(proposed.pipelineRunId);
    return NextResponse.json({ ok: true });
  }

  if (action === 'approve') {
    const [run] = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, proposed.pipelineRunId));
    if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

    // Idempotent topic creation — handles retries after a failed generation
    let [topic] = await db
      .select()
      .from(topics)
      .where(and(eq(topics.sourceId, run.sourceId), eq(topics.name, proposed.name)));
    if (!topic) {
      [topic] = await db
        .insert(topics)
        .values({ sourceId: run.sourceId, name: proposed.name, description: proposed.description })
        .returning();
    }

    // Seed extraction from the already-approved content (only seed if not already seeded).
    const [existingExtraction] = await db
      .select({ id: topicExtractions.id })
      .from(topicExtractions)
      .where(eq(topicExtractions.topicId, topic.id));
    if (!existingExtraction) {
      await db.insert(topicExtractions).values({
        topicId: topic.id,
        sourceVersionId: proposed.sourceVersionId,
        extractedContent: normalizeText(proposed.extractedContent),
      });
    }

    await db.update(proposedTopics).set({ generationStatus: 'generating' }).where(eq(proposedTopics.id, id));
    await markGenerateRunning(proposed.pipelineRunId);
    try {
      await generateForTopic(topic.id, proposed.sourceVersionId, null);
    } catch (err) {
      console.error('generateForTopic failed for proposed topic', id, err);
      await db.update(proposedTopics).set({ generationStatus: 'failed' }).where(eq(proposedTopics.id, id));
      return NextResponse.json({ error: 'Generation failed — click Retry to try again' }, { status: 500 });
    }

    await db
      .update(proposedTopics)
      .set({ status: 'approved', generationStatus: null, reviewedAt: new Date() })
      .where(eq(proposedTopics.id, id));
    await tryCompleteRun(proposed.pipelineRunId);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
