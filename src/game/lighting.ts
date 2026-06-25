import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Object3D,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import type { Vector3 } from 'three'
import {
  DAY_CYCLE_SECONDS,
  INITIAL_DAY_TIME,
  advanceDayTime,
  getDayCycleSnapshot,
  type DayCyclePhase,
} from './dayCycle'
import type { GraphicsSettings } from './graphicsSettings'

export interface LightingState {
  shadowEnabled: boolean
  shadowMapSize: number
  postFxEnabled: boolean
  timeOfDay: number
  phase: DayCyclePhase
  cycleSeconds: number
  applyGraphicsSettings: (settings: GraphicsSettings) => void
  setTimeOfDay: (timeOfDay: number) => void
  update: (focus: Vector3, deltaTime?: number) => void
}

export const configureLighting = (
  renderer: WebGLRenderer,
  scene: Scene,
  settings: GraphicsSettings,
): LightingState => {
  renderer.outputColorSpace = SRGBColorSpace
  renderer.shadowMap.type = PCFShadowMap
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const ambient = new AmbientLight(0xffffff, 0.38)
  scene.add(ambient)

  const skyLight = new HemisphereLight(0xb8dcff, 0x6b4f2a, 0.82)
  scene.add(skyLight)

  const sunTarget = new Object3D()
  scene.add(sunTarget)

  const sun = new DirectionalLight(0xfff1c4, 2.2)
  sun.target = sunTarget
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 140
  sun.shadow.camera.left = -56
  sun.shadow.camera.right = 56
  sun.shadow.camera.top = 56
  sun.shadow.camera.bottom = -56
  sun.shadow.bias = -0.00008
  sun.shadow.normalBias = 0.03
  scene.add(sun)

  const applyDayCycleSnapshot = (timeOfDay: number) => {
    const snapshot = getDayCycleSnapshot(timeOfDay)
    scene.background = snapshot.skyColor.clone()

    if (scene.fog instanceof Fog) {
      scene.fog.color.copy(snapshot.fogColor)
      scene.fog.near = snapshot.fogNear
      scene.fog.far = snapshot.fogFar
    }

    ambient.color.copy(snapshot.ambientColor)
    ambient.intensity = snapshot.ambientIntensity
    skyLight.color.copy(snapshot.hemisphereSkyColor)
    skyLight.groundColor.copy(snapshot.hemisphereGroundColor)
    skyLight.intensity = snapshot.hemisphereIntensity
    sun.color.copy(snapshot.sunColor)
    sun.intensity = snapshot.sunIntensity
    renderer.toneMappingExposure = snapshot.exposure

    return snapshot
  }

  let currentSnapshot = applyDayCycleSnapshot(INITIAL_DAY_TIME)

  const state: LightingState = {
    shadowEnabled: false,
    shadowMapSize: 0,
    postFxEnabled: false,
    timeOfDay: currentSnapshot.timeOfDay,
    phase: currentSnapshot.phase,
    cycleSeconds: DAY_CYCLE_SECONDS,
    applyGraphicsSettings(nextSettings) {
      renderer.shadowMap.enabled = nextSettings.shadows
      sun.castShadow = nextSettings.shadows

      if (nextSettings.shadows && nextSettings.shadowMapSize > 0) {
        const previousSize = sun.shadow.mapSize.x
        sun.shadow.mapSize.set(nextSettings.shadowMapSize, nextSettings.shadowMapSize)

        if (previousSize !== nextSettings.shadowMapSize && sun.shadow.map) {
          sun.shadow.map.dispose()
          sun.shadow.map = null
        }
      }

      state.shadowEnabled = renderer.shadowMap.enabled
      state.shadowMapSize = nextSettings.shadows ? nextSettings.shadowMapSize : 0
      state.postFxEnabled = false
    },
    setTimeOfDay(nextTimeOfDay) {
      currentSnapshot = applyDayCycleSnapshot(nextTimeOfDay)
      state.timeOfDay = currentSnapshot.timeOfDay
      state.phase = currentSnapshot.phase
    },
    update(focus, deltaTime = 0) {
      state.setTimeOfDay(advanceDayTime(state.timeOfDay, deltaTime, DAY_CYCLE_SECONDS))
      const sunDistance = 72
      sun.position.set(
        focus.x + currentSnapshot.sunDirection.x * sunDistance,
        focus.y + currentSnapshot.sunDirection.y * sunDistance,
        focus.z + currentSnapshot.sunDirection.z * sunDistance,
      )
      sunTarget.position.set(focus.x, focus.y, focus.z)
      sunTarget.updateMatrixWorld()
    },
  }

  state.applyGraphicsSettings(settings)
  return state
}
