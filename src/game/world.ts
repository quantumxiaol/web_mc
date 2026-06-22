import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Raycaster,
  Scene,
} from 'three'
import {
  BlockId,
  PLACEABLE_BLOCKS,
  isBlockSolid,
  type BlockDefinition,
} from './blocks'
import { createBlockMaterials } from './materials'

export const CHUNK_SIZE = 16
export const WORLD_HEIGHT = 16
export const LOAD_RADIUS = 2

export interface BlockPosition {
  x: number
  y: number
  z: number
}

export type PlaceableBlockDefinition = BlockDefinition

interface Chunk {
  cx: number
  cz: number
  data: Uint8Array
  meshes: InstancedMesh<BoxGeometry, MeshStandardMaterial[]>[]
  instancesByBlock: Partial<Record<BlockId, BlockPosition[]>>
}

const blockGeometry = new BoxGeometry(1, 1, 1)
const blockMaterialMap = new Map<BlockId, MeshStandardMaterial[]>(
  PLACEABLE_BLOCKS.map((definition) => [definition.id, createBlockMaterials(definition)] as const),
)

const instanceMatrix = new Matrix4()

const chunkKey = (cx: number, cz: number) => `${cx},${cz}`

const floorDiv = (value: number, size: number) => Math.floor(value / size)

const mod = (value: number, size: number) => ((value % size) + size) % size

const blockIndex = (x: number, y: number, z: number) =>
  y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x

const surfaceBlockFor = (worldX: number, worldZ: number, height: number): BlockId => {
  const warmth = Math.sin(worldX * 0.045) + Math.cos(worldZ * 0.04)
  const moisture = Math.sin((worldX - worldZ) * 0.034)

  if (height >= 6 || warmth < -1.1) {
    return BlockId.Snow
  }

  if (warmth > 1.15) {
    return moisture > 0.4 ? BlockId.RedSand : BlockId.Sand
  }

  if (moisture < -0.72) {
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
  const oreNoise = Math.abs(
    Math.sin(worldX * 12.9898 + worldY * 78.233 + worldZ * 37.719) * 43758.5453,
  ) % 1

  if (worldY <= 2 && oreNoise > 0.992) {
    return BlockId.StoneDiamond
  }
  if (worldY <= 3 && oreNoise > 0.986) {
    return BlockId.GreystoneRuby
  }
  if (worldY <= 4 && oreNoise > 0.976) {
    return BlockId.StoneGold
  }
  if (worldY <= 5 && oreNoise > 0.958) {
    return BlockId.StoneIron
  }
  if (oreNoise > 0.935) {
    return BlockId.StoneCoal
  }

  return BlockId.Stone
}

export class VoxelWorld {
  private readonly chunks = new Map<string, Chunk>()
  private readonly raycastTargets: InstancedMesh<BoxGeometry, MeshStandardMaterial[]>[] = []
  private readonly scene: Scene

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
    let total = 0
    for (const chunk of this.chunks.values()) {
      for (const blockId of PLACEABLE_BLOCKS) {
        total += chunk.instancesByBlock[blockId.id]?.length ?? 0
      }
    }
    return total
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

    if (chunk.data[index] === blockId) {
      return false
    }

    chunk.data[index] = blockId
    this.rebuildChunkMesh(chunk)
    return true
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

  raycast(raycaster: Raycaster) {
    const intersections = raycaster.intersectObjects(this.raycastTargets, false)
    const hit = intersections[0]
    if (!hit || hit.instanceId === undefined) {
      return null
    }

    const mesh = hit.object as InstancedMesh<BoxGeometry, MeshStandardMaterial[]>
    const key = mesh.userData.chunkKey as string | undefined
    const blockId = mesh.userData.blockId as BlockId | undefined
    if (!key || blockId === undefined) {
      return null
    }

    const chunk = this.chunks.get(key)
    if (!chunk) {
      return null
    }

    const block = chunk.instancesByBlock[blockId]?.[hit.instanceId]
    if (!block || !hit.face) {
      return null
    }

    return {
      distance: hit.distance,
      point: hit.point.clone(),
      normal: hit.face.normal.clone().round(),
      block,
      blockId,
    }
  }

  private loadChunk(cx: number, cz: number) {
    const key = chunkKey(cx, cz)
    const cached = this.chunks.get(key)
    if (cached) {
      return cached
    }

    const chunk: Chunk = {
      cx,
      cz,
      data: this.generateChunk(cx, cz),
      meshes: [],
      instancesByBlock: {},
    }

    this.chunks.set(key, chunk)
    this.rebuildChunkMesh(chunk)
    return chunk
  }

  private unloadChunk(key: string, chunk: Chunk) {
    this.removeChunkMeshes(chunk)
    this.chunks.delete(key)
  }

  private removeChunkMeshes(chunk: Chunk) {
    for (const mesh of chunk.meshes) {
      this.scene.remove(mesh)
      const index = this.raycastTargets.indexOf(mesh)
      if (index >= 0) {
        this.raycastTargets.splice(index, 1)
      }
    }
    chunk.meshes = []
  }

  private generateChunk(cx: number, cz: number) {
    const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)

    for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
      for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
        const worldX = cx * CHUNK_SIZE + lx
        const worldZ = cz * CHUNK_SIZE + lz

        const ridge =
          Math.sin(worldX * 0.17) * 1.4 +
          Math.cos(worldZ * 0.12) * 1.3 +
          Math.sin((worldX + worldZ) * 0.08) * 0.9
        const height = Math.max(1, Math.min(7, Math.round(3 + ridge)))
        const topBlock = surfaceBlockFor(worldX, worldZ, height)
        const soilBlock = soilBlockFor(topBlock)

        for (let y = 0; y <= height; y += 1) {
          let blockId = stoneBlockFor(worldX, y, worldZ)
          if (y === height) {
            blockId = topBlock
          } else if (y >= height - 2) {
            blockId = soilBlock
          }
          data[blockIndex(lx, y, lz)] = blockId
        }
      }
    }

    return data
  }

  private rebuildChunkMesh(chunk: Chunk) {
    this.removeChunkMeshes(chunk)
    chunk.instancesByBlock = {}

    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let z = 0; z < CHUNK_SIZE; z += 1) {
        for (let x = 0; x < CHUNK_SIZE; x += 1) {
          const blockId = chunk.data[blockIndex(x, y, z)] as BlockId
          if (blockId === BlockId.Air) {
            continue
          }

          const instances = (chunk.instancesByBlock[blockId] ??= [])
          instances.push({
            x: chunk.cx * CHUNK_SIZE + x,
            y,
            z: chunk.cz * CHUNK_SIZE + z,
          })
        }
      }
    }

    for (const definition of PLACEABLE_BLOCKS) {
      const instances = chunk.instancesByBlock[definition.id]
      const materials = blockMaterialMap.get(definition.id)
      if (!instances || instances.length === 0 || !materials) {
        continue
      }

      const mesh = new InstancedMesh(blockGeometry, materials, instances.length)
      mesh.castShadow = definition.solid && definition.materialKind !== 'transparent' && definition.materialKind !== 'liquid'
      mesh.receiveShadow = definition.materialKind !== 'liquid'
      mesh.userData.chunkKey = chunkKey(chunk.cx, chunk.cz)
      mesh.userData.blockId = definition.id

      for (let index = 0; index < instances.length; index += 1) {
        const block = instances[index]
        instanceMatrix.setPosition(block.x + 0.5, block.y + 0.5, block.z + 0.5)
        mesh.setMatrixAt(index, instanceMatrix)
      }

      mesh.instanceMatrix.needsUpdate = true
      this.scene.add(mesh)
      this.raycastTargets.push(mesh)
      chunk.meshes.push(mesh)
    }
  }
}
