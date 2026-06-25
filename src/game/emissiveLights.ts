import { PointLight, Scene, Vector3 } from 'three'
import type { GraphicsSettings } from './graphicsSettings'
import type { VoxelWorld } from './world'

export interface EmissiveLightsState {
  enabled: boolean
  activeCount: number
  applyGraphicsSettings: (settings: GraphicsSettings) => void
  update: (world: VoxelWorld, focus: Vector3, deltaTime: number, timeOfDay: number) => void
  dispose: () => void
}

const MAX_EMISSIVE_LIGHTS = 12
const SOURCE_RADIUS = 48
const REFRESH_SECONDS = 0.28
const TAU = Math.PI * 2

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const getLocalLightMultiplier = (timeOfDay: number) => {
  const sunHeight = Math.sin(((timeOfDay % 1) + 1) % 1 * TAU - Math.PI / 2)
  const nightFactor = 1 - clamp01((sunHeight + 0.08) / 0.58)

  return 0.34 + nightFactor * 0.88
}

export const configureEmissiveLights = (
  scene: Scene,
  settings: GraphicsSettings,
): EmissiveLightsState => {
  const lights = Array.from({ length: MAX_EMISSIVE_LIGHTS }, () => {
    const light = new PointLight(0xff7a18, 0, 12, 2)
    light.visible = false
    scene.add(light)
    return light
  })
  let refreshAccumulator = REFRESH_SECONDS

  const hideLights = () => {
    for (const light of lights) {
      light.visible = false
      light.intensity = 0
    }
  }

  const state: EmissiveLightsState = {
    enabled: false,
    activeCount: 0,
    applyGraphicsSettings(nextSettings) {
      state.enabled = nextSettings.preset === 'high'
      if (!state.enabled) {
        state.activeCount = 0
        hideLights()
      }
    },
    update(world, focus, deltaTime, timeOfDay) {
      if (!state.enabled) {
        return
      }

      refreshAccumulator += deltaTime
      if (refreshAccumulator < REFRESH_SECONDS) {
        return
      }
      refreshAccumulator = 0

      const sources = world.getEmissiveLightSources(focus.x, focus.y, focus.z, SOURCE_RADIUS, lights.length)
      const lightMultiplier = getLocalLightMultiplier(timeOfDay)

      state.activeCount = sources.length
      for (let index = 0; index < lights.length; index += 1) {
        const light = lights[index]
        const source = sources[index]

        if (!source) {
          light.visible = false
          light.intensity = 0
          continue
        }

        light.visible = true
        light.color.setHex(source.color)
        light.position.set(source.x, source.y + 0.35, source.z)
        light.intensity = source.intensity * lightMultiplier
        light.distance = 9 + Math.min(7, source.count * 0.18 + source.intensity * 2.2)
      }
    },
    dispose() {
      for (const light of lights) {
        scene.remove(light)
      }
    },
  }

  state.applyGraphicsSettings(settings)
  return state
}
