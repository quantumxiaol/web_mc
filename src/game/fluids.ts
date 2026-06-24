import { BlockId } from './blocks'

export const FLUID_NONE = 255
export const FLUID_SOURCE_LEVEL = 0

export interface FluidRule {
  maxLevel: number
  tickSeconds: number
  maxUpdatesPerTick: number
}

export const FLUID_BLOCK_IDS = [BlockId.Water, BlockId.Lava] as const

const DEFAULT_FLUID_RULE: FluidRule = {
  maxLevel: 6,
  tickSeconds: 0.12,
  maxUpdatesPerTick: 48,
}

const FLUID_RULES: Partial<Record<BlockId, FluidRule>> = {
  [BlockId.Water]: DEFAULT_FLUID_RULE,
  [BlockId.Lava]: {
    maxLevel: 3,
    tickSeconds: 0.45,
    maxUpdatesPerTick: 12,
  },
}

const LIQUID_FULL_HEIGHT = 0.86
const LIQUID_MIN_HEIGHT = 0.26

export const getFluidRule = (blockId: BlockId) => FLUID_RULES[blockId] ?? DEFAULT_FLUID_RULE

export const fluidLevelToHeight = (level: number, maxLevel = DEFAULT_FLUID_RULE.maxLevel) => {
  if (level === FLUID_NONE) {
    return 0
  }

  const clampedMaxLevel = Math.max(1, maxLevel)
  const clampedLevel = Math.max(FLUID_SOURCE_LEVEL, Math.min(clampedMaxLevel, level))
  const progress = clampedLevel / clampedMaxLevel
  return LIQUID_FULL_HEIGHT - (LIQUID_FULL_HEIGHT - LIQUID_MIN_HEIGHT) * progress
}
