import { describe, it, expect } from 'vitest';
import { normalizeText, hashContent } from '../../src/lib/utils';

describe('normalizeText', () => {
  it('collapses whitespace', () => {
    expect(normalizeText('hello   \n\t  world')).toBe('hello world');
  });

  it('lowercases', () => {
    expect(normalizeText('Cloud Run AUTOSCALING')).toBe('cloud run autoscaling');
  });

  it('trims', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeText('')).toBe('');
  });
});

describe('hashContent', () => {
  it('returns same hash for same content', () => {
    expect(hashContent('cloud run autoscaling')).toBe(hashContent('cloud run autoscaling'));
  });

  it('returns different hash for different content', () => {
    expect(hashContent('supports 1000 instances')).not.toBe(hashContent('supports 100 instances'));
  });

  it('is insensitive to extra whitespace', () => {
    expect(hashContent('hello  world')).toBe(hashContent('hello world'));
  });
});
