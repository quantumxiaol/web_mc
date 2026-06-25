import { describe, expect, it } from 'vitest'
import { advanceDayTime, getDayCycleSnapshot } from './dayCycle'

describe('day cycle', () => {
  it('wraps normalized time after a full cycle', () => {
    expect(advanceDayTime(0.9, 30, 100)).toBeCloseTo(0.2)
  })

  it('makes noon brighter than midnight', () => {
    const midnight = getDayCycleSnapshot(0)
    const noon = getDayCycleSnapshot(0.5)

    expect(noon.phase).toBe('day')
    expect(midnight.phase).toBe('night')
    expect(noon.sunDirection.y).toBeGreaterThan(0.9)
    expect(midnight.sunDirection.y).toBeLessThan(-0.9)
    expect(noon.sunIntensity).toBeGreaterThan(midnight.sunIntensity)
    expect(noon.ambientIntensity).toBeGreaterThan(midnight.ambientIntensity)
  })
})
