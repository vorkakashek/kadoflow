<script setup lang="ts">
/**
 * Hero swarm — tilted torus spiral (ring + helix twist), slow plane drift.
 * ≥1200: cursor knocks balls; they return to moving seats.
 * <1200: baked orbit + motion physics (angular velocity sweeps / collide / home).
 */
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Euler,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'
import {
  isAppleTouchDevice,
  isCoarsePointer,
  isMobileChromeHeightOnlyResize,
  isNarrowViewport,
} from '~/utils/mobileViewport'
import {
  swarmHapticArm,
  swarmHapticConfirm,
  swarmHapticContact,
  swarmHapticIsArmed,
  swarmHapticPairKey,
  swarmHapticPrune,
  swarmHapticReset,
} from '~/utils/swarmHaptics'
import { flowSurfaceMask } from '~/composables/useFlowSurfaceMask'
import { useBrandPreload } from '~/composables/useBrandPreload'

const { t } = useI18n()

/** Flip this to A/B studio looks (files in /public/env). */
const HDRI_PRESETS = {
  studioSoft: '/env/studio_small_09_256.hdr',
  studioWarm: '/env/studio_small_03_256.hdr',
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
/** Tighter mobile orbit so the 12-ball strand reads as a cluster. */
const MOBILE_ROUTE_SCALE = 0.84
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
/** Entry gather window: stronger springs, with input and idle knocks muted. */
const SETTLE_MS = 700
/** Intro: place balls this far out (× ringRadius), then spring home. */
const ENTRY_SCATTER_RATIO = 2.25
/** Mobile starts near the final outer silhouette so its entrance is visible immediately. */
const ENTRY_SCATTER_RATIO_MOBILE = 1.55
/** Debounce real window resizes before a full scene reboot. */
const REBOOT_MS = 320
const MOTION_INTRO_COOKIE = 'kado_motion_intro'
const MOTION_INTRO_MAX_AGE = 60 * 60 * 24 * 7
const DESKTOP_MOTION_EASE_MS = 520
const DESKTOP_ICON_MORPH_S = 0.38
const HAPTIC_CONTROL_EXIT_MS = 240
// Tabler player-pause/player-play (MIT); combined paths retain the existing morph.
const DESKTOP_PAUSE_ICON_PATH = 'M6 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -12 M14 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -12'
const DESKTOP_PLAY_ICON_PATH = 'M7 4v16l13 -8l-13 -8'

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
  mesh: Mesh
  position: Vector3
  seat: Vector3
  velocity: Vector3
  angle: number
  radius: number
  phase: number
  /** Cursor was inside this ball's hit radius last frame. */
  pointerInside: boolean
}

const COLORS = {
  green: new Color('#49573f'),
  white: new Color('#f5f1e8'),
  dark: new Color('#171915'),
} as const

const props = withDefaults(
  defineProps<{
    /** When false, rAF + draws stop (keeps GPU assets warm for return). */
    active?: boolean
    /** Canvas extends past the visible hero; keep overlay chrome inside that edge. */
    overlayInsetX?: number
    overlayInsetY?: number
  }>(),
  { active: true, overlayInsetX: 0, overlayInsetY: 0 },
)

const motionOverlayStyle = computed<Record<string, string>>(() => ({
  '--motion-scene-inset-x': `${Math.max(0, props.overlayInsetX)}px`,
  '--motion-scene-inset-y': `${Math.max(0, props.overlayInsetY)}px`,
}))

const emit = defineEmits<{
  booted: []
  lit: []
}>()

const canvasHost = ref<HTMLElement | null>(null)
const isAndroidClient = ref(false)
const isIosClient = ref(false)
const isDesktopMotionClient = ref(false)
const isMobileMotionClient = computed(
  () => isAndroidClient.value || isIosClient.value,
)
const motionEnabled = ref(false)
const motionIntroVisible = ref(false)
/** The intro is hero-local even though its control layer is teleported. */
const motionIntroInHero = ref(false)
const motionEnableRequested = ref(false)
const gyroPermissionReady = ref(false)
const motionControlVisible = computed(
  () => isMobileMotionClient.value && !motionIntroVisible.value,
)
const motionControlActive = computed(
  () => motionEnabled.value && gyroPermissionReady.value,
)
const motionControlAtRest = ref(true)
const androidHapticConfirmed = ref(false)
const androidHapticLeaving = ref(false)
const desktopSceneEnabled = ref(true)
const desktopMotionIconPath = ref<SVGPathElement | null>(null)
const desktopMotionNotice = ref('')
const desktopMotionNoticeVisible = ref(false)
const motionIntroText = computed(() =>
  isAndroidClient.value
    ? t('accessibility.enableGyroscopeAndVibrationHint')
    : t('accessibility.enableGyroscopeHint'),
)
let gyroUnlockFn: (() => void) | null = null
let removeMotionControlScroll: (() => void) | null = null
let motionIntroHeroObserver: IntersectionObserver | null = null
let motionIntroPointerUpAt = 0
let desktopMotionNoticeTimer = 0
let androidHapticExitTimer = 0
let desktopIconMorph: { kill: () => void } | null = null
let desktopIconMorphGen = 0

function hasMotionIntroCookie() {
  return document.cookie
    .split(';')
    .some((part) => part.trim().startsWith(`${MOTION_INTRO_COOKIE}=`))
}

function rememberMotionIntro() {
  document.cookie = `${MOTION_INTRO_COOKIE}=1; Max-Age=${MOTION_INTRO_MAX_AGE}; Path=/; SameSite=Lax`
}

function syncMotionIntroHero() {
  const hero = document.querySelector<HTMLElement>('.hero')
  if (!hero) {
    motionIntroInHero.value = window.scrollY <= 2
    return
  }
  const box = hero.getBoundingClientRect()
  motionIntroInHero.value = box.bottom > 0 && box.top < window.innerHeight
}

function observeMotionIntroHero() {
  motionIntroHeroObserver?.disconnect()
  motionIntroHeroObserver = null

  const hero = document.querySelector<HTMLElement>('.hero')
  if (!hero) {
    syncMotionIntroHero()
    return
  }

  motionIntroHeroObserver = new IntersectionObserver(
    ([entry]) => {
      motionIntroInHero.value = entry.isIntersecting
    },
    { threshold: 0.01 },
  )
  motionIntroHeroObserver.observe(hero)
  syncMotionIntroHero()
}

function finishMotionIntro() {
  rememberMotionIntro()
  motionIntroVisible.value = false
}

function onMotionIntroTap() {
  motionEnableRequested.value = true
  motionEnabled.value = true
  swarmHapticReset()
  // iOS can reject or delay its system permission sheet (notably outside HTTPS).
  // The hint is still one-shot: reveal the regular control so a later tap can retry.
  finishMotionIntro()
  if (isAndroidClient.value) {
    androidHapticConfirmed.value = swarmHapticConfirm()
  }
  gyroUnlockFn?.()
}

/** Pointer-up keeps the iOS permission request inside a real user gesture. */
function onMotionIntroPointerUp(event: PointerEvent) {
  if (!event.isPrimary) return
  motionIntroPointerUpAt = performance.now()
  onMotionIntroTap()
}

/** Keyboard activation and browsers without Pointer Events still use click. */
function onMotionIntroClick() {
  if (performance.now() - motionIntroPointerUpAt < 450) return
  onMotionIntroTap()
}

function onMotionControlTap() {
  if (motionControlActive.value) {
    motionEnabled.value = false
    motionEnableRequested.value = false
    swarmHapticReset()
    return
  }
  motionEnableRequested.value = true
  motionEnabled.value = true
  swarmHapticReset()
  if (isAndroidClient.value) {
    androidHapticConfirmed.value =
      swarmHapticConfirm() || androidHapticConfirmed.value
  }
  if (!gyroPermissionReady.value) gyroUnlockFn?.()
}

function onHapticControlTap() {
  if (androidHapticLeaving.value || !swarmHapticConfirm()) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    androidHapticConfirmed.value = true
    return
  }
  androidHapticLeaving.value = true
  window.clearTimeout(androidHapticExitTimer)
  androidHapticExitTimer = window.setTimeout(() => {
    androidHapticConfirmed.value = true
    androidHapticLeaving.value = false
  }, HAPTIC_CONTROL_EXIT_MS)
}

async function morphDesktopMotionIcon(sceneEnabled: boolean) {
  const path = desktopMotionIconPath.value
  if (!path) return
  const gen = ++desktopIconMorphGen
  const target = sceneEnabled
    ? DESKTOP_PAUSE_ICON_PATH
    : DESKTOP_PLAY_ICON_PATH
  desktopIconMorph?.kill()
  desktopIconMorph = null
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    path.setAttribute('d', target)
    return
  }
  // The paid MorphSVG helper is needed only after this explicit control is
  // used. Keeping it out of Hero boot removes its parser/runtime from the
  // already heavy Three.js initialization task.
  const [{ default: gsap }, { default: MorphSVGPlugin }] = await Promise.all([
    import('gsap'),
    import('gsap/MorphSVGPlugin'),
  ])
  if (gen !== desktopIconMorphGen || !path.isConnected) return
  gsap.registerPlugin(MorphSVGPlugin)
  desktopIconMorph = gsap.to(path, {
    duration: DESKTOP_ICON_MORPH_S,
    morphSVG: { shape: target, type: 'rotational' },
    ease: 'power2.inOut',
    overwrite: true,
    onComplete: () => {
      path.setAttribute('d', target)
      desktopIconMorph = null
    },
  })
}

function onDesktopMotionControlTap() {
  desktopSceneEnabled.value = !desktopSceneEnabled.value
  void morphDesktopMotionIcon(desktopSceneEnabled.value)
  desktopMotionNotice.value = desktopSceneEnabled.value
    ? t('accessibility.enabledShort')
    : t('accessibility.disabledShort')
  desktopMotionNoticeVisible.value = true
  window.clearTimeout(desktopMotionNoticeTimer)
  desktopMotionNoticeTimer = window.setTimeout(() => {
    desktopMotionNoticeVisible.value = false
  }, 1500)
  if (desktopSceneEnabled.value && props.active) startLoop()
}

let renderer: WebGLRenderer | null = null
let animationId = 0
let resizeObserver: ResizeObserver | null = null
let removePointerListeners: (() => void) | null = null
let removeScrollPause: (() => void) | null = null
let sharedGeometry: BufferGeometry | null = null
let envMap: Texture | null = null
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
let keepAliveActive = true

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
    if (on && keepAliveActive) {
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

onMounted(() => {
  isIosClient.value = isAppleTouchDevice()
  isAndroidClient.value = /Android/i.test(navigator.userAgent)
  androidHapticConfirmed.value = isAndroidClient.value && swarmHapticIsArmed()
  isDesktopMotionClient.value = window.matchMedia(
    `(min-width: ${DESKTOP_MIN_WIDTH}px) and (pointer: fine)`,
  ).matches
  const introSeen = hasMotionIntroCookie()
  motionIntroVisible.value = isMobileMotionClient.value && !introSeen
  motionEnabled.value = isMobileMotionClient.value && !motionIntroVisible.value
  motionEnableRequested.value = motionEnabled.value
  observeMotionIntroHero()
  const syncMotionControlRest = () => {
    motionControlAtRest.value = window.scrollY <= 2
  }
  syncMotionControlRest()
  window.addEventListener('scroll', syncMotionControlRest, { passive: true })
  removeMotionControlScroll = () => {
    window.removeEventListener('scroll', syncMotionControlRest)
  }
  lastLayoutKey = layoutKey()
  void bootScene()
  const onWinResize = () => {
    if (isMobileChromeHeightOnlyResize()) return
    isDesktopMotionClient.value = window.matchMedia(
      `(min-width: ${DESKTOP_MIN_WIDTH}px) and (pointer: fine)`,
    ).matches
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
  desktopIconMorphGen += 1
  desktopIconMorph?.kill()
  desktopIconMorph = null
  removeWindowResize?.()
  removeWindowResize = null
  removeMotionControlScroll?.()
  removeMotionControlScroll = null
  motionIntroHeroObserver?.disconnect()
  motionIntroHeroObserver = null
  window.clearTimeout(desktopMotionNoticeTimer)
  window.clearTimeout(androidHapticExitTimer)
  disposeScene()
})

onDeactivated(() => {
  keepAliveActive = false
  stopLoop()
})

onActivated(() => {
  keepAliveActive = true
  if (!props.active || document.visibilityState === 'hidden') return
  forceResize?.()
  startLoop()
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
   * Mobile / coarse / iOS: budget for fill-rate — Standard mats, DPR 1 and
   * baked helix seats (no physics). MSAA preserves silhouettes while stable
   * direct lights replace runtime HDR/PMREM.
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
  const sphereSegments = wide && !isCoarse ? 40 : lite ? 24 : 32
  const pixelRatioCap = wide && !isCoarse ? 1.35 : lite ? 1 : 1.25
  const cameraZ = layout.cameraZ
  const ballDiameterPx = layout.diameterPx
  const ringScale = layout.ringScale

  const scene = new Scene()
  const camera = new PerspectiveCamera(40, 1, 0.1, 50)
  camera.position.set(0, 0.12, cameraZ)

  const gl = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    // Page Canvas no longer snapshots this buffer. Keeping it discardable avoids
    // the copy-back cost; the existing stone cover masks frames during GL wake-up.
    preserveDrawingBuffer: false,
  })
  const surfaceColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--palette-stone')
    .trim() || '#d8d2c6'
  gl.setClearColor(surfaceColor, 1)
  gl.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap))
  // Frosted transmission does not need a full-resolution refraction buffer.
  // Half resolution cuts that first GPU allocation/render to a quarter of pixels.
  gl.transmissionResolutionScale = lite ? 1 : 0.5
  gl.outputColorSpace = SRGBColorSpace
  gl.toneMapping = ACESFilmicToneMapping
  gl.toneMappingExposure = lite ? 0.98 : 0.92
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

  // Keep HDR parsing and PMREM out of the already large scene chunk. This
  // second-stage import starts only after the renderer exists and remains
  // independently cacheable from the core interaction code.
  const environmentPromise = import('~/utils/loadHeroEnvironment').then(
    ({ loadHeroEnvironment }) => loadHeroEnvironment(
      gl,
      lite ? HDRI_PRESETS.studioWarm : HDRI_PRESETS[ACTIVE_HDRI],
      (loaded, total) => {
        if (firstSceneReady) return
        const ratio = total > 0 ? loaded / total : 0
        preload.setSceneProgress(0.08 + ratio * 0.55)
      },
    ),
  )

  renderer = gl
  host.appendChild(gl.domElement)
  // WebGL context creation is the only measured >50 ms startup task. Tell the
  // shell as soon as it is behind us; lighting may continue under the cover.
  emit('booted')

  const hemi = new HemisphereLight(0xe8eef5, 0xb8a990, lite ? 0.4 : 0.22)
  scene.add(hemi)

  const key = new DirectionalLight(0xf5f8fc, lite ? 0.6 : 0.55)
  key.position.set(3.8, 5.2, 4.5)
  scene.add(key)

  const fill = new DirectionalLight(0xc5d4e4, lite ? 0.29 : 0.22)
  fill.position.set(-4.5, 1.2, 2.8)
  scene.add(fill)

  const rim = new DirectionalLight(0xd0dcea, lite ? 0.26 : 0.32)
  rim.position.set(-1.8, 2.8, -4.8)
  scene.add(rim)

  const matte = (color: Color) => {
    const material = lite
      ? new MeshStandardMaterial({
          color,
          roughness: 0.86,
          metalness: 0,
          envMapIntensity: 0.9,
        })
      : new MeshPhysicalMaterial({
          color,
          roughness: 0.86,
          metalness: 0.02,
          clearcoat: 0.12,
          clearcoatRoughness: 0.62,
          sheen: 0.28,
          sheenRoughness: 0.75,
          sheenColor: new Color('#d7e4f0'),
          envMapIntensity: 0.7,
          specularIntensity: 0.5,
        })
    material.userData.swarmFinish = 'matte'
    return material
  }

  /** Desktop: real glass. Lite: bright Standard stand-in — no transmission fill cost. */
  const frosted = (color: Color) =>
    lite
      ? new MeshStandardMaterial({
          color: color.clone().lerp(new Color('#eef4fa'), 0.35),
          roughness: 0.28,
          metalness: 0,
          envMapIntensity: 1.25,
        })
      : new MeshPhysicalMaterial({
          color,
          roughness: 0.48,
          metalness: 0,
          transmission: 0.88,
          thickness: 1.6,
          ior: 1.42,
          // Keep DOM stone visible through empty parts of the alpha canvas.
          // Depth writing below stabilizes overlapping transmissive spheres.
          transparent: true,
          opacity: 1,
          attenuationColor: color.clone().lerp(new Color('#e4eef7'), 0.4),
          attenuationDistance: 1.6,
          clearcoat: 0.4,
          clearcoatRoughness: 0.35,
          envMapIntensity: 1.15,
          depthWrite: true,
        })

  const glossy = (color: Color) =>
    lite
      ? new MeshStandardMaterial({
          color,
          roughness: 0.22,
          metalness: 0,
          envMapIntensity: 1.15,
        })
      : new MeshPhysicalMaterial({
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

  const materialPlan: Material[] = []
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
    // Desktop: roughly one third real frosted glass. Keep both opaque brand
    // finishes, but replace part of the repeating green/ink mass with glass.
    materialPlan.push(
      matte(COLORS.green.clone()),
      glossy(COLORS.green.clone()),
      frosted(COLORS.green.clone()),
      matte(COLORS.dark.clone()),
      glossy(COLORS.dark.clone()),
      frosted(COLORS.white.clone()),
      matte(COLORS.white.clone()),
      frosted(COLORS.white.clone()),
      glossy(COLORS.white.clone()),
    )
  }

  sharedGeometry = new SphereGeometry(1, sphereSegments, sphereSegments)
  balls = []

  for (let i = 0; i < ballCount; i++) {
    const material = materialPlan[i % materialPlan.length].clone()
    const mesh = new Mesh(sharedGeometry, material)
    mesh.renderOrder = material.transparent ? 2 : 1
    scene.add(mesh)
    balls.push({
      mesh,
      position: new Vector3(),
      seat: new Vector3(),
      velocity: new Vector3(),
      angle: (i / ballCount) * Math.PI * 2,
      radius: 0.35,
      // Spread along the helix so the swarm reads as a twisted strand, not a flat pack.
      phase: (i / ballCount) * Math.PI * 2 * SPIRAL_TURNS,
      pointerInside: false,
    })
  }
  for (const material of materialPlan) material.dispose()

  let litEmitted = false
  let envFallbackChosen = false
  let pointerInteractionReady = false
  const emitLit = () => {
    if (litEmitted || gen !== bootGen) return
    litEmitted = true
    emit('lit')
    // Let the cover finish fading before hover physics can touch the first
    // visible frames. A cursor already over the swarm must not compete with it.
    window.setTimeout(() => {
      if (gen !== bootGen || renderer !== gl) return
      pointerInteractionReady = true
    }, 600)
  }

  const nextPaint = () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })

  /** Compile shaders and paint twice under the cover before making GL visible. */
  const settleAndEmitLit = async () => {
    if (gen !== bootGen || renderer !== gl) return
    syncCamera({ force: true })
    try {
      await gl.compileAsync(scene, camera)
    } catch {
      gl.compile(scene, camera)
    }
    if (gen !== bootGen || renderer !== gl) return
    gl.render(scene, camera)
    await nextPaint()
    if (gen !== bootGen || renderer !== gl) return
    gl.render(scene, camera)
    await nextPaint()
    emitLit()
  }

  const applyEnvAssets = async () => {
    let preparedEnvironment: Texture
    try {
      preparedEnvironment = await environmentPromise
    } catch {
      await settleAndEmitLit()
      return
    }
    if (envFallbackChosen) {
      preparedEnvironment.dispose()
      return
    }
    if (gen !== bootGen || renderer !== gl) {
      preparedEnvironment.dispose()
      return
    }
    if (!firstSceneReady) preload.setSceneProgress(0.9)
    envMap = preparedEnvironment
    scene.environment = envMap
    scene.environmentIntensity = lite ? 0.88 : 1.05

    await settleAndEmitLit()
  }
  void applyEnvAssets()
  // A failed HDR request must not leave the stone cover forever.
  window.setTimeout(() => {
    if (litEmitted) return
    envFallbackChosen = true
    void settleAndEmitLit()
  }, lite ? 1800 : 6000)

  const anchor = new Vector3(1.55, 0.05, 0)
  /** Base ring orientation: tilted, receding into depth — then slowly drifts. */
  const ringBaseEuler = new Euler(-0.62, 0.78, 0.18, 'XYZ')
  // Match the phase-zero drift formula immediately; otherwise the first tick
  // adds +0.12rad around Z and visibly changes the route after first paint.
  const ringEuler = new Euler(
    ringBaseEuler.x,
    ringBaseEuler.y,
    ringBaseEuler.z + 0.12,
    'XYZ',
  )
  const ringQuat = new Quaternion().setFromEuler(ringEuler)
  let ringRadius = 1.2
  let ringTiltPhase = 0

  /**
   * Device motion (lite):
   * — Tip (any edge lower): accelerate balls in that screen-space direction.
   * — Ignore alpha / rotation rate: Euler coupling during a tip must not add physics.
   */
  let gyroPitch = 0
  let gyroRoll = 0
  let gyroPitchT = 0
  let gyroRollT = 0
  let gyroArmed = false
  let tipFromGrav = false
  let tipGravStamp = 0
  const gravityNeutral = { roll: 0, pitch: 0, samples: 0 }
  const orientNeutral = { roll: 0, pitch: 0, samples: 0 }
  /** Screen-space acceleration at full tilt; depth response varies per ball. */
  const GYRO_ACCEL = 0.0011
  /** Ignore hand tremor, then ease the remaining sensor range back to 0…1. */
  const GYRO_DEAD_ZONE = 0.075
  /** Time-based low-pass: stable feel at both 60 and 30 fps. */
  const GYRO_SMOOTH_MS = 180
  /** Visible camera travel on a vertical cylinder centred on the swarm. */
  const GYRO_CAMERA_ARC = 1.2
  const GYRO_CAMERA_LIFT = 0.56
  /** Near/far layers travel at different rates, creating controlled contacts. */
  const GYRO_DEPTH_RESPONSE = 0.32
  /** Average the initial handheld pose; it becomes neutral instead of table-flat. */
  const GYRO_CALIBRATION_SAMPLES = 24
  /** Orient fallback: degrees of tip → full force (flat-relative). */
  const GYRO_TIP_ANGLE = 22
  const lookTarget = new Vector3()
  const LITE_WALL_X = 2.15
  const LITE_WALL_Y = 2.35
  const LITE_WALL_BOUNCE = 0.62
  const LITE_RETURN = 0.00006
  const LITE_DAMPING = 0.972
  const LITE_SEP_FORCE = 0.018
  const LITE_MAX_SPEED = 0.22
  const LITE_LEASH = 2.2
  let removeGyroListeners: (() => void) | null = null
  let gyroAttachScheduled = false

  const filterGyroTip = (value: number) => {
    const magnitude = Math.abs(value)
    if (magnitude <= GYRO_DEAD_ZONE) return 0
    return (
      Math.sign(value) *
      MathUtils.clamp(
        (magnitude - GYRO_DEAD_ZONE) / (1 - GYRO_DEAD_ZONE),
        0,
        1,
      )
    )
  }

  const updateGyroTip = (
    rawRoll: number,
    rawPitch: number,
    neutral: { roll: number; pitch: number; samples: number },
  ) => {
    if (neutral.samples < GYRO_CALIBRATION_SAMPLES) {
      neutral.samples += 1
      const weight = 1 / neutral.samples
      neutral.roll += (rawRoll - neutral.roll) * weight
      neutral.pitch += (rawPitch - neutral.pitch) * weight
      gyroRollT = 0
      gyroPitchT = 0
      return
    }
    gyroRollT = filterGyroTip(
      MathUtils.clamp(rawRoll - neutral.roll, -1, 1),
    )
    gyroPitchT = filterGyroTip(
      MathUtils.clamp(rawPitch - neutral.pitch, -1, 1),
    )
  }

  /** Wire unlock ASAP so the first tap can open the iOS permission sheet. */
  const attachGyroSensors = () => {
    if (!lite || reduced || typeof window === 'undefined') return
    if (isIOS && !GYRO_ENABLE_IOS) return
    if (removeGyroListeners) return

    try {
      const onOrient = (e: DeviceOrientationEvent) => {
        if (e.beta == null || e.gamma == null) return
        gyroArmed = true

        const gravFresh =
          tipFromGrav && performance.now() - tipGravStamp < 250
        if (!gravFresh) {
          updateGyroTip(
            e.gamma / GYRO_TIP_ANGLE,
            -e.beta / GYRO_TIP_ANGLE,
            orientNeutral,
          )
        }

      }

      const onMotion = (e: DeviceMotionEvent) => {
        gyroArmed = true

        const g = e.accelerationIncludingGravity
        if (g && g.x != null && g.y != null) {
          const gx = g.x / 9.81
          const gy = g.y / 9.81
          updateGyroTip(gx, gy, gravityNeutral)
          tipFromGrav = true
          tipGravStamp = performance.now()
        }
      }

      const startListening = () => {
        window.addEventListener('deviceorientation', onOrient, { passive: true })
        window.addEventListener('devicemotion', onMotion, { passive: true })
        gyroPermissionReady.value = true
        gyroUnlockFn = null
        removeGyroListeners = () => {
          window.removeEventListener('deviceorientation', onOrient)
          window.removeEventListener('devicemotion', onMotion)
          gyroPermissionReady.value = false
          removeGyroListeners = null
        }
      }

      const DOE = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
      }
      const DME = DeviceMotionEvent as typeof DeviceMotionEvent & {
        requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
      }

      const needsExplicitPermission =
        typeof DOE.requestPermission === 'function'
        || typeof DME.requestPermission === 'function'

      if (needsExplicitPermission) {
        // Chrome 151+ and iOS require a secure context plus a direct gesture.
        if (!window.isSecureContext) {
          return
        }

        let unlocking = false
        const detachUnlock = () => {
          gyroUnlockFn = null
        }

        const unlock = () => {
          if (unlocking || gen !== bootGen) return
          unlocking = true

          const tasks: Promise<string>[] = []
          if (typeof DOE.requestPermission === 'function') {
            try {
              tasks.push(DOE.requestPermission())
            } catch {
              /* ignore */
            }
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

        gyroUnlockFn = unlock
        removeGyroListeners = () => {
          detachUnlock()
          gyroPermissionReady.value = false
          removeGyroListeners = null
        }
      } else {
        startListening()
      }
    } catch {
      removeGyroListeners?.()
      removeGyroListeners = null
      gyroPermissionReady.value = false
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

  const pointer = new Vector3()
  const pointerPrev = new Vector3()
  const pointerVel = new Vector3()
  const pointerNdc = new Vector2()
  const pointerNdcPrev = new Vector2()
  const raycaster = new Raycaster()
  const hitPlane = new Plane()
  const planeNormal = new Vector3()
  let pointerActive = false
  let pointerSampled = false
  let pointerSpeedPx = 0
  let pointerIdleTimer = 0
  const POINTER_IDLE_MS = 280
  const size = { w: 1, h: 1 }
  const tmp = new Vector3()
  const push = new Vector3()
  const seat = new Vector3()
  const seatPull = new Vector3()
  const local = new Vector3()
  const camRight = new Vector3()
  const camUp = new Vector3()
  const camForward = new Vector3()
  let lastBallRadius = 0
  let settleLeft = SETTLE_MS
  /** Once true, orbit anchor/radius ignore host size churn (morph / pin). */
  let orbitLocked = false
  /** Pairs overlapping this frame — for haptic edge triggers. */
  const hapticAlive = new Set<number>()
  const wallHaptic = (ballIndex: number, wallIndex: number, impact: number) => {
    if (!motionEnabled.value) return
    const key = swarmHapticPairKey(ballIndex, balls.length + wallIndex)
    hapticAlive.add(key)
    swarmHapticContact(
      key,
      MathUtils.clamp(impact / Math.max(LITE_MAX_SPEED, 0.001), 0, 1),
    )
  }

  const pointOnOrbit = (angle: number, phase: number, out: Vector3) => {
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
    if (!reduced) {
      // Scatter outside the ring, then let springs pull home — avoids the
      // “stuck overlapping → explode” pop and gives both layouts one entrance.
      camera.updateMatrixWorld(true)
      camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
      camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize()
      camForward
        .setFromMatrixColumn(camera.matrixWorld, 2)
        .normalize()
        .negate()
      const n = balls.length
      const scatterRatio = lite ? ENTRY_SCATTER_RATIO_MOBILE : ENTRY_SCATTER_RATIO
      const scatterR = Math.max(ringRadius * scatterRatio, balls[0]?.radius * 6 || 1)
      const depthMax = ringRadius * LITE_DEPTH_MAX_RATIO
      for (let i = 0; i < n; i++) {
        const ball = balls[i]
        pointOnOrbit(ball.angle, ball.phase, seat)
        ball.seat.copy(seat)
        push.copy(seat).sub(anchor)
        const sz = MathUtils.clamp(
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
      // Gyro / cursor / idle knocks stay muted while physics gathers inward.
      settleLeft = SETTLE_MS
      swarmHapticReset()
      return
    }

    for (const ball of balls) {
      pointOnOrbit(ball.angle, ball.phase, ball.position)
      ball.seat.copy(ball.position)
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
      2 * Math.tan(MathUtils.degToRad(camera.fov) * 0.5) * dist
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
      new Vector3(0, 0, 0),
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
    ringRadius = radius * ringScale * (lite ? MOBILE_ROUTE_SCALE : 1)

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
    if (!pointerInteractionReady) return
    if (event.pointerType !== 'mouse') return
    if (
      !desktopSceneEnabled.value
      || (event.target as Element | null)?.closest('.motion-control')
    ) {
      if (pointerActive) onPointerLeave()
      return
    }
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
    if (!pointerInteractionReady) return
    if (event.pointerType !== 'mouse') return
    if (
      !desktopSceneEnabled.value
      || (event.target as Element | null)?.closest('.motion-control')
    ) return
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

  // Loop while the tab is visible — including other window / other monitor.
  // Pause only when the tab itself is hidden (throttled rAF would flash).
  const onPageVisibility = () => {
    if (document.visibilityState === 'hidden') stopLoop()
    else if (props.active && keepAliveActive) startLoop()
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

  let desktopMotionScale = desktopSceneEnabled.value ? 1 : 0

  const tick = (now: number) => {
    if (!loopRunning) return
    animationId = requestAnimationFrame(tick)
    if (!renderer) return

    const dt = Math.min(32, now - lastFrame)
    lastFrame = now
    if (!lite && !reduced) {
      const target = desktopSceneEnabled.value ? 1 : 0
      const blend = 1 - Math.exp(-dt / DESKTOP_MOTION_EASE_MS)
      desktopMotionScale += (target - desktopMotionScale) * blend
      if (Math.abs(target - desktopMotionScale) < 0.001) {
        desktopMotionScale = target
      }
      if (!desktopSceneEnabled.value && pointerActive) {
        pointerActive = false
        pointerSampled = false
        pointerSpeedPx = 0
        pointerVel.set(0, 0, 0)
      }
    }
    const step = reduced ? 0 : dt * (lite ? 1 : desktopMotionScale)

    if (!reduced) {
      if (lite) {
        // Tip holds from gravity/orient while an edge is lowered — no decay here.
        if (
          tipFromGrav &&
          performance.now() - tipGravStamp > 280
        ) {
          tipFromGrav = false
        }
        const gyroBlend = 1 - Math.exp(-dt / GYRO_SMOOTH_MS)
        gyroPitch += (gyroPitchT - gyroPitch) * gyroBlend
        gyroRoll += (gyroRollT - gyroRoll) * gyroBlend
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

      // Device gravity X arrives opposite to the visual lean on tested phones.
      const motionActive = motionEnabled.value && gyroPermissionReady.value
      const tipRight = motionActive ? -gyroRoll : 0
      // Lowering the phone should pull the swarm toward the viewer / screen
      // bottom. Sensor pitch arrives in the opposite visual direction.
      const tipUp = motionActive ? -gyroPitch : 0

      if (!reduced) {
        const cameraArc = tipRight * GYRO_CAMERA_ARC
        camera.position.set(
          lookTarget.x + Math.sin(cameraArc) * cameraZ,
          0.12 + tipUp * ringRadius * GYRO_CAMERA_LIFT,
          lookTarget.z + Math.cos(cameraArc) * cameraZ,
        )
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

      /** Screen XY from helix + depth so balls aren’t coplanar. */
      const flattenSeat = () => {
        push.copy(seat).sub(anchor)
        const sx = push.dot(camRight)
        const sy = push.dot(camUp)
        const sz = MathUtils.clamp(
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
        if (!reduced) ball.angle += ORBIT_SPEED * step
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
          const depthResponse =
            1 +
            MathUtils.clamp(-seatDepth / Math.max(depthMax, 0.001), -1, 1) *
              GYRO_DEPTH_RESPONSE
          ball.velocity
            .addScaledVector(
              camRight,
              tipRight * depthResponse * GYRO_ACCEL * step,
            )
            .addScaledVector(
              camUp,
              tipUp * depthResponse * GYRO_ACCEL * step,
            )
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
            if (!settling && !reduced && motionEnabled.value) {
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
            if (vx > 0) {
              if (!settling) wallHaptic(i, 0, vx)
              vx *= -LITE_WALL_BOUNCE
            }
          } else if (px < -maxX) {
            px = -maxX
            if (vx < 0) {
              if (!settling) wallHaptic(i, 1, -vx)
              vx *= -LITE_WALL_BOUNCE
            }
          }
          if (py > maxY) {
            py = maxY
            if (vy > 0) {
              if (!settling) wallHaptic(i, 2, vy)
              vy *= -LITE_WALL_BOUNCE
            }
          } else if (py < -maxY) {
            py = -maxY
            if (vy < 0) {
              if (!settling) wallHaptic(i, 3, -vy)
              vy *= -LITE_WALL_BOUNCE
            }
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
    const tanHalfFov = Math.tan(MathUtils.degToRad(camera.fov) * 0.5)

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i]

      if (!reduced) ball.angle += ORBIT_SPEED * step
      pointOnOrbit(ball.angle, ball.phase, seat)

      if (!settling) {
        // Inherit the seat's exact world-space travel first. Physics then owns
        // only the offset, so releasing boot lock cannot alter the route itself.
        push.copy(seat).sub(ball.seat)
        ball.position.add(push)
      }
      ball.seat.copy(seat)

      // Reduced motion keeps the finished composition without an entrance.
      // Otherwise `settling` deliberately runs the same spring gather as mobile.
      if (reduced) {
        ball.position.copy(seat)
        ball.velocity.set(0, 0, 0)
        ball.pointerInside = false
        ball.mesh.position.copy(ball.position)
        continue
      }

      if (!settling) {
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
      let returnForce = RETURN * (settling ? 2.6 : 1)
      if (distToSeat > RETURN_SOFT_DIST * ball.radius) {
        returnForce *= settling ? 0.32 : 0.28
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
      if (!settling && pointerActive && tmp.z < 1 && tmp.z > -1) {
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
    if (!desktopSceneEnabled.value && desktopMotionScale <= 0.001) stopLoop()
  }

  runFrame = tick
  if (gen !== bootGen) return

  // Compile and paint the final lighting/material state before lifting the cover.
  syncCamera({ force: true })
  gl.render(scene, camera)
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
  <div
    class="hero-swarm-root size-full"
    :class="{
      'hero-swarm-root--desktop-paused': isDesktopMotionClient && !desktopSceneEnabled,
    }"
    :style="motionOverlayStyle"
  >
    <div
      ref="canvasHost"
      class="hero-swarm size-full touch-pan-y"
      aria-hidden="true"
    />

    <Teleport to="#hero-motion-controls">
      <div
        class="hero-swarm-controls size-full"
        :style="motionOverlayStyle"
      >
    <button
      v-if="isAndroidClient && !motionIntroVisible && !androidHapticConfirmed"
      type="button"
      class="motion-control motion-control--haptic"
      :class="{
        'motion-control--scroll-hidden': !motionControlAtRest,
        'motion-control--haptic-leaving': androidHapticLeaving,
      }"
      :aria-label="t('accessibility.enableVibration')"
      @click="onHapticControlTap"
    >
      <SiteIcon
        name="device-mobile-vibration"
        class="motion-control__icon motion-control__icon--haptic"
      />
    </button>

    <button
      v-if="motionControlVisible"
      type="button"
      class="motion-control"
      :class="{
        'motion-control--active': motionControlActive,
        'motion-control--scroll-hidden': !motionControlAtRest,
      }"
      :aria-label="motionControlActive ? t('accessibility.disableGyroscope') : t('accessibility.enableGyroscope')"
      :aria-pressed="motionControlActive"
      @click="onMotionControlTap"
    >
      <SiteIcon
        name="device-mobile"
        class="motion-control__icon"
      />
    </button>

    <button
      v-else-if="isDesktopMotionClient"
      type="button"
      class="motion-control"
      :class="{
        'motion-control--active': desktopSceneEnabled,
        'motion-control--scroll-hidden': !motionControlAtRest,
      }"
      :aria-label="desktopSceneEnabled ? t('accessibility.disableSceneMotion') : t('accessibility.enableSceneMotion')"
      :aria-pressed="desktopSceneEnabled"
      @click="onDesktopMotionControlTap"
    >
      <span
        class="motion-control__notice"
        :class="{ 'motion-control__notice--visible': desktopMotionNoticeVisible }"
        aria-hidden="true"
      >{{ desktopMotionNotice }}</span>
      <svg
        class="motion-control__icon motion-control__icon--desktop"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="butt"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          ref="desktopMotionIconPath"
          :d="DESKTOP_PAUSE_ICON_PATH"
        />
      </svg>
    </button>

    <button
      v-if="motionIntroVisible && motionIntroInHero"
      type="button"
      class="motion-intro"
      @pointerup="onMotionIntroPointerUp"
      @click="onMotionIntroClick"
    >
      <span class="motion-intro__content">
        <img
          class="motion-intro__icon"
          src="/svg/phone-tilt-css.svg"
          alt=""
        >
        <span class="motion-intro__text">{{ motionIntroText }}</span>
      </span>
    </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.hero-swarm-root {
  position: relative;
}

.hero-swarm-controls {
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

.hero-swarm-root--desktop-paused .hero-swarm,
.hero-swarm-root--desktop-paused .hero-swarm:active {
  cursor: default;
  pointer-events: none;
}

.hero-swarm :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.motion-control {
  position: absolute;
  top: auto;
  right: calc(var(--motion-scene-inset-x, 0px) + 1.25rem + env(safe-area-inset-right));
  bottom: calc(var(--motion-scene-inset-y, 0px) + 1.25rem + env(safe-area-inset-bottom));
  z-index: 6;
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0.25rem;
  border: 0;
  border-radius: 0.85rem;
  color: #fff;
  background: rgba(23, 25, 21, 0.46);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
  pointer-events: auto;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 0.3s var(--motion-ease, ease),
    opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (min-width: 768px) and (hover: hover) and (pointer: fine) {
  .motion-control:hover,
  .motion-control:focus-visible {
    background-color: var(--palette-ink, #171915);
  }
}

.motion-control--scroll-hidden {
  opacity: 0;
  pointer-events: none;
}

.motion-control--haptic-leaving {
  opacity: 0;
  pointer-events: none;
  transform: scale(1.18);
}

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .motion-control {
    backdrop-filter: blur(9px) saturate(1.08);
    -webkit-backdrop-filter: blur(9px) saturate(1.08);
  }
}

.motion-control__icon {
  display: block;
  width: 100%;
  height: 100%;
  transform: rotate(30deg) scale(1.04);
  transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
}

.motion-control--active .motion-control__icon {
  transform: rotate(0deg) scale(1.04);
}

.motion-control__icon--desktop,
.motion-control--active .motion-control__icon--desktop {
  width: 1.5rem;
  height: 1.5rem;
  transform: none;
}

.motion-control__notice {
  position: absolute;
  bottom: calc(100% + 0.5rem);
  left: 50%;
  color: var(--palette-ink);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1;
  letter-spacing: -0.01em;
  opacity: 0;
  pointer-events: none;
  text-shadow: none;
  transform: translate(-50%, 0.2rem);
  transition:
    opacity 0.28s ease,
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.motion-control__notice--visible {
  opacity: 1;
  transform: translate(-50%, 0);
}

@media (max-width: 767.98px), (pointer: coarse) {
  .motion-control {
    --mobile-motion-control-right: calc(
      var(--motion-scene-inset-x, 0px)
      + var(--layout-margin)
      + var(--safe-right, 0px)
      + var(--menu-fab-expanded-width, 108px)
      + 8px
    );
    top: auto;
    right: var(--mobile-motion-control-right);
    width: 42.5px;
    height: 42.5px;
    padding: 0;
    border-radius: 9999px;
    color: var(--palette-ink);
    background-color: color-mix(in srgb, var(--palette-sand) 60%, transparent);
    box-shadow: none;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    bottom: calc(
      var(--motion-scene-inset-y, 0px)
      + var(--layout-margin)
      + var(--safe-bottom, 0px)
    );
    left: auto;
  }

  .motion-control__icon {
    width: 24px;
    height: 24px;
    transform: rotate(0deg) scale(1.04);
  }

  .motion-control--active .motion-control__icon {
    transform: rotate(30deg) scale(1.04);
  }

  .motion-control--haptic {
    right: calc(var(--mobile-motion-control-right) + 42.5px + 8px);
  }

  .motion-control__icon--haptic,
  .motion-control--active .motion-control__icon--haptic {
    width: 24px;
    height: 24px;
    transform: none;
  }

}

@media (prefers-reduced-motion: reduce) {
  .motion-control {
    transition: none;
  }

  .motion-control__icon,
  .motion-control__notice {
    transition: none;
  }
}

.motion-intro {
  position: absolute;
  inset: 0;
  z-index: 7;
  display: grid;
  place-items: center;
  padding: max(1.5rem, env(safe-area-inset-top)) 1.5rem max(1.5rem, env(safe-area-inset-bottom));
  border: 0;
  background: rgba(23, 25, 21, 0.64);
  color: #f5f1e8;
  pointer-events: auto;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.motion-intro__content {
  display: flex;
  width: min(19rem, 82vw);
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
}

.motion-intro__icon {
  display: block;
  width: auto;
  /* SVG has a safe frame for its 3D tilt; keep the phone itself at the old size. */
  height: clamp(9rem, 36vw, 12.6rem);
}

.motion-intro__text {
  max-width: 18rem;
  font-family: var(--font-sans);
  font-size: clamp(1rem, 4.2vw, 1.2rem);
  font-weight: 400;
  line-height: 1.35;
  letter-spacing: -0.01em;
  text-align: center;
  text-wrap: balance;
}

</style>
