export type GraphicsPreset = 'low' | 'medium' | 'high'

export interface GraphicsSettings {
  preset: GraphicsPreset
  shadows: boolean
  shadowMapSize: 0 | 1024 | 2048
  maxPixelRatio: number
  bloom: boolean
}

export const GRAPHICS_PRESETS: Record<GraphicsPreset, GraphicsSettings> = {
  low: {
    preset: 'low',
    shadows: false,
    shadowMapSize: 0,
    maxPixelRatio: 1.25,
    bloom: false,
  },
  medium: {
    preset: 'medium',
    shadows: true,
    shadowMapSize: 1024,
    maxPixelRatio: 1.5,
    bloom: false,
  },
  high: {
    preset: 'high',
    shadows: true,
    shadowMapSize: 2048,
    maxPixelRatio: 2,
    bloom: false,
  },
}

export const GRAPHICS_PRESET_ORDER: GraphicsPreset[] = ['low', 'medium', 'high']

export const nextGraphicsPreset = (preset: GraphicsPreset) => {
  const index = GRAPHICS_PRESET_ORDER.indexOf(preset)
  return GRAPHICS_PRESET_ORDER[(index + 1) % GRAPHICS_PRESET_ORDER.length]
}
