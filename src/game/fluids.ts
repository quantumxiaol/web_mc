export const FLUID_NONE = 255
export const FLUID_SOURCE_LEVEL = 0
export const FLUID_MAX_LEVEL = 7

const LIQUID_FULL_HEIGHT = 0.86
const LIQUID_MIN_HEIGHT = 0.26

export const fluidLevelToHeight = (level: number) => {
  if (level === FLUID_NONE) {
    return 0
  }

  const clampedLevel = Math.max(FLUID_SOURCE_LEVEL, Math.min(FLUID_MAX_LEVEL, level))
  const progress = clampedLevel / FLUID_MAX_LEVEL
  return LIQUID_FULL_HEIGHT - (LIQUID_FULL_HEIGHT - LIQUID_MIN_HEIGHT) * progress
}
