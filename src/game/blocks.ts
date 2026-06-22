export const BlockId = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Sand: 4,
  Wood: 5,
  RedSand: 6,
  GreySand: 7,
  Snow: 8,
  Ice: 9,
  GravelDirt: 10,
  GravelStone: 11,
  Rock: 12,
  RockMoss: 13,
  BrickGrey: 14,
  BrickRed: 15,
  WoodRed: 16,
  Glass: 17,
  Table: 18,
  Oven: 19,
  Trunk: 20,
  TrunkWhite: 21,
  Leaves: 22,
  LeavesOrange: 23,
  Cactus: 24,
  MushroomRed: 25,
  MushroomBrown: 26,
  StoneCoal: 27,
  StoneIron: 28,
  StoneGold: 29,
  StoneDiamond: 30,
  GreystoneRuby: 31,
  RedstoneEmerald: 32,
  Water: 33,
  Lava: 34,
} as const

export type BlockId = (typeof BlockId)[keyof typeof BlockId]

export type BlockMaterialKind = 'opaque' | 'alphaTest' | 'transparent' | 'emissive' | 'liquid'

export type BlockRenderLayer = 'opaque' | 'cutout' | 'transparent' | 'liquid' | 'emissive'

export const BLOCK_CATEGORIES = [
  { id: 'terrain', label: '地形' },
  { id: 'building', label: '建筑' },
  { id: 'nature', label: '自然' },
  { id: 'ores', label: '矿石' },
  { id: 'special', label: '特效' },
] as const

export type BlockCategory = (typeof BLOCK_CATEGORIES)[number]['id']

export interface BlockDefinition {
  id: BlockId
  key: string
  label: string
  iconPath: string
  category: BlockCategory
  solid: boolean
  transparent?: boolean
  liquid?: boolean
  replaceable?: boolean
  selectable?: boolean
  emitsLight?: number
  emissiveColor?: number
  opacity?: number
  materialKind: BlockMaterialKind
  renderLayer?: BlockRenderLayer
  textures: {
    side: string
    top?: string
    bottom?: string
  }
}

const tile = (name: string) => `kenney_voxel-pack/PNG/Tiles/${name}.png`

export const PLACEABLE_BLOCKS: BlockDefinition[] = [
  {
    id: BlockId.Grass,
    key: 'grass',
    label: '草方块',
    iconPath: tile('grass_top'),
    category: 'terrain',
    solid: true,
    materialKind: 'opaque',
    textures: {
      side: tile('dirt_grass'),
      top: tile('grass_top'),
      bottom: tile('dirt'),
    },
  },
  {
    id: BlockId.Dirt,
    key: 'dirt',
    label: '泥土',
    iconPath: tile('dirt'),
    category: 'terrain',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('dirt') },
  },
  {
    id: BlockId.Stone,
    key: 'stone',
    label: '石头',
    iconPath: tile('stone'),
    category: 'terrain',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('stone') },
  },
  {
    id: BlockId.Sand,
    key: 'sand',
    label: '沙子',
    iconPath: tile('sand'),
    category: 'terrain',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('sand') },
  },
  {
    id: BlockId.Wood,
    key: 'wood',
    label: '木板',
    iconPath: tile('wood'),
    category: 'building',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('wood') },
  },
  {
    id: BlockId.RedSand,
    key: 'redsand',
    label: '红沙',
    iconPath: tile('redsand'),
    category: 'terrain',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('redsand') },
  },
  {
    id: BlockId.GreySand,
    key: 'greysand',
    label: '灰沙',
    iconPath: tile('greysand'),
    category: 'terrain',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('greysand') },
  },
  {
    id: BlockId.Snow,
    key: 'snow',
    label: '雪块',
    iconPath: tile('snow'),
    category: 'terrain',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('snow') },
  },
  {
    id: BlockId.Ice,
    key: 'ice',
    label: '冰',
    iconPath: tile('ice'),
    category: 'terrain',
    solid: true,
    transparent: true,
    opacity: 0.72,
    materialKind: 'transparent',
    renderLayer: 'transparent',
    textures: { side: tile('ice') },
  },
  {
    id: BlockId.GravelDirt,
    key: 'gravel_dirt',
    label: '泥砾',
    iconPath: tile('gravel_dirt'),
    category: 'terrain',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('gravel_dirt') },
  },
  {
    id: BlockId.GravelStone,
    key: 'gravel_stone',
    label: '石砾',
    iconPath: tile('gravel_stone'),
    category: 'terrain',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('gravel_stone') },
  },
  {
    id: BlockId.Rock,
    key: 'rock',
    label: '岩石',
    iconPath: tile('rock'),
    category: 'building',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('rock') },
  },
  {
    id: BlockId.RockMoss,
    key: 'rock_moss',
    label: '苔石',
    iconPath: tile('rock_moss'),
    category: 'building',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('rock_moss') },
  },
  {
    id: BlockId.BrickGrey,
    key: 'brick_grey',
    label: '灰砖',
    iconPath: tile('brick_grey'),
    category: 'building',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('brick_grey') },
  },
  {
    id: BlockId.BrickRed,
    key: 'brick_red',
    label: '红砖',
    iconPath: tile('brick_red'),
    category: 'building',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('brick_red') },
  },
  {
    id: BlockId.WoodRed,
    key: 'wood_red',
    label: '红木板',
    iconPath: tile('wood_red'),
    category: 'building',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('wood_red') },
  },
  {
    id: BlockId.Glass,
    key: 'glass',
    label: '玻璃',
    iconPath: tile('glass'),
    category: 'building',
    solid: true,
    transparent: true,
    opacity: 0.55,
    materialKind: 'transparent',
    renderLayer: 'transparent',
    textures: { side: tile('glass') },
  },
  {
    id: BlockId.Table,
    key: 'table',
    label: '桌面',
    iconPath: tile('table'),
    category: 'building',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('table') },
  },
  {
    id: BlockId.Oven,
    key: 'oven',
    label: '熔炉',
    iconPath: tile('oven'),
    category: 'building',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('oven') },
  },
  {
    id: BlockId.Trunk,
    key: 'trunk',
    label: '树干',
    iconPath: tile('trunk_side'),
    category: 'nature',
    solid: true,
    materialKind: 'opaque',
    textures: {
      side: tile('trunk_side'),
      top: tile('trunk_top'),
      bottom: tile('trunk_bottom'),
    },
  },
  {
    id: BlockId.TrunkWhite,
    key: 'trunk_white',
    label: '白树干',
    iconPath: tile('trunk_white_side'),
    category: 'nature',
    solid: true,
    materialKind: 'opaque',
    textures: {
      side: tile('trunk_white_side'),
      top: tile('trunk_white_top'),
      bottom: tile('trunk_bottom'),
    },
  },
  {
    id: BlockId.Leaves,
    key: 'leaves',
    label: '树叶',
    iconPath: tile('leaves_transparent'),
    category: 'nature',
    solid: true,
    transparent: true,
    materialKind: 'alphaTest',
    renderLayer: 'cutout',
    textures: { side: tile('leaves_transparent') },
  },
  {
    id: BlockId.LeavesOrange,
    key: 'leaves_orange',
    label: '橙叶',
    iconPath: tile('leaves_orange_transparent'),
    category: 'nature',
    solid: true,
    transparent: true,
    materialKind: 'alphaTest',
    renderLayer: 'cutout',
    textures: { side: tile('leaves_orange_transparent') },
  },
  {
    id: BlockId.Cactus,
    key: 'cactus',
    label: '仙人掌',
    iconPath: tile('cactus_side'),
    category: 'nature',
    solid: true,
    materialKind: 'opaque',
    textures: {
      side: tile('cactus_side'),
      top: tile('cactus_top'),
      bottom: tile('cactus_inside'),
    },
  },
  {
    id: BlockId.MushroomRed,
    key: 'mushroom_red',
    label: '红蘑菇',
    iconPath: tile('mushroom_red'),
    category: 'nature',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('mushroom_red') },
  },
  {
    id: BlockId.MushroomBrown,
    key: 'mushroom_brown',
    label: '褐蘑菇',
    iconPath: tile('mushroom_brown'),
    category: 'nature',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('mushroom_brown') },
  },
  {
    id: BlockId.StoneCoal,
    key: 'stone_coal',
    label: '煤矿石',
    iconPath: tile('stone_coal'),
    category: 'ores',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('stone_coal') },
  },
  {
    id: BlockId.StoneIron,
    key: 'stone_iron',
    label: '铁矿石',
    iconPath: tile('stone_iron'),
    category: 'ores',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('stone_iron') },
  },
  {
    id: BlockId.StoneGold,
    key: 'stone_gold',
    label: '金矿石',
    iconPath: tile('stone_gold'),
    category: 'ores',
    solid: true,
    materialKind: 'opaque',
    textures: { side: tile('stone_gold') },
  },
  {
    id: BlockId.StoneDiamond,
    key: 'stone_diamond',
    label: '钻石矿',
    iconPath: tile('stone_diamond'),
    category: 'ores',
    solid: true,
    emitsLight: 0.18,
    emissiveColor: 0x7ee7ff,
    materialKind: 'emissive',
    renderLayer: 'emissive',
    textures: { side: tile('stone_diamond') },
  },
  {
    id: BlockId.GreystoneRuby,
    key: 'greystone_ruby',
    label: '红宝石矿',
    iconPath: tile('greystone_ruby'),
    category: 'ores',
    solid: true,
    emitsLight: 0.2,
    emissiveColor: 0xff5d73,
    materialKind: 'emissive',
    renderLayer: 'emissive',
    textures: { side: tile('greystone_ruby') },
  },
  {
    id: BlockId.RedstoneEmerald,
    key: 'redstone_emerald',
    label: '绿宝石矿',
    iconPath: tile('redstone_emerald'),
    category: 'ores',
    solid: true,
    emitsLight: 0.24,
    emissiveColor: 0x79ff9f,
    materialKind: 'emissive',
    renderLayer: 'emissive',
    textures: { side: tile('redstone_emerald') },
  },
  {
    id: BlockId.Water,
    key: 'water',
    label: '水',
    iconPath: tile('water'),
    category: 'special',
    solid: false,
    transparent: true,
    liquid: true,
    replaceable: true,
    opacity: 0.66,
    materialKind: 'liquid',
    renderLayer: 'liquid',
    textures: { side: tile('water') },
  },
  {
    id: BlockId.Lava,
    key: 'lava',
    label: '岩浆',
    iconPath: tile('lava'),
    category: 'special',
    solid: false,
    transparent: true,
    liquid: true,
    replaceable: true,
    emitsLight: 1,
    emissiveColor: 0xff7a18,
    materialKind: 'emissive',
    renderLayer: 'liquid',
    textures: { side: tile('lava') },
  },
]

const blockById = new Map<BlockId, BlockDefinition>(
  PLACEABLE_BLOCKS.map((definition) => [definition.id, definition] as const),
)

export const getBlockDefinition = (blockId: BlockId) => blockById.get(blockId)

export const getBlockLabel = (blockId: BlockId) => {
  if (blockId === BlockId.Air) {
    return '空气'
  }

  return getBlockDefinition(blockId)?.label ?? `未知方块 ${blockId}`
}

export const isBlockSolid = (blockId: BlockId) => getBlockDefinition(blockId)?.solid ?? false

export const isBlockLiquid = (blockId: BlockId) => getBlockDefinition(blockId)?.liquid ?? false

export const isBlockTransparent = (blockId: BlockId) =>
  getBlockDefinition(blockId)?.transparent ?? false

export const isBlockReplaceable = (blockId: BlockId) =>
  blockId === BlockId.Air || (getBlockDefinition(blockId)?.replaceable ?? false)

export const isBlockRaycastTarget = (blockId: BlockId) =>
  getBlockDefinition(blockId)?.selectable ?? blockId !== BlockId.Air

export const getBlockRenderLayer = (blockId: BlockId): BlockRenderLayer => {
  const block = getBlockDefinition(blockId)

  if (!block) {
    return 'opaque'
  }

  if (block.renderLayer) {
    return block.renderLayer
  }

  if (block.liquid) {
    return 'liquid'
  }

  if (block.materialKind === 'alphaTest') {
    return 'cutout'
  }

  if (block.materialKind === 'transparent') {
    return 'transparent'
  }

  if (block.materialKind === 'emissive') {
    return 'emissive'
  }

  return 'opaque'
}

export const isBlockOpaqueOccluder = (blockId: BlockId) => {
  const block = getBlockDefinition(blockId)

  return (
    !!block &&
    block.solid &&
    !block.transparent &&
    block.materialKind !== 'alphaTest' &&
    block.materialKind !== 'transparent' &&
    block.materialKind !== 'liquid'
  )
}
