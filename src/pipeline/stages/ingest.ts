import { db } from '@/db';
import { sources } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { fetchHtml } from '@/lib/parsers/html';
import { extractPdf } from '@/lib/parsers/pdf';
import { CONTENT_MAX_CHARS } from '@/lib/constants';
import { log } from '@/lib/logger';

export async function ingestStage(
  _runId: string,
  sourceId: string
): Promise<{ rawContent: string; sourceType: 'html' | 'pdf' }> {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!source || !source.url) throw new Error(`Source not found or missing URL: ${sourceId}`);

  log.info('ingest', 'fetching source', { type: source.type, url: source.url });

  let rawContent: string;

  if (source.type === 'html') {
    rawContent = await fetchHtml(source.url);
  } else {
    const res = await fetch(source.url);
    if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status} ${source.url}`);
    rawContent = await extractPdf(Buffer.from(await res.arrayBuffer()));
  }

  log.info('ingest', 'fetched', { chars: rawContent.length });

  if (rawContent.length > CONTENT_MAX_CHARS) {
    throw new Error(
      `Content exceeds max length (${rawContent.length} > ${CONTENT_MAX_CHARS} chars). Split the source.`
    );
  }

  return { rawContent, sourceType: source.type };
}
