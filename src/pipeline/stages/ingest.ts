import { db } from '@/db';
import { sources, sourceVersions, pipelineRuns } from '@/db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { fetchHtml, normalizeContent } from '@/lib/parsers/html';
import { extractPdf, parsePdf } from '@/lib/parsers/pdf';
import { hashContent } from '@/lib/utils';
import { CONTENT_MAX_CHARS } from '@/lib/constants';
import { log } from '@/lib/logger';

export async function ingestStage(
  runId: string,
  sourceId: string
): Promise<{ stopped: boolean; sourceVersionId: string; normalized: string }> {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!source || !source.url) throw new Error(`Source not found or missing URL: ${sourceId}`);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  log.info('ingest', 'fetching', { type: source.type, url: source.url });
  let rawContent: string;
  if (source.type === 'html') {
    rawContent = await fetchHtml(source.url);
  } else {
    const res = await fetch(source.url);
    if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status} ${source.url}`);
    rawContent = await extractPdf(Buffer.from(await res.arrayBuffer()));
  }

  if (rawContent.length > CONTENT_MAX_CHARS) {
    throw new Error(`Content exceeds max length (${rawContent.length} > ${CONTENT_MAX_CHARS}). Split the source.`);
  }

  // ── Normalize ────────────────────────────────────────────────────────────────
  const normalized = source.type === 'html' ? normalizeContent(rawContent) : parsePdf(rawContent);
  log.info('ingest', 'normalized', { chars: normalized.length });

  // ── Hash check ───────────────────────────────────────────────────────────────
  const hash = hashContent(normalized);
  const [latest] = await db
    .select()
    .from(sourceVersions)
    .where(eq(sourceVersions.sourceId, sourceId))
    .orderBy(desc(sourceVersions.createdAt))
    .limit(1);

  if (latest && latest.contentHash === hash) {
    const [priorRun] = await db
      .select()
      .from(pipelineRuns)
      .where(and(
        eq(pipelineRuns.sourceVersionId, latest.id),
        inArray(pipelineRuns.status, ['completed', 'awaiting_review'])
      ))
      .limit(1);

    if (priorRun) {
      log.info('ingest', 'same hash, prior run already processed — stopping', {
        status: priorRun.status, hash: hash.slice(0, 12),
      });
      await db.update(pipelineRuns)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(pipelineRuns.id, runId));
      return { stopped: true, sourceVersionId: latest.id, normalized };
    }

    log.info('ingest', 'same hash but prior run failed — reusing version, continuing', { hash: hash.slice(0, 12) });
    await db.update(pipelineRuns).set({ sourceVersionId: latest.id }).where(eq(pipelineRuns.id, runId));
    return { stopped: false, sourceVersionId: latest.id, normalized };
  }

  log.info('ingest', 'new content version', { hash: hash.slice(0, 12) });
  const [newVersion] = await db
    .insert(sourceVersions)
    .values({ sourceId, contentHash: hash, normalizedContent: normalized })
    .returning();

  await db.update(pipelineRuns).set({ sourceVersionId: newVersion.id }).where(eq(pipelineRuns.id, runId));
  return { stopped: false, sourceVersionId: newVersion.id, normalized };
}
