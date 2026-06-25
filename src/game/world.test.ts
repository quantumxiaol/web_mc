import { describe, expect, it } from 'vitest'
import { Scene, Vector3 } from 'three'
import { BlockId } from './blocks'
import { FLUID_NONE, FLUID_SOURCE_LEVEL } from './fluids'
import { CHUNK_SIZE, VoxelWorld, WORLD_HEIGHT, type SavedChunkPayload } from './world'

const CHUNK_DATA_LENGTH = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE

const createEmptyChunkPayload = (cx = 0, cz = 0): SavedChunkPayload => {
  const fluidLevels = new Uint8Array(CHUNK_DATA_LENGTH)
  fluidLevels.fill(FLUID_NONE)

  return {
    key: `${cx},${cz}`,
    cx,
    cz,
    data: new Uint8Array(CHUNK_DATA_LENGTH),
    fluidLevels,
  }
}

const createWorldWithEmptyOrigin = () => {
  const world = new VoxelWorld(new Scene())
  expect(world.importEditedChunks([createEmptyChunkPayload()])).toBe(1)
  world.ensureChunksAround(0, 0)
  return world
}

const cloneSavedChunks = (chunks: SavedChunkPayload[]) =>
  chunks.map((chunk) => ({
    key: chunk.key,
    cx: chunk.cx,
    cz: chunk.cz,
    data: chunk.data.slice(),
    fluidLevels: chunk.fluidLevels.slice(),
  }))

describe('VoxelWorld.raycastVoxel', () => {
  it('hits the first target block along a straight ray', () => {
    const world = createWorldWithEmptyOrigin()
    world.setBlock(5, 10, 1, BlockId.Stone)

    const hit = world.raycastVoxel(new Vector3(1.2, 10.5, 1.5), new Vector3(1, 0, 0), 8)

    expect(hit?.block).toEqual({ x: 5, y: 10, z: 1 })
    expect(hit?.blockId).toBe(BlockId.Stone)
    expect(hit?.normal.toArray()).toEqual([-1, 0, 0])
    expect(hit?.distance).toBeCloseTo(3.8)
  })

  it('returns null when the target is outside maxDistance', () => {
    const world = createWorldWithEmptyOrigin()
    world.setBlock(5, 10, 1, BlockId.Stone)

    const hit = world.raycastVoxel(new Vector3(1.2, 10.5, 1.5), new Vector3(1, 0, 0), 3)

    expect(hit).toBeNull()
  })

  it('can hit a block through a diagonal voxel traversal', () => {
    const world = createWorldWithEmptyOrigin()
    world.setBlock(4, 10, 4, BlockId.Stone)

    const hit = world.raycastVoxel(new Vector3(1.5, 10.5, 1.5), new Vector3(1, 0, 1), 8)

    expect(hit?.block).toEqual({ x: 4, y: 10, z: 4 })
    expect(hit?.blockId).toBe(BlockId.Stone)
  })
})

describe('VoxelWorld fluid rules', () => {
  it('turns lava into stone when water touches lava', () => {
    const world = createWorldWithEmptyOrigin()
    world.setBlock(4, 10, 4, BlockId.Water)
    world.setBlock(5, 10, 4, BlockId.Lava)

    expect(world.stepFluids()).toBeGreaterThan(0)

    expect(world.getBlock(5, 10, 4)).toBe(BlockId.Stone)
    expect(world.getFluidLevel(5, 10, 4)).toBe(FLUID_NONE)
  })

  it('lets lava destroy replaceable vegetation while flowing horizontally', () => {
    const world = createWorldWithEmptyOrigin()
    world.setBlock(4, 9, 4, BlockId.Stone)
    world.setBlock(4, 10, 4, BlockId.Lava)
    world.setBlock(5, 10, 4, BlockId.Leaves)

    expect(world.stepFluids()).toBeGreaterThan(0)

    expect(world.getBlock(5, 10, 4)).toBe(BlockId.Lava)
    expect(world.getFluidLevel(5, 10, 4)).toBe(1)
  })
})

describe('VoxelWorld emissive light sources', () => {
  it('aggregates visible emissive blocks near the player', () => {
    const world = createWorldWithEmptyOrigin()
    world.setBlock(4, 10, 4, BlockId.Lava)
    world.setBlock(5, 10, 4, BlockId.Lava)

    const sources = world.getEmissiveLightSources(4, 10, 4, 3, 4)

    expect(sources).toHaveLength(1)
    expect(sources[0].color).toBe(0xff7a18)
    expect(sources[0].count).toBe(2)
    expect(sources[0].intensity).toBeGreaterThan(0.8)
  })
})

describe('VoxelWorld edited chunk persistence', () => {
  it('exports and imports edited chunks with block and fluid state', () => {
    const source = createWorldWithEmptyOrigin()
    source.setBlock(2, 10, 2, BlockId.Wood)
    source.setBlock(3, 10, 2, BlockId.Water)

    const savedChunks = source.exportEditedChunks()
    expect(savedChunks).toHaveLength(1)

    const restored = new VoxelWorld(new Scene())
    expect(restored.importEditedChunks(savedChunks)).toBe(1)
    restored.ensureChunksAround(0, 0)

    expect(restored.getBlock(2, 10, 2)).toBe(BlockId.Wood)
    expect(restored.getBlock(3, 10, 2)).toBe(BlockId.Water)
    expect(restored.getFluidLevel(3, 10, 2)).toBe(FLUID_SOURCE_LEVEL)
  })

  it('rejects invalid imported chunks without clearing the current world', () => {
    const world = createWorldWithEmptyOrigin()
    world.setBlock(2, 10, 2, BlockId.Wood)

    const invalidChunks = cloneSavedChunks(world.exportEditedChunks())
    invalidChunks[0].data[0] = 250

    expect(world.importEditedChunks(invalidChunks)).toBeNull()
    expect(world.getBlock(2, 10, 2)).toBe(BlockId.Wood)
  })
})
