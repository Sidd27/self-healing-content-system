import { NextResponse } from 'next/server';
import { db } from '@/db';
import {
  sources,
  topics,
  sourceVersions,
  topicExtractions,
  driftItems,
  pipelineRuns,
} from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { generateText } from 'ai';
import { buildExtractPrompt } from '@/pipeline/prompts';
import { llmModel } from '@/lib/llm';
import { normalizeText, hashContent } from '@/lib/utils';
import { LLM_TIMEOUT_MS } from '@/lib/constants';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { name?: unknown; description?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { name, description } = body as { name?: string; description?: string };

  if (!name?.trim() || !description?.trim()) {
    return NextResponse.json({ error: 'name and description are required' }, { status: 400 });
  }

  const [source] = await db.select().from(sources).where(eq(sources.id, id));
  if (!source) return NextResponse.json({ error: 'Source not found' }, { status: 404 });

  // Need a completed pipeline run to have normalized content to extract from
  const [latestRun] = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.sourceId, id))
    .orderBy(desc(pipelineRuns.triggeredAt))
    .limit(1);

  if (!latestRun?.sourceVersionId) {
    return NextResponse.json(
      {
        error: 'No completed pipeline run found. Run the pipeline first to ingest source content.',
      },
      { status: 409 }
    );
  }

  const [sv] = await db
    .select()
    .from(sourceVersions)
    .where(eq(sourceVersions.id, latestRun.sourceVersionId));
  if (!sv) return NextResponse.json({ error: 'Source version not found' }, { status: 500 });

  // Create the topic
  const [topic] = await db
    .insert(topics)
    .values({ sourceId: id, name: name.trim(), description: description.trim() })
    .returning();

  // Run extraction in background, create pending_review drift item
  (async () => {
    try {
      const { text: extracted } = await generateText({
        model: llmModel,
        prompt: buildExtractPrompt(topic.name, topic.description, sv.normalizedContent),
        temperature: 0,
        abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      });

      const normalizedExtraction = normalizeText(extracted);
      const extractionHash = hashContent(normalizedExtraction);

      await db.insert(topicExtractions).values({
        topicId: topic.id,
        sourceVersionId: sv.id,
        extractedContent: normalizedExtraction,
        contentHash: extractionHash,
      });

      await db.insert(driftItems).values({
        pipelineRunId: latestRun.id,
        topicId: topic.id,
        changeType: 'FIRST_EXTRACTION',
        driftScore: 0.0,
        driftLevel: 'low',
        reason:
          'Manually added topic — extracted content requires human approval before generating learning unit.',
        status: 'pending_review',
      });
    } catch (err) {
      console.error('Topic extraction failed for', topic.id, err);
    }
  })();

  return NextResponse.json({ topicId: topic.id }, { status: 202 });
}
