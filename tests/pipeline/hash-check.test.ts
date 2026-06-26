import { describe, it, expect } from 'vitest'
import { computeHashCheckResult } from '../../src/pipeline/stages/hash-check'

describe('computeHashCheckResult', () => {
  it('returns stopped=true when hashes match', () => {
    expect(computeHashCheckResult('abc123', 'abc123')).toEqual({ stopped: true })
  })

  it('returns stopped=false when hashes differ', () => {
    expect(computeHashCheckResult('abc123', 'def456')).toEqual({ stopped: false })
  })

  it('returns stopped=false when previousHash is null (first run)', () => {
    expect(computeHashCheckResult('abc123', null)).toEqual({ stopped: false })
  })
})
