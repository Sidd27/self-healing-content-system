import { describe, it, expect } from 'vitest'
import { normalizeContent, hashContent } from '@/lib/normalize'

describe('normalizeContent', () => {
  it('strips HTML tags', () => {
    expect(normalizeContent('<p>Hello <b>world</b></p>')).toBe('hello world')
  })

  it('lowercases text', () => {
    expect(normalizeContent('Cloud Run AUTOSCALING')).toBe('cloud run autoscaling')
  })

  it('collapses whitespace', () => {
    expect(normalizeContent('  foo   bar  \n  baz  ')).toBe('foo bar baz')
  })

  it('trims leading and trailing whitespace', () => {
    expect(normalizeContent('  hello  ')).toBe('hello')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeContent('')).toBe('')
  })

  it('handles mixed HTML and text', () => {
    const input = '<h1>Title</h1>\n<p>Body  text</p>'
    expect(normalizeContent(input)).toBe('title body text')
  })
})

describe('hashContent', () => {
  it('returns a 32-character hex string (MD5)', () => {
    const hash = hashContent('hello world')
    expect(hash).toMatch(/^[0-9a-f]{32}$/)
  })

  it('is deterministic for the same input', () => {
    expect(hashContent('cloud run')).toBe(hashContent('cloud run'))
  })

  it('produces different hashes for different content', () => {
    expect(hashContent('version 1')).not.toBe(hashContent('version 2'))
  })

  it('collapses extra whitespace before hashing (same hash regardless of spacing)', () => {
    expect(hashContent('cloud  run')).toBe(hashContent('cloud run'))
  })

  it('is case-sensitive (operates on already-normalized input)', () => {
    expect(hashContent('Cloud Run')).not.toBe(hashContent('cloud run'))
  })
})
