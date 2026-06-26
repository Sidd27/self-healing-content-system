import { normalizeContent, hashContent } from '@/lib/normalize'

export async function normalizeStage(
  _runId: string,
  rawContent: string
): Promise<{ normalized: string; hash: string }> {
  const normalized = normalizeContent(rawContent)
  const hash = hashContent(normalized)
  return { normalized, hash }
}
