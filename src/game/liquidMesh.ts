import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
} from 'three'
import { BlockId, isBlockOpaqueOccluder } from './blocks'
import { fluidLevelToHeight } from './fluids'
import type { BlockMaterial } from './materials'

interface LiquidCell {
  x: number
  y: number
  z: number
  fluidLevel?: number
}

interface BuildLiquidMeshOptions {
  blockId: BlockId
  cells: LiquidCell[]
  material: BlockMaterial
  getBlock: (x: number, y: number, z: number) => BlockId
  getFluidLevel: (x: number, y: number, z: number) => number
}

const horizontalNeighbors = [
  { dx: 1, dz: 0, face: 'east' },
  { dx: -1, dz: 0, face: 'west' },
  { dx: 0, dz: 1, face: 'south' },
  { dx: 0, dz: -1, face: 'north' },
] as const

const shouldDrawFaceAgainst = (neighborBlockId: BlockId, liquidBlockId: BlockId) =>
  neighborBlockId !== liquidBlockId && !isBlockOpaqueOccluder(neighborBlockId)

export const hasVisibleLiquidFaces = (
  blockId: BlockId,
  x: number,
  y: number,
  z: number,
  fluidLevel: number,
  getBlock: (x: number, y: number, z: number) => BlockId,
  getFluidLevel: (x: number, y: number, z: number) => number,
) => {
  if (shouldDrawFaceAgainst(getBlock(x, y + 1, z), blockId)) {
    return true
  }

  const height = fluidLevelToHeight(fluidLevel)

  return horizontalNeighbors.some(({ dx, dz }) => {
    const neighborBlockId = getBlock(x + dx, y, z + dz)
    if (shouldDrawFaceAgainst(neighborBlockId, blockId)) {
      return true
    }
    if (neighborBlockId !== blockId) {
      return false
    }

    return fluidLevelToHeight(getFluidLevel(x + dx, y, z + dz)) < height
  })
}

export const buildLiquidMesh = ({ blockId, cells, material, getBlock, getFluidLevel }: BuildLiquidMeshOptions) => {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  const pushQuad = (vertices: number[]) => {
    const vertexOffset = positions.length / 3
    positions.push(...vertices)
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1)
    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3)
  }

  for (const cell of cells) {
    const x0 = cell.x
    const x1 = cell.x + 1
    const y0 = cell.y
    const y1 = cell.y + fluidLevelToHeight(cell.fluidLevel ?? 0)
    const z0 = cell.z
    const z1 = cell.z + 1

    if (shouldDrawFaceAgainst(getBlock(cell.x, cell.y + 1, cell.z), blockId)) {
      pushQuad([
        x0, y1, z0,
        x0, y1, z1,
        x1, y1, z1,
        x1, y1, z0,
      ])
    }

    for (const { dx, dz, face } of horizontalNeighbors) {
      const neighborBlockId = getBlock(cell.x + dx, cell.y, cell.z + dz)
      let sideBottom = y0

      if (neighborBlockId === blockId) {
        const neighborLevel = getFluidLevel(cell.x + dx, cell.y, cell.z + dz)
        sideBottom = cell.y + fluidLevelToHeight(neighborLevel)
      } else if (!shouldDrawFaceAgainst(neighborBlockId, blockId)) {
        continue
      }

      if (sideBottom >= y1) {
        continue
      }

      if (face === 'east') {
        pushQuad([
          x1, sideBottom, z0,
          x1, y1, z0,
          x1, y1, z1,
          x1, sideBottom, z1,
        ])
      } else if (face === 'west') {
        pushQuad([
          x0, sideBottom, z1,
          x0, y1, z1,
          x0, y1, z0,
          x0, sideBottom, z0,
        ])
      } else if (face === 'south') {
        pushQuad([
          x1, sideBottom, z1,
          x1, y1, z1,
          x0, y1, z1,
          x0, sideBottom, z1,
        ])
      } else {
        pushQuad([
          x0, sideBottom, z0,
          x0, y1, z0,
          x1, y1, z0,
          x1, sideBottom, z0,
        ])
      }
    }
  }

  if (positions.length === 0) {
    return null
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  const mesh = new Mesh(geometry, material)
  mesh.userData.disposeGeometry = true
  return mesh
}
