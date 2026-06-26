import type { GraphicsPreset } from './graphicsSettings'

export const WORLD_SAVE_VERSION = 2
export const WORLD_SAVE_SEED = 'default'

export interface SerializedChunkPayload {
  key: string
  cx: number
  cz: number
  data: string
  fluidLevels: string
}

export interface SerializedPlayerState {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
}

export interface SerializedFluidState {
  paused: boolean
  worldgenSimulationEnabled: boolean
}

export interface WorldSaveFile {
  version: typeof WORLD_SAVE_VERSION
  createdAt: string
  seed: string
  timeOfDay: number
  player: SerializedPlayerState
  hotbar: number[]
  graphicsPreset: GraphicsPreset
  fluid: SerializedFluidState
  chunks: SerializedChunkPayload[]
}

interface CommonWorldSaveFields {
  createdAt: string
  player: SerializedPlayerState
  hotbar: number[]
  graphicsPreset: GraphicsPreset
  chunks: SerializedChunkPayload[]
}

export const isGraphicsPreset = (value: unknown): value is GraphicsPreset =>
  value === 'low' || value === 'medium' || value === 'high'

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isSerializedPlayerState = (value: unknown): value is SerializedPlayerState =>
  isRecord(value) &&
  isFiniteNumber(value.x) &&
  isFiniteNumber(value.y) &&
  isFiniteNumber(value.z) &&
  isFiniteNumber(value.yaw) &&
  isFiniteNumber(value.pitch)

const isSerializedChunkPayload = (value: unknown): value is SerializedChunkPayload =>
  isRecord(value) &&
  typeof value.key === 'string' &&
  Number.isInteger(value.cx) &&
  Number.isInteger(value.cz) &&
  typeof value.data === 'string' &&
  typeof value.fluidLevels === 'string'

const isSerializedFluidState = (value: unknown): value is SerializedFluidState =>
  isRecord(value) &&
  typeof value.paused === 'boolean' &&
  typeof value.worldgenSimulationEnabled === 'boolean'

const hasCommonSaveFields = (
  value: Record<string, unknown>,
): value is Record<string, unknown> & CommonWorldSaveFields =>
  typeof value.createdAt === 'string' &&
  isSerializedPlayerState(value.player) &&
  Array.isArray(value.hotbar) &&
  value.hotbar.every(isFiniteNumber) &&
  isGraphicsPreset(value.graphicsPreset) &&
  Array.isArray(value.chunks) &&
  value.chunks.every(isSerializedChunkPayload)

export const parseWorldSave = (raw: string): WorldSaveFile | null => {
  try {
    const parsed: unknown = JSON.parse(raw)

    if (!isRecord(parsed) || !hasCommonSaveFields(parsed)) {
      return null
    }

    const { version, createdAt, player, hotbar, graphicsPreset, chunks } = parsed
    const { seed, timeOfDay, fluid } = parsed
    if (
      version !== WORLD_SAVE_VERSION ||
      typeof seed !== 'string' ||
      !isFiniteNumber(timeOfDay) ||
      !isSerializedFluidState(fluid)
    ) {
      return null
    }

    return {
      version: WORLD_SAVE_VERSION,
      createdAt,
      seed,
      timeOfDay,
      player,
      hotbar,
      graphicsPreset,
      fluid,
      chunks,
    }
  } catch {
    return null
  }
}
