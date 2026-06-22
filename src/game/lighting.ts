import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Object3D,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import type { Vector3 } from 'three'
import type { GraphicsSettings } from './graphicsSettings'

export interface LightingState {
  shadowEnabled: boolean
  shadowMapSize: number
  postFxEnabled: boolean
  applyGraphicsSettings: (settings: GraphicsSettings) => void
  update: (focus: Vector3) => void
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

  const state: LightingState = {
    shadowEnabled: false,
    shadowMapSize: 0,
    postFxEnabled: false,
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
    update(focus) {
      sun.position.set(focus.x + 32, focus.y + 48, focus.z + 24)
      sunTarget.position.set(focus.x, focus.y, focus.z)
      sunTarget.updateMatrixWorld()
    },
  }

  state.applyGraphicsSettings(settings)
  return state
}
