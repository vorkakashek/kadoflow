<script setup lang="ts">
/**
 * Hero swarm — tilted torus spiral (ring + helix twist), slow plane drift.
 * ≥1200: cursor knocks balls; they return to moving seats.
 * <1200: no pointer interaction (mobile/tablet baked or calm orbit).
 */
import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import {
  isAppleTouchDevice,
  isCoarsePointer,
  isMobileChromeHeightOnlyResize,
  isNarrowViewport,
} from '~/utils/mobileViewport'
import { flowSurfaceMask } from '~/composables/useFlowSurfaceMask'
import { useBrandPreload } from '~/composables/useBrandPreload'

/** Flip this to A/B studio looks (files in /public/env). */
const HDRI_PRESETS = {
  studioSoft: '/env/studio_small_09_2k.hdr',
  photoStudio: '/env/photo_studio_01_2k.hdr',
  studioWarm: '/env/studio_small_03_1k.hdr',
} as const
const ACTIVE_HDRI: keyof typeof HDRI_PRESETS = 'studioSoft'
/** Desktop breakpoint — full ball count, richer materials, cursor interaction. */
const DESKTOP_MIN_WIDTH = 1200
const BALL_COUNT_DESKTOP = 32
const BALL_COUNT_TABLET = 16
/** Mobile: few high-quality balls on a baked orbit (no physics / pointer). */
const BALL_COUNT_MOBILE = 6
/** Camera distance — framing is fluid via on-screen diameter, not a zoom cliff. */
const CAMERA_Z = 8.82
/** Same control widths as design-tokens/responsive.json. */
const FLUID_VIEWPORTS = [390, 768, 1280, 1440, 1920, 2560]
/** On-screen ball diameter (px) at those widths — 390 ≈ current phone, 2560 ≈ 2K. */
const FLUID_DIAMETER_W = [90, 118, 156, 176, 192, 200]
/** Diameter contribution from viewport height (short heroes keep balls in check). */
const FLUID_HEIGHTS = [667, 800, 900, 1080, 1440]
const FLUID_DIAMETER_H = [96, 118, 142, 176, 200]
/** Soft spring back to the moving seat on the ring. */
const RETURN = 0.000022
const DAMPING = 0.982
/** Base cursor push (continuous while near). */
const CURSOR_FORCE = 0.004
/** Extra scale on the first enter knock. */
const CURSOR_IMPULSE = 1.3
/** Ongoing push while the cursor stays over / sweeps through a ball. */
const CURSOR_HOLD = 0.32
/** Extra hit padding around projected ball radius (px). */
const CURSOR_HIT_PAD_PX = 36
/** Screen-radius scale vs projected ball (1 = silhouette). */
const CURSOR_HIT_SCALE = 1.12
/** Min pointer travel per event (px) to count as a strong swipe. */
const CURSOR_SPEED_MIN_PX = 0.6
/** Even slow cursor still applies a fraction of hold force. */
const CURSOR_IDLE_HOLD = 0.14
const SEPARATION_PAD = 0.03
const SEPARATION_FORCE = 0.01
/** Torus tube radius as a fraction of the major ring radius. */
const SPIRAL_TUBE_RATIO = 0.3
/** How many helix twists per full lap around the ring. */
const SPIRAL_TURNS = 2.75
/**
 * Must match HomeHero media padding — used to place the swarm at a
 * fraction of the *surface* height (not the taller media canvas).
 */
const MEDIA_TOP_EXTRA_VH = 0.14
const MEDIA_DIVE_VH = 0.6
/** Mobile cluster center: fraction down the visible surface (0 = top). Negative = into headroom. */
const MOBILE_ANCHOR_SURFACE_Y = -0.4
const MAX_SPEED = 0.26
const SOFT_BOUND_SCALE = 12.5
/**
 * Soft leash from the moving orbit seat (× ball radius).
 * Past this offset a spring pulls back — no hard clamp / velocity kill
 * (those fought cursor push every frame and felt dead).
 */
const ORBIT_LEASH = 2.6
/** Extra return strength when stretched past ORBIT_LEASH (× overshoot / leash). */
const ORBIT_LEASH_SPRING = 0.0001
/** Radians per ms along the ring path. */
const ORBIT_SPEED = 0.0001792
/** Slow drift of the ring plane orientation (radians per ms). */
const RING_TILT_SPEED = 0.000018
/** Beyond this distance from seat, base return spring softens further. */
const RETURN_SOFT_DIST = 0.55
/** Tiny idle wander off the orbit. */
const CHAOS_IDLE = 0.000018
/** Occasional self-knock chance per ball per frame (at ~60fps). */
const CHAOS_POP_CHANCE = 0.0014
const CHAOS_POP_FORCE = 0.012
/** Lock to seats on boot / resize so separation doesn't grenade the swarm. */
const SETTLE_MS = 700
/** Debounce real window resizes before a full scene reboot. */
const REBOOT_MS = 320

function lerpStops(x: number, stops: number[], values: number[]) {
  if (x <= stops[0]) return values[0]
  const last = stops.length - 1
  if (x >= stops[last]) return values[last]
  for (let i = 0; i < last; i++) {
    if (x <= stops[i + 1]) {
      const t = (x - stops[i]) / (stops[i + 1] - stops[i])
      return values[i] + (values[i + 1] - values[i]) * t
    }
  }
  return values[last]
}

/**
 * Fluid ball size from width, height, and aspect — no 1200px cliff.
 * Phone and 2K are the liked anchors; everything between interpolates.
 */
function swarmLayout(w: number, h: number) {
  const fromW = lerpStops(w, FLUID_VIEWPORTS, FLUID_DIAMETER_W)
  const fromH = lerpStops(h, FLUID_HEIGHTS, FLUID_DIAMETER_H)
  const aspect = w / Math.max(h, 1)
  // Portrait: trust width more (hero is tall). Landscape: let height pull down.
  const wH = Math.min(0.46, Math.max(0.16, (aspect - 0.48) / 2.4))
  let diameterPx = fromW * (1 - wH) + fromH * wH
  diameterPx = Math.min(diameterPx, h * 0.16, w * 0.28)
  diameterPx = Math.max(72, diameterPx)
  const geo = Math.sqrt(w * h)
  const ringScale = lerpStops(
    geo,
    [560, 780, 1100, 1400, 1920],
    [4.2, 5.0, 6.1, 6.75, 7.2],
  )
  return { diameterPx, ringScale, cameraZ: CAMERA_Z }
}

type Ball = {
  mesh: THREE.Mesh
  position: THREE.Vector3
  velocity: THREE.Vector3
  angle: number
  radius: number
  phase: number
  /** Cursor was inside this ball's hit radius last frame. */
  pointerInside: boolean
}

const COLORS = {
  green: new THREE.Color('#49573f'),
  white: new THREE.Color('#f5f1e8'),
  dark: new THREE.Color('#171915'),
} as const

const props = withDefaults(
  defineProps<{
    /** When false, rAF + draws stop (keeps GPU assets warm for return). */
    active?: boolean
  }>(),
  { active: true },
)

const canvasHost = ref<HTMLElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let animationId = 0
let resizeObserver: ResizeObserver | null = null
let removePointerListeners: (() => void) | null = null
let removeScrollPause: (() => void) | null = null
let sharedGeometry: THREE.BufferGeometry | null = null
let envMap: THREE.Texture | null = null
let microNormal: THREE.Texture | null = null
let microRough: THREE.Texture | null = null
let balls: Ball[] = []
let loopRunning = false
let lastFrame = 0
let runFrame: ((now: number) => void) | null = null
let forceResize: (() => void) | null = null
/** Snap seats after hide→show so morph resizes can't ratchet world positions. */
let resetSeats: (() => void) | null = null
let lockOrbitLayout: (() => void) | null = null
let unlockOrbitLayout: (() => void) | null = null
let bootGen = 0
let resizeTimer = 0
let resizePaintTimer = 0
let lastLayoutKey = ''
let removeWindowResize: (() => void) | null = null
let firstSceneReady = false

function layoutKey() {
  return `${window.innerWidth}|${window.innerHeight}`
}

function disposeScene() {
  stopLoop()
  runFrame = null
  forceResize = null
  resetSeats = null
  lockOrbitLayout = null
  unlockOrbitLayout = null
  window.clearTimeout(resizePaintTimer)
  resizePaintTimer = 0
  resizeObserver?.disconnect()
  resizeObserver = null
  removePointerListeners?.()
  removePointerListeners = null
  removeScrollPause?.()
  removeScrollPause = null
  sharedGeometry?.dispose()
  sharedGeometry = null
  envMap?.dispose()
  envMap = null
  microNormal?.dispose()
  microNormal = null
  microRough?.dispose()
  microRough = null
  for (const ball of balls) {
    const material = ball.mesh.material
    if (Array.isArray(material)) material.forEach((m) => m.dispose())
    else material.dispose()
  }
  balls = []
  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
    renderer = null
  }
}

function stopLoop() {
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = 0
  }
  loopRunning = false
}

function startLoop() {
  if (!runFrame || loopRunning || !renderer) return
  loopRunning = true
  lastFrame = performance.now()
  // Paint immediately — don't wait a rAF (blank composite = one-frame flash).
  runFrame(lastFrame)
}

watch(
  () => props.active,
  (on) => {
    if (on) {
      forceResize?.()
      startLoop()
    } else {
      stopLoop()
    }
  },
)

function readLayoutSpan1Px(host: HTMLElement) {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;width:var(--layout-span-1)'
  host.appendChild(probe)
  const width = probe.offsetWidth
  probe.remove()
  return width > 0 ? width : host.clientWidth * 0.06
}

/** Stable svh screen height — matches HomeHero media padding. */
function readAppScreenPx(): number {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;height:var(--app-screen)'
  document.body.appendChild(probe)
  const h = probe.getBoundingClientRect().height
  probe.remove()
  return h > 0 ? h : window.innerHeight
}

function prepDataMap(tex: THREE.Texture, repeat = 2.4) {
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.colorSpace = THREE.NoColorSpace
  tex.anisotropy = 4
  return tex
}

onMounted(() => {
  lastLayoutKey = layoutKey()
  void bootScene()
  const onWinResize = () => {
    if (isMobileChromeHeightOnlyResize()) return
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      const key = layoutKey()
      if (key === lastLayoutKey) return
      lastLayoutKey = key
      void bootScene()
    }, REBOOT_MS)
  }
  window.addEventListener('resize', onWinResize, { passive: true })
  removeWindowResize = () => {
    window.removeEventListener('resize', onWinResize)
    window.clearTimeout(resizeTimer)
  }
})

onUnmounted(() => {
  bootGen += 1
  removeWindowResize?.()
  removeWindowResize = null
  disposeScene()
})

async function bootScene() {
  const gen = ++bootGen
  disposeScene()
  const host = canvasHost.value
  if (!host) return

  const preload = useBrandPreload()
  if (!firstSceneReady) preload.setSceneProgress(0.06)

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const isCoarse = isCoarsePointer()
  const isMobile = isNarrowViewport()
  const isIOS = isAppleTouchDevice()
  /**
   * Mobile (Android + iOS): 6 balls, AA + 1k HDRI, baked helix orbit.
   * No pointer / separation / chaos — budget goes into look, not physics.
   */
  const lite = isMobile || isIOS
  const wide =
    Math.max(window.innerWidth, host.clientWidth) >= DESKTOP_MIN_WIDTH
  /** Cursor knocks only on wide desktop — never below 1200. */
  const interactive = wide
  const layout = swarmLayout(window.innerWidth, window.innerHeight)
  const ballCount = wide
    ? BALL_COUNT_DESKTOP
    : lite
      ? BALL_COUNT_MOBILE
      : BALL_COUNT_TABLET
  const sphereSegments = wide && !isCoarse ? 64 : lite ? 40 : 32
  const pixelRatioCap = wide && !isCoarse ? 2 : lite ? 1.5 : 1.25
  const cameraZ = layout.cameraZ
  const ballDiameterPx = layout.diameterPx
  const ringScale = layout.ringScale

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50)
  camera.position.set(0, 0.12, cameraZ)

  const gl = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    // Keep last frame when rAF is throttled (other monitor / unfocused window).
    // Without this the buffer clears between presents → random GL flashes.
    preserveDrawingBuffer: true,
  })
  gl.setClearColor(0x000000, 0)
  gl.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap))
  gl.outputColorSpace = THREE.SRGBColorSpace
  gl.toneMapping = THREE.ACESFilmicToneMapping
  gl.toneMappingExposure = 0.92
  gl.sortObjects = true
  // Avoid auto-clear gaps if a frame is skipped mid-composite.
  gl.autoClear = true
  // Below 1200: PE none so scroll isn't stolen and knocks stay off.
  // Wide desktop: keep auto so cursor knocks reach the host listeners.
  if (!interactive) {
    host.style.pointerEvents = 'none'
    host.style.cursor = 'default'
    gl.domElement.style.pointerEvents = 'none'
    gl.domElement.style.touchAction = 'pan-y'
  } else {
    host.style.pointerEvents = 'auto'
    host.style.cursor = 'grab'
    gl.domElement.style.pointerEvents = 'auto'
    gl.domElement.style.touchAction = 'none'
  }

  // HDRI — mobile uses the smaller 1k warm studio.
  {
    const pmrem = new THREE.PMREMGenerator(gl)
    pmrem.compileEquirectangularShader()

    const manager = new THREE.LoadingManager()
    manager.onProgress = (_url, loaded, total) => {
      if (firstSceneReady) return
      const ratio = total > 0 ? loaded / total : 0
      preload.setSceneProgress(0.08 + ratio * 0.72)
    }

    const texLoader = new THREE.TextureLoader(manager)
    const hdrUrl = wide ? HDRI_PRESETS[ACTIVE_HDRI] : HDRI_PRESETS.studioWarm
    const assetLoads: Promise<THREE.DataTexture | THREE.Texture>[] = [
      new HDRLoader(manager).loadAsync(hdrUrl),
    ]
    if (wide) {
      assetLoads.push(
        texLoader.loadAsync('/textures/micro/plaster_nor.jpg'),
        texLoader.loadAsync('/textures/micro/plaster_rough.jpg'),
      )
    }
    const assets = await Promise.all(assetLoads)
    if (gen !== bootGen) {
      if (renderer !== gl) {
        gl.dispose()
        gl.domElement.remove()
      }
      pmrem.dispose()
      return
    }
    if (!firstSceneReady) preload.setSceneProgress(0.86)
    const hdrTex = assets[0] as THREE.DataTexture

    envMap = pmrem.fromEquirectangular(hdrTex).texture
    hdrTex.dispose()
    pmrem.dispose()
    scene.environment = envMap
    scene.environmentIntensity = lite ? 1.1 : 1.05

    if (wide && assets[1] && assets[2]) {
      microNormal = prepDataMap(assets[1], 2.6)
      microRough = prepDataMap(assets[2], 2.6)
    }
  }

  renderer = gl
  host.appendChild(gl.domElement)

  const hemi = new THREE.HemisphereLight(0xe8eef5, 0xb8a990, lite ? 0.34 : 0.28)
  scene.add(hemi)

  const key = new THREE.DirectionalLight(0xf5f8fc, lite ? 0.62 : 0.55)
  key.position.set(3.8, 5.2, 4.5)
  scene.add(key)

  const fill = new THREE.DirectionalLight(0xc5d4e4, lite ? 0.28 : 0.22)
  fill.position.set(-4.5, 1.2, 2.8)
  scene.add(fill)

  if (!lite) {
    const rim = new THREE.DirectionalLight(0xd0dcea, 0.32)
    rim.position.set(-1.8, 2.8, -4.8)
    scene.add(rim)
  }

  const matte = (color: THREE.Color) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.86,
      metalness: 0.02,
      clearcoat: lite ? 0.18 : 0.12,
      clearcoatRoughness: lite ? 0.5 : 0.62,
      sheen: lite ? 0.18 : 0.28,
      sheenRoughness: 0.75,
      sheenColor: new THREE.Color('#d7e4f0'),
      envMapIntensity: lite ? 0.85 : 0.7,
      specularIntensity: 0.5,
      ...(microRough ? { roughnessMap: microRough } : null),
      ...(microNormal
        ? {
            normalMap: microNormal,
            normalScale: new THREE.Vector2(0.28, 0.28),
          }
        : null),
    })

  const frosted = (color: THREE.Color) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: lite ? 0.42 : 0.48,
      metalness: 0,
      transmission: lite ? 0.82 : 0.88,
      thickness: lite ? 1.1 : 1.6,
      ior: 1.42,
      transparent: true,
      opacity: 1,
      attenuationColor: color.clone().lerp(new THREE.Color('#e4eef7'), 0.4),
      attenuationDistance: lite ? 1.2 : 1.6,
      clearcoat: lite ? 0.28 : 0.4,
      clearcoatRoughness: lite ? 0.4 : 0.35,
      envMapIntensity: lite ? 1.05 : 1.15,
      depthWrite: false,
    })

  const glossy = (color: THREE.Color) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: lite ? 0.22 : 0.18,
      metalness: 0.08,
      clearcoat: lite ? 0.45 : 0.55,
      clearcoatRoughness: lite ? 0.22 : 0.16,
      reflectivity: 0.6,
      envMapIntensity: lite ? 1.12 : 1.05,
      specularIntensity: 0.75,
      ior: 1.45,
    })

  const materialPlan: THREE.Material[] = []
  if (lite) {
    // Mobile: swap shiny green + glossy black for frosted glass (clear).
    materialPlan.push(
      matte(COLORS.green.clone()),
      frosted(COLORS.white.clone()),
      matte(COLORS.dark.clone()),
      frosted(COLORS.white.clone()),
      matte(COLORS.white.clone()),
      frosted(COLORS.white.clone()),
    )
  } else {
    for (const color of [COLORS.green, COLORS.dark]) {
      materialPlan.push(matte(color.clone()), glossy(color.clone()))
    }
    materialPlan.push(
      matte(COLORS.white.clone()),
      frosted(COLORS.white.clone()),
      glossy(COLORS.white.clone()),
    )
  }

  sharedGeometry = new THREE.SphereGeometry(1, sphereSegments, sphereSegments)
  balls = []

  for (let i = 0; i < ballCount; i++) {
    const material = materialPlan[i % materialPlan.length].clone()
    const mesh = new THREE.Mesh(sharedGeometry, material)
    mesh.renderOrder = material.transparent ? 2 : 1
    scene.add(mesh)
    balls.push({
      mesh,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      angle: (i / ballCount) * Math.PI * 2,
      radius: 0.35,
      // Spread along the helix so the swarm reads as a twisted strand, not a flat pack.
      phase: (i / ballCount) * Math.PI * 2 * SPIRAL_TURNS,
      pointerInside: false,
    })
  }
  for (const material of materialPlan) material.dispose()

  const anchor = new THREE.Vector3(1.55, 0.05, 0)
  /** Base ring orientation: tilted, receding into depth — then slowly drifts. */
  const ringBaseEuler = new THREE.Euler(-0.62, 0.78, 0.18, 'XYZ')
  const ringQuat = new THREE.Quaternion().setFromEuler(ringBaseEuler)
  const ringEuler = ringBaseEuler.clone()
  let ringRadius = 1.2
  let ringTiltPhase = 0

  const pointer = new THREE.Vector3()
  const pointerPrev = new THREE.Vector3()
  const pointerVel = new THREE.Vector3()
  const pointerNdc = new THREE.Vector2()
  const pointerNdcPrev = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  const hitPlane = new THREE.Plane()
  const planeNormal = new THREE.Vector3()
  let pointerActive = false
  let pointerSampled = false
  let pointerSpeedPx = 0
  let pointerIdleTimer = 0
  const POINTER_IDLE_MS = 280
  const size = { w: 1, h: 1 }
  const tmp = new THREE.Vector3()
  const push = new THREE.Vector3()
  const seat = new THREE.Vector3()
  const seatPull = new THREE.Vector3()
  const local = new THREE.Vector3()
  const camRight = new THREE.Vector3()
  const camUp = new THREE.Vector3()
  let lastBallRadius = 0
  let settleLeft = SETTLE_MS
  /** Once true, orbit anchor/radius ignore host size churn (morph / pin). */
  let orbitLocked = false

  const pointOnOrbit = (angle: number, phase: number, out: THREE.Vector3) => {
    // Torus helix: major angle around the bagel, minor angle winds the tube.
    const tube = ringRadius * SPIRAL_TUBE_RATIO
    const phi = angle * SPIRAL_TURNS + phase
    const rho = ringRadius + tube * Math.cos(phi)
    local.set(
      rho * Math.cos(angle),
      rho * Math.sin(angle),
      tube * Math.sin(phi),
    )
    local.applyQuaternion(ringQuat)
    out.copy(anchor).add(local)
  }

  const seatAll = () => {
    for (const ball of balls) {
      pointOnOrbit(ball.angle, ball.phase, ball.position)
      ball.velocity.set(0, 0, 0)
      ball.pointerInside = false
      ball.mesh.position.copy(ball.position)
    }
    settleLeft = SETTLE_MS
  }

  const worldRadiusForPixels = (diameterPx: number, layoutH: number) => {
    const dist = camera.position.distanceTo(anchor)
    const visibleHeight =
      2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * dist
    return (diameterPx * 0.5 * visibleHeight) / Math.max(layoutH, 1)
  }

  const syncCamera = (opts?: { unlock?: boolean; force?: boolean }) => {
    // While hidden, morph keeps resizing the host — don't update orbit math.
    if (!props.active && !opts?.force) return
    const w = host.clientWidth
    const h = host.clientHeight
    if (w < 2 || h < 2 || !renderer) return

    // Ignore 1px jitter from layout/subpixel — setSize clears the buffer.
    const sizeChanged =
      Math.abs(w - size.w) >= 2 || Math.abs(h - size.h) >= 2 || size.w === 0
    if (sizeChanged) {
      size.w = w
      size.h = h
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      // Fill the freshly cleared buffer before the next composite.
      if (props.active) renderer.render(scene, camera)
    }

    // Canvas may stretch with the morphing frame; orbit stays on the first rest layout
    // so hide→show cycles can't ratchet the cluster upward.
    if (orbitLocked && !opts?.unlock) return

    const column = readLayoutSpan1Px(host)
    const rightNdc = 1 - ((column * 2 + w * 0.16) / w) * 2

    let anchorNdcX = rightNdc
    let anchorNdcY = 0.02
    if (lite) {
      // Stable screen metrics — not the morphing host box.
      const screen = readAppScreenPx()
      const layoutH = Math.max(screen * 0.92, h)
      const topExtraPx = screen * MEDIA_TOP_EXTRA_VH
      const divePx = screen * MEDIA_DIVE_VH
      const slotPx = Math.max(layoutH - topExtraPx - divePx, layoutH * 0.45)
      const cssY = topExtraPx + slotPx * MOBILE_ANCHOR_SURFACE_Y
      anchorNdcX = 0
      anchorNdcY = 1 - (2 * cssY) / layoutH
    }

    camera.getWorldDirection(planeNormal)
    hitPlane.setFromNormalAndCoplanarPoint(
      planeNormal.clone().negate(),
      new THREE.Vector3(0, 0, 0),
    )
    pointerNdc.set(anchorNdcX, anchorNdcY)
    raycaster.setFromCamera(pointerNdc, camera)
    if (!raycaster.ray.intersectPlane(hitPlane, anchor)) {
      anchor.set(lite ? 0 : 1.55, lite ? 0.55 : 0.05, 0)
    }

    camera.lookAt(anchor.x * (lite ? 0.5 : 0.28), anchor.y, 0)

    const layoutH = lite ? Math.max(readAppScreenPx() * 0.92, h) : h
    const radius = worldRadiusForPixels(ballDiameterPx, layoutH)
    ringRadius = radius * ringScale

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i]
      ball.radius = radius
      ball.mesh.scale.setScalar(radius)
    }

    seatAll()
    lastBallRadius = radius
    orbitLocked = true
  }

  const clientToWorld = (clientX: number, clientY: number) => {
    const canvas = renderer?.domElement ?? host
    const rect = canvas.getBoundingClientRect()
    pointerNdcPrev.copy(pointerNdc)
    pointerNdc.set(
      ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
      -((clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
    )

    if (pointerSampled) {
      const dx = ((pointerNdc.x - pointerNdcPrev.x) * rect.width) / 2
      const dy = ((pointerNdc.y - pointerNdcPrev.y) * rect.height) / 2
      pointerSpeedPx = Math.hypot(dx, dy)
    } else {
      pointerSpeedPx = 0
      pointerSampled = true
    }

    raycaster.setFromCamera(pointerNdc, camera)
    camera.getWorldDirection(planeNormal)
    hitPlane.setFromNormalAndCoplanarPoint(planeNormal.clone().negate(), anchor)

    pointerPrev.copy(pointer)
    if (!raycaster.ray.intersectPlane(hitPlane, pointer)) {
      pointer.copy(anchor)
    }
    pointerVel.copy(pointer).sub(pointerPrev)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    if (
      event.clientX < 0
      || event.clientY < 0
      || event.clientX > window.innerWidth
      || event.clientY > window.innerHeight
    ) {
      onPointerLeave()
      return
    }
    const rect = host.getBoundingClientRect()
    // Small pad so edge balls still get hits when the cursor grazes the mask.
    const pad = 48
    if (
      event.clientX < rect.left - pad
      || event.clientX > rect.right + pad
      || event.clientY < rect.top - pad
      || event.clientY > rect.bottom + pad
    ) {
      if (pointerActive) onPointerLeave()
      return
    }
    pointerActive = true
    clientToWorld(event.clientX, event.clientY)
    bumpPointerIdle()
  }
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    const rect = host.getBoundingClientRect()
    if (
      event.clientX < rect.left
      || event.clientX > rect.right
      || event.clientY < rect.top
      || event.clientY > rect.bottom
    ) {
      return
    }
    pointerActive = true
    pointerSampled = false
    pointerSpeedPx = 0
    clientToWorld(event.clientX, event.clientY)
    bumpPointerIdle()
  }
  const onPointerLeave = () => {
    pointerActive = false
    pointerSampled = false
    pointerVel.set(0, 0, 0)
    pointerSpeedPx = 0
    if (pointerIdleTimer) {
      window.clearTimeout(pointerIdleTimer)
      pointerIdleTimer = 0
    }
    for (const ball of balls) ball.pointerInside = false
  }
  const bumpPointerIdle = () => {
    if (pointerIdleTimer) window.clearTimeout(pointerIdleTimer)
    pointerIdleTimer = window.setTimeout(() => {
      pointerIdleTimer = 0
      onPointerLeave()
    }, POINTER_IDLE_MS)
  }

  if (interactive) {
    // Window-level: swarm sits under PE-none stacks; host-only listeners miss hits.
    const onWindowBlur = () => onPointerLeave()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') onPointerLeave()
    }
    const onDocumentMouseOut = (e: MouseEvent) => {
      const to = e.relatedTarget as Node | null
      if (!to || !document.documentElement.contains(to)) onPointerLeave()
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('blur', onWindowBlur)
    document.addEventListener('visibilitychange', onVisibilityChange)
    document.addEventListener('mouseout', onDocumentMouseOut, { passive: true })
    removePointerListeners = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('blur', onWindowBlur)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      document.removeEventListener('mouseout', onDocumentMouseOut)
      if (pointerIdleTimer) {
        window.clearTimeout(pointerIdleTimer)
        pointerIdleTimer = 0
      }
    }
  }

  syncCamera({ force: true })
  forceResize = () => {
    // Match current host; do not wipe size.w (setSize on a forced 0→w clear-flashes).
    syncCamera({ force: true })
  }
  resetSeats = () => {
    seatAll()
    if (balls[0]) lastBallRadius = balls[0].radius
  }
  lockOrbitLayout = () => {
    orbitLocked = true
  }
  unlockOrbitLayout = () => {
    orbitLocked = false
    size.w = 0
    size.h = 0
    syncCamera({ unlock: true, force: true })
  }
  resizeObserver = new ResizeObserver(() => {
    // Coalesce morph/layout chatter — each setSize was a potential flash.
    if (resizePaintTimer) return
    resizePaintTimer = window.setTimeout(() => {
      resizePaintTimer = 0
      syncCamera()
    }, 32)
  })
  resizeObserver.observe(host)

  // No scroll stopLoop — that froze/restarted the GL layer every finger move (flicker).
  // Scene lifetime is owned by sceneLive / opacity fade only.
  let scrollPaused = false

  const tick = (now: number) => {
    if (!loopRunning) return
    animationId = requestAnimationFrame(tick)
    if (!renderer) return

    if (lite && scrollPaused) {
      lastFrame = now
      return
    }

    const dt = Math.min(32, now - lastFrame)
    lastFrame = now
    const step = reduced ? 0 : dt

    if (!reduced) {
      ringTiltPhase += RING_TILT_SPEED * step
      ringEuler.set(
        ringBaseEuler.x + Math.sin(ringTiltPhase) * 0.22,
        ringBaseEuler.y + ringTiltPhase * 0.35,
        ringBaseEuler.z + Math.cos(ringTiltPhase * 0.7) * 0.12,
        'XYZ',
      )
      ringQuat.setFromEuler(ringEuler)
    }

    // Mobile: baked helix seats only — no physics / pointer / separation.
    if (lite) {
      for (const ball of balls) {
        if (!reduced) ball.angle += ORBIT_SPEED * step
        pointOnOrbit(ball.angle, ball.phase, ball.position)
        ball.mesh.position.copy(ball.position)
      }
      renderer.render(scene, camera)
      return
    }

    const softBound = balls[0].radius * SOFT_BOUND_SCALE
    const settling = settleLeft > 0
    if (settling) settleLeft = Math.max(0, settleLeft - dt)
    const cursorMoving =
      !settling && pointerActive && pointerSpeedPx >= CURSOR_SPEED_MIN_PX

    const halfW = size.w * 0.5
    const halfH = size.h * 0.5
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i]

      if (!reduced) ball.angle += ORBIT_SPEED * step
      pointOnOrbit(ball.angle, ball.phase, seat)

      // Boot / post-resize: stick to seats until layout + radius are stable.
      if (settling) {
        ball.position.copy(seat)
        ball.velocity.set(0, 0, 0)
        ball.pointerInside = false
        ball.mesh.position.copy(ball.position)
        continue
      }

      if (!reduced) {
        const chaos = CHAOS_IDLE * step
        ball.velocity.x += Math.sin(now * 0.00037 + ball.phase) * chaos
        ball.velocity.y += Math.cos(now * 0.00041 + ball.phase * 1.3) * chaos
        ball.velocity.z += Math.sin(now * 0.00029 + ball.phase * 0.7) * chaos

        if (Math.random() < CHAOS_POP_CHANCE * (step / 16.67)) {
          push.set(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5,
          )
          if (push.lengthSq() > 1e-8) {
            push
              .normalize()
              .multiplyScalar(CHAOS_POP_FORCE * (0.6 + Math.random() * 0.8))
            ball.velocity.add(push)
          }
        }
      }

      seatPull.copy(seat).sub(ball.position)
      const distToSeat = seatPull.length()
      const orbitLeash = ball.radius * ORBIT_LEASH
      let returnForce = RETURN
      if (distToSeat > RETURN_SOFT_DIST * ball.radius) {
        returnForce *= 0.28
      }
      // Spring leash stays full-strength even while hover softens base return.
      let leashSpring = 0
      if (distToSeat > orbitLeash) {
        const stretch = (distToSeat - orbitLeash) / orbitLeash
        leashSpring = ORBIT_LEASH_SPRING * stretch
      }

      // Screen-space hit — enter knock + continuous hold while the cursor is near.
      let near = false
      tmp.copy(ball.position).project(camera)
      if (pointerActive && tmp.z < 1 && tmp.z > -1) {
        const dx = (tmp.x - pointerNdc.x) * halfW
        const dy = (tmp.y - pointerNdc.y) * halfH
        const pixelDist = Math.hypot(dx, dy)
        const ballCamDist = camera.position.distanceTo(ball.position)
        const screenRadius =
          ((ball.radius / Math.max(ballCamDist, 0.001)) / tanHalfFov) *
            halfH *
            CURSOR_HIT_SCALE +
          CURSOR_HIT_PAD_PX
        near = pixelDist < screenRadius

        if (near) {
          const falloff = 1 - pixelDist / Math.max(screenRadius, 1)
          const entering = cursorMoving && !ball.pointerInside
          const moving = cursorMoving || pointerSpeedPx >= CURSOR_SPEED_MIN_PX
          returnForce *= entering ? 0.02 : moving ? 0.08 : 0.22

          const speedMul = Math.min(
            0.75 + Math.max(pointerSpeedPx, CURSOR_SPEED_MIN_PX) / 6,
            2.2,
          )

          let strength =
            CURSOR_FORCE * (0.4 + 0.6 * falloff) * speedMul
          if (entering) strength *= CURSOR_IMPULSE
          else if (moving) strength *= CURSOR_HOLD
          else strength *= CURSOR_IDLE_HOLD

          if (strength > 1e-8) {
            if (pointerVel.lengthSq() > 1e-8) {
              push.copy(pointerVel).normalize().multiplyScalar(strength)
            } else {
              const awayX = tmp.x - pointerNdc.x
              const awayY = tmp.y - pointerNdc.y
              const awayLen = Math.hypot(awayX, awayY) || 1
              camRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
              camUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
              push
                .copy(camRight)
                .multiplyScalar((awayX / awayLen) * strength)
                .addScaledVector(camUp, (awayY / awayLen) * strength)
              if (push.lengthSq() < 1e-10) {
                push.copy(ball.position).sub(pointer).setLength(strength)
              }
            }
            ball.velocity.add(push)
          }
        }
      }
      ball.pointerInside = near

      ball.velocity.addScaledVector(seatPull, (returnForce + leashSpring) * step)

      for (let j = i + 1; j < balls.length; j++) {
        const other = balls[j]
        tmp.copy(ball.position).sub(other.position)
        const dist = tmp.length()
        const minDist = ball.radius + other.radius + SEPARATION_PAD
        if (dist > 0.0001 && dist < minDist) {
          const overlap = (minDist - dist) / minDist
          push
            .copy(tmp)
            .normalize()
            .multiplyScalar(overlap * SEPARATION_FORCE * step)
          ball.velocity.add(push)
          other.velocity.sub(push)
        }
      }

      ball.velocity.multiplyScalar(DAMPING)
      const speed = ball.velocity.length()
      if (speed > MAX_SPEED) ball.velocity.multiplyScalar(MAX_SPEED / speed)
      ball.position.addScaledVector(ball.velocity, 1)

      // Absolute safety around ring center — never let a ball reach the scene edge.
      tmp.copy(ball.position).sub(anchor)
      const fromAnchor = tmp.length()
      if (fromAnchor > softBound) {
        tmp.multiplyScalar(softBound / fromAnchor)
        ball.position.copy(anchor).add(tmp)
        ball.velocity.multiplyScalar(0.8)
      }

      ball.mesh.position.copy(ball.position)
    }

    // Decay swipe speed so a stopped cursor ends the stroke
    pointerSpeedPx *= 0.88
    pointerVel.multiplyScalar(0.88)

    renderer.render(scene, camera)
  }

  runFrame = tick
  if (gen !== bootGen) return
  if (props.active) startLoop()
  else stopLoop()

  if (!firstSceneReady) {
    preload.setSceneProgress(0.96)
    renderer.render(scene, camera)
    requestAnimationFrame(() => {
      firstSceneReady = true
      preload.markSceneReady()
    })
  } else {
    renderer.render(scene, camera)
  }
}
</script>

<template>
  <div
    ref="canvasHost"
    class="hero-swarm size-full touch-pan-y"
    aria-hidden="true"
  />
</template>

<style scoped>
.hero-swarm {
  cursor: grab;
  /* Belt-and-suspenders: never let the GL surface own vertical gestures. */
  touch-action: pan-y;
}

/* Under the brand preloader: keep the GL layer out of the compositor.
   Prefer opacity — a child with visibility:visible can override a hidden parent. */
.hero-swarm--cold {
  opacity: 0;
  pointer-events: none;
}

.hero-swarm:active {
  cursor: grabbing;
}

.hero-swarm :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
