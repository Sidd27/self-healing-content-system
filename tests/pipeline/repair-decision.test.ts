import { describe, it, expect } from 'vitest'
import { computeDriftLevel, computeRepairDecision } from '../../src/pipeline/stages/repair-decision'

describe('computeDriftLevel', () => {
  it('returns low for score < 0.5', () => {
    expect(computeDriftLevel(0.3)).toBe('low')
    expect(computeDriftLevel(0.0)).toBe('low')
  })

  it('returns med for score 0.5 - 0.74', () => {
    expect(computeDriftLevel(0.5)).toBe('med')
    expect(computeDriftLevel(0.74)).toBe('med')
  })

  it('returns high for score >= 0.75', () => {
    expect(computeDriftLevel(0.75)).toBe('high')
    expect(computeDriftLevel(1.0)).toBe('high')
  })
})

describe('computeRepairDecision', () => {
  it('auto-applies low drift', () => {
    expect(computeRepairDecision(0.3)).toBe('auto_applied')
  })

  it('auto-applies medium drift', () => {
    expect(computeRepairDecision(0.6)).toBe('auto_applied')
  })

  it('gates high drift for review', () => {
    expect(computeRepairDecision(0.75)).toBe('pending_review')
    expect(computeRepairDecision(1.0)).toBe('pending_review')
  })
})
