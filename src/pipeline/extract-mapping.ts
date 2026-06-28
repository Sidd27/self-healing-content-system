export type ExistingExtractResult = { index: number; extractedContent: string; drifted: boolean };
export type TopicRef = { id: string; name: string; description: string };
export type DriftedTopic = { id: string; name: string; description: string; extractedContent: string };

export function selectDriftedTopics(
  topics: TopicRef[],
  existing: ExistingExtractResult[]
): DriftedTopic[] {
  const seen = new Set<number>();
  const out: DriftedTopic[] = [];
  for (const e of existing) {
    if (!e.drifted) continue;
    if (e.index < 1 || e.index > topics.length) continue;
    if (seen.has(e.index)) continue;
    seen.add(e.index);
    if (!e.extractedContent || e.extractedContent.trim() === '') continue;
    const t = topics[e.index - 1];
    out.push({ id: t.id, name: t.name, description: t.description, extractedContent: e.extractedContent });
  }
  return out;
}
