import { BlockId } from './blocks'

export type PlayerLiquidKind = 'none' | 'water' | 'lava'

export interface PlayerLiquidProfile {
  kind: PlayerLiquidKind
  label: string
  speedMultiplier: number
  gravityScale: number
  verticalDrag: number
  swimUpAcceleration: number
  maxSinkSpeed: number
  maxRiseSpeed: number
}

export const PLAYER_LIQUID_PROFILES: Record<PlayerLiquidKind, PlayerLiquidProfile> = {
  none: {
    kind: 'none',
    label: 'Clear',
    speedMultiplier: 1,
    gravityScale: 1,
    verticalDrag: 0,
    swimUpAcceleration: 0,
    maxSinkSpeed: Number.NEGATIVE_INFINITY,
    maxRiseSpeed: Number.POSITIVE_INFINITY,
  },
  water: {
    kind: 'water',
    label: 'In Water',
    speedMultiplier: 0.55,
    gravityScale: 0.18,
    verticalDrag: 3.6,
    swimUpAcceleration: 15,
    maxSinkSpeed: -2.6,
    maxRiseSpeed: 4.2,
  },
  lava: {
    kind: 'lava',
    label: 'In Lava',
    speedMultiplier: 0.35,
    gravityScale: 0.12,
    verticalDrag: 4.8,
    swimUpAcceleration: 9,
    maxSinkSpeed: -1.7,
    maxRiseSpeed: 2.6,
  },
}

export const getPlayerLiquidProfile = (kind: PlayerLiquidKind) => PLAYER_LIQUID_PROFILES[kind]

export const getDominantPlayerLiquidKind = (blockIds: BlockId[]): PlayerLiquidKind => {
  if (blockIds.includes(BlockId.Lava)) {
    return 'lava'
  }

  if (blockIds.includes(BlockId.Water)) {
    return 'water'
  }

  return 'none'
}
