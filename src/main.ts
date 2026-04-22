import './style.css'
import {
  AmbientLight,
  BoxGeometry,
  Clock,
  Color,
  DirectionalLight,
  Euler,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { BlockId, PLACEABLE_BLOCKS, type PlaceableBlockDefinition, VoxelWorld } from './game/world'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Missing #app root element')
}

const assetBase = import.meta.env.BASE_URL

function getRequiredElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Missing element: ${selector}`)
  }
  return element
}

const hotbarMarkup = PLACEABLE_BLOCKS.map((block, index) => {
  return `
    <button
      type="button"
      class="hotbar-slot"
      data-block-id="${block.id}"
      aria-label="选择${block.label}"
    >
      <span class="hotbar-key">${index + 1}</span>
      <img src="${assetBase}${block.iconPath}" alt="${block.label}" width="48" height="48" />
      <span class="hotbar-name">${block.label}</span>
    </button>
  `
}).join('')

app.innerHTML = `
  <div class="shell">
    <div id="viewport" class="viewport"></div>
    <div class="crosshair" aria-hidden="true"></div>
    <section class="hud hud-top">
      <div class="panel">
        <p class="eyebrow">web_mc</p>
        <h1>Creative Sandbox</h1>
        <p>点击画面锁定鼠标，左键移除，右键放置当前选中的方块。</p>
        <p class="hint">数字键 1-${PLACEABLE_BLOCKS.length} 可以快速切换快捷栏。</p>
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
        <span>1-${PLACEABLE_BLOCKS.length} 切换方块</span>
        <span>G 切换飞行/步行</span>
        <span>R 重置位置</span>
        <span>Esc 解锁鼠标</span>
      </div>
    </section>
    <section class="hotbar-layer">
      <div id="hotbar" class="hotbar">${hotbarMarkup}</div>
      <p id="hotbar-label" class="hotbar-label"></p>
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

const viewport = getRequiredElement<HTMLDivElement>('#viewport')
const lockScreen = getRequiredElement<HTMLDivElement>('#lock-screen')
const startButton = getRequiredElement<HTMLButtonElement>('#start-button')
const modeLine = getRequiredElement<HTMLParagraphElement>('#mode-line')
const coordsLine = getRequiredElement<HTMLParagraphElement>('#coords-line')
const worldLine = getRequiredElement<HTMLParagraphElement>('#world-line')
const hotbar = getRequiredElement<HTMLDivElement>('#hotbar')
const hotbarLabel = getRequiredElement<HTMLParagraphElement>('#hotbar-label')

const hotbarButtons = Array.from(hotbar.querySelectorAll<HTMLButtonElement>('.hotbar-slot'))

const renderer = new WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0xb8dcff)
viewport.append(renderer.domElement)

const scene = new Scene()
scene.background = new Color(0xb8dcff)
scene.fog = new Fog(0xb8dcff, 40, 120)

const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400)
camera.position.set(8, 9, 8)

const cameraRig = new Group()
cameraRig.add(camera)
scene.add(cameraRig)

const ambientLight = new AmbientLight(0xffffff, 1.7)
scene.add(ambientLight)

const sun = new DirectionalLight(0xfff3d4, 1.8)
sun.position.set(24, 48, 16)
scene.add(sun)

const world = new VoxelWorld(scene)
world.ensureChunksAround(camera.position.x, camera.position.z)

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

const clock = new Clock()
const raycaster = new Raycaster()
const centerScreen = new Vector2(0, 0)
const lookEuler = new Euler(0, 0, 0, 'YXZ')
const moveDirection = new Vector3()
const forward = new Vector3()
const right = new Vector3()
const up = new Vector3(0, 1, 0)

const keys = new Set<string>()

let yaw = 0
let pitch = 0
let isFlying = true
let isGrounded = false
let verticalVelocity = 0
let selectedBlockIndex = 0

const playerRadius = 0.35
const playerHeight = 1.8
const eyeHeight = 1.62
const walkSpeed = 7
const flySpeed = 10
const gravity = 24
const jumpVelocity = 9

const getSelectedBlock = () => PLACEABLE_BLOCKS[selectedBlockIndex]

const requestLock = () => {
  renderer.domElement.requestPointerLock()
}

const resetPlayer = () => {
  camera.position.set(8, 9, 8)
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

function updateCameraRotation() {
  lookEuler.set(pitch, yaw, 0)
  camera.quaternion.setFromEuler(lookEuler)
}

function updateHotbarSelection() {
  const selectedBlock = getSelectedBlock()

  for (const button of hotbarButtons) {
    const blockId = Number(button.dataset.blockId)
    button.classList.toggle('is-selected', blockId === selectedBlock.id)
  }

  hotbarLabel.textContent = `当前方块：${selectedBlock.label}`
}

function setSelectedBlock(block: PlaceableBlockDefinition) {
  const nextIndex = PLACEABLE_BLOCKS.findIndex((entry) => entry.id === block.id)
  if (nextIndex === -1) {
    return
  }

  selectedBlockIndex = nextIndex
  updateHotbarSelection()
}

function setSelectedBlockByIndex(index: number) {
  const normalizedIndex = ((index % PLACEABLE_BLOCKS.length) + PLACEABLE_BLOCKS.length) % PLACEABLE_BLOCKS.length
  selectedBlockIndex = normalizedIndex
  updateHotbarSelection()
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
  if (world.getBlock(x, y, z) !== BlockId.Air) {
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
  modeLine.textContent = `模式：${mode}`
  coordsLine.textContent = `坐标：${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}`
  worldLine.textContent = `区块：${world.getLoadedChunkCount()} | 方块：${world.getLoadedBlockCount()}`
}

function updateSelection() {
  raycaster.setFromCamera(centerScreen, camera)
  const hit = world.raycast(raycaster)

  if (!hit || hit.distance > 8) {
    selection.visible = false
    return null
  }

  selection.visible = true
  selection.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5)
  return hit
}

function placeOrRemoveBlock(place: boolean) {
  if (document.pointerLockElement !== renderer.domElement) {
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

  const targetX = hit.block.x + hit.normal.x
  const targetY = hit.block.y + hit.normal.y
  const targetZ = hit.block.z + hit.normal.z

  if (!canPlaceBlock(targetX, targetY, targetZ)) {
    return
  }

  world.setBlock(targetX, targetY, targetZ, getSelectedBlock().id)
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
    moveDirection.multiplyScalar(flySpeed * deltaTime)
    moveDirection.addScaledVector(up, vertical * flySpeed * deltaTime)
    camera.position.add(moveDirection)
    verticalVelocity = 0
    isGrounded = false
    return
  }

  const horizontalDelta = moveDirection.multiplyScalar(walkSpeed * deltaTime)

  if (keys.has('Space') && isGrounded) {
    verticalVelocity = jumpVelocity
    isGrounded = false
  }

  verticalVelocity -= gravity * deltaTime
  moveWithCollisions(new Vector3(horizontalDelta.x, verticalVelocity * deltaTime, horizontalDelta.z))
}

function animate() {
  const deltaTime = Math.min(clock.getDelta(), 0.05)

  if (document.pointerLockElement === renderer.domElement) {
    updateMovement(deltaTime)
    world.ensureChunksAround(camera.position.x, camera.position.z)
  }

  updateSelection()
  refreshHud()
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== renderer.domElement) {
    return
  }

  yaw -= event.movementX * 0.0022
  pitch -= event.movementY * 0.0018
  pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch))
  updateCameraRotation()
})

document.addEventListener('pointerlockchange', () => {
  lockScreen.classList.toggle('hidden', document.pointerLockElement === renderer.domElement)
})

window.addEventListener('keydown', (event) => {
  if (/^Digit[1-9]$/.test(event.code)) {
    const index = Number(event.code.at(-1)) - 1
    if (index < PLACEABLE_BLOCKS.length) {
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

  const blockId = Number(button.dataset.blockId)
  const block = PLACEABLE_BLOCKS.find((entry) => entry.id === blockId)
  if (block) {
    setSelectedBlock(block)
  }
})

hotbar.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    const delta = Math.sign(event.deltaY)
    if (delta !== 0) {
      setSelectedBlockByIndex(selectedBlockIndex + delta)
    }
  },
  { passive: false },
)

renderer.domElement.addEventListener('mousedown', (event) => {
  if (document.pointerLockElement !== renderer.domElement) {
    requestLock()
    return
  }

  if (event.button === 0) {
    placeOrRemoveBlock(false)
  }
  if (event.button === 2) {
    placeOrRemoveBlock(true)
  }
})

renderer.domElement.addEventListener('contextmenu', (event) => {
  event.preventDefault()
})

startButton.addEventListener('click', requestLock)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

resetPlayer()
updateHotbarSelection()
animate()
