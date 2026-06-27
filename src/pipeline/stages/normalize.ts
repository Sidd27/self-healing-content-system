import { normalizeContent } from '@/lib/parsers/html';
import { parsePdf } from '@/lib/parsers/pdf';

export async function normalizeStage(
  _runId: string,
  rawContent: string,
  sourceType: 'html' | 'pdf'
): Promise<{ normalized: string }> {
  const normalized = sourceType === 'html' ? normalizeContent(rawContent) : parsePdf(rawContent);
  return { normalized };
}
