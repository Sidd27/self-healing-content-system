import { NextResponse } from 'next/server';
import { db } from '@/db';
import { proposedTopics, topics, pipelineRuns, topicExtractions, sourceVersions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateForTopic } from '@/pipeline/stages/generate';
import { normalizeText, hashContent } from '@/lib/utils';
import { markGenerateRunning, tryCompleteRun } from '@/lib/close-run';
import { extractionAgent } from '@/mastra';
import { buildExtractPrompt } from '@/pipeline/prompts';

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

    // Create the topic
    const [newTopic] = await db
      .insert(topics)
      .values({
        sourceId: run.sourceId,
        name: proposed.name,
        description: proposed.description,
      })
      .returning();

    // Re-extract using buildExtractPrompt so the seeded baseline matches the prompt
    // used by extract-topics stage on every future run (proposed.extractedContent used
    // a different prompt, making hash comparison meaningless).
    const [version] = await db
      .select({ normalizedContent: sourceVersions.normalizedContent })
      .from(sourceVersions)
      .where(eq(sourceVersions.id, proposed.sourceVersionId));
    const rawExtracted = version
      ? (await extractionAgent.generate(buildExtractPrompt(proposed.name, proposed.description, version.normalizedContent))).text
      : proposed.extractedContent;
    const normalized = normalizeText(rawExtracted);
    await db.insert(topicExtractions).values({
      topicId: newTopic.id,
      sourceVersionId: proposed.sourceVersionId,
      extractedContent: normalized,
      contentHash: hashContent(normalized),
    });

    await db
      .update(proposedTopics)
      .set({ status: 'approved', reviewedAt: new Date() })
      .where(eq(proposedTopics.id, id));

    // Generate learning unit from the proposed content
    await markGenerateRunning(proposed.pipelineRunId);
    await generateForTopic(newTopic.id, proposed.sourceVersionId, null);
    await tryCompleteRun(proposed.pipelineRunId);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
