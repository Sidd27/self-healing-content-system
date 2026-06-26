import { describe, it, expect } from 'vitest'
import { normalizeContent, hashContent } from '../../src/lib/normalize'

describe('normalizeContent', () => {
  it('strips HTML tags', () => {
    expect(normalizeContent('<p>Hello <b>world</b></p>')).toBe('hello world')
  })

  it('collapses whitespace', () => {
    expect(normalizeContent('hello   \n\t  world')).toBe('hello world')
  })

  it('lowercases', () => {
    expect(normalizeContent('Cloud Run AUTOSCALING')).toBe('cloud run autoscaling')
  })

  it('trims', () => {
    expect(normalizeContent('  hello  ')).toBe('hello')
  })
})

describe('hashContent', () => {
  it('returns same hash for same content', () => {
    const a = hashContent('cloud run autoscaling supports 1000 instances')
    const b = hashContent('cloud run autoscaling supports 1000 instances')
    expect(a).toBe(b)
  })

  it('returns different hash for different content', () => {
    const a = hashContent('supports 1000 instances')
    const b = hashContent('supports 100 instances')
    expect(a).not.toBe(b)
  })

  it('is insensitive to extra whitespace before hashing', () => {
    const a = hashContent('hello  world')
    const b = hashContent('hello world')
    expect(a).toBe(b)
  })
})
