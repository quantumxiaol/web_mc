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
  getBlockShape,
  getBlockRenderLayer,
  isBlockOpaqueOccluder,
  isBlockRaycastTarget,
  isBlockSolid,
  type BlockDefinition,
  type BlockRenderLayer,
} from './blocks'
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

interface Chunk {
  cx: number
  cz: number
  data: Uint8Array
  meshes: ChunkMesh[]
  instancesByBlock: Partial<Record<BlockId, BlockPosition[]>>
  loadedBlockCount: number
  renderedBlockCount: number
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

const floorDiv = (value: number, size: number) => Math.floor(value / size)

const mod = (value: number, size: number) => ((value % size) + size) % size

const blockIndex = (x: number, y: number, z: number) =>
  y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x

const renderOrderByLayer: Record<BlockRenderLayer, number> = {
  opaque: 0,
  cutout: 1,
  emissive: 1,
  transparent: 2,
  liquid: 3,
}

export class VoxelWorld {
  private readonly chunks = new Map<string, Chunk>()
  private readonly dirtyChunks = new Set<string>()
  private readonly scene: Scene
  private loadedBlockCount = 0
  private renderedBlockCount = 0

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
    if (previousBlockId === BlockId.Air && blockId !== BlockId.Air) {
      chunk.loadedBlockCount += 1
      this.loadedBlockCount += 1
    } else if (previousBlockId !== BlockId.Air && blockId === BlockId.Air) {
      chunk.loadedBlockCount -= 1
      this.loadedBlockCount -= 1
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

  private loadChunk(cx: number, cz: number) {
    const key = chunkKey(cx, cz)
    const cached = this.chunks.get(key)
    if (cached) {
      return cached
    }

    const generated = generateChunk(cx, cz)
    const chunk: Chunk = {
      cx,
      cz,
      data: generated.data,
      meshes: [],
      instancesByBlock: {},
      loadedBlockCount: generated.loadedBlockCount,
      renderedBlockCount: 0,
    }

    this.chunks.set(key, chunk)
    this.loadedBlockCount += chunk.loadedBlockCount
    this.rebuildChunkMesh(chunk)
    this.markLoadedNeighborsDirty(cx, cz)
    return chunk
  }

  private unloadChunk(key: string, chunk: Chunk) {
    const { cx, cz } = chunk

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
          if (
            shape === 'liquid' &&
            !hasVisibleLiquidFaces(blockId, worldX, y, worldZ, (blockX, blockY, blockZ) =>
              this.getBlock(blockX, blockY, blockZ),
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
