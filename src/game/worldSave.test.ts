import { describe, expect, it } from 'vitest'
import { WORLD_SAVE_SEED, WORLD_SAVE_VERSION, parseWorldSave } from './worldSave'

const chunk = {
  key: '0,0',
  cx: 0,
  cz: 0,
  data: 'AAAA',
  fluidLevels: '////',
}

const player = {
  x: 1,
  y: 2,
  z: 3,
  yaw: 0.25,
  pitch: -0.12,
}

describe('world save schema', () => {
  it('parses version 2 saves with world runtime state', () => {
    const parsed = parseWorldSave(JSON.stringify({
      version: WORLD_SAVE_VERSION,
      createdAt: '2026-06-25T00:00:00.000Z',
      seed: WORLD_SAVE_SEED,
      timeOfDay: 0.67,
      player,
      hotbar: [1, 2, 3],
      graphicsPreset: 'high',
      fluid: {
        paused: true,
        worldgenSimulationEnabled: true,
      },
      chunks: [chunk],
    }))

    expect(parsed?.version).toBe(WORLD_SAVE_VERSION)
    expect(parsed?.timeOfDay).toBe(0.67)
    expect(parsed?.fluid.paused).toBe(true)
    expect(parsed?.fluid.worldgenSimulationEnabled).toBe(true)
    expect(parsed?.chunks).toEqual([chunk])
  })

  it('rejects unsupported version 1 saves', () => {
    expect(parseWorldSave(JSON.stringify({
      version: 1,
      createdAt: '2026-06-25T00:00:00.000Z',
      player,
      hotbar: [1, 2, 3],
      graphicsPreset: 'medium',
      chunks: [chunk],
    }))).toBeNull()
  })

  it('rejects malformed saves', () => {
    expect(parseWorldSave('{bad json')).toBeNull()
    expect(parseWorldSave(JSON.stringify({
      version: WORLD_SAVE_VERSION,
      createdAt: '2026-06-25T00:00:00.000Z',
      seed: WORLD_SAVE_SEED,
      timeOfDay: 0.5,
      player,
      hotbar: [1, 2, 3],
      graphicsPreset: 'high',
      chunks: [chunk],
    }))).toBeNull()
  })
})
