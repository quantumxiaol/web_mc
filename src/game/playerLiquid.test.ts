import { describe, expect, it } from 'vitest'
import { BlockId } from './blocks'
import { getDominantPlayerLiquidKind, getPlayerLiquidProfile } from './playerLiquid'

describe('player liquid movement profile', () => {
  it('prioritizes lava over water when both are sampled', () => {
    expect(getDominantPlayerLiquidKind([BlockId.Water, BlockId.Lava])).toBe('lava')
  })

  it('slows water movement less than lava movement', () => {
    const clear = getPlayerLiquidProfile('none')
    const water = getPlayerLiquidProfile('water')
    const lava = getPlayerLiquidProfile('lava')

    expect(water.speedMultiplier).toBeLessThan(clear.speedMultiplier)
    expect(lava.speedMultiplier).toBeLessThan(water.speedMultiplier)
    expect(water.swimUpAcceleration).toBeGreaterThan(lava.swimUpAcceleration)
  })
})
