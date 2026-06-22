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

export type BlockMaterial = MeshStandardMaterial | MeshStandardMaterial[]

const assetBase = import.meta.env.BASE_URL
const textureLoader = new TextureLoader()
const textureCache = new Map<string, Texture>()
const materialCache = new Map<string, MeshStandardMaterial>()

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

const materialCacheKey = (definition: BlockDefinition, texturePath: string) =>
  [
    definition.key,
    definition.materialKind,
    texturePath,
    definition.opacity ?? '',
    definition.emissiveColor ?? '',
    definition.emitsLight ?? '',
  ].join('|')

const createFaceMaterial = (definition: BlockDefinition, texturePath: string) => {
  const cacheKey = materialCacheKey(definition, texturePath)
  const cached = materialCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const texture = loadVoxelTexture(texturePath)
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

  materialCache.set(cacheKey, material)
  return material
}

export const createBlockMaterials = (definition: BlockDefinition): BlockMaterial => {
  const sidePath = definition.textures.side
  const topPath = definition.textures.top ?? sidePath
  const bottomPath = definition.textures.bottom ?? sidePath

  if (sidePath === topPath && sidePath === bottomPath) {
    return createFaceMaterial(definition, sidePath)
  }

  const side = createFaceMaterial(definition, sidePath)
  const top = createFaceMaterial(definition, topPath)
  const bottom = createFaceMaterial(definition, bottomPath)

  return [side, side, top, bottom, side, side]
}
