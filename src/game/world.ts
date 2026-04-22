import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  NearestFilter,
  NearestMipmapNearestFilter,
  Raycaster,
  Scene,
  SRGBColorSpace,
  TextureLoader,
} from 'three'

export const CHUNK_SIZE = 16
export const WORLD_HEIGHT = 16
const LOAD_RADIUS = 2
const assetBase = import.meta.env.BASE_URL

export const BlockId = {
  Air: 0,
  Grass: 1,
} as const

export type BlockId = (typeof BlockId)[keyof typeof BlockId]

export interface BlockPosition {
  x: number
  y: number
  z: number
}

interface Chunk {
  cx: number
  cz: number
  data: Uint8Array
  mesh?: InstancedMesh<BoxGeometry, MeshLambertMaterial[]>
  instances: BlockPosition[]
}

const blockGeometry = new BoxGeometry(1, 1, 1)
const textureLoader = new TextureLoader()

const loadVoxelTexture = (path: string) => {
  const texture = textureLoader.load(`${assetBase}${path}`)
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = NearestFilter
  texture.minFilter = NearestMipmapNearestFilter
  return texture
}

const grassTopTexture = loadVoxelTexture('kenney_voxel-pack/PNG/Tiles/grass_top.png')
const dirtTexture = loadVoxelTexture('kenney_voxel-pack/PNG/Tiles/dirt.png')
const grassSideTexture = loadVoxelTexture('kenney_voxel-pack/PNG/Tiles/dirt_grass.png')

const blockMaterials = [
  new MeshLambertMaterial({ map: grassSideTexture }),
  new MeshLambertMaterial({ map: grassSideTexture }),
  new MeshLambertMaterial({ map: grassTopTexture }),
  new MeshLambertMaterial({ map: dirtTexture }),
  new MeshLambertMaterial({ map: grassSideTexture }),
  new MeshLambertMaterial({ map: grassSideTexture }),
]

const instanceMatrix = new Matrix4()

const chunkKey = (cx: number, cz: number) => `${cx},${cz}`

const floorDiv = (value: number, size: number) => Math.floor(value / size)

const mod = (value: number, size: number) => ((value % size) + size) % size

const blockIndex = (x: number, y: number, z: number) =>
  y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x

export class VoxelWorld {
  private readonly chunks = new Map<string, Chunk>()
  private readonly raycastTargets: InstancedMesh<BoxGeometry, MeshLambertMaterial[]>[] = []

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
      total += chunk.instances.length
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
    return chunk.data[blockIndex(lx, worldY, lz)] ?? BlockId.Air
  }

  setBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId) {
    if (worldY < 0 || worldY >= WORLD_HEIGHT) {
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

  intersectsSolid(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) {
    const startX = Math.floor(minX)
    const endX = Math.floor(maxX - 1e-6)
    const startY = Math.floor(minY)
    const endY = Math.floor(maxY - 1e-6)
    const startZ = Math.floor(minZ)
    const endZ = Math.floor(maxZ - 1e-6)

    for (let y = startY; y <= endY; y += 1) {
      for (let z = startZ; z <= endZ; z += 1) {
        for (let x = startX; x <= endX; x += 1) {
          if (this.getBlock(x, y, z) !== BlockId.Air) {
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

    const mesh = hit.object as InstancedMesh<BoxGeometry, MeshLambertMaterial[]>
    const key = mesh.userData.chunkKey as string | undefined
    if (!key) {
      return null
    }

    const chunk = this.chunks.get(key)
    if (!chunk) {
      return null
    }

    const block = chunk.instances[hit.instanceId]
    if (!block || !hit.face) {
      return null
    }

    return {
      distance: hit.distance,
      point: hit.point.clone(),
      normal: hit.face.normal.clone().round(),
      block,
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
      instances: [],
    }

    this.chunks.set(key, chunk)
    this.rebuildChunkMesh(chunk)
    return chunk
  }

  private unloadChunk(key: string, chunk: Chunk) {
    if (chunk.mesh) {
      this.scene.remove(chunk.mesh)
      const index = this.raycastTargets.indexOf(chunk.mesh)
      if (index >= 0) {
        this.raycastTargets.splice(index, 1)
      }
    }

    this.chunks.delete(key)
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
        const height = Math.max(1, Math.min(6, Math.round(2 + ridge)))

        for (let y = 0; y <= height; y += 1) {
          data[blockIndex(lx, y, lz)] = BlockId.Grass
        }
      }
    }

    return data
  }

  private rebuildChunkMesh(chunk: Chunk) {
    if (chunk.mesh) {
      this.scene.remove(chunk.mesh)
      const index = this.raycastTargets.indexOf(chunk.mesh)
      if (index >= 0) {
        this.raycastTargets.splice(index, 1)
      }
    }

    const instances: BlockPosition[] = []

    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let z = 0; z < CHUNK_SIZE; z += 1) {
        for (let x = 0; x < CHUNK_SIZE; x += 1) {
          if (chunk.data[blockIndex(x, y, z)] === BlockId.Air) {
            continue
          }

          instances.push({
            x: chunk.cx * CHUNK_SIZE + x,
            y,
            z: chunk.cz * CHUNK_SIZE + z,
          })
        }
      }
    }

    chunk.instances = instances

    if (instances.length === 0) {
      chunk.mesh = undefined
      return
    }

    const mesh = new InstancedMesh(blockGeometry, blockMaterials, instances.length)
    mesh.castShadow = false
    mesh.receiveShadow = true
    mesh.userData.chunkKey = chunkKey(chunk.cx, chunk.cz)

    for (let index = 0; index < instances.length; index += 1) {
      const block = instances[index]
      instanceMatrix.setPosition(block.x + 0.5, block.y + 0.5, block.z + 0.5)
      mesh.setMatrixAt(index, instanceMatrix)
    }

    mesh.instanceMatrix.needsUpdate = true
    this.scene.add(mesh)
    this.raycastTargets.push(mesh)
    chunk.mesh = mesh
  }
}
