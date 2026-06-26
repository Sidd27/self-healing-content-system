import { describe, it, expect } from 'vitest'
import { extractFromMd } from '@/lib/extractors/md'

describe('extractFromMd', () => {
  it('strips markdown headings', () => {
    expect(extractFromMd('## Cloud Run\n\nSome content')).toContain('Cloud Run')
    expect(extractFromMd('## Cloud Run\n\nSome content')).not.toContain('##')
  })

  it('strips bold and italic', () => {
    expect(extractFromMd('**bold** and _italic_')).toBe('bold and italic')
  })

  it('strips links but keeps text', () => {
    expect(extractFromMd('[Google](https://google.com)')).toBe('Google')
  })

  it('strips code fences', () => {
    expect(extractFromMd('```\ncode here\n```')).not.toContain('```')
  })
})
