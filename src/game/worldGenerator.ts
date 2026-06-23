import { BlockId } from './blocks'
import { CHUNK_SIZE, WORLD_HEIGHT } from './worldConstants'

export interface GeneratedChunk {
  data: Uint8Array
  loadedBlockCount: number
}

interface ChunkWriter {
  cx: number
  cz: number
  minWorldX: number
  minWorldZ: number
  data: Uint8Array
  loadedBlockCount: number
}

interface PoolCandidate {
  blockId: BlockId
  radius: number
}

interface Climate {
  warmth: number
  moisture: number
}

const DECORATION_MARGIN = 8
const POOL_MARGIN = 4

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const fract = (value: number) => value - Math.floor(value)

const hash2 = (worldX: number, worldZ: number, salt: number) =>
  fract(Math.sin(worldX * 127.1 + worldZ * 311.7 + salt * 74.7) * 43758.5453123)

const hash3 = (worldX: number, worldY: number, worldZ: number, salt: number) =>
  fract(Math.sin(worldX * 12.9898 + worldY * 78.233 + worldZ * 37.719 + salt * 91.17) * 43758.5453)

const blockIndex = (x: number, y: number, z: number) =>
  y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x

const climateAt = (worldX: number, worldZ: number): Climate => ({
  warmth:
    Math.sin(worldX * 0.024) +
    Math.cos(worldZ * 0.021) +
    Math.sin((worldX - worldZ) * 0.011) * 0.55,
  moisture:
    Math.sin((worldX - worldZ) * 0.032) +
    Math.cos((worldX + worldZ) * 0.018) +
    Math.sin(worldZ * 0.009) * 0.35,
})

export const terrainHeightAt = (worldX: number, worldZ: number) => {
  const broad =
    Math.sin(worldX * 0.071) * 3.1 +
    Math.cos(worldZ * 0.057) * 2.7 +
    Math.sin((worldX + worldZ) * 0.034) * 2.0 +
    Math.cos((worldX - worldZ) * 0.021) * 1.8
  const detail = (hash2(Math.floor(worldX / 3), Math.floor(worldZ / 3), 3) - 0.5) * 1.6

  return clamp(Math.round(10 + broad + detail), 4, 20)
}

const surfaceBlockFor = (worldX: number, worldZ: number, height: number): BlockId => {
  const { warmth, moisture } = climateAt(worldX, worldZ)

  if (height >= 18 || warmth < -1.15) {
    return BlockId.Snow
  }

  if (warmth > 1.15) {
    return moisture > 0.45 ? BlockId.RedSand : BlockId.Sand
  }

  if (moisture < -0.82) {
    return BlockId.GreySand
  }

  return BlockId.Grass
}

const soilBlockFor = (surfaceBlock: BlockId): BlockId => {
  if (surfaceBlock === BlockId.Sand || surfaceBlock === BlockId.RedSand || surfaceBlock === BlockId.GreySand) {
    return surfaceBlock
  }

  if (surfaceBlock === BlockId.Snow) {
    return BlockId.GravelDirt
  }

  return BlockId.Dirt
}

const stoneBlockFor = (worldX: number, worldY: number, worldZ: number): BlockId => {
  const oreNoise = hash3(worldX, worldY, worldZ, 11)

  if (worldY <= 5 && oreNoise > 0.993) {
    return BlockId.StoneDiamond
  }
  if (worldY <= 7 && oreNoise > 0.988) {
    return BlockId.GreystoneRuby
  }
  if (worldY <= 9 && oreNoise > 0.981) {
    return BlockId.StoneGold
  }
  if (worldY <= 10 && oreNoise > 0.973) {
    return BlockId.RedstoneEmerald
  }
  if (worldY <= 13 && oreNoise > 0.955) {
    return BlockId.StoneIron
  }
  if (oreNoise > 0.93) {
    return BlockId.StoneCoal
  }

  return BlockId.Stone
}

const isSandySurface = (blockId: BlockId) =>
  blockId === BlockId.Sand || blockId === BlockId.RedSand || blockId === BlockId.GreySand

const createWriter = (cx: number, cz: number): ChunkWriter => ({
  cx,
  cz,
  minWorldX: cx * CHUNK_SIZE,
  minWorldZ: cz * CHUNK_SIZE,
  data: new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE),
  loadedBlockCount: 0,
})

const toLocalX = (writer: ChunkWriter, worldX: number) => worldX - writer.minWorldX

const toLocalZ = (writer: ChunkWriter, worldZ: number) => worldZ - writer.minWorldZ

const isInsideChunk = (writer: ChunkWriter, worldX: number, worldZ: number) => {
  const localX = toLocalX(writer, worldX)
  const localZ = toLocalZ(writer, worldZ)

  return localX >= 0 && localX < CHUNK_SIZE && localZ >= 0 && localZ < CHUNK_SIZE
}

const getBlock = (writer: ChunkWriter, worldX: number, worldY: number, worldZ: number) => {
  if (!isInsideChunk(writer, worldX, worldZ) || worldY < 0 || worldY >= WORLD_HEIGHT) {
    return BlockId.Air
  }

  return writer.data[blockIndex(toLocalX(writer, worldX), worldY, toLocalZ(writer, worldZ))] as BlockId
}

const setBlock = (writer: ChunkWriter, worldX: number, worldY: number, worldZ: number, blockId: BlockId) => {
  if (!isInsideChunk(writer, worldX, worldZ) || worldY < 0 || worldY >= WORLD_HEIGHT) {
    return
  }

  const index = blockIndex(toLocalX(writer, worldX), worldY, toLocalZ(writer, worldZ))
  const previousBlockId = writer.data[index] as BlockId
  if (previousBlockId === blockId) {
    return
  }

  writer.data[index] = blockId
  if (previousBlockId === BlockId.Air && blockId !== BlockId.Air) {
    writer.loadedBlockCount += 1
  } else if (previousBlockId !== BlockId.Air && blockId === BlockId.Air) {
    writer.loadedBlockCount -= 1
  }
}

const setBlockIfAir = (writer: ChunkWriter, worldX: number, worldY: number, worldZ: number, blockId: BlockId) => {
  if (getBlock(writer, worldX, worldY, worldZ) === BlockId.Air) {
    setBlock(writer, worldX, worldY, worldZ, blockId)
  }
}

const setBlockIfAirOrLeaves = (
  writer: ChunkWriter,
  worldX: number,
  worldY: number,
  worldZ: number,
  blockId: BlockId,
) => {
  const existingBlock = getBlock(writer, worldX, worldY, worldZ)
  if (
    existingBlock === BlockId.Air ||
    existingBlock === BlockId.Leaves ||
    existingBlock === BlockId.LeavesOrange
  ) {
    setBlock(writer, worldX, worldY, worldZ, blockId)
  }
}

const fillTerrain = (writer: ChunkWriter) => {
  for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
    for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
      const worldX = writer.minWorldX + localX
      const worldZ = writer.minWorldZ + localZ
      const height = terrainHeightAt(worldX, worldZ)
      const topBlock = surfaceBlockFor(worldX, worldZ, height)
      const soilBlock = soilBlockFor(topBlock)

      for (let y = 0; y <= height; y += 1) {
        let blockId = stoneBlockFor(worldX, y, worldZ)
        if (y === height) {
          blockId = topBlock
        } else if (y >= height - 2) {
          blockId = soilBlock
        }
        setBlock(writer, worldX, y, worldZ, blockId)
      }
    }
  }
}

const poolCandidateAt = (worldX: number, worldZ: number): PoolCandidate | null => {
  const height = terrainHeightAt(worldX, worldZ)
  const surfaceBlock = surfaceBlockFor(worldX, worldZ, height)
  const { warmth, moisture } = climateAt(worldX, worldZ)

  if (surfaceBlock === BlockId.Snow) {
    return null
  }

  const waterRoll = hash2(worldX, worldZ, 41)
  if (waterRoll > 0.9977 && moisture > -0.15 && height >= 6) {
    return {
      blockId: BlockId.Water,
      radius: 2 + Math.floor(hash2(worldX, worldZ, 42) * 2),
    }
  }

  const lavaRoll = hash2(worldX, worldZ, 43)
  if (lavaRoll > 0.99965 && warmth > 0.7 && height >= 5) {
    return {
      blockId: BlockId.Lava,
      radius: 1 + Math.floor(hash2(worldX, worldZ, 44) * 2),
    }
  }

  return null
}

const isCoveredByPool = (worldX: number, worldZ: number) => {
  for (let centerZ = worldZ - POOL_MARGIN; centerZ <= worldZ + POOL_MARGIN; centerZ += 1) {
    for (let centerX = worldX - POOL_MARGIN; centerX <= worldX + POOL_MARGIN; centerX += 1) {
      const candidate = poolCandidateAt(centerX, centerZ)
      if (!candidate) {
        continue
      }

      const distance = Math.hypot(worldX - centerX, worldZ - centerZ)
      const centerHeight = terrainHeightAt(centerX, centerZ)
      const terrainHeight = terrainHeightAt(worldX, worldZ)
      if (distance <= candidate.radius + 1 && Math.abs(terrainHeight - centerHeight) <= 2) {
        return true
      }
    }
  }

  return false
}

const stampPool = (writer: ChunkWriter, centerX: number, centerZ: number, candidate: PoolCandidate) => {
  const centerHeight = terrainHeightAt(centerX, centerZ)
  const basinBlock = candidate.blockId === BlockId.Lava ? BlockId.Stone : BlockId.Sand

  for (let dz = -candidate.radius; dz <= candidate.radius; dz += 1) {
    for (let dx = -candidate.radius; dx <= candidate.radius; dx += 1) {
      const worldX = centerX + dx
      const worldZ = centerZ + dz
      const distance = Math.hypot(dx, dz)
      const edgeNoise = hash2(worldX, worldZ, 45) * 0.28

      if (distance > candidate.radius + edgeNoise) {
        continue
      }

      const terrainHeight = terrainHeightAt(worldX, worldZ)
      if (Math.abs(terrainHeight - centerHeight) > 2) {
        continue
      }

      const level = Math.min(centerHeight, WORLD_HEIGHT - 2)
      for (let y = level + 1; y <= terrainHeight; y += 1) {
        setBlock(writer, worldX, y, worldZ, BlockId.Air)
      }

      setBlock(writer, worldX, level - 1, worldZ, basinBlock)
      setBlock(writer, worldX, level, worldZ, candidate.blockId)
    }
  }
}

const decoratePools = (writer: ChunkWriter) => {
  const minX = writer.minWorldX - POOL_MARGIN
  const maxX = writer.minWorldX + CHUNK_SIZE + POOL_MARGIN - 1
  const minZ = writer.minWorldZ - POOL_MARGIN
  const maxZ = writer.minWorldZ + CHUNK_SIZE + POOL_MARGIN - 1

  for (let worldZ = minZ; worldZ <= maxZ; worldZ += 1) {
    for (let worldX = minX; worldX <= maxX; worldX += 1) {
      const candidate = poolCandidateAt(worldX, worldZ)
      if (candidate) {
        stampPool(writer, worldX, worldZ, candidate)
      }
    }
  }
}

const stampTree = (writer: ChunkWriter, rootX: number, rootZ: number, surfaceY: number, climate: Climate) => {
  const trunkHeight = 4 + Math.floor(hash2(rootX, rootZ, 101) * 3)
  const trunkBlock = hash2(rootX, rootZ, 102) > 0.76 ? BlockId.TrunkWhite : BlockId.Trunk
  const leafBlock =
    climate.warmth > 0.7 && hash2(rootX, rootZ, 103) > 0.55 ? BlockId.LeavesOrange : BlockId.Leaves
  const crownY = surfaceY + trunkHeight

  for (let y = surfaceY + 1; y <= crownY; y += 1) {
    setBlockIfAirOrLeaves(writer, rootX, y, rootZ, trunkBlock)
  }

  for (let dy = -2; dy <= 2; dy += 1) {
    const radius = dy === 2 ? 1 : 2
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const distance = Math.abs(dx) + Math.abs(dz)
        const extraCorner = hash2(rootX + dx, rootZ + dz, 110 + dy) > 0.68 ? 1 : 0

        if (distance > radius + extraCorner || (dx === 0 && dz === 0 && dy <= 0)) {
          continue
        }

        setBlockIfAir(writer, rootX + dx, crownY + dy, rootZ + dz, leafBlock)
      }
    }
  }
}

const stampCactus = (writer: ChunkWriter, rootX: number, rootZ: number, surfaceY: number) => {
  const cactusHeight = 2 + Math.floor(hash2(rootX, rootZ, 121) * 3)

  for (let y = surfaceY + 1; y <= surfaceY + cactusHeight; y += 1) {
    setBlockIfAir(writer, rootX, y, rootZ, BlockId.Cactus)
  }
}

const stampMushroom = (writer: ChunkWriter, rootX: number, rootZ: number, surfaceY: number) => {
  const blockId = hash2(rootX, rootZ, 131) > 0.5 ? BlockId.MushroomRed : BlockId.MushroomBrown
  setBlockIfAir(writer, rootX, surfaceY + 1, rootZ, blockId)
}

const decorateVegetation = (writer: ChunkWriter) => {
  const minX = writer.minWorldX - DECORATION_MARGIN
  const maxX = writer.minWorldX + CHUNK_SIZE + DECORATION_MARGIN - 1
  const minZ = writer.minWorldZ - DECORATION_MARGIN
  const maxZ = writer.minWorldZ + CHUNK_SIZE + DECORATION_MARGIN - 1

  for (let worldZ = minZ; worldZ <= maxZ; worldZ += 1) {
    for (let worldX = minX; worldX <= maxX; worldX += 1) {
      const surfaceY = terrainHeightAt(worldX, worldZ)
      const surfaceBlock = surfaceBlockFor(worldX, worldZ, surfaceY)
      const climate = climateAt(worldX, worldZ)

      if (surfaceY >= WORLD_HEIGHT - 8 || isCoveredByPool(worldX, worldZ)) {
        continue
      }

      const treeRoll = hash2(worldX, worldZ, 201)
      if ((surfaceBlock === BlockId.Grass || surfaceBlock === BlockId.Snow) && treeRoll > 0.986) {
        stampTree(writer, worldX, worldZ, surfaceY, climate)
        continue
      }

      const cactusRoll = hash2(worldX, worldZ, 202)
      if (isSandySurface(surfaceBlock) && climate.warmth > 0.85 && cactusRoll > 0.982) {
        stampCactus(writer, worldX, worldZ, surfaceY)
        continue
      }

      const mushroomRoll = hash2(worldX, worldZ, 203)
      if (surfaceBlock === BlockId.Grass && climate.moisture > 0.45 && mushroomRoll > 0.992) {
        stampMushroom(writer, worldX, worldZ, surfaceY)
      }
    }
  }
}

export const generateChunk = (cx: number, cz: number): GeneratedChunk => {
  const writer = createWriter(cx, cz)

  fillTerrain(writer)
  decoratePools(writer)
  decorateVegetation(writer)

  return {
    data: writer.data,
    loadedBlockCount: writer.loadedBlockCount,
  }
}
