import { describe, it, expect } from 'vitest';
import { selectDriftedTopics } from '../../src/pipeline/extract-mapping';

const topics = [
  { id: 't1', name: 'A', description: 'da' },
  { id: 't2', name: 'B', description: 'db' },
  { id: 't3', name: 'C', description: 'dc' },
];

describe('selectDriftedTopics', () => {
  it('returns only drifted topics, mapped by 1-based index', () => {
    const result = selectDriftedTopics(topics, [
      { index: 1, extractedContent: 'new A', drifted: true },
      { index: 2, extractedContent: 'new B', drifted: false },
      { index: 3, extractedContent: 'new C', drifted: true },
    ]);
    expect(result).toEqual([
      { id: 't1', name: 'A', description: 'da', extractedContent: 'new A' },
      { id: 't3', name: 'C', description: 'dc', extractedContent: 'new C' },
    ]);
  });

  it('ignores out-of-range indices', () => {
    const result = selectDriftedTopics(topics, [
      { index: 0, extractedContent: 'x', drifted: true },
      { index: 9, extractedContent: 'y', drifted: true },
      { index: 2, extractedContent: 'new B', drifted: true },
    ]);
    expect(result).toEqual([
      { id: 't2', name: 'B', description: 'db', extractedContent: 'new B' },
    ]);
  });

  it('drops drifted entries with empty/whitespace content', () => {
    const result = selectDriftedTopics(topics, [
      { index: 1, extractedContent: '   ', drifted: true },
      { index: 2, extractedContent: 'real', drifted: true },
    ]);
    expect(result).toEqual([
      { id: 't2', name: 'B', description: 'db', extractedContent: 'real' },
    ]);
  });

  it('keeps first when an index is duplicated', () => {
    const result = selectDriftedTopics(topics, [
      { index: 1, extractedContent: 'first', drifted: true },
      { index: 1, extractedContent: 'second', drifted: true },
    ]);
    expect(result).toEqual([
      { id: 't1', name: 'A', description: 'da', extractedContent: 'first' },
    ]);
  });

  it('returns empty when nothing drifted', () => {
    expect(
      selectDriftedTopics(topics, [{ index: 1, extractedContent: 'x', drifted: false }])
    ).toEqual([]);
  });
});
