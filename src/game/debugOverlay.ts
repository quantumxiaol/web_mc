import type { PerspectiveCamera, WebGLRenderer } from 'three'
import type { DayCyclePhase } from './dayCycle'
import type { GraphicsPreset } from './graphicsSettings'
import { CHUNK_SIZE, LOAD_RADIUS, WORLD_HEIGHT, type VoxelWorld } from './world'

export interface DebugOverlayState {
  enabled: boolean
  fps: number
  frameMs: number
  mode: string
  selectedBlock: string
  target: string
  playerLiquid: string
  playerLiquidSpeedMultiplier: number
  yaw: number
  pitch: number
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  world: VoxelWorld
  graphicsPreset: GraphicsPreset
  maxPixelRatio: number
  bloomConfigured: boolean
  shadowEnabled: boolean
  shadowMapSize: number
  postFxEnabled: boolean
  emissiveLightCount: number
  emissiveLightsEnabled: boolean
  dayCycleTime: string
  dayCyclePhase: DayCyclePhase
  dayCycleSeconds: number
  fluidPaused: boolean
  worldgenFluidSimEnabled: boolean
}

const toDegrees = (radians: number) => radians * (180 / Math.PI)

export class DebugOverlay {
  private readonly el: HTMLPreElement

  constructor() {
    this.el = document.createElement('pre')
    this.el.id = 'debug-overlay'
    this.el.className = 'debug-overlay hidden'
    document.body.append(this.el)
  }

  setVisible(visible: boolean) {
    this.el.classList.toggle('hidden', !visible)
  }

  update(state: DebugOverlayState) {
    if (!state.enabled) {
      return
    }

    const canvas = state.renderer.domElement
    const info = state.renderer.info
    const position = state.camera.position
    const chunkX = Math.floor(Math.floor(position.x) / CHUNK_SIZE)
    const chunkZ = Math.floor(Math.floor(position.z) / CHUNK_SIZE)
    const actualDpr = window.innerWidth > 0 ? canvas.width / window.innerWidth : window.devicePixelRatio
    const meshStats = state.world.getMeshStats()
    const fluidStats = state.world.getFluidStats()

    this.el.textContent = [
      'WebMC Debug',
      `FPS: ${state.fps.toFixed(0)} | Frame: ${state.frameMs.toFixed(2)}ms`,
      `Resolution: ${window.innerWidth}x${window.innerHeight} CSS | ${canvas.width}x${canvas.height} buffer | DPR ${actualDpr.toFixed(2)}`,
      `PointerLock: ${document.pointerLockElement === canvas ? 'yes' : 'no'}`,
      `Mode: ${state.mode}`,
      `Environment: ${state.playerLiquid} | move x${state.playerLiquidSpeedMultiplier.toFixed(2)}`,
      `Position: x=${position.x.toFixed(2)} y=${position.y.toFixed(2)} z=${position.z.toFixed(2)}`,
      `Block: x=${Math.floor(position.x)} y=${Math.floor(position.y)} z=${Math.floor(position.z)}`,
      `Chunk: cx=${chunkX} cz=${chunkZ}`,
      `Yaw/Pitch: ${toDegrees(state.yaw).toFixed(1)} / ${toDegrees(state.pitch).toFixed(1)} deg`,
      `Selected: ${state.selectedBlock}`,
      `Target: ${state.target}`,
      '',
      'World:',
      `Loaded chunks: ${state.world.getLoadedChunkCount()}`,
      `Loaded blocks: ${state.world.getLoadedBlockCount()}`,
      `Rendered blocks: ${state.world.getRenderedBlockCount()}`,
      `Edited chunks: ${state.world.getEditedChunkCount()} | saved ${state.world.getSavedEditedChunkCount()}`,
      `Fluid paused: ${state.fluidPaused ? 'yes' : 'no'} | worldgen sim ${state.worldgenFluidSimEnabled ? 'on' : 'off'}`,
      `Fluids: active ${fluidStats.active} | queued ${fluidStats.queued} | processed ${fluidStats.processed} | changed ${fluidStats.changed}`,
      `Water: active ${fluidStats.water.active} | queued ${fluidStats.water.queued} | processed ${fluidStats.water.processed} | changed ${fluidStats.water.changed}`,
      `Lava: active ${fluidStats.lava.active} | queued ${fluidStats.lava.queued} | processed ${fluidStats.lava.processed} | changed ${fluidStats.lava.changed}`,
      `Chunk size: ${CHUNK_SIZE}`,
      `World height: ${WORLD_HEIGHT}`,
      `Load radius: ${LOAD_RADIUS}`,
      `Meshes: ${meshStats.total} | opaque ${meshStats.opaque} | cutout ${meshStats.cutout} | transparent ${meshStats.transparent} | liquid ${meshStats.liquid} | emissive ${meshStats.emissive}`,
      '',
      'Graphics:',
      `Preset: ${state.graphicsPreset}`,
      `Max pixel ratio: ${state.maxPixelRatio.toFixed(2)}`,
      `Shadow: ${state.shadowEnabled ? `on ${state.shadowMapSize}` : 'off'}`,
      `Day cycle: ${state.dayCycleTime} ${state.dayCyclePhase} | ${state.dayCycleSeconds}s`,
      `Bloom setting: ${state.bloomConfigured ? 'on' : 'off'}`,
      `Emissive lights: ${state.emissiveLightsEnabled ? `on ${state.emissiveLightCount}` : 'off'}`,
      '',
      'Renderer:',
      `Draw calls: ${info.render.calls}`,
      `Triangles: ${info.render.triangles}`,
      `Geometries: ${info.memory.geometries}`,
      `Textures: ${info.memory.textures}`,
      `PostFX: ${state.postFxEnabled ? 'on' : 'off'}`,
    ].join('\n')
  }
}
