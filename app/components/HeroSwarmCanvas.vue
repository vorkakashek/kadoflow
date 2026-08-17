<script setup lang="ts">
/**
 * Hero swarm — tilted torus spiral (ring + helix twist), slow plane drift.
 * ≥1200: cursor knocks balls; they return to moving seats.
 * <1200: baked orbit + motion physics (angular velocity sweeps / collide / home).
 */
import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import {
  isAppleTouchDevice,
  isCoarsePointer,
  isMobileChromeHeightOnlyResize,
  isNarrowViewport,
} from '~/utils/mobileViewport'
import {
  swarmHapticArm,
  swarmHapticContact,
  swarmHapticPairKey,
  swarmHapticPrune,
  swarmHapticReset,
} from '~/utils/swarmHaptics'
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
/** Mobile: orbit + tilt physics (no pointer). */
const BALL_COUNT_MOBILE = 12
/** Mobile on-screen diameter vs fluid curve. */
const MOBILE_BALL_DIAMETER_SCALE = 1.2
/**
 * iOS gyro on — attach only after first paint, never with capture-phase
 * unlock listeners during boot (that path blanked the hero on Safari).
 */
const GYRO_ENABLE_IOS = true
/**
 * Lite keeps helix depth so balls sit on different planes
 * (1 = full tube, 0 = flat screen plane).
 */
const LITE_DEPTH_KEEP = 1
/** Cap |depth| as a fraction of ringRadius — visible layering, not a flat pack. */
const LITE_DEPTH_MAX_RATIO = 1.5
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
/** Lite intro: place balls this far out (× ringRadius), then spring home. */
const LITE_SCATTER_RATIO = 2.25
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

const emit = defineEmits<{
  lit: []
}>()

const canvasHost = ref<HTMLElement | null>(null)
/** iOS: show until DeviceOrientation permission is granted. */
const motionUnlockVisible = ref(false)
let gyroUnlockFn: (() => void) | null = null

function onMotionUnlockTap() {
  gyroUnlockFn?.()
}

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
      if (runFrame && renderer) runFrame(performance.now())
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
   * Mobile / coarse / iOS: budget for fill-rate — Standard mats, DPR 1, no MSAA,
   * baked helix seats (no physics). Look comes from HDRI + lights, not transmission.
   */
  const lite = isMobile || isIOS || isCoarse
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
  const sphereSegments = wide && !isCoarse ? 64 : lite ? 20 : 32
  const pixelRatioCap = wide && !isCoarse ? 2 : lite ? 1 : 1.25
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
    // Desktop: keep last frame if rAF throttles (other monitor). Mobile: the
    // extra copy-back is a known Android Chrome 90Hz→60Hz lock, and Page Canvas
    // no longer snapshots this buffer.
    preserveDrawingBuffer: !lite,
  })
  gl.setClearColor(0x000000, 0)
  gl.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap))
  gl.outputColorSpace = THREE.SRGBColorSpace
  gl.toneMapping = THREE.ACESFilmicToneMapping
  gl.toneMappingExposure = 0.92
  /* Transparent frosted balls need depth sort — lite uses opaque Standard only. */
  gl.sortObjects = !lite
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

  // HDRI — start immediately; don't block scene-ready / preloader exit on it.
  const pmrem = new THREE.PMREMGenerator(gl)
  pmrem.compileEquirectangularShader()

  const manager = new THREE.LoadingManager()
  manager.onProgress = (_url, loaded, total) => {
    if (firstSceneReady) return
    const ratio = total > 0 ? loaded / total : 0
    preload.setSceneProgress(0.08 + ratio * 0.55)
  }

  const texLoader = new THREE.TextureLoader(manager)
  // Same studio HDRI on phone + desktop (was studioWarm on narrow).
  const hdrUrl = HDRI_PRESETS[ACTIVE_HDRI]
  const assetLoads: Promise<THREE.DataTexture | THREE.Texture>[] = [
    new HDRLoader(manager).loadAsync(hdrUrl),
  ]
  if (wide) {
    assetLoads.push(
      texLoader.loadAsync('/textures/micro/plaster_nor.jpg'),
      texLoader.loadAsync('/textures/micro/plaster_rough.jpg'),
    )
  }
  const assetsPromise = Promise.all(assetLoads)

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
    lite
      ? new THREE.MeshStandardMaterial({
          color,
          roughness: 0.86,
          metalness: 0.04,
          envMapIntensity: 0.9,
        })
      : new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.86,
          metalness: 0.02,
          clearcoat: 0.12,
          clearcoatRoughness: 0.62,
          sheen: 0.28,
          sheenRoughness: 0.75,
          sheenColor: new THREE.Color('#d7e4f0'),
          envMapIntensity: 0.7,
          specularIntensity: 0.5,
        })

  /** Desktop: real glass. Lite: bright Standard stand-in — no transmission fill cost. */
  const frosted = (color: THREE.Color) =>
    lite
      ? new THREE.MeshStandardMaterial({
          color: color.clone().lerp(new THREE.Color('#eef4fa'), 0.35),
          roughness: 0.28,
          metalness: 0.06,
          envMapIntensity: 1.25,
        })
      : new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.48,
          metalness: 0,
          transmission: 0.88,
          thickness: 1.6,
          ior: 1.42,
          transparent: true,
          opacity: 1,
          attenuationColor: color.clone().lerp(new THREE.Color('#e4eef7'), 0.4),
          attenuationDistance: 1.6,
          clearcoat: 0.4,
          clearcoatRoughness: 0.35,
          envMapIntensity: 1.15,
          depthWrite: false,
        })

  const glossy = (color: THREE.Color) =>
    lite
      ? new THREE.MeshStandardMaterial({
          color,
          roughness: 0.22,
          metalness: 0.1,
          envMapIntensity: 1.15,
        })
      : new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.18,
          metalness: 0.08,
          clearcoat: 0.55,
          clearcoatRoughness: 0.16,
          reflectivity: 0.6,
          envMapIntensity: 1.05,
          specularIntensity: 0.75,
          ior: 1.45,
        })

  const materialPlan: THREE.Material[] = []
  if (lite) {
    // Mobile: brand green + white only (no ink/black). Standard stand-ins, no transmission.
    materialPlan.push(
      matte(COLORS.green.clone()),
      frosted(COLORS.white.clone()),
      glossy(COLORS.green.clone()),
      matte(COLORS.green.clone()),
      frosted(COLORS.green.clone()),
      matte(COLORS.white.clone()),
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

  let litEmitted = false
  const emitLit = () => {
    if (litEmitted || gen !== bootGen) return
    litEmitted = true
    emit('lit')
  }

  const applyEnvAssets = async () => {
    let assets: (THREE.DataTexture | THREE.Texture)[]
    try {
      assets = await assetsPromise
    } catch {
      pmrem.dispose()
      emitLit()
      return
    }
    if (gen !== bootGen || renderer !== gl) {
      pmrem.dispose()
      for (const a of assets) a.dispose()
      return
    }
    if (!firstSceneReady) preload.setSceneProgress(0.9)
    const hdrTex = assets[0] as THREE.DataTexture

    envMap = pmrem.fromEquirectangular(hdrTex).texture
    hdrTex.dispose()
    pmrem.dispose()
    scene.environment = envMap
    scene.environmentIntensity = lite ? 1.1 : 1.05

    if (wide && assets[1] && assets[2]) {
      microNormal = prepDataMap(assets[1], 2.6)
      microRough = prepDataMap(assets[2], 2.6)
      for (const ball of balls) {
        const mat = ball.mesh.material as THREE.MeshPhysicalMaterial
        if (typeof mat.transmission === 'number' && mat.transmission > 0) continue
        if (microRough) mat.roughnessMap = microRough
        if (microNormal) {
          mat.normalMap = microNormal
          mat.normalScale = new THREE.Vector2(0.28, 0.28)
        }
        mat.needsUpdate = true
      }
    }

    syncCamera({ force: true })
    gl.render(scene, camera)
    emitLit()
  }
  void applyEnvAssets()
  // iOS: HDRI can hang on flaky nets — never leave the stone cover forever.
  window.setTimeout(() => emitLit(), lite ? 1800 : 6000)

  const anchor = new THREE.Vector3(1.55, 0.05, 0)
  /** Base ring orientation: tilted, receding into depth — then slowly drifts. */
  const ringBaseEuler = new THREE.Euler(-0.62, 0.78, 0.18, 'XYZ')
  const ringQuat = new THREE.Quaternion().setFromEuler(ringBaseEuler)
  const ringEuler = ringBaseEuler.clone()
  let ringRadius = 1.2
  let ringTiltPhase = 0

  /**
   * Device motion (lite):
   * — Tip (any edge lower): balls slide toward the lowered side (gravity / beta·gamma).
   * — Spin in the phone’s plane: the pile twists a little, then springs home.
   */
  let gyroYaw = 0
  let gyroPitch = 0
  let gyroRoll = 0
  let gyroYawT = 0
  let gyroPitchT = 0
  let gyroRollT = 0
  let gyroArmed = false
  let prevAlpha: number | null = null
  let gyroFromRate = false
  let gyroRateStamp = 0
  let tipFromGrav = false
  let tipGravStamp = 0
  /** Tip → balls toward lowered edge. */
  const GYRO_DEPTH_FORCE = 0.00072
  /** In-plane spin → tangential shove on the pile. */
  const GYRO_YAW_FORCE = 0.00088
  /** Brief orbit kick while spinning (rad/ms at full signal). */
  const GYRO_SPIN_ORBIT = 0.0042
  const GYRO_SMOOTH = 0.32
  const GYRO_RATE_SCALE = 100
  const GYRO_DELTA_SCALE = 5
  const GYRO_TARGET_DECAY = 0.82
  /** Orient fallback: degrees of tip → full force (flat-relative). */
  const GYRO_TIP_ANGLE = 22
  const GYRO_SWEEP_FRONT = 0.32
  const GYRO_SWEEP_BACK = 1
  const lookTarget = new THREE.Vector3()
  const LITE_WALL_X = 2.15
  const LITE_WALL_Y = 2.35
  const LITE_WALL_BOUNCE = 0.62
  const LITE_RETURN = 0.000042
  const LITE_DAMPING = 0.972
  const LITE_SEP_FORCE = 0.018
  const LITE_MAX_SPEED = 0.22
  const LITE_LEASH = 2.2
  let removeGyroListeners: (() => void) | null = null
  let gyroAttachScheduled = false

  /** Wire unlock ASAP so the first tap can open the iOS permission sheet. */
  const attachGyroSensors = () => {
    if (!lite || reduced || typeof window === 'undefined') return
    if (isIOS && !GYRO_ENABLE_IOS) return
    if (removeGyroListeners) return

    try {
      const unwrapDelta = (d: number) => {
        if (d > 180) return d - 360
        if (d < -180) return d + 360
        return d
      }

      const onOrient = (e: DeviceOrientationEvent) => {
        if (e.beta == null || e.gamma == null) return
        gyroArmed = true
        motionUnlockVisible.value = false

        const gravFresh =
          tipFromGrav && performance.now() - tipGravStamp < 250
        if (!gravFresh) {
          gyroRollT = THREE.MathUtils.clamp(e.gamma / GYRO_TIP_ANGLE, -1, 1)
          gyroPitchT = THREE.MathUtils.clamp(-e.beta / GYRO_TIP_ANGLE, -1, 1)
        }

        if (e.alpha != null && prevAlpha != null) {
          const ratesFresh =
            gyroFromRate && performance.now() - gyroRateStamp < 200
          if (!ratesFresh) {
            const dA = unwrapDelta(e.alpha - prevAlpha)
            if (Math.abs(dA) > 0.35) {
              gyroYawT = THREE.MathUtils.clamp(dA / GYRO_DELTA_SCALE, -1, 1)
            }
          }
        }
        prevAlpha = e.alpha
      }

      const onMotion = (e: DeviceMotionEvent) => {
        gyroArmed = true
        motionUnlockVisible.value = false

        const g = e.accelerationIncludingGravity
        if (g && g.x != null && g.y != null) {
          const gx = g.x / 9.81
          const gy = g.y / 9.81
          if (Math.hypot(gx, gy) < 0.08) {
            gyroRollT = 0
            gyroPitchT = 0
          } else {
            gyroRollT = THREE.MathUtils.clamp(gx, -1, 1)
            gyroPitchT = THREE.MathUtils.clamp(gy, -1, 1)
          }
          tipFromGrav = true
          tipGravStamp = performance.now()
        }

        const r = e.rotationRate
        if (r && r.alpha != null) {
          gyroFromRate = true
          gyroRateStamp = performance.now()
          gyroYawT = THREE.MathUtils.clamp(r.alpha / GYRO_RATE_SCALE, -1, 1)
        }
      }

      const startListening = () => {
        window.addEventListener('deviceorientation', onOrient, { passive: true })
        window.addEventListener('devicemotion', onMotion, { passive: true })
        motionUnlockVisible.value = false
        gyroUnlockFn = null
        removeGyroListeners = () => {
          window.removeEventListener('deviceorientation', onOrient)
          window.removeEventListener('devicemotion', onMotion)
          removeGyroListeners = null
        }
      }

      const DOE = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
      }
      const DME = DeviceMotionEvent as typeof DeviceMotionEvent & {
        requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
      }

      const needsIosPerm =
        isIOS && typeof DOE.requestPermission === 'function'

      if (needsIosPerm) {
        // iOS: sensors need a secure context + a user gesture calling requestPermission.
        if (!window.isSecureContext) {
          motionUnlockVisible.value = false
          return
        }

        let unlocking = false
        const detachUnlock = () => {
          document.removeEventListener('pointerdown', unlock)
          document.removeEventListener('touchend', unlock)
          gyroUnlockFn = null
        }

        const unlock = () => {
          if (unlocking || gen !== bootGen) return
          unlocking = true

          const tasks: Promise<string>[] = []
          try {
            tasks.push(DOE.requestPermission!())
          } catch {
            /* ignore */
          }
          if (typeof DME.requestPermission === 'function') {
            try {
              tasks.push(DME.requestPermission!())
            } catch {
              /* ignore */
            }
          }

          void Promise.allSettled(tasks).then((results) => {
            if (gen !== bootGen) return
            const ok = results.some(
              (r) => r.status === 'fulfilled' && r.value === 'granted',
            )
            if (ok) {
              detachUnlock()
              startListening()
            } else {
              // Keep button + listeners — denied / dismissed can retry.
              unlocking = false
            }
          })
        }

        // Bubble only (capture-during-boot blanked the hero on Safari).
        document.addEventListener('pointerdown', unlock, { passive: true })
        document.addEventListener('touchend', unlock, { passive: true })
        gyroUnlockFn = unlock
        motionUnlockVisible.value = true
        removeGyroListeners = () => {
          detachUnlock()
          motionUnlockVisible.value = false
          removeGyroListeners = null
        }
      } else {
        startListening()
      }
    } catch {
      removeGyroListeners?.()
      removeGyroListeners = null
      motionUnlockVisible.value = false
    }
  }

  const scheduleGyroAttach = () => {
    if (gyroAttachScheduled) return
    if (!lite || reduced) return
    if (isIOS && !GYRO_ENABLE_IOS) return
    gyroAttachScheduled = true
    // Immediate — delayed wire missed the first tap (no permission sheet).
    attachGyroSensors()
  }

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
  const camForward = new THREE.Vector3()
  let lastBallRadius = 0
  let settleLeft = SETTLE_MS
  /** Once true, orbit anchor/radius ignore host size churn (morph / pin). */
  let orbitLocked = false
  /** Pairs overlapping this frame — for haptic edge triggers. */
  const hapticAlive = new Set<number>()

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
    if (lite) {
      // Scatter outside the ring, then let springs pull home — avoids the
      // “stuck overlapping → explode” pop when settle ends.
      camera.updateMatrixWorld(true)
      camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
      camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize()
      camForward
        .setFromMatrixColumn(camera.matrixWorld, 2)
        .normalize()
        .negate()
      const n = balls.length
      const scatterR = Math.max(ringRadius * LITE_SCATTER_RATIO, balls[0]?.radius * 6 || 1)
      const depthMax = ringRadius * LITE_DEPTH_MAX_RATIO
      for (let i = 0; i < n; i++) {
        const ball = balls[i]
        pointOnOrbit(ball.angle, ball.phase, seat)
        push.copy(seat).sub(anchor)
        const sz = THREE.MathUtils.clamp(
          push.dot(camForward) * LITE_DEPTH_KEEP,
          -depthMax,
          depthMax,
        )
        const a = (i / n) * Math.PI * 2 + 0.4
        const r = scatterR * (0.9 + (i % 4) * 0.05)
        ball.position
          .copy(anchor)
          .addScaledVector(camRight, Math.cos(a) * r)
          .addScaledVector(camUp, Math.sin(a) * r)
          .addScaledVector(camForward, sz)
        ball.velocity.set(0, 0, 0)
        ball.pointerInside = false
        ball.mesh.position.copy(ball.position)
      }
      // Gyro muted during gather; physics runs so they fly inward.
      settleLeft = SETTLE_MS
      swarmHapticReset()
      return
    }

    for (const ball of balls) {
      pointOnOrbit(ball.angle, ball.phase, ball.position)
      ball.velocity.set(0, 0, 0)
      ball.pointerInside = false
      ball.mesh.position.copy(ball.position)
    }
    settleLeft = SETTLE_MS
    swarmHapticReset()
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
    lookTarget.set(anchor.x * (lite ? 0.5 : 0.28), anchor.y, 0)

    const layoutH = lite ? Math.max(readAppScreenPx() * 0.92, h) : h
    const diameterPx = lite
      ? ballDiameterPx * MOBILE_BALL_DIAMETER_SCALE
      : ballDiameterPx
    const radius = worldRadiusForPixels(diameterPx, layoutH)
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
    // Chrome: vibrate() needs sticky user activation — arm on any press.
    swarmHapticArm()
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
  } else if (lite && !isIOS) {
    // Mobile Android: no cursor knocks, but Chrome still needs a gesture to arm vibrate.
    const arm = () => swarmHapticArm()
    document.addEventListener('pointerdown', arm, { passive: true })
    document.addEventListener('touchstart', arm, { passive: true })
    removePointerListeners = () => {
      document.removeEventListener('pointerdown', arm)
      document.removeEventListener('touchstart', arm)
    }
  }

  // Loop while the tab is visible — including other window / other monitor.
  // Pause only when the tab itself is hidden (throttled rAF would flash).
  const onPageVisibility = () => {
    if (document.visibilityState === 'hidden') stopLoop()
    else if (props.active) startLoop()
  }
  document.addEventListener('visibilitychange', onPageVisibility)
  const prevRemovePointer = removePointerListeners
  removePointerListeners = () => {
    prevRemovePointer?.()
    removeGyroListeners?.()
    document.removeEventListener('visibilitychange', onPageVisibility)
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

  const tick = (now: number) => {
    if (!loopRunning) return
    animationId = requestAnimationFrame(tick)
    if (!renderer) return

    const dt = Math.min(32, now - lastFrame)
    lastFrame = now
    const step = reduced ? 0 : dt

    if (!reduced) {
      if (lite) {
        if (!gyroFromRate || performance.now() - gyroRateStamp > 180) {
          gyroFromRate = false
          // Spin fades when the phone stops turning in-plane.
          gyroYawT *= GYRO_TARGET_DECAY
          if (Math.abs(gyroYawT) < 0.02) gyroYawT = 0
        }
        // Tip holds from gravity/orient while an edge is lowered — no decay here.
        if (
          tipFromGrav &&
          performance.now() - tipGravStamp > 280
        ) {
          tipFromGrav = false
        }
        gyroYaw += (gyroYawT - gyroYaw) * GYRO_SMOOTH
        gyroPitch += (gyroPitchT - gyroPitch) * GYRO_SMOOTH
        gyroRoll += (gyroRollT - gyroRoll) * GYRO_SMOOTH
      }
      ringTiltPhase += RING_TILT_SPEED * step
      ringEuler.set(
        ringBaseEuler.x + Math.sin(ringTiltPhase) * 0.22,
        ringBaseEuler.y + ringTiltPhase * 0.35,
        ringBaseEuler.z + Math.cos(ringTiltPhase * 0.7) * 0.12,
        'XYZ',
      )
      ringQuat.setFromEuler(ringEuler)
    }

    // Mobile: orbit seats + planar motion → collide → walls → spring home.
    if (lite) {
      const settling = settleLeft > 0
      if (settling) settleLeft = Math.max(0, settleLeft - dt)
      hapticAlive.clear()

      if (!reduced) {
        camera.up.set(0, 1, 0)
        camera.lookAt(lookTarget)
        camera.updateMatrixWorld(true)
        camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
        camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize()
        camForward.setFromMatrixColumn(camera.matrixWorld, 2).normalize().negate()
      }
      const wallX = ringRadius * LITE_WALL_X
      const wallY = ringRadius * LITE_WALL_Y
      const depthMax = ringRadius * LITE_DEPTH_MAX_RATIO
      const sweepSpan = Math.max(ringRadius * 1.35, balls[0].radius * 5)

      // Tip → toward lowered edge. Spin → twist the pile (then springs home).
      const depthRight = gyroRoll
      const depthUp = gyroPitch
      const twist = gyroYaw

      const sweepW = (along: number, force: number) => {
        if (Math.abs(force) < 0.01) return 1
        const n = THREE.MathUtils.clamp(along / sweepSpan, -1, 1)
        const behind = force > 0 ? -n : n
        const t = behind * 0.5 + 0.5
        return GYRO_SWEEP_FRONT + (GYRO_SWEEP_BACK - GYRO_SWEEP_FRONT) * t
      }

      /** Screen XY from helix + depth so balls aren’t coplanar. */
      const flattenSeat = () => {
        push.copy(seat).sub(anchor)
        const sx = push.dot(camRight)
        const sy = push.dot(camUp)
        const sz = THREE.MathUtils.clamp(
          push.dot(camForward) * LITE_DEPTH_KEEP,
          -depthMax,
          depthMax,
        )
        seat
          .copy(anchor)
          .addScaledVector(camRight, sx)
          .addScaledVector(camUp, sy)
          .addScaledVector(camForward, sz)
        return sz
      }

      for (let i = 0; i < balls.length; i++) {
        const ball = balls[i]
        if (!reduced) {
          ball.angle += ORBIT_SPEED * step
          if (!settling && gyroArmed && Math.abs(twist) > 0.01) {
            ball.angle += twist * GYRO_SPIN_ORBIT * step
          }
        }
        pointOnOrbit(ball.angle, ball.phase, seat)
        const seatDepth = flattenSeat()

        // Reduced-motion: stick to seats. Intro settle: physics gathers from scatter.
        if (reduced) {
          ball.position.copy(seat)
          ball.velocity.set(0, 0, 0)
          ball.mesh.position.copy(ball.position)
          continue
        }

        // Motion stays in the screen plane; depth locked to the seat layer.
        {
          const rel = push.copy(ball.position).sub(anchor)
          const px = rel.dot(camRight)
          const py = rel.dot(camUp)
          ball.position
            .copy(anchor)
            .addScaledVector(camRight, px)
            .addScaledVector(camUp, py)
            .addScaledVector(camForward, seatDepth)
          const vx = ball.velocity.dot(camRight)
          const vy = ball.velocity.dot(camUp)
          ball.velocity
            .copy(camRight)
            .multiplyScalar(vx)
            .addScaledVector(camUp, vy)
        }

        if (gyroArmed && !settling) {
          const rel = push.copy(ball.position).sub(anchor)
          const alongR = rel.dot(camRight)
          const alongU = rel.dot(camUp)

          if (Math.abs(depthRight) > 0.01 || Math.abs(depthUp) > 0.01) {
            const wR = sweepW(alongR, depthRight)
            const wU = sweepW(alongU, depthUp)
            ball.velocity.addScaledVector(
              camRight,
              depthRight * wR * GYRO_DEPTH_FORCE * step,
            )
            ball.velocity.addScaledVector(
              camUp,
              depthUp * wU * GYRO_DEPTH_FORCE * step,
            )
          }

          if (Math.abs(twist) > 0.01) {
            const rad = Math.hypot(alongR, alongU)
            if (rad > 1e-4) {
              const tR = -alongU / rad
              const tU = alongR / rad
              const radial = THREE.MathUtils.clamp(rad / sweepSpan, 0.25, 1.15)
              ball.velocity.addScaledVector(
                camRight,
                twist * tR * radial * GYRO_YAW_FORCE * step,
              )
              ball.velocity.addScaledVector(
                camUp,
                twist * tU * radial * GYRO_YAW_FORCE * step,
              )
            }
          }
        }

        seatPull.copy(seat).sub(ball.position)
        {
          const sx = seatPull.dot(camRight)
          const sy = seatPull.dot(camUp)
          seatPull.copy(camRight).multiplyScalar(sx).addScaledVector(camUp, sy)
        }
        const distToSeat = seatPull.length()
        let returnForce = LITE_RETURN * (settling ? 2.6 : 1)
        if (distToSeat > RETURN_SOFT_DIST * ball.radius) returnForce *= 0.32
        let leashSpring = 0
        const orbitLeash = ball.radius * LITE_LEASH
        if (distToSeat > orbitLeash) {
          leashSpring =
            ORBIT_LEASH_SPRING * ((distToSeat - orbitLeash) / orbitLeash) * 1.35
        }
        ball.velocity.addScaledVector(seatPull, (returnForce + leashSpring) * step)

        for (let j = i + 1; j < balls.length; j++) {
          const other = balls[j]
          tmp.copy(ball.position).sub(other.position)
          const sx = tmp.dot(camRight)
          const sy = tmp.dot(camUp)
          tmp.copy(camRight).multiplyScalar(sx).addScaledVector(camUp, sy)
          const dist = tmp.length()
          const minDist = ball.radius + other.radius + SEPARATION_PAD
          if (dist > 0.0001 && dist < minDist) {
            const overlap = (minDist - dist) / minDist
            push
              .copy(tmp)
              .normalize()
              .multiplyScalar(overlap * LITE_SEP_FORCE * step)
            ball.velocity.add(push)
            other.velocity.sub(push)
            if (!settling && !reduced) {
              const key = swarmHapticPairKey(i, j)
              hapticAlive.add(key)
              swarmHapticContact(key, overlap)
            }
          }
        }

        ball.velocity.multiplyScalar(LITE_DAMPING)
        {
          const vx = ball.velocity.dot(camRight)
          const vy = ball.velocity.dot(camUp)
          const speed = Math.hypot(vx, vy)
          let nx = vx
          let ny = vy
          if (speed > LITE_MAX_SPEED) {
            const s = LITE_MAX_SPEED / speed
            nx *= s
            ny *= s
          }
          ball.velocity
            .copy(camRight)
            .multiplyScalar(nx)
            .addScaledVector(camUp, ny)
        }
        ball.position.addScaledVector(ball.velocity, 1)

        {
          const rel = push.copy(ball.position).sub(anchor)
          let px = rel.dot(camRight)
          let py = rel.dot(camUp)
          let vx = ball.velocity.dot(camRight)
          let vy = ball.velocity.dot(camUp)
          const maxX = Math.max(0.2, wallX - ball.radius)
          const maxY = Math.max(0.2, wallY - ball.radius)
          if (px > maxX) {
            px = maxX
            if (vx > 0) vx *= -LITE_WALL_BOUNCE
          } else if (px < -maxX) {
            px = -maxX
            if (vx < 0) vx *= -LITE_WALL_BOUNCE
          }
          if (py > maxY) {
            py = maxY
            if (vy > 0) vy *= -LITE_WALL_BOUNCE
          } else if (py < -maxY) {
            py = -maxY
            if (vy < 0) vy *= -LITE_WALL_BOUNCE
          }
          ball.position
            .copy(anchor)
            .addScaledVector(camRight, px)
            .addScaledVector(camUp, py)
            .addScaledVector(camForward, seatDepth)
          ball.velocity
            .copy(camRight)
            .multiplyScalar(vx)
            .addScaledVector(camUp, vy)
        }

        ball.mesh.position.copy(ball.position)
      }

      swarmHapticPrune(hapticAlive)
      renderer.render(scene, camera)
      return
    }

    const softBound = balls[0].radius * SOFT_BOUND_SCALE
    const settling = settleLeft > 0
    if (settling) settleLeft = Math.max(0, settleLeft - dt)
    hapticAlive.clear()
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
          if (!settling && !reduced) {
            const key = swarmHapticPairKey(i, j)
            hapticAlive.add(key)
            swarmHapticContact(key, overlap)
          }
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

    swarmHapticPrune(hapticAlive)

    // Decay swipe speed so a stopped cursor ends the stroke
    pointerSpeedPx *= 0.88
    pointerVel.multiplyScalar(0.88)

    renderer.render(scene, camera)
  }

  runFrame = tick
  if (gen !== bootGen) return

  // Lite: lights alone are enough — lift the stone cover without waiting on HDRI.
  syncCamera({ force: true })
  gl.render(scene, camera)
  if (lite) emitLit()
  scheduleGyroAttach()

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
  <div class="hero-swarm-root size-full">
    <div
      ref="canvasHost"
      class="hero-swarm size-full touch-pan-y"
      aria-hidden="true"
    />
    <Teleport to="body">
      <button
        v-if="motionUnlockVisible"
        type="button"
        class="motion-unlock"
        @pointerdown.prevent="onMotionUnlockTap"
      >
        Включить гироскоп
      </button>
    </Teleport>
  </div>
</template>

<style scoped>
.hero-swarm-root {
  position: relative;
}

.hero-swarm {
  cursor: grab;
  /* Belt-and-suspenders: never let the GL surface own vertical gestures. */
  touch-action: pan-y;
}

/* Under the brand preloader: keep the GL layer out of the compositor.
   Prefer opacity — a child with visibility:visible can override a hidden parent. */
.hero-swarm-root.hero-swarm--cold .hero-swarm {
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

<style>
/* Teleported — must not be scoped (lives on body). */
.motion-unlock {
  position: fixed;
  left: 50%;
  bottom: max(1.25rem, env(safe-area-inset-bottom));
  z-index: 80;
  transform: translateX(-50%);
  padding: 0.7rem 1.15rem;
  border: 0;
  border-radius: 999px;
  background: rgba(20, 18, 16, 0.88);
  color: #f4efe8;
  font: 600 0.875rem/1.2 "Outfit", ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0.01em;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;
}
</style>
