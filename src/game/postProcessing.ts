import { Scene, Vector2, WebGLRenderer, type PerspectiveCamera } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { GraphicsSettings } from './graphicsSettings'

export interface PostProcessingState {
  enabled: boolean
  bloomEnabled: boolean
  applyGraphicsSettings: (settings: GraphicsSettings) => void
  resize: (width: number, height: number, pixelRatio: number) => void
  render: (deltaTime?: number) => void
  dispose: () => void
}

export const configurePostProcessing = (
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  settings: GraphicsSettings,
): PostProcessingState => {
  const composer = new EffectComposer(renderer)
  const renderPass = new RenderPass(scene, camera)
  const bloomPass = new UnrealBloomPass(new Vector2(window.innerWidth, window.innerHeight), 0.32, 0.24, 0.88)
  const outputPass = new OutputPass()

  composer.addPass(renderPass)
  composer.addPass(bloomPass)
  composer.addPass(outputPass)

  const state: PostProcessingState = {
    enabled: false,
    bloomEnabled: false,
    applyGraphicsSettings(nextSettings) {
      state.enabled = nextSettings.bloom
      state.bloomEnabled = nextSettings.bloom
      bloomPass.enabled = nextSettings.bloom
    },
    resize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio)
      composer.setSize(width, height)
      bloomPass.setSize(width, height)
    },
    render(deltaTime) {
      composer.render(deltaTime)
    },
    dispose() {
      composer.dispose()
    },
  }

  state.applyGraphicsSettings(settings)
  state.resize(window.innerWidth, window.innerHeight, renderer.getPixelRatio())
  return state
}
