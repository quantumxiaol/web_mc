import {
  Color,
  DoubleSide,
  MeshStandardMaterial,
  NearestFilter,
  NearestMipmapNearestFilter,
  RepeatWrapping,
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
const animatedTextures: Array<{
  texture: Texture
  speedX: number
  speedY: number
}> = []
const animatedTextureKeys = new Set<string>()
const animatedEmissiveMaterials: Array<{
  material: MeshStandardMaterial
  baseIntensity: number
}> = []
let animatedMaterialTime = 0

const loadVoxelTexture = (path: string) => {
  const cached = textureCache.get(path)
  if (cached) {
    return cached
  }

  const texture = typeof document === 'undefined' ? new Texture() : textureLoader.load(`${assetBase}${path}`)
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
    definition.transparent ? 'transparent' : '',
    definition.liquid ? 'liquid' : '',
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

  if (definition.materialKind === 'liquid' && !animatedTextureKeys.has(cacheKey)) {
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.needsUpdate = true
    animatedTextures.push({
      texture,
      speedX: definition.key === 'lava' ? 0.015 : 0.008,
      speedY: definition.key === 'lava' ? 0.025 : 0.012,
    })
    animatedTextureKeys.add(cacheKey)
  }

  if (definition.materialKind === 'alphaTest') {
    material.alphaTest = 0.42
    material.transparent = false
    material.depthWrite = true
    material.side = DoubleSide
  }

  const shouldUseTransparency =
    definition.materialKind === 'transparent' ||
    definition.materialKind === 'liquid' ||
    definition.opacity !== undefined

  if (shouldUseTransparency && definition.materialKind !== 'alphaTest') {
    material.transparent = true
    material.opacity = definition.opacity ?? 0.65
    material.alphaTest = definition.materialKind === 'liquid' ? 0.02 : 0.04
    material.depthWrite = false
  }

  if (definition.emitsLight && definition.emissiveColor !== undefined) {
    material.emissive = new Color(definition.emissiveColor)
    material.emissiveMap = texture
    material.emissiveIntensity = definition.emitsLight
    if (definition.materialKind === 'liquid') {
      animatedEmissiveMaterials.push({
        material,
        baseIntensity: definition.emitsLight,
      })
    }
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

export const updateAnimatedMaterials = (deltaTime: number) => {
  animatedMaterialTime += deltaTime

  for (const item of animatedTextures) {
    item.texture.offset.x = (item.texture.offset.x + item.speedX * deltaTime) % 1
    item.texture.offset.y = (item.texture.offset.y + item.speedY * deltaTime) % 1
  }

  const pulse = 0.88 + Math.sin(animatedMaterialTime * 2.5) * 0.12
  for (const item of animatedEmissiveMaterials) {
    item.material.emissiveIntensity = item.baseIntensity * pulse
  }
}
