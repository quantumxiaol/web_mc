import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'

export interface LightingState {
  shadowEnabled: boolean
  shadowMapSize: number
  postFxEnabled: boolean
}

export const configureLighting = (renderer: WebGLRenderer, scene: Scene): LightingState => {
  renderer.outputColorSpace = SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const ambient = new AmbientLight(0xffffff, 0.42)
  scene.add(ambient)

  const skyLight = new HemisphereLight(0xb8dcff, 0x6b4f2a, 0.82)
  scene.add(skyLight)

  const sun = new DirectionalLight(0xfff1c4, 2.2)
  sun.position.set(32, 48, 24)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 120
  sun.shadow.camera.left = -48
  sun.shadow.camera.right = 48
  sun.shadow.camera.top = 48
  sun.shadow.camera.bottom = -48
  scene.add(sun)

  return {
    shadowEnabled: renderer.shadowMap.enabled,
    shadowMapSize: sun.shadow.mapSize.x,
    postFxEnabled: false,
  }
}
