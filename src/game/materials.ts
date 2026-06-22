import {
  Color,
  MeshStandardMaterial,
  NearestFilter,
  NearestMipmapNearestFilter,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three'
import type { BlockDefinition } from './blocks'

const assetBase = import.meta.env.BASE_URL
const textureLoader = new TextureLoader()
const textureCache = new Map<string, Texture>()

const loadVoxelTexture = (path: string) => {
  const cached = textureCache.get(path)
  if (cached) {
    return cached
  }

  const texture = textureLoader.load(`${assetBase}${path}`)
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = NearestFilter
  texture.minFilter = NearestMipmapNearestFilter
  textureCache.set(path, texture)
  return texture
}

const createFaceMaterial = (definition: BlockDefinition, texture: Texture) => {
  const material = new MeshStandardMaterial({
    map: texture,
    roughness: definition.materialKind === 'liquid' ? 0.35 : 0.86,
    metalness: 0,
  })

  if (definition.materialKind === 'alphaTest') {
    material.alphaTest = 0.42
  }

  if (definition.materialKind === 'transparent' || definition.materialKind === 'liquid') {
    material.transparent = true
    material.opacity = definition.opacity ?? 0.65
    material.alphaTest = 0.04
    material.depthWrite = false
  }

  if (definition.materialKind === 'emissive') {
    material.emissive = new Color(definition.emissiveColor ?? 0xffffff)
    material.emissiveMap = texture
    material.emissiveIntensity = definition.emitsLight ?? 0.45
  }

  return material
}

export const createBlockMaterials = (definition: BlockDefinition) => {
  const side = loadVoxelTexture(definition.textures.side)
  const top = definition.textures.top ? loadVoxelTexture(definition.textures.top) : side
  const bottom = definition.textures.bottom ? loadVoxelTexture(definition.textures.bottom) : side

  return [
    createFaceMaterial(definition, side),
    createFaceMaterial(definition, side),
    createFaceMaterial(definition, top),
    createFaceMaterial(definition, bottom),
    createFaceMaterial(definition, side),
    createFaceMaterial(definition, side),
  ]
}
