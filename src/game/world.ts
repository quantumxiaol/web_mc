import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Scene,
  Vector3,
} from 'three'
import {
  BlockId,
  PLACEABLE_BLOCKS,
  getBlockDefinition,
  getBlockShape,
  getBlockRenderLayer,
  isBlockOpaqueOccluder,
  isDestroyedByFluid,
  isBlockLiquid,
  isBlockRaycastTarget,
  isBlockSolid,
  type BlockDefinition,
  type BlockRenderLayer,
} from './blocks'
import { FLUID_BLOCK_IDS, FLUID_NONE, FLUID_SOURCE_LEVEL, getFluidRule } from './fluids'
import { buildLiquidMesh, hasVisibleLiquidFaces } from './liquidMesh'
import { createBlockMaterials, type BlockMaterial } from './materials'
import { CHUNK_SIZE, LOAD_RADIUS, WORLD_HEIGHT } from './worldConstants'
import { generateChunk } from './worldGenerator'

export { CHUNK_SIZE, LOAD_RADIUS, WORLD_HEIGHT } from './worldConstants'

export interface BlockPosition {
  x: number
  y: number
  z: number
}

export type PlaceableBlockDefinition = BlockDefinition

type ChunkMesh = Mesh<BufferGeometry, BlockMaterial> | InstancedMesh<BufferGeometry, BlockMaterial>

export interface VoxelRaycastHit {
  block: BlockPosition
  blockId: BlockId
  normal: Vector3
  distance: number
  point: Vector3
}

export interface WorldMeshStats {
  total: number
  opaque: number
  cutout: number
  transparent: number
  liquid: number
  emissive: number
}

export interface WorldFluidStats {
  active: number
  queued: number
  processed: number
  changed: number
  water: FluidBlockStats
  lava: FluidBlockStats
}

export interface FluidBlockStats {
  active: number
  queued: number
  processed: number
  changed: number
}

export interface WorldEmissiveLightSource {
  x: number
  y: number
  z: number
  color: number
  intensity: number
  count: number
}

interface RenderBlockPosition extends BlockPosition {
  fluidLevel?: number
}

interface SavedChunkData {
  data: Uint8Array
  fluidLevels: Uint8Array
}

export interface SavedChunkPayload {
  key: string
  cx: number
  cz: number
  data: Uint8Array
  fluidLevels: Uint8Array
}

interface Chunk {
  cx: number
  cz: number
  data: Uint8Array
  fluidLevels: Uint8Array
  meshes: ChunkMesh[]
  instancesByBlock: Partial<Record<BlockId, RenderBlockPosition[]>>
  loadedBlockCount: number
  renderedBlockCount: number
}

interface MarkChangedBlockOptions {
  markEdited?: boolean
  queueFluid?: boolean
}

const blockGeometry = new BoxGeometry(1, 1, 1)
const createCrossGeometry = (width = 0.78, height = 0.82) => {
  const geometry = new BufferGeometry()
  const halfWidth = width / 2
  const bottom = -0.5
  const top = bottom + height

  const positions = [
    -halfWidth, bottom, -halfWidth,
    halfWidth, bottom, halfWidth,
    halfWidth, top, halfWidth,
    -halfWidth, top, -halfWidth,
    -halfWidth, bottom, halfWidth,
    halfWidth, bottom, -halfWidth,
    halfWidth, top, -halfWidth,
    -halfWidth, top, halfWidth,
  ]
  const uvs = [
    0, 0,
    1, 0,
    1, 1,
    0, 1,
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ]

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  geometry.computeVertexNormals()
  return geometry
}
const crossGeometry = createCrossGeometry()
const blockMaterialMap = new Map<BlockId, BlockMaterial>(
  PLACEABLE_BLOCKS.map((definition) => [definition.id, createBlockMaterials(definition)] as const),
)

const instanceMatrix = new Matrix4()

const chunkKey = (cx: number, cz: number) => `${cx},${cz}`

const parseChunkKey = (key: string) => {
  const [cx, cz] = key.split(',').map(Number)

  if (!Number.isInteger(cx) || !Number.isInteger(cz)) {
    return null
  }

  return { cx, cz }
}

const floorDiv = (value: number, size: number) => Math.floor(value / size)

const mod = (value: number, size: number) => ((value % size) + size) % size

const blockIndex = (x: number, y: number, z: number) =>
  y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x

const CHUNK_DATA_LENGTH = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE

const isValidSavedChunkData = (data: Uint8Array, fluidLevels: Uint8Array) => {
  if (data.length !== CHUNK_DATA_LENGTH || fluidLevels.length !== CHUNK_DATA_LENGTH) {
    return false
  }

  for (let index = 0; index < data.length; index += 1) {
    const blockId = data[index] as BlockId
    const fluidLevel = fluidLevels[index] ?? FLUID_NONE

    if (blockId !== BlockId.Air && !blockMaterialMap.has(blockId)) {
      return false
    }

    if (isBlockLiquid(blockId)) {
      if (fluidLevel === FLUID_NONE || fluidLevel > getFluidRule(blockId).maxLevel) {
        return false
      }
    } else if (fluidLevel !== FLUID_NONE) {
      return false
    }
  }

  return true
}

const countLoadedBlocks = (data: Uint8Array) => {
  let count = 0

  for (let index = 0; index < data.length; index += 1) {
    if (data[index] !== BlockId.Air) {
      count += 1
    }
  }

  return count
}

const createInitialFluidLevels = (data: Uint8Array) => {
  const fluidLevels = new Uint8Array(data.length)
  fluidLevels.fill(FLUID_NONE)

  for (let index = 0; index < data.length; index += 1) {
    if (isBlockLiquid(data[index] as BlockId)) {
      fluidLevels[index] = FLUID_SOURCE_LEVEL
    }
  }

  return fluidLevels
}

const fluidQueueKey = (x: number, y: number, z: number) => `${x},${y},${z}`

const parseFluidQueueKey = (key: string): BlockPosition | null => {
  const [x, y, z] = key.split(',').map(Number)

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null
  }

  return { x, y, z }
}

const ENABLE_WORLDGEN_FLUID_SIM = false
const fluidReactionNeighbors = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const

const renderOrderByLayer: Record<BlockRenderLayer, number> = {
  opaque: 0,
  cutout: 1,
  emissive: 1,
  transparent: 2,
  liquid: 3,
}

const EMISSIVE_LIGHT_CELL_SIZE = 8

export class VoxelWorld {
  private readonly chunks = new Map<string, Chunk>()
  private readonly dirtyChunks = new Set<string>()
  private readonly editedChunkKeys = new Set<string>()
  private readonly editedChunkData = new Map<string, SavedChunkData>()
  private readonly fluidUpdateQueues = new Map<BlockId, Set<string>>()
  private readonly fluidTickAccumulators = new Map<BlockId, number>()
  private readonly lastFluidProcessedByBlock = new Map<BlockId, number>()
  private readonly lastFluidChangedByBlock = new Map<BlockId, number>()
  private readonly scene: Scene
  private loadedBlockCount = 0
  private renderedBlockCount = 0
  private worldgenFluidSimulationEnabled = ENABLE_WORLDGEN_FLUID_SIM

  constructor(scene: Scene) {
    this.scene = scene
  }

  ensureChunksAround(worldX: number, worldZ: number) {
    const centerCx = floorDiv(Math.floor(worldX), CHUNK_SIZE)
    const centerCz = floorDiv(Math.floor(worldZ), CHUNK_SIZE)

    for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz += 1) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx += 1) {
        const cx = centerCx + dx
        const cz = centerCz + dz
        this.loadChunk(cx, cz)
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (
        Math.abs(chunk.cx - centerCx) > LOAD_RADIUS ||
        Math.abs(chunk.cz - centerCz) > LOAD_RADIUS
      ) {
        this.unloadChunk(key, chunk)
      }
    }
  }

  getLoadedChunkCount() {
    return this.chunks.size
  }

  getLoadedBlockCount() {
    return this.loadedBlockCount
  }

  getRenderedBlockCount() {
    return this.renderedBlockCount
  }

  getEditedChunkCount() {
    return this.editedChunkKeys.size
  }

  getSavedEditedChunkCount() {
    return this.editedChunkData.size
  }

  getWorldgenFluidSimulationEnabled() {
    return this.worldgenFluidSimulationEnabled
  }

  setWorldgenFluidSimulationEnabled(enabled: boolean) {
    if (this.worldgenFluidSimulationEnabled === enabled) {
      return
    }

    this.worldgenFluidSimulationEnabled = enabled

    if (enabled) {
      for (const chunk of this.chunks.values()) {
        this.seedFluidUpdates(chunk)
      }
    }
  }

  exportEditedChunks(): SavedChunkPayload[] {
    for (const key of this.editedChunkKeys) {
      const chunk = this.chunks.get(key)
      if (chunk) {
        this.persistEditedChunk(key, chunk)
      }
    }

    const payloads: SavedChunkPayload[] = []
    for (const key of this.editedChunkKeys) {
      const savedChunk = this.editedChunkData.get(key)
      const position = parseChunkKey(key)
      if (!savedChunk || !position) {
        continue
      }

      payloads.push({
        key,
        cx: position.cx,
        cz: position.cz,
        data: savedChunk.data.slice(),
        fluidLevels: savedChunk.fluidLevels.slice(),
      })
    }

    return payloads
  }

  importEditedChunks(payloads: SavedChunkPayload[]) {
    const nextEditedChunkKeys = new Set<string>()
    const nextEditedChunkData = new Map<string, SavedChunkData>()

    for (const payload of payloads) {
      const key = chunkKey(payload.cx, payload.cz)
      if (
        payload.key !== key ||
        !isValidSavedChunkData(payload.data, payload.fluidLevels)
      ) {
        return null
      }

      nextEditedChunkKeys.add(key)
      nextEditedChunkData.set(key, {
        data: payload.data.slice(),
        fluidLevels: payload.fluidLevels.slice(),
      })
    }

    this.clearLoadedChunks()
    this.editedChunkKeys.clear()
    this.editedChunkData.clear()

    for (const key of nextEditedChunkKeys) {
      this.editedChunkKeys.add(key)
    }
    for (const [key, savedChunk] of nextEditedChunkData) {
      this.editedChunkData.set(key, savedChunk)
    }

    return this.editedChunkKeys.size
  }

  clearEditedChunks() {
    this.clearLoadedChunks()
    this.editedChunkKeys.clear()
    this.editedChunkData.clear()
  }

  getFluidStats(): WorldFluidStats {
    const water = this.createFluidBlockStats(BlockId.Water)
    const lava = this.createFluidBlockStats(BlockId.Lava)

    for (const chunk of this.chunks.values()) {
      for (let index = 0; index < chunk.fluidLevels.length; index += 1) {
        if (chunk.fluidLevels[index] === FLUID_NONE) {
          continue
        }

        const blockId = chunk.data[index] as BlockId
        if (blockId === BlockId.Water) {
          water.active += 1
        } else if (blockId === BlockId.Lava) {
          lava.active += 1
        }
      }
    }

    return {
      active: water.active + lava.active,
      queued: water.queued + lava.queued,
      processed: water.processed + lava.processed,
      changed: water.changed + lava.changed,
      water,
      lava,
    }
  }

  getMeshStats(): WorldMeshStats {
    const stats: WorldMeshStats = {
      total: 0,
      opaque: 0,
      cutout: 0,
      transparent: 0,
      liquid: 0,
      emissive: 0,
    }

    for (const chunk of this.chunks.values()) {
      for (const mesh of chunk.meshes) {
        const layer = mesh.userData.renderLayer as BlockRenderLayer | undefined
        stats.total += 1

        if (layer) {
          stats[layer] += 1
        }
      }
    }

    return stats
  }

  getEmissiveLightSources(
    focusX: number,
    focusY: number,
    focusZ: number,
    radius = 48,
    maxSources = 12,
  ): WorldEmissiveLightSource[] {
    const radiusSq = radius * radius
    const groups = new Map<
      string,
      {
        x: number
        y: number
        z: number
        weight: number
        intensity: number
        count: number
        color: number
        maxEmit: number
        distanceSq: number
      }
    >()

    for (const chunk of this.chunks.values()) {
      for (let y = 0; y < WORLD_HEIGHT; y += 1) {
        for (let z = 0; z < CHUNK_SIZE; z += 1) {
          for (let x = 0; x < CHUNK_SIZE; x += 1) {
            const index = blockIndex(x, y, z)
            const blockId = chunk.data[index] as BlockId
            const definition = getBlockDefinition(blockId)
            if (!definition?.emitsLight || definition.emissiveColor === undefined) {
              continue
            }

            const worldX = chunk.cx * CHUNK_SIZE + x
            const worldZ = chunk.cz * CHUNK_SIZE + z
            const sourceX = worldX + 0.5
            const sourceY = y + 0.5
            const sourceZ = worldZ + 0.5
            const distanceSq =
              (sourceX - focusX) ** 2 +
              (sourceY - focusY) ** 2 +
              (sourceZ - focusZ) ** 2

            if (distanceSq > radiusSq || !this.isBlockVisible(worldX, y, worldZ)) {
              continue
            }

            const cellX = Math.floor(worldX / EMISSIVE_LIGHT_CELL_SIZE)
            const cellY = Math.floor(y / EMISSIVE_LIGHT_CELL_SIZE)
            const cellZ = Math.floor(worldZ / EMISSIVE_LIGHT_CELL_SIZE)
            const key = `${cellX},${cellY},${cellZ}`
            const weight = Math.max(0.2, definition.emitsLight)
            const group = groups.get(key)

            if (group) {
              group.x += sourceX * weight
              group.y += sourceY * weight
              group.z += sourceZ * weight
              group.weight += weight
              group.intensity += definition.emitsLight
              group.count += 1
              group.distanceSq = Math.min(group.distanceSq, distanceSq)
              if (definition.emitsLight > group.maxEmit) {
                group.color = definition.emissiveColor
                group.maxEmit = definition.emitsLight
              }
            } else {
              groups.set(key, {
                x: sourceX * weight,
                y: sourceY * weight,
                z: sourceZ * weight,
                weight,
                intensity: definition.emitsLight,
                count: 1,
                color: definition.emissiveColor,
                maxEmit: definition.emitsLight,
                distanceSq,
              })
            }
          }
        }
      }
    }

    return Array.from(groups.values())
      .map((group) => ({
        x: group.x / group.weight,
        y: group.y / group.weight,
        z: group.z / group.weight,
        color: group.color,
        intensity: Math.min(2.4, 0.55 + group.intensity * 0.18),
        count: group.count,
        distanceSq: group.distanceSq,
      }))
      .sort((a, b) => {
        const aScore = a.distanceSq / Math.max(0.1, a.intensity)
        const bScore = b.distanceSq / Math.max(0.1, b.intensity)
        return aScore - bScore
      })
      .slice(0, maxSources)
      .map(({ distanceSq, ...source }) => source)
  }

  getBlock(worldX: number, worldY: number, worldZ: number) {
    if (worldY < 0 || worldY >= WORLD_HEIGHT) {
      return BlockId.Air
    }

    const cx = floorDiv(worldX, CHUNK_SIZE)
    const cz = floorDiv(worldZ, CHUNK_SIZE)
    const chunk = this.chunks.get(chunkKey(cx, cz))
    if (!chunk) {
      return BlockId.Air
    }

    const lx = mod(worldX, CHUNK_SIZE)
    const lz = mod(worldZ, CHUNK_SIZE)
    return (chunk.data[blockIndex(lx, worldY, lz)] ?? BlockId.Air) as BlockId
  }

  getFluidLevel(worldX: number, worldY: number, worldZ: number) {
    if (worldY < 0 || worldY >= WORLD_HEIGHT) {
      return FLUID_NONE
    }

    const cx = floorDiv(worldX, CHUNK_SIZE)
    const cz = floorDiv(worldZ, CHUNK_SIZE)
    const chunk = this.chunks.get(chunkKey(cx, cz))
    if (!chunk) {
      return FLUID_NONE
    }

    const lx = mod(worldX, CHUNK_SIZE)
    const lz = mod(worldZ, CHUNK_SIZE)
    return chunk.fluidLevels[blockIndex(lx, worldY, lz)] ?? FLUID_NONE
  }

  setBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId) {
    if (worldY < 0 || worldY >= WORLD_HEIGHT) {
      return false
    }
    if (blockId !== BlockId.Air && !blockMaterialMap.has(blockId)) {
      return false
    }

    const cx = floorDiv(worldX, CHUNK_SIZE)
    const cz = floorDiv(worldZ, CHUNK_SIZE)
    const chunk = this.loadChunk(cx, cz)
    const lx = mod(worldX, CHUNK_SIZE)
    const lz = mod(worldZ, CHUNK_SIZE)
    const index = blockIndex(lx, worldY, lz)
    const previousBlockId = chunk.data[index] as BlockId

    if (previousBlockId === blockId) {
      return false
    }

    chunk.data[index] = blockId
    chunk.fluidLevels[index] = isBlockLiquid(blockId) ? FLUID_SOURCE_LEVEL : FLUID_NONE
    if (previousBlockId === BlockId.Air && blockId !== BlockId.Air) {
      chunk.loadedBlockCount += 1
      this.loadedBlockCount += 1
    } else if (previousBlockId !== BlockId.Air && blockId === BlockId.Air) {
      chunk.loadedBlockCount -= 1
      this.loadedBlockCount -= 1
    }

    this.markChangedBlock(cx, cz, lx, lz, worldX, worldY, worldZ)

    return true
  }

  rebuildDirtyChunks(maxPerFrame = 2) {
    let rebuilt = 0

    for (const key of this.dirtyChunks) {
      const chunk = this.chunks.get(key)
      this.dirtyChunks.delete(key)

      if (chunk) {
        this.rebuildChunkMesh(chunk)
        rebuilt += 1
      }

      if (rebuilt >= maxPerFrame) {
        break
      }
    }

    return rebuilt
  }

  updateFluids(deltaTime: number) {
    let totalProcessed = 0
    let totalChanged = 0

    for (const blockId of FLUID_BLOCK_IDS) {
      this.setLastFluidStepStats(blockId, 0, 0)
      const rule = getFluidRule(blockId)
      const accumulated = (this.fluidTickAccumulators.get(blockId) ?? 0) + deltaTime
      if (accumulated < rule.tickSeconds) {
        this.fluidTickAccumulators.set(blockId, accumulated)
        continue
      }

      this.fluidTickAccumulators.set(blockId, accumulated % rule.tickSeconds)
      const stats = this.processFluidQueue(blockId, rule.maxUpdatesPerTick)
      this.setLastFluidStepStats(blockId, stats.processed, stats.changed)
      totalProcessed += stats.processed
      totalChanged += stats.changed
    }

    return totalChanged
  }

  stepFluids() {
    let totalChanged = 0

    for (const blockId of FLUID_BLOCK_IDS) {
      const rule = getFluidRule(blockId)
      const stats = this.processFluidQueue(blockId, rule.maxUpdatesPerTick)
      this.setLastFluidStepStats(blockId, stats.processed, stats.changed)
      totalChanged += stats.changed
    }

    return totalChanged
  }

  clearFlowingFluids() {
    const positions: BlockPosition[] = []

    for (const chunk of this.chunks.values()) {
      for (let y = 0; y < WORLD_HEIGHT; y += 1) {
        for (let z = 0; z < CHUNK_SIZE; z += 1) {
          for (let x = 0; x < CHUNK_SIZE; x += 1) {
            const index = blockIndex(x, y, z)
            if (
              isBlockLiquid(chunk.data[index] as BlockId) &&
              chunk.fluidLevels[index] !== FLUID_NONE &&
              chunk.fluidLevels[index] !== FLUID_SOURCE_LEVEL
            ) {
              positions.push({
                x: chunk.cx * CHUNK_SIZE + x,
                y,
                z: chunk.cz * CHUNK_SIZE + z,
              })
            }
          }
        }
      }
    }

    for (const position of positions) {
      this.setSimulatedBlock(position.x, position.y, position.z, BlockId.Air, {
        markEdited: false,
        queueFluid: false,
      })
    }

    this.clearFluidQueues()
    return positions.length
  }

  private processFluidQueue(blockId: BlockId, maxUpdates: number) {
    const queue = this.getFluidQueue(blockId)
    let processed = 0
    let changed = 0

    while (processed < maxUpdates && queue.size > 0) {
      const key = queue.values().next().value
      if (key === undefined) {
        break
      }

      queue.delete(key)
      const position = parseFluidQueueKey(key)
      if (
        position &&
        this.getBlock(position.x, position.y, position.z) === blockId &&
        this.updateFluidCell(position.x, position.y, position.z)
      ) {
        changed += 1
      }
      processed += 1
    }

    return { processed, changed }
  }

  intersectsSolid(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ) {
    const startX = Math.floor(minX)
    const endX = Math.floor(maxX - 1e-6)
    const startY = Math.floor(minY)
    const endY = Math.floor(maxY - 1e-6)
    const startZ = Math.floor(minZ)
    const endZ = Math.floor(maxZ - 1e-6)

    for (let y = startY; y <= endY; y += 1) {
      for (let z = startZ; z <= endZ; z += 1) {
        for (let x = startX; x <= endX; x += 1) {
          if (isBlockSolid(this.getBlock(x, y, z))) {
            return true
          }
        }
      }
    }

    return false
  }

  raycastVoxel(origin: Vector3, direction: Vector3, maxDistance = 8): VoxelRaycastHit | null {
    const rayDirection = direction.clone().normalize()
    if (rayDirection.lengthSq() === 0) {
      return null
    }

    let blockX = Math.floor(origin.x)
    let blockY = Math.floor(origin.y)
    let blockZ = Math.floor(origin.z)

    const stepX = Math.sign(rayDirection.x)
    const stepY = Math.sign(rayDirection.y)
    const stepZ = Math.sign(rayDirection.z)

    const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / rayDirection.x)
    const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / rayDirection.y)
    const tDeltaZ = stepZ === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / rayDirection.z)

    let tMaxX = stepX > 0 ? (blockX + 1 - origin.x) / rayDirection.x : (origin.x - blockX) / -rayDirection.x
    let tMaxY = stepY > 0 ? (blockY + 1 - origin.y) / rayDirection.y : (origin.y - blockY) / -rayDirection.y
    let tMaxZ = stepZ > 0 ? (blockZ + 1 - origin.z) / rayDirection.z : (origin.z - blockZ) / -rayDirection.z

    if (stepX === 0) {
      tMaxX = Number.POSITIVE_INFINITY
    }
    if (stepY === 0) {
      tMaxY = Number.POSITIVE_INFINITY
    }
    if (stepZ === 0) {
      tMaxZ = Number.POSITIVE_INFINITY
    }

    const normal = new Vector3()
    let distance = 0

    while (distance <= maxDistance) {
      const blockId = this.getBlock(blockX, blockY, blockZ)
      if (isBlockRaycastTarget(blockId)) {
        return {
          distance,
          point: origin.clone().addScaledVector(rayDirection, distance),
          normal: normal.clone(),
          block: {
            x: blockX,
            y: blockY,
            z: blockZ,
          },
          blockId,
        }
      }

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        blockX += stepX
        distance = tMaxX
        tMaxX += tDeltaX
        normal.set(-stepX, 0, 0)
      } else if (tMaxY < tMaxZ) {
        blockY += stepY
        distance = tMaxY
        tMaxY += tDeltaY
        normal.set(0, -stepY, 0)
      } else {
        blockZ += stepZ
        distance = tMaxZ
        tMaxZ += tDeltaZ
        normal.set(0, 0, -stepZ)
      }
    }

    return null
  }

  private markChunkDirty(cx: number, cz: number) {
    this.dirtyChunks.add(chunkKey(cx, cz))
  }

  private markChangedBlock(
    cx: number,
    cz: number,
    lx: number,
    lz: number,
    worldX: number,
    worldY: number,
    worldZ: number,
    options: MarkChangedBlockOptions = {},
  ) {
    const { markEdited = true, queueFluid = true } = options

    if (markEdited) {
      this.editedChunkKeys.add(chunkKey(cx, cz))
    }

    this.markChunkDirty(cx, cz)

    if (lx === 0) {
      this.markChunkDirty(cx - 1, cz)
    }
    if (lx === CHUNK_SIZE - 1) {
      this.markChunkDirty(cx + 1, cz)
    }
    if (lz === 0) {
      this.markChunkDirty(cx, cz - 1)
    }
    if (lz === CHUNK_SIZE - 1) {
      this.markChunkDirty(cx, cz + 1)
    }

    if (queueFluid) {
      this.queueFluidAround(worldX, worldY, worldZ)
    }
  }

  private createFluidBlockStats(blockId: BlockId): FluidBlockStats {
    return {
      active: 0,
      queued: this.fluidUpdateQueues.get(blockId)?.size ?? 0,
      processed: this.lastFluidProcessedByBlock.get(blockId) ?? 0,
      changed: this.lastFluidChangedByBlock.get(blockId) ?? 0,
    }
  }

  private setLastFluidStepStats(blockId: BlockId, processed: number, changed: number) {
    this.lastFluidProcessedByBlock.set(blockId, processed)
    this.lastFluidChangedByBlock.set(blockId, changed)
  }

  private getLoadedChunkAt(worldX: number, worldZ: number) {
    const cx = floorDiv(worldX, CHUNK_SIZE)
    const cz = floorDiv(worldZ, CHUNK_SIZE)
    const chunk = this.chunks.get(chunkKey(cx, cz))

    if (!chunk) {
      return null
    }

    return {
      chunk,
      cx,
      cz,
      lx: mod(worldX, CHUNK_SIZE),
      lz: mod(worldZ, CHUNK_SIZE),
    }
  }

  private getFluidQueue(blockId: BlockId) {
    let queue = this.fluidUpdateQueues.get(blockId)
    if (!queue) {
      queue = new Set<string>()
      this.fluidUpdateQueues.set(blockId, queue)
    }

    return queue
  }

  private clearFluidQueues() {
    for (const queue of this.fluidUpdateQueues.values()) {
      queue.clear()
    }
  }

  private queueFluidUpdate(worldX: number, worldY: number, worldZ: number) {
    if (worldY < 0 || worldY >= WORLD_HEIGHT) {
      return
    }

    const loaded = this.getLoadedChunkAt(worldX, worldZ)
    if (!loaded) {
      return
    }

    const blockId = loaded.chunk.data[blockIndex(loaded.lx, worldY, loaded.lz)] as BlockId
    if (!isBlockLiquid(blockId)) {
      return
    }

    this.getFluidQueue(blockId).add(fluidQueueKey(worldX, worldY, worldZ))
  }

  private queueFluidAround(worldX: number, worldY: number, worldZ: number) {
    const neighbors = [
      [0, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as const

    for (const [dx, dy, dz] of neighbors) {
      this.queueFluidUpdate(worldX + dx, worldY + dy, worldZ + dz)
    }
  }

  private setSimulatedBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
    blockId: BlockId,
    options: MarkChangedBlockOptions = { markEdited: false, queueFluid: true },
  ) {
    if (worldY < 0 || worldY >= WORLD_HEIGHT) {
      return false
    }
    if (blockId !== BlockId.Air && !blockMaterialMap.has(blockId)) {
      return false
    }

    const loaded = this.getLoadedChunkAt(worldX, worldZ)
    if (!loaded) {
      return false
    }

    const { chunk, cx, cz, lx, lz } = loaded
    const index = blockIndex(lx, worldY, lz)
    const previousBlockId = chunk.data[index] as BlockId

    if (previousBlockId === blockId) {
      return false
    }

    chunk.data[index] = blockId
    chunk.fluidLevels[index] = isBlockLiquid(blockId) ? FLUID_SOURCE_LEVEL : FLUID_NONE
    if (previousBlockId === BlockId.Air && blockId !== BlockId.Air) {
      chunk.loadedBlockCount += 1
      this.loadedBlockCount += 1
    } else if (previousBlockId !== BlockId.Air && blockId === BlockId.Air) {
      chunk.loadedBlockCount -= 1
      this.loadedBlockCount -= 1
    }

    this.markChangedBlock(cx, cz, lx, lz, worldX, worldY, worldZ, {
      markEdited: false,
      queueFluid: true,
      ...options,
    })
    return true
  }

  private setFluidBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId, fluidLevel: number) {
    if (worldY < 0 || worldY >= WORLD_HEIGHT) {
      return false
    }
    if (blockId !== BlockId.Air && !isBlockLiquid(blockId)) {
      return false
    }

    const loaded = this.getLoadedChunkAt(worldX, worldZ)
    if (!loaded) {
      return false
    }

    const { chunk, cx, cz, lx, lz } = loaded
    const index = blockIndex(lx, worldY, lz)
    const previousBlockId = chunk.data[index] as BlockId
    const previousFluidLevel = chunk.fluidLevels[index] ?? FLUID_NONE
    const nextFluidLevel = isBlockLiquid(blockId) ? fluidLevel : FLUID_NONE

    if (previousBlockId === blockId && previousFluidLevel === nextFluidLevel) {
      return false
    }

    chunk.data[index] = blockId
    chunk.fluidLevels[index] = nextFluidLevel
    if (previousBlockId === BlockId.Air && blockId !== BlockId.Air) {
      chunk.loadedBlockCount += 1
      this.loadedBlockCount += 1
    } else if (previousBlockId !== BlockId.Air && blockId === BlockId.Air) {
      chunk.loadedBlockCount -= 1
      this.loadedBlockCount -= 1
    }

    this.markChangedBlock(cx, cz, lx, lz, worldX, worldY, worldZ, {
      markEdited: false,
      queueFluid: true,
    })
    return true
  }

  private canFluidFlowInto(blockId: BlockId, worldX: number, worldY: number, worldZ: number) {
    if (worldY < 0 || worldY >= WORLD_HEIGHT) {
      return false
    }

    const loaded = this.getLoadedChunkAt(worldX, worldZ)
    if (!loaded) {
      return false
    }

    const targetIndex = blockIndex(loaded.lx, worldY, loaded.lz)
    const targetBlockId = loaded.chunk.data[targetIndex] as BlockId

    if (targetBlockId === BlockId.Air) {
      return true
    }

    if (targetBlockId === blockId && loaded.chunk.fluidLevels[targetIndex] !== FLUID_SOURCE_LEVEL) {
      return true
    }

    return isDestroyedByFluid(targetBlockId, blockId)
  }

  private tryFlowInto(blockId: BlockId, worldX: number, worldY: number, worldZ: number, fluidLevel: number) {
    if (!this.canFluidFlowInto(blockId, worldX, worldY, worldZ)) {
      return false
    }

    const loaded = this.getLoadedChunkAt(worldX, worldZ)
    if (!loaded) {
      return false
    }

    const targetIndex = blockIndex(loaded.lx, worldY, loaded.lz)
    const targetBlockId = loaded.chunk.data[targetIndex] as BlockId
    const targetFluidLevel = loaded.chunk.fluidLevels[targetIndex] ?? FLUID_NONE
    const canOverwrite =
      targetBlockId === BlockId.Air ||
      targetBlockId === blockId ||
      isDestroyedByFluid(targetBlockId, blockId)

    if (canOverwrite && (targetBlockId !== blockId || fluidLevel < targetFluidLevel)) {
      return this.setFluidBlock(worldX, worldY, worldZ, blockId, fluidLevel)
    }

    return false
  }

  private tryFluidReaction(blockId: BlockId, worldX: number, worldY: number, worldZ: number) {
    if (blockId !== BlockId.Water && blockId !== BlockId.Lava) {
      return false
    }

    const oppositeBlockId = blockId === BlockId.Water ? BlockId.Lava : BlockId.Water

    for (const [dx, dy, dz] of fluidReactionNeighbors) {
      const neighborX = worldX + dx
      const neighborY = worldY + dy
      const neighborZ = worldZ + dz

      if (this.getBlock(neighborX, neighborY, neighborZ) !== oppositeBlockId) {
        continue
      }

      if (blockId === BlockId.Lava) {
        return this.setSimulatedBlock(worldX, worldY, worldZ, BlockId.Stone)
      }

      return this.setSimulatedBlock(neighborX, neighborY, neighborZ, BlockId.Stone)
    }

    return false
  }

  private getDesiredFluidLevel(blockId: BlockId, worldX: number, worldY: number, worldZ: number) {
    const { maxLevel } = getFluidRule(blockId)
    let desiredLevel = FLUID_NONE
    const aboveLevel = this.getFluidLevel(worldX, worldY + 1, worldZ)

    if (this.getBlock(worldX, worldY + 1, worldZ) === blockId && aboveLevel !== FLUID_NONE) {
      desiredLevel = Math.min(desiredLevel, Math.max(1, aboveLevel))
    }

    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const

    for (const [dx, dz] of neighbors) {
      const neighborLevel = this.getFluidLevel(worldX + dx, worldY, worldZ + dz)
      if (
        this.getBlock(worldX + dx, worldY, worldZ + dz) === blockId &&
        neighborLevel !== FLUID_NONE &&
        neighborLevel < maxLevel
      ) {
        desiredLevel = Math.min(desiredLevel, neighborLevel + 1)
      }
    }

    return desiredLevel
  }

  private updateFluidCell(worldX: number, worldY: number, worldZ: number) {
    const loaded = this.getLoadedChunkAt(worldX, worldZ)
    if (!loaded || worldY < 0 || worldY >= WORLD_HEIGHT) {
      return false
    }

    const index = blockIndex(loaded.lx, worldY, loaded.lz)
    const blockId = loaded.chunk.data[index] as BlockId
    const currentLevel = loaded.chunk.fluidLevels[index] ?? FLUID_NONE
    const { maxLevel } = getFluidRule(blockId)

    if (!isBlockLiquid(blockId)) {
      if (currentLevel !== FLUID_NONE) {
        loaded.chunk.fluidLevels[index] = FLUID_NONE
      }
      return false
    }

    if (currentLevel === FLUID_NONE) {
      return this.setFluidBlock(worldX, worldY, worldZ, blockId, FLUID_SOURCE_LEVEL)
    }

    if (this.tryFluidReaction(blockId, worldX, worldY, worldZ)) {
      return true
    }

    if (currentLevel !== FLUID_SOURCE_LEVEL) {
      const desiredLevel = this.getDesiredFluidLevel(blockId, worldX, worldY, worldZ)

      if (desiredLevel === FLUID_NONE) {
        return this.setFluidBlock(worldX, worldY, worldZ, BlockId.Air, FLUID_NONE)
      }
      if (desiredLevel !== currentLevel) {
        return this.setFluidBlock(worldX, worldY, worldZ, blockId, desiredLevel)
      }
    }

    let changed = false
    const downwardLevel = Math.max(1, currentLevel)
    if (this.tryFlowInto(blockId, worldX, worldY - 1, worldZ, downwardLevel)) {
      changed = true
    }

    if (!this.canFluidFlowInto(blockId, worldX, worldY - 1, worldZ) && currentLevel < maxLevel) {
      const nextLevel = currentLevel + 1
      changed = this.tryFlowInto(blockId, worldX + 1, worldY, worldZ, nextLevel) || changed
      changed = this.tryFlowInto(blockId, worldX - 1, worldY, worldZ, nextLevel) || changed
      changed = this.tryFlowInto(blockId, worldX, worldY, worldZ + 1, nextLevel) || changed
      changed = this.tryFlowInto(blockId, worldX, worldY, worldZ - 1, nextLevel) || changed
    }

    return changed
  }

  private markLoadedNeighborsDirty(cx: number, cz: number) {
    const neighbors = [
      [cx - 1, cz],
      [cx + 1, cz],
      [cx, cz - 1],
      [cx, cz + 1],
    ] as const

    for (const [nx, nz] of neighbors) {
      if (this.chunks.has(chunkKey(nx, nz))) {
        this.markChunkDirty(nx, nz)
      }
    }
  }

  private isBlockVisible(worldX: number, worldY: number, worldZ: number) {
    const neighbors = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as const

    for (const [dx, dy, dz] of neighbors) {
      if (!isBlockOpaqueOccluder(this.getBlock(worldX + dx, worldY + dy, worldZ + dz))) {
        return true
      }
    }

    return false
  }

  private seedFluidUpdates(chunk: Chunk) {
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let z = 0; z < CHUNK_SIZE; z += 1) {
        for (let x = 0; x < CHUNK_SIZE; x += 1) {
          const index = blockIndex(x, y, z)
          if (isBlockLiquid(chunk.data[index] as BlockId)) {
            this.queueFluidUpdate(chunk.cx * CHUNK_SIZE + x, y, chunk.cz * CHUNK_SIZE + z)
          }
        }
      }
    }
  }

  private seedLoadedNeighborFluidUpdates(cx: number, cz: number) {
    const neighbors = [
      [cx - 1, cz],
      [cx + 1, cz],
      [cx, cz - 1],
      [cx, cz + 1],
    ] as const

    for (const [nx, nz] of neighbors) {
      const neighborChunk = this.chunks.get(chunkKey(nx, nz))
      if (neighborChunk) {
        this.seedFluidUpdates(neighborChunk)
      }
    }
  }

  private removeQueuedFluidUpdatesForChunk(cx: number, cz: number) {
    for (const queue of this.fluidUpdateQueues.values()) {
      for (const key of queue) {
        const position = parseFluidQueueKey(key)
        if (
          position &&
          floorDiv(position.x, CHUNK_SIZE) === cx &&
          floorDiv(position.z, CHUNK_SIZE) === cz
        ) {
          queue.delete(key)
        }
      }
    }
  }

  private persistEditedChunk(key: string, chunk: Chunk) {
    this.editedChunkData.set(key, {
      data: chunk.data.slice(),
      fluidLevels: chunk.fluidLevels.slice(),
    })
  }

  private clearLoadedChunks() {
    for (const chunk of this.chunks.values()) {
      this.removeChunkMeshes(chunk)
    }

    this.chunks.clear()
    this.dirtyChunks.clear()
    this.clearFluidQueues()
    this.loadedBlockCount = 0
    this.renderedBlockCount = 0
  }

  private loadChunk(cx: number, cz: number) {
    const key = chunkKey(cx, cz)
    const cached = this.chunks.get(key)
    if (cached) {
      return cached
    }

    const savedChunk = this.editedChunkData.get(key)
    const generated = savedChunk
      ? {
          data: savedChunk.data.slice(),
          fluidLevels: savedChunk.fluidLevels.slice(),
          loadedBlockCount: countLoadedBlocks(savedChunk.data),
        }
      : generateChunk(cx, cz)
    const chunk: Chunk = {
      cx,
      cz,
      data: generated.data,
      fluidLevels: 'fluidLevels' in generated ? generated.fluidLevels : createInitialFluidLevels(generated.data),
      meshes: [],
      instancesByBlock: {},
      loadedBlockCount: generated.loadedBlockCount,
      renderedBlockCount: 0,
    }

    this.chunks.set(key, chunk)
    this.loadedBlockCount += chunk.loadedBlockCount
    this.rebuildChunkMesh(chunk)
    if (this.worldgenFluidSimulationEnabled) {
      this.seedFluidUpdates(chunk)
      this.seedLoadedNeighborFluidUpdates(cx, cz)
    }
    this.markLoadedNeighborsDirty(cx, cz)
    return chunk
  }

  private unloadChunk(key: string, chunk: Chunk) {
    const { cx, cz } = chunk

    if (this.editedChunkKeys.has(key)) {
      this.persistEditedChunk(key, chunk)
    }

    this.removeQueuedFluidUpdatesForChunk(cx, cz)
    this.removeChunkMeshes(chunk)
    this.dirtyChunks.delete(key)
    this.chunks.delete(key)
    this.loadedBlockCount -= chunk.loadedBlockCount
    this.renderedBlockCount -= chunk.renderedBlockCount
    this.markLoadedNeighborsDirty(cx, cz)
  }

  private removeChunkMeshes(chunk: Chunk) {
    for (const mesh of chunk.meshes) {
      this.scene.remove(mesh)
      if (mesh.userData.disposeGeometry === true) {
        mesh.geometry.dispose()
      }
      if (mesh instanceof InstancedMesh) {
        mesh.dispose()
      }
    }
    chunk.meshes = []
  }

  private rebuildChunkMesh(chunk: Chunk) {
    this.renderedBlockCount -= chunk.renderedBlockCount
    this.removeChunkMeshes(chunk)
    chunk.instancesByBlock = {}
    chunk.renderedBlockCount = 0

    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let z = 0; z < CHUNK_SIZE; z += 1) {
        for (let x = 0; x < CHUNK_SIZE; x += 1) {
          const blockId = chunk.data[blockIndex(x, y, z)] as BlockId
          if (blockId === BlockId.Air) {
            continue
          }

          const worldX = chunk.cx * CHUNK_SIZE + x
          const worldZ = chunk.cz * CHUNK_SIZE + z
          const shape = getBlockShape(blockId)
          const fluidLevel = chunk.fluidLevels[blockIndex(x, y, z)] ?? FLUID_NONE
          if (
            shape === 'liquid' &&
            !hasVisibleLiquidFaces(
              blockId,
              worldX,
              y,
              worldZ,
              fluidLevel,
              (blockX, blockY, blockZ) => this.getBlock(blockX, blockY, blockZ),
              (blockX, blockY, blockZ) => this.getFluidLevel(blockX, blockY, blockZ),
            )
          ) {
            continue
          }
          if (shape !== 'liquid' && !this.isBlockVisible(worldX, y, worldZ)) {
            continue
          }

          const instances = (chunk.instancesByBlock[blockId] ??= [])
          instances.push({
            x: worldX,
            y,
            z: worldZ,
            fluidLevel,
          })
          chunk.renderedBlockCount += 1
        }
      }
    }

    this.renderedBlockCount += chunk.renderedBlockCount

    for (const definition of PLACEABLE_BLOCKS) {
      const instances = chunk.instancesByBlock[definition.id]
      const materials = blockMaterialMap.get(definition.id)
      if (!instances || instances.length === 0 || !materials) {
        continue
      }

      const renderLayer = getBlockRenderLayer(definition.id)
      const shape = getBlockShape(definition.id)
      if (shape === 'liquid') {
        const mesh = buildLiquidMesh({
          blockId: definition.id,
          cells: instances,
          material: materials,
          getBlock: (blockX, blockY, blockZ) => this.getBlock(blockX, blockY, blockZ),
          getFluidLevel: (blockX, blockY, blockZ) => this.getFluidLevel(blockX, blockY, blockZ),
        })

        if (!mesh) {
          continue
        }

        mesh.castShadow = false
        mesh.receiveShadow = false
        mesh.renderOrder = renderOrderByLayer[renderLayer]
        mesh.userData.chunkKey = chunkKey(chunk.cx, chunk.cz)
        mesh.userData.blockId = definition.id
        mesh.userData.renderLayer = renderLayer
        this.scene.add(mesh)
        chunk.meshes.push(mesh)
        continue
      }

      const geometry = shape === 'cross' ? crossGeometry : blockGeometry
      const mesh = new InstancedMesh(geometry, materials, instances.length)
      mesh.castShadow =
        definition.solid && renderLayer !== 'transparent' && renderLayer !== 'liquid'
      mesh.receiveShadow = renderLayer !== 'liquid'
      mesh.renderOrder = renderOrderByLayer[renderLayer]
      mesh.userData.chunkKey = chunkKey(chunk.cx, chunk.cz)
      mesh.userData.blockId = definition.id
      mesh.userData.renderLayer = renderLayer

      for (let index = 0; index < instances.length; index += 1) {
        const block = instances[index]
        instanceMatrix.setPosition(block.x + 0.5, block.y + 0.5, block.z + 0.5)
        mesh.setMatrixAt(index, instanceMatrix)
      }

      mesh.instanceMatrix.needsUpdate = true
      this.scene.add(mesh)
      chunk.meshes.push(mesh)
    }
  }
}
