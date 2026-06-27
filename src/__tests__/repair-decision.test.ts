import { describe, it, expect } from 'vitest'
import { computeDriftLevel, computeRepairDecision } from '@/pipeline/stages/repair-decision'
import { DRIFT_HIGH_THRESHOLD } from '@/lib/constants'

describe('computeDriftLevel', () => {
  it('returns low for scores below 0.5', () => {
    expect(computeDriftLevel(0)).toBe('low')
    expect(computeDriftLevel(0.3)).toBe('low')
    expect(computeDriftLevel(0.49)).toBe('low')
  })

  it('returns med for scores 0.5 to just below threshold (0.75)', () => {
    expect(computeDriftLevel(0.5)).toBe('med')
    expect(computeDriftLevel(0.6)).toBe('med')
    expect(computeDriftLevel(DRIFT_HIGH_THRESHOLD - 0.001)).toBe('med')
  })

  it('returns high at and above the drift threshold (0.75)', () => {
    expect(computeDriftLevel(DRIFT_HIGH_THRESHOLD)).toBe('high')
    expect(computeDriftLevel(0.9)).toBe('high')
    expect(computeDriftLevel(1.0)).toBe('high')
  })
})

describe('computeRepairDecision', () => {
  it('returns auto_applied for scores below threshold', () => {
    expect(computeRepairDecision(0)).toBe('auto_applied')
    expect(computeRepairDecision(0.5)).toBe('auto_applied')
    expect(computeRepairDecision(DRIFT_HIGH_THRESHOLD - 0.001)).toBe('auto_applied')
  })

  it('returns pending_review at and above the drift threshold', () => {
    expect(computeRepairDecision(DRIFT_HIGH_THRESHOLD)).toBe('pending_review')
    expect(computeRepairDecision(0.9)).toBe('pending_review')
    expect(computeRepairDecision(1.0)).toBe('pending_review')
  })

  it('threshold boundary is exactly DRIFT_HIGH_THRESHOLD (0.75)', () => {
    expect(DRIFT_HIGH_THRESHOLD).toBe(0.75)
    expect(computeRepairDecision(0.74999)).toBe('auto_applied')
    expect(computeRepairDecision(0.75)).toBe('pending_review')
  })
})
