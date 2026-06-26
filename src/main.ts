import './style.css'
import {
  BoxGeometry,
  Color,
  Euler,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Timer,
  Vector3,
  WebGLRenderer,
} from 'three'
import {
  BLOCK_CATEGORIES,
  BlockId,
  PLACEABLE_BLOCKS,
  getBlockDefinition,
  getBlockLabel,
  isBlockReplaceable,
  type BlockCategory,
  type BlockDefinition,
} from './game/blocks'
import { DebugOverlay } from './game/debugOverlay'
import { formatDayCycleTime } from './game/dayCycle'
import { configureEmissiveLights } from './game/emissiveLights'
import { GRAPHICS_PRESETS, nextGraphicsPreset, type GraphicsPreset } from './game/graphicsSettings'
import { configureLighting } from './game/lighting'
import { updateAnimatedMaterials } from './game/materials'
import {
  getDominantPlayerLiquidKind,
  getPlayerLiquidProfile,
  type PlayerLiquidKind,
  type PlayerLiquidProfile,
} from './game/playerLiquid'
import { configurePostProcessing } from './game/postProcessing'
import { VoxelWorld, type SavedChunkPayload } from './game/world'
import {
  WORLD_SAVE_SEED,
  WORLD_SAVE_VERSION,
  isGraphicsPreset,
  parseWorldSave,
  type SerializedChunkPayload,
  type WorldSaveFile,
} from './game/worldSave'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Missing #app root element')
}

const assetBase = import.meta.env.BASE_URL
const GRAPHICS_PRESET_STORAGE_KEY = 'web_mc:graphicsPreset'
const HOTBAR_STORAGE_KEY = 'web_mc:hotbar'
const WORLD_SAVE_STORAGE_KEY = 'web_mc:worldSave'
const HOTBAR_SIZE = Math.min(9, PLACEABLE_BLOCKS.length)
const defaultHotbarBlockIds: BlockId[] = PLACEABLE_BLOCKS.slice(0, HOTBAR_SIZE).map((block) => block.id)
const placeableBlockIds = new Set<BlockId>(PLACEABLE_BLOCKS.map((block) => block.id))

const getInitialGraphicsPreset = (): GraphicsPreset => {
  try {
    const storedPreset = localStorage.getItem(GRAPHICS_PRESET_STORAGE_KEY)
    return isGraphicsPreset(storedPreset) ? storedPreset : 'medium'
  } catch {
    return 'medium'
  }
}

const getInitialHotbarBlockIds = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOTBAR_STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) {
      return [...defaultHotbarBlockIds]
    }

    const storedIds = parsed
      .map((entry) => Number(entry) as BlockId)
      .filter((blockId) => placeableBlockIds.has(blockId))
      .slice(0, HOTBAR_SIZE)

    return [...storedIds, ...defaultHotbarBlockIds].slice(0, HOTBAR_SIZE)
  } catch {
    return [...defaultHotbarBlockIds]
  }
}

const saveHotbarBlockIds = () => {
  try {
    localStorage.setItem(HOTBAR_STORAGE_KEY, JSON.stringify(hotbarBlockIds))
  } catch {
    // Ignore storage failures; the hotbar still works for this session.
  }
}

const hotbarBlockIds: BlockId[] = getInitialHotbarBlockIds()
let graphicsPreset: GraphicsPreset = getInitialGraphicsPreset()
let graphicsSettings = GRAPHICS_PRESETS[graphicsPreset]

function getRequiredElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Missing element: ${selector}`)
  }
  return element
}

const getRequiredBlockDefinition = (blockId: BlockId) => {
  const definition = getBlockDefinition(blockId)
  if (!definition) {
    throw new Error(`Unknown block id: ${blockId}`)
  }
  return definition
}

const hotbarMarkup = hotbarBlockIds.map((blockId, index) => {
  const block = getRequiredBlockDefinition(blockId)
  return `
    <button
      type="button"
      class="hotbar-slot"
      data-slot-index="${index}"
      data-block-id="${block.id}"
      aria-label="快捷栏 ${index + 1}：${block.label}"
    >
      <span class="hotbar-key">${index + 1}</span>
      <img src="${assetBase}${block.iconPath}" alt="${block.label}" width="48" height="48" />
      <span class="hotbar-name">${block.label}</span>
    </button>
  `
}).join('')

const paletteTabsMarkup = [
  '<button type="button" class="palette-tab is-selected" data-category="all">全部</button>',
  ...BLOCK_CATEGORIES.map((category) => {
    return `<button type="button" class="palette-tab" data-category="${category.id}">${category.label}</button>`
  }),
].join('')

const paletteMarkup = PLACEABLE_BLOCKS.map((block) => {
  return `
    <button
      type="button"
      class="palette-block"
      data-block-id="${block.id}"
      data-category="${block.category}"
      aria-label="${block.label}"
    >
      <img src="${assetBase}${block.iconPath}" alt="${block.label}" width="40" height="40" />
      <span>${block.label}</span>
    </button>
  `
}).join('')

app.innerHTML = `
  <div class="shell">
    <div id="viewport" class="viewport"></div>
    <div id="liquid-overlay" class="liquid-overlay" aria-hidden="true"></div>
    <div class="crosshair" aria-hidden="true"></div>
    <section class="hud hud-top">
      <div class="panel">
        <p class="eyebrow">web_mc</p>
        <h1>Creative Sandbox</h1>
        <p>点击画面锁定鼠标，左键移除，右键放置当前选中的方块。</p>
        <p class="hint">数字键 1-${HOTBAR_SIZE} 可以快速切换快捷栏。</p>
      </div>
      <div class="panel metrics">
        <p id="mode-line">模式：飞行</p>
        <p id="coords-line">坐标：0, 0, 0</p>
        <p id="world-line">区块：0 | 方块：0</p>
      </div>
    </section>
    <section class="hud hud-bottom">
      <div class="panel controls">
        <span>W/A/S/D 移动</span>
        <span>Space 上升或跳跃</span>
        <span>Shift 下降</span>
        <span>1-${HOTBAR_SIZE} 切换快捷栏</span>
        <span>滚轮切换槽位</span>
        <span>E 方块面板</span>
        <span>F2 截图</span>
        <span>F3/\` 调试</span>
        <span>F4/P 图形档位</span>
        <span>Cmd/Ctrl+S 保存世界</span>
        <span>Cmd/Ctrl+O 载入世界</span>
        <span>Cmd/Ctrl+E 导出存档</span>
        <span>Cmd/Ctrl+I 导入存档</span>
        <span>V 暂停流体</span>
        <span>B 单步流体</span>
        <span>N 清除流动液体</span>
        <span>Shift+N 清空编辑</span>
        <span>M 天然液体仿真</span>
        <span>G 切换飞行/步行</span>
        <span>R 重置位置</span>
        <span>Esc 解锁鼠标</span>
      </div>
    </section>
    <div id="screenshot-toast" class="screenshot-toast hidden" aria-live="polite"></div>
    <section class="hotbar-layer">
      <div id="hotbar" class="hotbar">${hotbarMarkup}</div>
      <p id="hotbar-label" class="hotbar-label"></p>
    </section>
    <section id="palette-layer" class="palette-layer hidden" aria-hidden="true">
      <div class="palette-panel" role="dialog" aria-label="方块选择">
        <div class="palette-header">
          <h2>方块</h2>
          <button id="palette-close" class="palette-close" type="button" aria-label="关闭">×</button>
        </div>
        <input id="palette-search" class="palette-search" type="search" placeholder="搜索方块" autocomplete="off" />
        <div id="palette-tabs" class="palette-tabs">${paletteTabsMarkup}</div>
        <div id="palette-grid" class="palette-grid">${paletteMarkup}</div>
      </div>
    </section>
    <div id="lock-screen" class="lock-screen">
      <div class="lock-card">
        <p class="eyebrow">Pointer Lock</p>
        <h2>进入方块世界</h2>
        <p>点击开始后锁定鼠标，用准星放置和移除方块。</p>
        <img
          class="pack-preview"
          src="${assetBase}homepage.png"
          alt="web_mc homepage artwork"
        />
        <button id="start-button" type="button">点击开始</button>
      </div>
    </div>
  </div>
`

const shell = getRequiredElement<HTMLDivElement>('.shell')
const viewport = getRequiredElement<HTMLDivElement>('#viewport')
const liquidOverlay = getRequiredElement<HTMLDivElement>('#liquid-overlay')
const lockScreen = getRequiredElement<HTMLDivElement>('#lock-screen')
const startButton = getRequiredElement<HTMLButtonElement>('#start-button')
const modeLine = getRequiredElement<HTMLParagraphElement>('#mode-line')
const coordsLine = getRequiredElement<HTMLParagraphElement>('#coords-line')
const worldLine = getRequiredElement<HTMLParagraphElement>('#world-line')
const screenshotToast = getRequiredElement<HTMLDivElement>('#screenshot-toast')
const hotbar = getRequiredElement<HTMLDivElement>('#hotbar')
const hotbarLabel = getRequiredElement<HTMLParagraphElement>('#hotbar-label')
const paletteLayer = getRequiredElement<HTMLElement>('#palette-layer')
const paletteClose = getRequiredElement<HTMLButtonElement>('#palette-close')
const paletteSearch = getRequiredElement<HTMLInputElement>('#palette-search')
const paletteTabs = getRequiredElement<HTMLDivElement>('#palette-tabs')
const paletteGrid = getRequiredElement<HTMLDivElement>('#palette-grid')

const hotbarButtons = Array.from(hotbar.querySelectorAll<HTMLButtonElement>('.hotbar-slot'))
const paletteButtons = Array.from(paletteGrid.querySelectorAll<HTMLButtonElement>('.palette-block'))
const paletteTabButtons = Array.from(paletteTabs.querySelectorAll<HTMLButtonElement>('.palette-tab'))
const saveImportInput = document.createElement('input')
saveImportInput.type = 'file'
saveImportInput.accept = 'application/json,.json'
saveImportInput.style.display = 'none'
document.body.append(saveImportInput)

const renderer = new WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, graphicsSettings.maxPixelRatio))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0xb8dcff)
viewport.append(renderer.domElement)

const scene = new Scene()
scene.background = new Color(0xb8dcff)
scene.fog = new Fog(0xb8dcff, 40, 120)

const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400)
camera.position.set(8, 18, 8)

const cameraRig = new Group()
cameraRig.add(camera)
scene.add(cameraRig)

const lighting = configureLighting(renderer, scene, graphicsSettings)
const postProcessing = configurePostProcessing(renderer, scene, camera, graphicsSettings)
const emissiveLights = configureEmissiveLights(scene, graphicsSettings)

const world = new VoxelWorld(scene)
world.ensureChunksAround(camera.position.x, camera.position.z)

function applyGraphicsPreset(preset: GraphicsPreset) {
  graphicsPreset = preset
  graphicsSettings = GRAPHICS_PRESETS[preset]
  const pixelRatio = Math.min(window.devicePixelRatio, graphicsSettings.maxPixelRatio)
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  lighting.applyGraphicsSettings(graphicsSettings)
  postProcessing.applyGraphicsSettings(graphicsSettings)
  emissiveLights.applyGraphicsSettings(graphicsSettings)
  postProcessing.resize(window.innerWidth, window.innerHeight, pixelRatio)

  try {
    localStorage.setItem(GRAPHICS_PRESET_STORAGE_KEY, graphicsPreset)
  } catch {
    // Ignore storage failures; the preset still applies for this session.
  }
}

const selection = new Mesh(
  new BoxGeometry(1.02, 1.02, 1.02),
  new MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.5,
  }),
)
selection.visible = false
scene.add(selection)

const timer = new Timer()
timer.connect(document)
const lookEuler = new Euler(0, 0, 0, 'YXZ')
const moveDirection = new Vector3()
const lookDirection = new Vector3()
const forward = new Vector3()
const right = new Vector3()
const up = new Vector3(0, 1, 0)

const keys = new Set<string>()
const wheelCooldownMs = 120

let yaw = 0
let pitch = 0
let isFlying = true
let isGrounded = false
let verticalVelocity = 0
let selectedHotbarSlot = 0
let isPaletteOpen = false
let activePaletteCategory: BlockCategory | 'all' = 'all'
let debugEnabled = false
let fps = 0
let frameMs = 0
let fpsFrames = 0
let fpsTime = 0
let lastWheelSlotChange = 0
let screenshotRequested = false
let screenshotToastTimeout: number | undefined
let fluidPaused = false
let fluidStepRequested = false
let playerLiquidKind: PlayerLiquidKind = 'none'
let playerLiquidProfile: PlayerLiquidProfile = getPlayerLiquidProfile(playerLiquidKind)

const playerRadius = 0.35
const playerHeight = 1.8
const eyeHeight = 1.62
const walkSpeed = 7
const flySpeed = 10
const gravity = 24
const jumpVelocity = 9

const debugOverlay = new DebugOverlay()

const getSelectedBlock = () => getRequiredBlockDefinition(hotbarBlockIds[selectedHotbarSlot])

const isGameLocked = () => document.pointerLockElement === renderer.domElement

const clearActiveInput = () => {
  keys.clear()
  verticalVelocity = 0
}

const isEditableTarget = (target: EventTarget | null) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement

const isSystemShortcutEvent = (event: KeyboardEvent) =>
  event.metaKey ||
  event.ctrlKey ||
  event.code === 'MetaLeft' ||
  event.code === 'MetaRight' ||
  event.code === 'ControlLeft' ||
  event.code === 'ControlRight' ||
  event.key === 'Meta' ||
  event.key === 'Control'

const requestLock = () => {
  if (isPaletteOpen) {
    return
  }
  const lockRequest = renderer.domElement.requestPointerLock()
  if (lockRequest instanceof Promise) {
    lockRequest.catch(() => undefined)
  }
}

function syncLockScreen() {
  lockScreen.classList.toggle('hidden', isGameLocked() || isPaletteOpen)
}

function setPaletteOpen(open: boolean) {
  isPaletteOpen = open
  paletteLayer.classList.toggle('hidden', !open)
  paletteLayer.setAttribute('aria-hidden', String(!open))
  syncLockScreen()

  if (open) {
    clearActiveInput()
    if (isGameLocked()) {
      document.exitPointerLock()
    }
    paletteSearch.focus()
  }
}

const resetPlayer = () => {
  camera.position.set(8, 18, 8)
  yaw = 0
  pitch = -0.15
  verticalVelocity = 0
  updateCameraRotation()
  world.ensureChunksAround(camera.position.x, camera.position.z)
}

const getPlayerBounds = (nextPosition = camera.position) => ({
  minX: nextPosition.x - playerRadius,
  maxX: nextPosition.x + playerRadius,
  minY: nextPosition.y - eyeHeight,
  maxY: nextPosition.y + (playerHeight - eyeHeight),
  minZ: nextPosition.z - playerRadius,
  maxZ: nextPosition.z + playerRadius,
})

function updatePlayerLiquidState() {
  const x = Math.floor(camera.position.x)
  const z = Math.floor(camera.position.z)
  const feetY = Math.floor(camera.position.y - eyeHeight + 0.15)
  const torsoY = Math.floor(camera.position.y - eyeHeight + playerHeight * 0.58)
  const eyeY = Math.floor(camera.position.y - 0.08)
  const nextLiquidKind = getDominantPlayerLiquidKind([
    world.getBlock(x, feetY, z),
    world.getBlock(x, torsoY, z),
    world.getBlock(x, eyeY, z),
  ])

  playerLiquidKind = nextLiquidKind
  playerLiquidProfile = getPlayerLiquidProfile(nextLiquidKind)
  liquidOverlay.classList.toggle('is-water', nextLiquidKind === 'water')
  liquidOverlay.classList.toggle('is-lava', nextLiquidKind === 'lava')
}

function updateCameraRotation() {
  lookEuler.set(pitch, yaw, 0)
  camera.quaternion.setFromEuler(lookEuler)
}

function refreshHotbarButtons() {
  hotbarButtons.forEach((button, index) => {
    const block = getRequiredBlockDefinition(hotbarBlockIds[index])
    const image = button.querySelector<HTMLImageElement>('img')
    const name = button.querySelector<HTMLSpanElement>('.hotbar-name')

    button.dataset.blockId = String(block.id)
    button.setAttribute('aria-label', `快捷栏 ${index + 1}：${block.label}`)

    if (image) {
      image.src = `${assetBase}${block.iconPath}`
      image.alt = block.label
    }
    if (name) {
      name.textContent = block.label
    }
  })
}

function updateHotbarSelection() {
  const selectedBlock = getSelectedBlock()
  refreshHotbarButtons()

  for (const button of hotbarButtons) {
    const slotIndex = Number(button.dataset.slotIndex)
    button.classList.toggle('is-selected', slotIndex === selectedHotbarSlot)
  }

  hotbarLabel.textContent = `当前方块：${selectedBlock.label}`
}

function assignBlockToSelectedSlot(block: BlockDefinition) {
  hotbarBlockIds[selectedHotbarSlot] = block.id
  saveHotbarBlockIds()
  updateHotbarSelection()
}

function setSelectedBlockByIndex(index: number) {
  const normalizedIndex = ((index % hotbarBlockIds.length) + hotbarBlockIds.length) % hotbarBlockIds.length
  selectedHotbarSlot = normalizedIndex
  updateHotbarSelection()
}

function formatScreenshotTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
  ].join('-')
}

function showScreenshotToast(message: string) {
  screenshotToast.textContent = message
  screenshotToast.classList.remove('hidden')

  if (screenshotToastTimeout !== undefined) {
    window.clearTimeout(screenshotToastTimeout)
  }

  screenshotToastTimeout = window.setTimeout(() => {
    screenshotToast.classList.add('hidden')
  }, 1800)
}

function downloadScreenshotUrl(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function serializeChunkPayload(chunk: SavedChunkPayload): SerializedChunkPayload {
  return {
    key: chunk.key,
    cx: chunk.cx,
    cz: chunk.cz,
    data: bytesToBase64(chunk.data),
    fluidLevels: bytesToBase64(chunk.fluidLevels),
  }
}

function deserializeChunkPayload(chunk: SerializedChunkPayload): SavedChunkPayload {
  return {
    key: chunk.key,
    cx: chunk.cx,
    cz: chunk.cz,
    data: base64ToBytes(chunk.data),
    fluidLevels: base64ToBytes(chunk.fluidLevels),
  }
}

function createWorldSave(): WorldSaveFile {
  return {
    version: WORLD_SAVE_VERSION,
    createdAt: new Date().toISOString(),
    seed: WORLD_SAVE_SEED,
    timeOfDay: lighting.timeOfDay,
    player: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      yaw,
      pitch,
    },
    hotbar: [...hotbarBlockIds],
    graphicsPreset,
    fluid: {
      paused: fluidPaused,
      worldgenSimulationEnabled: world.getWorldgenFluidSimulationEnabled(),
    },
    chunks: world.exportEditedChunks().map(serializeChunkPayload),
  }
}

function restoreHotbarFromSave(savedHotbar: number[]) {
  const restoredIds = savedHotbar
    .map((entry) => Number(entry) as BlockId)
    .filter((blockId) => placeableBlockIds.has(blockId))
    .slice(0, HOTBAR_SIZE)
  const nextHotbarBlockIds = [...restoredIds, ...defaultHotbarBlockIds].slice(0, HOTBAR_SIZE)

  hotbarBlockIds.splice(0, hotbarBlockIds.length, ...nextHotbarBlockIds)
  selectedHotbarSlot = Math.min(selectedHotbarSlot, hotbarBlockIds.length - 1)
  saveHotbarBlockIds()
  updateHotbarSelection()
}

function applyWorldSave(save: WorldSaveFile) {
  const importedCount = world.importEditedChunks(save.chunks.map(deserializeChunkPayload))
  if (importedCount === null) {
    throw new Error('Invalid saved chunk data')
  }

  restoreHotbarFromSave(save.hotbar)
  applyGraphicsPreset(save.graphicsPreset)
  lighting.setTimeOfDay(save.timeOfDay)
  fluidPaused = save.fluid.paused
  world.setWorldgenFluidSimulationEnabled(save.fluid.worldgenSimulationEnabled)

  camera.position.set(save.player.x, save.player.y, save.player.z)
  yaw = save.player.yaw
  pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, save.player.pitch))
  verticalVelocity = 0
  isGrounded = false
  selection.visible = false
  clearActiveInput()
  updateCameraRotation()
  world.ensureChunksAround(camera.position.x, camera.position.z)

  return importedCount
}

function saveWorldToLocalStorage() {
  const save = createWorldSave()

  try {
    localStorage.setItem(WORLD_SAVE_STORAGE_KEY, JSON.stringify(save))
    showScreenshotToast(`世界已保存：${save.chunks.length} 个 edited chunk`)
  } catch {
    showScreenshotToast('世界保存失败：浏览器存储空间不足')
  }
}

function loadWorldFromLocalStorage() {
  let raw: string | null = null

  try {
    raw = localStorage.getItem(WORLD_SAVE_STORAGE_KEY)
  } catch {
    showScreenshotToast('读取浏览器存档失败')
    return false
  }

  if (!raw) {
    showScreenshotToast('没有可载入的浏览器存档')
    return false
  }

  const save = parseWorldSave(raw)
  if (!save) {
    showScreenshotToast('浏览器存档格式无效')
    return false
  }

  try {
    const importedCount = applyWorldSave(save)
    showScreenshotToast(`世界已载入：${importedCount} 个 edited chunk`)
    return true
  } catch {
    showScreenshotToast('世界载入失败')
    return false
  }
}

function exportWorldSave() {
  const save = createWorldSave()
  const filename = `web_mc-save-${formatScreenshotTimestamp()}.json`
  const blob = new Blob([JSON.stringify(save)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  downloadScreenshotUrl(url, filename)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  showScreenshotToast(`已导出存档：${filename}`)
}

function requestWorldImport() {
  clearActiveInput()
  if (isGameLocked()) {
    document.exitPointerLock()
  }

  saveImportInput.value = ''
  saveImportInput.click()
}

function clearWorldEdits() {
  world.clearEditedChunks()
  world.ensureChunksAround(camera.position.x, camera.position.z)

  try {
    localStorage.removeItem(WORLD_SAVE_STORAGE_KEY)
  } catch {
    // Ignore storage failures; the in-memory world has already been cleared.
  }

  showScreenshotToast('已清空编辑并回到 seed world')
}

function saveCanvasScreenshot() {
  const filename = `web_mc-${formatScreenshotTimestamp()}.png`
  const canvas = renderer.domElement

  canvas.toBlob((blob) => {
    if (!blob) {
      try {
        downloadScreenshotUrl(canvas.toDataURL('image/png'), filename)
        showScreenshotToast(`已保存截图：${filename}`)
      } catch {
        showScreenshotToast('截图失败')
      }
      return
    }

    const url = URL.createObjectURL(blob)
    downloadScreenshotUrl(url, filename)
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    showScreenshotToast(`已保存截图：${filename}`)
  }, 'image/png')
}

function requestScreenshot() {
  screenshotRequested = true
  showScreenshotToast('正在保存截图...')
}

function handleGameWheel(event: WheelEvent) {
  if (isPaletteOpen) {
    return
  }

  const isCanvasWheel = event.target === renderer.domElement
  if (!isGameLocked() && !isCanvasWheel) {
    return
  }

  event.preventDefault()

  if (!isGameLocked()) {
    return
  }

  const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
  const delta = Math.sign(dominantDelta)
  const now = performance.now()

  if (delta !== 0 && now - lastWheelSlotChange > wheelCooldownMs) {
    setSelectedBlockByIndex(selectedHotbarSlot + delta)
    lastWheelSlotChange = now
  }
}

function preventGameSurfaceGesture(event: Event) {
  if (isPaletteOpen) {
    return
  }

  if (isGameLocked() || event.target === renderer.domElement) {
    event.preventDefault()
  }
}

function moveWithCollisions(delta: Vector3) {
  const epsilon = 1e-4

  camera.position.x += delta.x
  let bounds = getPlayerBounds()
  if (
    world.intersectsSolid(
      bounds.minX,
      bounds.minY,
      bounds.minZ,
      bounds.maxX,
      bounds.maxY,
      bounds.maxZ,
    )
  ) {
    if (delta.x > 0) {
      camera.position.x = Math.floor(bounds.maxX) - playerRadius - epsilon
    } else if (delta.x < 0) {
      camera.position.x = Math.floor(bounds.minX) + 1 + playerRadius + epsilon
    }
  }

  camera.position.z += delta.z
  bounds = getPlayerBounds()
  if (
    world.intersectsSolid(
      bounds.minX,
      bounds.minY,
      bounds.minZ,
      bounds.maxX,
      bounds.maxY,
      bounds.maxZ,
    )
  ) {
    if (delta.z > 0) {
      camera.position.z = Math.floor(bounds.maxZ) - playerRadius - epsilon
    } else if (delta.z < 0) {
      camera.position.z = Math.floor(bounds.minZ) + 1 + playerRadius + epsilon
    }
  }

  isGrounded = false
  camera.position.y += delta.y
  bounds = getPlayerBounds()
  if (
    world.intersectsSolid(
      bounds.minX,
      bounds.minY,
      bounds.minZ,
      bounds.maxX,
      bounds.maxY,
      bounds.maxZ,
    )
  ) {
    if (delta.y > 0) {
      camera.position.y = Math.floor(bounds.maxY) - (playerHeight - eyeHeight) - epsilon
    } else if (delta.y < 0) {
      camera.position.y = Math.floor(bounds.minY) + 1 + eyeHeight + epsilon
      isGrounded = true
    }
    verticalVelocity = 0
  }
}

function canPlaceBlock(x: number, y: number, z: number) {
  if (!isBlockReplaceable(world.getBlock(x, y, z))) {
    return false
  }

  const bounds = getPlayerBounds()
  return !(
    bounds.maxX > x &&
    bounds.minX < x + 1 &&
    bounds.maxY > y &&
    bounds.minY < y + 1 &&
    bounds.maxZ > z &&
    bounds.minZ < z + 1
  )
}

function refreshHud() {
  const mode = isFlying ? '飞行' : `步行${isGrounded ? '（落地）' : '（空中）'}`
  const liquidLabel =
    playerLiquidKind === 'water' ? ' | 水中' : playerLiquidKind === 'lava' ? ' | 岩浆中' : ''
  modeLine.textContent = `模式：${mode}${liquidLabel}`
  coordsLine.textContent = `坐标：${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}`
  worldLine.textContent = `区块：${world.getLoadedChunkCount()} | 方块：${world.getLoadedBlockCount()} | 可见：${world.getRenderedBlockCount()}`
}

function updatePaletteFilter() {
  const query = paletteSearch.value.trim().toLowerCase()

  for (const button of paletteButtons) {
    const block = getRequiredBlockDefinition(Number(button.dataset.blockId) as BlockId)
    const matchesCategory = activePaletteCategory === 'all' || block.category === activePaletteCategory
    const matchesQuery =
      query.length === 0 || block.label.toLowerCase().includes(query) || block.key.toLowerCase().includes(query)

    button.classList.toggle('hidden', !matchesCategory || !matchesQuery)
  }

  for (const button of paletteTabButtons) {
    button.classList.toggle('is-selected', button.dataset.category === activePaletteCategory)
  }
}

function updatePerf(deltaTime: number) {
  frameMs = deltaTime * 1000
  fpsFrames += 1
  fpsTime += deltaTime

  if (fpsTime >= 0.25) {
    fps = fpsFrames / fpsTime
    fpsFrames = 0
    fpsTime = 0
  }
}

function updateFluidSimulation(deltaTime: number) {
  if (fluidStepRequested) {
    fluidStepRequested = false
    world.stepFluids()
    return
  }

  if (!fluidPaused) {
    world.updateFluids(deltaTime)
  }
}

function updateSelection() {
  if (isPaletteOpen || !isGameLocked()) {
    selection.visible = false
    return null
  }

  camera.getWorldDirection(lookDirection)
  const hit = world.raycastVoxel(camera.position, lookDirection, 8)

  if (!hit) {
    selection.visible = false
    return null
  }

  selection.visible = true
  selection.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5)
  return hit
}

type WorldRaycastHit = NonNullable<ReturnType<typeof updateSelection>>

function formatTarget(hit: WorldRaycastHit | null) {
  if (!hit) {
    return '-'
  }

  const face = `${hit.normal.x >= 0 ? '+' : ''}${hit.normal.x},${hit.normal.y >= 0 ? '+' : ''}${hit.normal.y},${
    hit.normal.z >= 0 ? '+' : ''
  }${hit.normal.z}`

  return `${getBlockLabel(hit.blockId)} @ ${hit.block.x},${hit.block.y},${hit.block.z} face ${face} dist ${hit.distance.toFixed(1)}`
}

function placeOrRemoveBlock(place: boolean) {
  if (isPaletteOpen || !isGameLocked()) {
    return
  }

  const hit = updateSelection()
  if (!hit) {
    return
  }

  if (!place) {
    world.setBlock(hit.block.x, hit.block.y, hit.block.z, BlockId.Air)
    return
  }

  const target = isBlockReplaceable(hit.blockId)
    ? hit.block
    : {
        x: hit.block.x + hit.normal.x,
        y: hit.block.y + hit.normal.y,
        z: hit.block.z + hit.normal.z,
      }

  if (!canPlaceBlock(target.x, target.y, target.z)) {
    return
  }

  world.setBlock(target.x, target.y, target.z, getSelectedBlock().id)
}

function updateMovement(deltaTime: number) {
  forward.set(-Math.sin(yaw), 0, -Math.cos(yaw))
  right.set(Math.cos(yaw), 0, -Math.sin(yaw))
  moveDirection.set(0, 0, 0)

  if (keys.has('KeyW')) {
    moveDirection.add(forward)
  }
  if (keys.has('KeyS')) {
    moveDirection.sub(forward)
  }
  if (keys.has('KeyD')) {
    moveDirection.add(right)
  }
  if (keys.has('KeyA')) {
    moveDirection.sub(right)
  }

  if (moveDirection.lengthSq() > 0) {
    moveDirection.normalize()
  }

  if (isFlying) {
    const vertical = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0)
    const liquidSpeed = flySpeed * playerLiquidProfile.speedMultiplier
    moveDirection.multiplyScalar(liquidSpeed * deltaTime)
    moveDirection.addScaledVector(up, vertical * liquidSpeed * deltaTime)
    camera.position.add(moveDirection)
    verticalVelocity = 0
    isGrounded = false
    return
  }

  const horizontalDelta = moveDirection.multiplyScalar(walkSpeed * playerLiquidProfile.speedMultiplier * deltaTime)
  const isInLiquid = playerLiquidKind !== 'none'

  if (!isInLiquid && keys.has('Space') && isGrounded) {
    verticalVelocity = jumpVelocity
    isGrounded = false
  }

  if (isInLiquid) {
    if (keys.has('Space')) {
      verticalVelocity += playerLiquidProfile.swimUpAcceleration * deltaTime
    }
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) {
      verticalVelocity -= playerLiquidProfile.swimUpAcceleration * 0.7 * deltaTime
    }

    verticalVelocity -= gravity * playerLiquidProfile.gravityScale * deltaTime
    verticalVelocity *= Math.max(0, 1 - playerLiquidProfile.verticalDrag * deltaTime)
    verticalVelocity = Math.max(
      playerLiquidProfile.maxSinkSpeed,
      Math.min(playerLiquidProfile.maxRiseSpeed, verticalVelocity),
    )
  } else {
    verticalVelocity -= gravity * deltaTime
  }

  moveWithCollisions(new Vector3(horizontalDelta.x, verticalVelocity * deltaTime, horizontalDelta.z))
}

function animate(timestamp?: number) {
  timer.update(timestamp)
  const deltaTime = Math.min(timer.getDelta(), 0.05)
  updatePerf(deltaTime)
  updatePlayerLiquidState()

  if (isGameLocked()) {
    updateMovement(deltaTime)
    world.ensureChunksAround(camera.position.x, camera.position.z)
    updatePlayerLiquidState()
  }

  updateFluidSimulation(deltaTime)
  updateAnimatedMaterials(deltaTime)
  world.rebuildDirtyChunks(2)
  lighting.update(camera.position, deltaTime)
  emissiveLights.update(world, camera.position, deltaTime, lighting.timeOfDay)
  const hit = updateSelection()
  refreshHud()
  if (postProcessing.enabled) {
    postProcessing.render(deltaTime)
  } else {
    renderer.render(scene, camera)
  }
  if (screenshotRequested) {
    screenshotRequested = false
    saveCanvasScreenshot()
  }
  debugOverlay.update({
    enabled: debugEnabled,
    fps,
    frameMs,
    mode: isFlying ? 'Flying' : `Walking ${isGrounded ? 'grounded' : 'airborne'}`,
    selectedBlock: getSelectedBlock().label,
    target: formatTarget(hit),
    playerLiquid: playerLiquidProfile.label,
    playerLiquidSpeedMultiplier: playerLiquidProfile.speedMultiplier,
    yaw,
    pitch,
    camera,
    renderer,
    world,
    graphicsPreset,
    maxPixelRatio: graphicsSettings.maxPixelRatio,
    bloomConfigured: postProcessing.bloomEnabled,
    shadowEnabled: lighting.shadowEnabled,
    shadowMapSize: lighting.shadowMapSize,
    postFxEnabled: postProcessing.enabled,
    emissiveLightCount: emissiveLights.activeCount,
    emissiveLightsEnabled: emissiveLights.enabled,
    dayCycleTime: formatDayCycleTime(lighting.timeOfDay),
    dayCyclePhase: lighting.phase,
    dayCycleSeconds: lighting.cycleSeconds,
    fluidPaused,
    worldgenFluidSimEnabled: world.getWorldgenFluidSimulationEnabled(),
  })
  requestAnimationFrame(animate)
}

document.addEventListener('mousemove', (event) => {
  if (!isGameLocked()) {
    return
  }

  yaw -= event.movementX * 0.0022
  pitch -= event.movementY * 0.0018
  pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch))
  updateCameraRotation()
})

document.addEventListener('pointerlockchange', () => {
  if (!isGameLocked()) {
    clearActiveInput()
  }
  syncLockScreen()
})

document.addEventListener('pointerlockerror', clearActiveInput)

window.addEventListener('keydown', (event) => {
  const editableTarget = isEditableTarget(event.target)

  if (!editableTarget && (event.metaKey || event.ctrlKey) && !event.repeat) {
    if (event.code === 'KeyS') {
      saveWorldToLocalStorage()
      clearActiveInput()
      event.preventDefault()
      return
    }

    if (event.code === 'KeyO') {
      loadWorldFromLocalStorage()
      clearActiveInput()
      event.preventDefault()
      return
    }

    if (event.code === 'KeyE') {
      exportWorldSave()
      clearActiveInput()
      event.preventDefault()
      return
    }

    if (event.code === 'KeyI') {
      requestWorldImport()
      event.preventDefault()
      return
    }
  }

  if (!editableTarget && isSystemShortcutEvent(event)) {
    clearActiveInput()
    return
  }

  if (
    !editableTarget &&
    (event.code === 'F2' || event.key === 'F2') &&
    !event.repeat
  ) {
    requestScreenshot()
    event.preventDefault()
    return
  }

  if (
    !editableTarget &&
    (event.code === 'F3' || event.key === 'F3' || event.code === 'Backquote') &&
    !event.repeat
  ) {
    debugEnabled = !debugEnabled
    debugOverlay.setVisible(debugEnabled)
    shell.classList.toggle('debug-mode', debugEnabled)
    event.preventDefault()
    return
  }

  if (
    !editableTarget &&
    (event.code === 'F4' ||
      event.key === 'F4' ||
      event.code === 'KeyP' ||
      event.key.toLowerCase() === 'p') &&
    !event.repeat
  ) {
    applyGraphicsPreset(nextGraphicsPreset(graphicsPreset))
    event.preventDefault()
    return
  }

  if (!editableTarget && event.code === 'KeyV' && !event.repeat) {
    fluidPaused = !fluidPaused
    showScreenshotToast(fluidPaused ? '流体模拟已暂停' : '流体模拟已恢复')
    event.preventDefault()
    return
  }

  if (!editableTarget && event.code === 'KeyB' && !event.repeat) {
    fluidStepRequested = true
    showScreenshotToast('单步执行流体 tick')
    event.preventDefault()
    return
  }

  if (!editableTarget && event.code === 'KeyN' && event.shiftKey && !event.repeat) {
    clearWorldEdits()
    clearActiveInput()
    event.preventDefault()
    return
  }

  if (!editableTarget && event.code === 'KeyN' && !event.repeat) {
    const clearedCount = world.clearFlowingFluids()
    showScreenshotToast(`已清除流动液体：${clearedCount}`)
    event.preventDefault()
    return
  }

  if (!editableTarget && event.code === 'KeyM' && !event.repeat) {
    const nextEnabled = !world.getWorldgenFluidSimulationEnabled()
    world.setWorldgenFluidSimulationEnabled(nextEnabled)
    showScreenshotToast(`天然液体仿真：${nextEnabled ? '开' : '关'}`)
    event.preventDefault()
    return
  }

  if (!editableTarget && event.code === 'KeyE' && !event.repeat) {
    setPaletteOpen(!isPaletteOpen)
    event.preventDefault()
    return
  }

  if (isPaletteOpen) {
    if (event.code === 'Escape') {
      setPaletteOpen(false)
      event.preventDefault()
    }
    return
  }

  if (/^Digit[1-9]$/.test(event.code)) {
    const index = Number(event.code.at(-1)) - 1
    if (index < hotbarBlockIds.length) {
      setSelectedBlockByIndex(index)
      event.preventDefault()
    }
  }

  keys.add(event.code)

  if (event.code === 'KeyR') {
    resetPlayer()
  }

  if (event.code === 'KeyG' && !event.repeat) {
    isFlying = !isFlying
    verticalVelocity = 0
  }

  if (['Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
    event.preventDefault()
  }
})

window.addEventListener('keyup', (event) => {
  keys.delete(event.code)
  if (
    event.code === 'MetaLeft' ||
    event.code === 'MetaRight' ||
    event.code === 'ControlLeft' ||
    event.code === 'ControlRight' ||
    event.key === 'Meta' ||
    event.key === 'Control'
  ) {
    clearActiveInput()
  }
})

window.addEventListener('blur', clearActiveInput)
window.addEventListener('focus', clearActiveInput)
window.addEventListener('pagehide', clearActiveInput)

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    clearActiveInput()
  }
})

hotbar.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }

  const button = target.closest<HTMLButtonElement>('.hotbar-slot')
  if (!button) {
    return
  }

  const slotIndex = Number(button.dataset.slotIndex)
  if (Number.isInteger(slotIndex)) {
    setSelectedBlockByIndex(slotIndex)
  }
})

hotbar.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    const delta = Math.sign(event.deltaY)
    if (delta !== 0) {
      setSelectedBlockByIndex(selectedHotbarSlot + delta)
    }
  },
  { passive: false },
)

paletteSearch.addEventListener('input', updatePaletteFilter)

paletteTabs.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }

  const button = target.closest<HTMLButtonElement>('.palette-tab')
  if (!button) {
    return
  }

  activePaletteCategory = (button.dataset.category ?? 'all') as BlockCategory | 'all'
  updatePaletteFilter()
})

paletteGrid.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }

  const button = target.closest<HTMLButtonElement>('.palette-block')
  if (!button) {
    return
  }

  const block = getBlockDefinition(Number(button.dataset.blockId) as BlockId)
  if (!block) {
    return
  }

  assignBlockToSelectedSlot(block)
  setPaletteOpen(false)
  requestLock()
})

paletteClose.addEventListener('click', () => {
  setPaletteOpen(false)
})

saveImportInput.addEventListener('change', async () => {
  const file = saveImportInput.files?.[0]
  saveImportInput.value = ''

  if (!file) {
    return
  }

  try {
    const raw = await file.text()
    const save = parseWorldSave(raw)

    if (!save) {
      showScreenshotToast('导入失败：存档格式无效')
      return
    }

    const importedCount = applyWorldSave(save)
    try {
      localStorage.setItem(WORLD_SAVE_STORAGE_KEY, JSON.stringify(save))
      showScreenshotToast(`已导入并保存：${importedCount} 个 edited chunk`)
    } catch {
      showScreenshotToast(`已导入：${importedCount} 个 edited chunk，本地保存失败`)
    }
  } catch {
    showScreenshotToast('导入失败：无法读取文件')
  }
})

renderer.domElement.addEventListener('mousedown', (event) => {
  event.preventDefault()

  if (!isGameLocked()) {
    requestLock()
    return
  }

  if (event.button === 0) {
    placeOrRemoveBlock(false)
  }
  if (event.button === 2) {
    placeOrRemoveBlock(true)
  }
}, { passive: false })

renderer.domElement.addEventListener('mouseup', (event) => {
  event.preventDefault()
}, { passive: false })

renderer.domElement.addEventListener('auxclick', (event) => {
  event.preventDefault()
}, { passive: false })

renderer.domElement.addEventListener('contextmenu', (event) => {
  event.preventDefault()
}, { passive: false })

renderer.domElement.addEventListener('dragstart', (event) => {
  event.preventDefault()
})

window.addEventListener('wheel', handleGameWheel, { passive: false })
window.addEventListener('touchmove', preventGameSurfaceGesture, { passive: false })
window.addEventListener('gesturestart', preventGameSurfaceGesture)
window.addEventListener('gesturechange', preventGameSurfaceGesture)

startButton.addEventListener('click', requestLock)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  const pixelRatio = Math.min(window.devicePixelRatio, graphicsSettings.maxPixelRatio)
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  postProcessing.resize(window.innerWidth, window.innerHeight, pixelRatio)
})

resetPlayer()
updateHotbarSelection()
updatePaletteFilter()
animate()
