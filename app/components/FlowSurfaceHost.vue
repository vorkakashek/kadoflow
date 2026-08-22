<script setup lang="ts">
/**
 * Fixed Flow Surface — one clipped window.
 * Desktop: hero → stone scrub, then kado → case-photo scrub (same lag, both
 * directions via ScrollTrigger onUpdate — no one-shot hop between 2↔3).
 * Case photo paints inside the surface while parked.
 * Mobile: scrub hero→stone with a light lag (not 1:1), box+morph on one live P
 * so stage glue / copy / GL stay in phase; then hop to term/word and pin.
 * Center stays viewport-fixed.
 */
import {
  applyBox,
  docToViewport,
  heroToKadoPlan,
  lerpBox,
  mixBox,
  poseAtScrollY,
  readBox,
  readDocBox,
  resolveCorridorSegment,
  scrollYForCenterCenter,
  scrollYForCenterTop,
  scrollYForTopAt,
  targetsFromScrollProgress,
  updateContinuousProgress,
  viewportCenterSquare,
  type SurfaceBox,
  type SurfaceMorphPlan,
} from '~/utils/flowSurfaceMorph'
import {
  applyFlowSurfaceLive,
  flowSurfaceLiveFromMorph,
} from '~/utils/flowSurfaceLive'
import {
  FLOW_SURFACE_CLIP_ID,
  flowSurfaceMask,
  flushFlowSurfacePath,
  registerFlowSurfaceClipPathEl,
  registerFlowSurfaceLiveBoxNudge,
  resetFlowSurfaceMaskSession,
} from '~/composables/useFlowSurfaceMask'
import {
  isAppleTouchDevice,
  isCoarsePointer,
  isMobileChromeHeightOnlyResize,
  isNarrowViewport,
} from '~/utils/mobileViewport'

type MobileHop = 'term' | 'word' | 'center'
type MobileStage = 'scrub' | MobileHop

const STAGE_RANK: Record<MobileStage, number> = {
  scrub: 0,
  term: 1,
  word: 2,
  center: 3,
}

const HOP_DURATION = 0.42
const HOP_EASE = 'power2.inOut'
/** Case→case box morph while parked (photo stays inside the surface). */
const CASE_MORPH_DURATION = 0.5
const CASE_MORPH_EASE = 'power2.inOut'
/**
 * Desktop kado→cases: one scrub corridor (same lag as hero→kado).
 * start = begin leaving the stone; end = fully on the case photo.
 * Shifted ~15% lower so the transition starts later on scroll down.
 */
const CASE_SCRUB_START = 'top 60%'
const CASE_SCRUB_END = 'top 18%'
/** Scroll-follow softness for the final Kado/center → case-media approach. */
const CASE_SCRUB_LAG = 0.13
/**
 * Global scroll-driven surface morph limit, in normalized morph segments/sec.
 * The route stays continuous through waypoints; only its velocity is clamped.
 */
const SURFACE_MORPH_MAX_VELOCITY = 1.55
const SURFACE_MORPH_EPSILON = 0.0008
/** Hand off just before the mobile case segment asymptotically settles at Kado. */
const MOBILE_CASE_REVERSE_HANDOFF_P = 0.12
/** Parked / fill fully opaque once lagged progress passes this. */
const CASE_PARK_P = 0.85
/**
 * Start a short geometry settle once the mobile surface visually reaches the
 * media. The settle follows the live card box, then pins at the exact endpoint.
 */
const MOBILE_CASE_SETTLE_P = 0.96
const MOBILE_CASE_SETTLE_DURATION = 0.18
/** Pin only at the true endpoint; pinning at 96% caused a visible 4% jump. */
const CASE_PIN_P = 0.999
/** Surface tone → case photo crossfade starts later in the case corridor. */
const CASE_FILL_FADE_START = 0.25
/** Ignore reverse hop triggers right after a forward hop (scroll bounce). */
const STAGE_FORWARD_LOCK_MS = HOP_DURATION * 1000 + 120
/** Mobile hero→stone scrub lag (seconds) — soft follow, not 1:1. Keep box+morph on same live P. */
const MOBILE_SCRUB_LAG = 0.08

const props = withDefaults(
  defineProps<{
    fromEl?: HTMLElement | null
    toEl?: HTMLElement | null
    /** Rock image — mobile scroll markers. */
    stoneEl?: HTMLElement | null
    /** Title + phonetic — hop after stone `top 10%`. */
    termEl?: HTMLElement | null
    /** “Kadoflow” word — hop at stone `center top`; square hop at word `top 20%`. */
    wordEl?: HTMLElement | null
    /** Body block — layout / capture; square hop uses wordEl when present. */
    bodyEl?: HTMLElement | null
    /** Cases section — desktop kado→case scrub trigger. */
    caseSectionEl?: HTMLElement | null
    /** Case mockup figure — scrub destination (surface occupies this box). */
    caseMediaEl?: HTMLElement | null
    plan?: SurfaceMorphPlan
    toneClass?: string
  }>(),
  {
    fromEl: null,
    toEl: null,
    stoneEl: null,
    termEl: null,
    wordEl: null,
    bodyEl: null,
    caseSectionEl: null,
    caseMediaEl: null,
    plan: () => heroToKadoPlan,
    toneClass: 'bg-stone',
  },
)

/** Shared with HomeCases — surface owns the case photo once docked. */
const caseSurfaceDocked = useState('home-case-surface-docked', () => false)
/** True only once the frame is physically pinned to the current case media. */
const caseSurfaceReady = useState('home-case-surface-ready', () => false)
/** Set by HomeCases after the first case raster has been decoded off the critical path. */
const caseMediaReady = useState('home-case-media-ready', () => false)
type CaseSurfaceMedia = {
  src: string
  alt: string
  wash: string
  video?: {
    webm: string
    mp4: string
    mobileWebm?: string
    mobileMp4?: string
    poster: string
  }
}

const caseSurfaceMedia = useState<CaseSurfaceMedia | null>(
  'home-case-surface-media',
  () => null,
)
/** Bumped by HomeCases after a case switch so we morph the parked box. */
const caseMediaMorphNonce = useState('home-case-media-morph-nonce', () => 0)
/** Emitted before HomeCases replaces its card, so a pinned surface can animate. */
const caseMediaPrepareNonce = useState('home-case-media-prepare-nonce', () => 0)

const BLANK_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/** Template: hide hero stage / show case fill. */
const showCaseFill = ref(false)
const fillFrontEl = ref<HTMLElement | null>(null)
const fillBackEl = ref<HTMLElement | null>(null)
const fillFrontSrc = ref(BLANK_IMAGE)
const fillFrontAlt = ref('')
const fillBackSrc = ref(BLANK_IMAGE)
const fillBackAlt = ref('')
/** Keep media metadata with each layer during a case-to-case wipe. */
const fillFrontMedia = ref<CaseSurfaceMedia | null>(null)
const fillBackMedia = ref<CaseSurfaceMedia | null>(null)
const fillFrontVideo = computed(() => fillFrontMedia.value?.video)
const fillBackVideo = computed(() => fillBackMedia.value?.video)

function setFillLayer(layer: 0 | 1, media: CaseSurfaceMedia) {
  if (layer === 0) {
    fillFrontSrc.value = media.src
    fillFrontAlt.value = media.alt
    fillFrontMedia.value = media
  } else {
    fillBackSrc.value = media.src
    fillBackAlt.value = media.alt
    fillBackMedia.value = media
  }
}
let activeFillLayer = 0
let photoSwitchTl: { kill: () => void } | null = null
let lastSwitchedSrc = ''

const caseFillOpacity = ref(0)
const surfaceToneOpacity = computed(() => {
  if (!showCaseFill.value) return 1
  return Math.max(0, Math.min(1, 1 - caseFillOpacity.value))
})

function setCaseSurfaceDocked(on: boolean) {
  caseSurfaceDocked.value = on
  showCaseFill.value = on
  if (on) {
    const media = caseSurfaceMedia.value
    if (media) {
      setFillLayer(activeFillLayer, media)
      lastSwitchedSrc = media.src
    }
    caseFillOpacity.value = 1
  } else {
    caseFillOpacity.value = 0
  }
}

const frame = ref<HTMLElement | null>(null)
const shellEl = ref<HTMLElement | null>(null)
const clipPathEl = ref<SVGPathElement | null>(null)
/** Teleport target for a pinned hop — null keeps the frame in the fixed shell. */
const pinTo = ref<HTMLElement | null>(null)
/** Hero-rest pose — stage keeps this size/origin; frame morphs around it. */
const stageRest = reactive({ top: 0, left: 0, w: 1, h: 1 })
const heroSectionEl = computed(() => {
  const el = props.fromEl
  if (!el) return null
  return (el.closest('section') as HTMLElement | null) ?? el
})

let trigger: { kill: () => void; progress: number } | null = null
let caseTrigger: { kill: () => void; progress: number } | null = null
let mobileTriggers: { kill: () => void }[] = []
let hopTween: { kill: () => void } | null = null
let caseMediaMorphTween: { kill: () => void } | null = null
let target = { h: 0, v: 0 }
let live = { h: 0, v: 0 }
let fromDoc: SurfaceBox | null = null
let toDoc: SurfaceBox | null = null
let lastCaseDoc: SurfaceBox | null = null
let fromPose: SurfaceBox | null = null
let toPose: SurfaceBox | null = null
let desktopTargetS = 0
let desktopLiveS = 0
/** True while lagged case progress is parked on the mockup. */
let caseMediaActive = false

let gsapMod: typeof import('gsap') | null = null
let stMod: typeof import('gsap/ScrollTrigger') | null = null

/** Mobile corridor state */
let mobileActive = false
/** Mobile center-square → case-media scrub progress. */
let mobileCaseProgress = 0
let mobileCaseTargetProgress = 0
let caseSettleTween: { kill: () => void } | null = null
/** Stays latched across case layout refreshes; clears only on a real reverse. */
let mobileCaseArrived = false
/** Frozen real box at the moment the mobile case corridor begins. */
let mobileCaseFromBox: SurfaceBox | null = null
/** Smooth bridge from a skipped mobile waypoint back into the Hero scrub. */
let mobileScrubBridge: {
  from: SurfaceBox
  fromMorph: number
  progress: number
} | null = null
let mobileStage: MobileStage = 'scrub'
let heroPose: SurfaceBox | null = null
let stonePose: SurfaceBox | null = null
let centerPose: SurfaceBox | null = null
let scrubStartY = 0
let scrubEndY = 0
/** Scroll scrub progress target / live (lagged) — 0…1 along hero→stone. */
let scrubTargetP = 0
let scrubLiveP = 0
let liveBox: SurfaceBox | null = null
/** Snapshot used as hop tween start (destination tracks live each frame). */
let hopFromBox: SurfaceBox | null = null
let hopProgress = 0
/** Last good Kadoflow box in *document* space — viewport via docToViewport. */
let lastWordDoc: SurfaceBox | null = null
/** Pin host currently holding the frame (term/word slot). */
let pinHost: HTMLElement | null = null
let pinRo: ResizeObserver | null = null
/** performance.now() until which reverse stage hops are ignored. */
let stageLockUntil = 0

let raf = 0
let lastTs = 0
let parseEase: ((name: string) => (t: number) => number) | null = null

const IDLE_EPS = 0.02

function useMobileCorridor() {
  return isAppleTouchDevice() || isNarrowViewport() || isCoarsePointer()
}

function nearTarget() {
  if (!Number.isFinite(live.h) || !Number.isFinite(live.v)) return true
  if (!Number.isFinite(target.h) || !Number.isFinite(target.v)) return true
  return (
    Math.abs(live.h - target.h) < 0.0008
    && Math.abs(live.v - target.v) < 0.0008
  )
}

function sectionOf(el: HTMLElement) {
  return (el.closest('section') as HTMLElement | null) ?? el
}

function syncStageRest(pose: SurfaceBox) {
  stageRest.top = pose.top
  stageRest.left = pose.left
  stageRest.w = Math.max(1, pose.width)
  stageRest.h = Math.max(1, pose.height)
}

function layoutMarginPx() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--layout-margin')
    .trim()
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : 8
}

function roundBox(box: SurfaceBox): SurfaceBox {
  return {
    top: Math.round(box.top),
    left: Math.round(box.left),
    width: Math.max(1, Math.round(box.width)),
    height: Math.max(1, Math.round(box.height)),
  }
}

/** Subpixel box for morph paint — integer round caused stair-steps on slow scrub. */
function morphBox(box: SurfaceBox): SurfaceBox {
  return {
    top: box.top,
    left: box.left,
    width: Math.max(1, box.width),
    height: Math.max(1, box.height),
  }
}

const BOX_EPS = 0.04

function boxesNear(a: SurfaceBox, b: SurfaceBox) {
  return (
    Math.abs(a.top - b.top) < BOX_EPS
    && Math.abs(a.left - b.left) < BOX_EPS
    && Math.abs(a.width - b.width) < BOX_EPS
    && Math.abs(a.height - b.height) < BOX_EPS
  )
}

function captureDesktopPoses() {
  if (!props.fromEl || !props.toEl) return false

  fromDoc = readDocBox(props.fromEl)
  // Target pose can be 0×0 before the stone image gives the parent height.
  toDoc = readDocBox(props.toEl) ?? (props.stoneEl ? readDocBox(props.stoneEl) : null)
  if (!fromDoc || !toDoc) return false

  const fromSection = sectionOf(props.fromEl)
  const toSection = sectionOf(props.toEl)

  const scrollStart = fromSection.getBoundingClientRect().top + window.scrollY
  fromPose = poseAtScrollY(fromDoc, scrollStart)

  const scrollEnd = scrollYForCenterCenter(toSection)
  toPose = poseAtScrollY(toDoc, scrollEnd)

  if (props.caseMediaEl) {
    lastCaseDoc = readDocBox(props.caseMediaEl)
  }

  mobileActive = false
  syncStageRest(fromPose)
  return true
}

function captureMobilePoses() {
  const hero = props.fromEl
  const stonePoseEl = props.toEl
  const stoneMark = props.stoneEl ?? props.toEl
  const term = props.termEl
  const body = props.bodyEl
  // Word is optional — line-fill creates it later; corridor must boot without it.
  if (!hero || !stonePoseEl || !stoneMark || !term || !body) return false

  const heroDoc = readDocBox(hero)
  const stoneDoc = readDocBox(stonePoseEl)
  if (!heroDoc || !stoneDoc) return false
  if (!readBox(term)) return false

  const heroSection = sectionOf(hero)
  scrubStartY = heroSection.getBoundingClientRect().top + window.scrollY
  scrubEndY = scrollYForTopAt(stoneMark, 0.1)

  heroPose = poseAtScrollY(heroDoc, scrubStartY)
  stonePose = poseAtScrollY(stoneDoc, scrubEndY)

  const pad = layoutMarginPx()
  const squareSize = Math.min(
    window.innerWidth - pad * 2,
    Math.max(stoneDoc.width, window.innerWidth * 0.72),
  )
  centerPose = viewportCenterSquare(squareSize)

  const wordDoc = readDocBox(props.wordEl)
  if (wordDoc) lastWordDoc = wordDoc

  mobileActive = true
  fromPose = heroPose
  toPose = centerPose
  syncStageRest(heroPose)
  return true
}

function capturePoses() {
  if (useMobileCorridor()) return captureMobilePoses()
  return captureDesktopPoses()
}

/** Mid-page reload / failed capture — align hero visibility to real scroll. */
function bootAlignHeroVisibility() {
  if (!props.fromEl) return
  const section = sectionOf(props.fromEl)
  const top = section.getBoundingClientRect().top + window.scrollY
  const y = window.scrollY
  // Still on the hero rest screen — never boot hidden (bad marker layout used to force morph=1).
  if (y <= top + window.innerHeight * 0.35) {
    flowSurfaceMask.morph = 0
    applyFlowSurfaceLive('hero')
    return
  }
  if (y > top + window.innerHeight * 0.12) {
    flowSurfaceMask.morph = 1
    applyFlowSurfaceLive('kado')
  }
}

/** Stone / scrub span must be real — collapsed layout falsely trips every hop. */
function markersReliable(): boolean {
  const stone = props.stoneEl
  if (!stone) return false
  if (stone.getBoundingClientRect().height < 120) return false
  if (!(scrubEndY > scrubStartY + window.innerHeight * 0.45)) return false
  return true
}

/** Paint hero rest even when full corridor capture is not ready yet. */
function ensureHeroRestPlaceholder() {
  if (!props.fromEl || !frame.value) return
  const doc = readDocBox(props.fromEl)
  if (!doc) return
  const section = sectionOf(props.fromEl)
  const y0 = section.getBoundingClientRect().top + window.scrollY
  const pose = poseAtScrollY(doc, y0)
  syncStageRest(pose)
  if (window.scrollY <= y0 + window.innerHeight * 0.35) {
    paintBox(pose, 0)
  }
}

function writeMaskBox(box: SurfaceBox, morph: number) {
  flowSurfaceMask.top = box.top
  flowSurfaceMask.left = box.left
  flowSurfaceMask.width = Math.max(1, box.width)
  flowSurfaceMask.height = Math.max(1, box.height)
  flowSurfaceMask.morph = Math.min(1, Math.max(0, morph))
  applyFlowSurfaceLive(flowSurfaceLiveFromMorph(morph, IDLE_EPS))
}

function paintBox(box: SurfaceBox, morph: number) {
  if (!frame.value || pinTo.value) return
  const next = morphBox(box)
  if (
    liveBox
    && boxesNear(next, liveBox)
    && Math.abs(flowSurfaceMask.morph - morph) < 0.001
  ) {
    return
  }
  liveBox = next
  writeMaskBox(next, morph)
  applyBox(frame.value, next)
  flushFlowSurfacePath(next)
}

function heroLivePose(): SurfaceBox | null {
  return readBox(props.fromEl) ?? (fromDoc ? docToViewport(fromDoc) : null)
}

function caseMediaPose(): SurfaceBox | null {
  const box = readBox(props.caseMediaEl)
  if (box) {
    lastCaseDoc = readDocBox(props.caseMediaEl)
    return box
  }
  return lastCaseDoc ? docToViewport(lastCaseDoc) : null
}

/** Live kado stone box — tracks element bounding box in viewport. */
function kadoLivePose(): SurfaceBox | null {
  return (
    readBox(props.toEl)
    ?? readBox(props.stoneEl)
    ?? (toDoc ? docToViewport(toDoc) : null)
  )
}

function computeDesktopTarget(): number {
  if (caseTrigger && caseTrigger.progress > 0) {
    return 1 + Math.min(1, Math.max(0, caseTrigger.progress))
  }
  if (trigger) {
    return Math.min(1, Math.max(0, trigger.progress))
  }
  return 0
}

function paintCaseMedia() {
  const dest = caseMediaPose()
  if (!dest) return false
  paintBox(dest, 1)
  return true
}

function paintHeroToKadoSegment(t: number) {
  if (showCaseFill.value || caseSurfaceDocked.value || caseMediaActive) {
    showCaseFill.value = false
    caseFillOpacity.value = 0
    caseMediaActive = false
    caseSurfaceDocked.value = false
    caseSurfaceReady.value = false
  }

  const { h, v } = targetsFromScrollProgress(props.plan, t, parseEase ?? ((_) => (u) => u))
  live.h = h
  live.v = v

  const hero = fromPose ?? heroLivePose()
  const kado = kadoLivePose()
  if (!hero && !kado) return
  if (!hero) {
    paintBox(kado!, 1)
    return
  }
  if (!kado) {
    paintBox(hero, 0)
    return
  }

  const box = mixBox(hero, kado, h, v)
  const morph = Math.min(h, v)
  paintBox(box, morph)
}

function paintKadoToCasesSegment(t: number) {
  const media = caseSurfaceMedia.value
  if (media && !photoSwitchTl) {
    setFillLayer(activeFillLayer, media)
    lastSwitchedSrc = media.src
  }

  const docked = t >= CASE_PARK_P
  if (docked !== caseMediaActive) {
    caseMediaActive = docked
    caseSurfaceDocked.value = docked
  }
  // Soft fade in for photo + desaturation of surface tone
  const fadeT = Math.min(1, Math.max(0, (t - CASE_FILL_FADE_START) / (1 - CASE_FILL_FADE_START)))
  showCaseFill.value = t > 0.005
  caseFillOpacity.value = fadeT

  const from = kadoLivePose()
  const to = caseMediaPose()
  if (!from && !to) return
  if (!to) {
    paintBox(from!, 1)
    return
  }
  if (!from) {
    paintBox(to, 1)
    return
  }
  if (t >= CASE_PIN_P) {
    pinCaseFrame()
    return
  }
  caseSurfaceReady.value = false
  if (caseFramePinned()) unpinFrame()
  // t===1 -> live photo; t===0 -> live stone. Same path both ways, no seam.
  paintBox(lerpBox(from, to, t), 1)
}

/** Mobile continues from its final center square into the case figure. */
function paintMobileCaseSegment(t: number) {
  const media = caseSurfaceMedia.value
  if (media && !photoSwitchTl) {
    setFillLayer(activeFillLayer, media)
    lastSwitchedSrc = media.src
  }

  const p = Math.min(1, Math.max(0, t))
  if (p < CASE_PARK_P && mobileCaseTargetProgress < CASE_PARK_P) {
    mobileCaseArrived = false
  }
  const docked = p >= CASE_PARK_P
  if (docked !== caseMediaActive) {
    caseMediaActive = docked
    caseSurfaceDocked.value = docked
  }
  showCaseFill.value = p > 0.005
  caseFillOpacity.value = Math.min(
    1,
    Math.max(0, (p - CASE_FILL_FADE_START) / (1 - CASE_FILL_FADE_START)),
  )

  // A case switch owns the geometry until its live destination is reached.
  if (caseMediaMorphTween) return

  if (!mobileCaseFromBox) {
    mobileCaseFromBox = liveBox
      ? { ...liveBox }
      : (centerPose ? { ...centerPose } : kadoLivePose())
  }
  const from = mobileCaseFromBox
  const to = caseMediaPose()
  if (!from && !to) return
  if (!to) {
    paintBox(from!, 1)
    return
  }
  if (!from) {
    paintBox(to, 1)
    return
  }
  if (caseSettleTween) return
  if (p >= CASE_PIN_P) {
    mobileCaseArrived = true
    paintBox(to, 1)
    pinCaseFrame()
    return
  }
  if (
    p >= MOBILE_CASE_SETTLE_P
    && mobileCaseTargetProgress >= 1 - SURFACE_MORPH_EPSILON
  ) {
    settleMobileCaseFrame(to)
    return
  }
  // Fast reverse scrolling can fire the skipped term/word threshold callbacks
  // while this corridor still owns the visual. Release any pin, not only the
  // case-media pin, otherwise paintBox() is blocked and the surface freezes at
  // that stale waypoint until the corridor ends.
  caseSurfaceReady.value = false
  if (pinTo.value) unpinFrame()
  paintBox(lerpBox(from, to, p), 1)
}

/** Smooth the last few pixels into the live media box before Teleport pins it. */
function settleMobileCaseFrame(initialDest: SurfaceBox) {
  if (!gsapMod || !frame.value || caseSettleTween || caseFramePinned()) return

  const start = liveBox ? { ...liveBox } : { ...initialDest }
  let fallbackDest = { ...initialDest }
  const proxy = { t: 0 }
  caseSurfaceReady.value = false
  caseSettleTween = gsapMod.default.to(proxy, {
    t: 1,
    duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : MOBILE_CASE_SETTLE_DURATION,
    ease: 'power2.out',
    onUpdate: () => {
      const liveDest = caseMediaPose()
      if (liveDest) fallbackDest = { ...liveDest }
      paintBox(lerpBox(start, fallbackDest, proxy.t), 1)
    },
    onComplete: () => {
      caseSettleTween = null
      mobileCaseProgress = 1
      mobileCaseArrived = true
      caseMediaActive = true
      caseSurfaceDocked.value = true
      paintBox(caseMediaPose() ?? fallbackDest, 1)
      pinCaseFrame()
    },
  })
}

function killCaseSettleTween() {
  caseSettleTween?.kill()
  caseSettleTween = null
}

function paintDesktop(s = desktopLiveS) {
  if (mobileActive) return
  // Case<->case morph in flight — onUpdate owns paint.
  if (hopTween || caseMediaMorphTween) return

  const { segmentIndex, localT } = resolveCorridorSegment(s, 2)
  if (segmentIndex === 1) {
    paintKadoToCasesSegment(localT)
  } else {
    paintHeroToKadoSegment(localT)
  }
}

/** While parked: morph surface box to the current case media figure (case switch). */
function morphParkedCaseMedia(animate: boolean) {
  if (
    (!mobileActive && desktopLiveS < (1 + CASE_PARK_P))
    || (mobileActive && !mobileCaseArrived && mobileCaseProgress < CASE_PARK_P)
    || !gsapMod
    || !frame.value
  ) return
  if (caseFramePinned()) {
    syncPinnedMask()
    return
  }
  const dest = caseMediaPose()
  if (!dest) return

  const from = liveBox ?? dest
  if (
    !animate
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    paintBox(dest, 1)
    if (caseFrameShouldBePinned()) pinCaseFrame()
    return
  }

  // Don't fight mobile hop / other tweens.
  if (hopTween || caseMediaMorphTween) return

  caseSurfaceReady.value = false

  const morphFrom = { ...from }
  const gsap = gsapMod.default
  const proxy = { t: 0 }
  let fallbackDest = { ...dest }
  caseMediaMorphTween = gsap.to(proxy, {
    t: 1,
    duration: CASE_MORPH_DURATION,
    ease: CASE_MORPH_EASE,
    onUpdate: () => {
      const liveDest = caseMediaPose()
      if (liveDest) fallbackDest = { ...liveDest }
      paintBox(lerpBox(morphFrom, fallbackDest, proxy.t), 1)
    },
    onComplete: () => {
      caseMediaMorphTween = null
      paintBox((caseMediaPose() ?? fallbackDest), 1)
      caseMediaActive = true
      caseSurfaceDocked.value = true
      // A case switch temporarily releases the Teleport so the frame can
      // interpolate between two card geometries. Reattach it immediately once
      // the morph has finished instead of waiting for another scroll update.
      if (caseFrameShouldBePinned()) pinCaseFrame()
    },
  })
}

/**
 * Sequential photo wipe on case switch:
 * 1. Morph the frame to the next case dimensions while the old photo remains.
 * 2. Old photo collapses right-to-left: inset(0 0% 0 0) -> inset(0 100% 0 0)
 * 3. After a short empty beat, the new photo expands left-to-right.
 */
function switchCasePhoto(media: CaseSurfaceMedia, animate: boolean) {
  if (lastSwitchedSrc === media.src) {
    // A second nonce is emitted after the case DOM/image has committed.
    // The source is unchanged, but the figure's intrinsic height may not be.
    morphParkedCaseMedia(animate)
    return
  }
  lastSwitchedSrc = media.src

  const isVisibleInCases = showCaseFill.value || desktopLiveS >= 0.85 || mobileCaseProgress > 0.005 || caseMediaActive

  if (
    !animate
    || !isVisibleInCases
    || !gsapMod
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    photoSwitchTl?.kill()
    photoSwitchTl = null
    if (activeFillLayer === 0) {
      setFillLayer(0, media)
      if (fillFrontEl.value && gsapMod) {
        gsapMod.default.set(fillFrontEl.value, { clipPath: 'inset(0 0% 0 0)', autoAlpha: 1 })
      }
      if (fillBackEl.value && gsapMod) {
        gsapMod.default.set(fillBackEl.value, { clipPath: 'inset(0 100% 0 0)', autoAlpha: 0 })
      }
    } else {
      setFillLayer(1, media)
      if (fillBackEl.value && gsapMod) {
        gsapMod.default.set(fillBackEl.value, { clipPath: 'inset(0 0% 0 0)', autoAlpha: 1 })
      }
      if (fillFrontEl.value && gsapMod) {
        gsapMod.default.set(fillFrontEl.value, { clipPath: 'inset(0 100% 0 0)', autoAlpha: 0 })
      }
    }
    morphParkedCaseMedia(false)
    return
  }

  const gsap = gsapMod.default
  photoSwitchTl?.kill()

  const curEl = activeFillLayer === 0 ? fillFrontEl.value : fillBackEl.value
  const nextEl = activeFillLayer === 0 ? fillBackEl.value : fillFrontEl.value

  setFillLayer(activeFillLayer === 0 ? 1 : 0, media)

  if (!curEl || !nextEl) {
    morphParkedCaseMedia(true)
    return
  }

  // Next layer starts collapsed on left (inset(0 100% 0 0))
  gsap.set(nextEl, { clipPath: 'inset(0 100% 0 0)', autoAlpha: 1 })

  const tl = gsap.timeline({
    onComplete: () => {
      activeFillLayer = activeFillLayer === 0 ? 1 : 0
      gsap.set(curEl, { clipPath: 'inset(0 100% 0 0)', autoAlpha: 0 })
      photoSwitchTl = null
    },
  })
  photoSwitchTl = tl

  // Step 1: settle the surface geometry before touching either photo.
  tl.call(() => {
    morphParkedCaseMedia(true)
  }, undefined, 0)

  // Step 2: the old image leaves only after the size morph has completed.
  tl.to(curEl, {
    clipPath: 'inset(0 100% 0 0)',
    duration: 0.5,
    ease: 'power2.in',
  }, CASE_MORPH_DURATION)

  tl.set(curEl, { autoAlpha: 0 }, CASE_MORPH_DURATION + 0.52)

  // Step 3: only after the old layer has gone does the next one appear.
  tl.to(nextEl, {
    clipPath: 'inset(0 0% 0 0)',
    duration: 0.75,
    ease: 'power2.out',
  }, CASE_MORPH_DURATION + 0.64)
}

function scrubProgressAt(scrollY: number) {
  const span = scrubEndY - scrubStartY
  // Collapsed / pre-layout span used to map scrollY≈0 → morph≈1 and hide hero on first paint.
  if (!(span > window.innerHeight * 0.45)) {
    if (props.fromEl) {
      const heroTop = sectionOf(props.fromEl).getBoundingClientRect().top
      // Hero still in view → hard rest.
      if (heroTop > -window.innerHeight * 0.25) return 0
    }
    return 0
  }
  return Math.min(1, Math.max(0, (scrollY - scrubStartY) / span))
}

function paintScrubAt(p: number) {
  if (!heroPose || !stonePose) {
    ensureHeroRestPlaceholder()
    return
  }
  // Linear box+morph from the same P — lag only on scrubLiveP (stage/copy/GL stay in phase).
  const t = Math.min(1, Math.max(0, p))
  paintBox(lerpBox(heroPose, stonePose, t), t)
}

function paintHeroRest() {
  mobileScrubBridge = null
  scrubLiveP = 0
  scrubTargetP = 0
  if (heroPose) paintBox(heroPose, 0)
}

/**
 * Scrub paint. Default: set scroll target and lag toward it.
 * `snap` locks live=target for boot / stage entry.
 */
function paintScrub(scrollY = window.scrollY, snap = false) {
  if (!heroPose || !stonePose) {
    ensureHeroRestPlaceholder()
    return
  }
  const p = scrubProgressAt(scrollY)
  scrubTargetP = p
  if (snap) {
    mobileScrubBridge = null
    scrubLiveP = p
    paintScrubAt(p)
    return
  }
  ensureTick()
}

/** Pin slot inside a hop target (`[data-flow-pin]`), else the target itself. */
function pinSlot(hop: Exclude<MobileHop, 'center'>): HTMLElement | null {
  if (hop === 'term') {
    const term = props.termEl
    if (!term) return null
    return (term.querySelector('[data-flow-pin]') as HTMLElement | null) ?? term
  }
  const word = props.wordEl
  if (!word) return null
  return (word.querySelector('[data-flow-pin]') as HTMLElement | null) ?? word
}

function syncPinnedMask() {
  const el = frame.value
  if (!el || !pinTo.value) return
  const r = el.getBoundingClientRect()
  const box = roundBox({
    top: r.top,
    left: r.left,
    width: Math.max(1, r.width),
    height: Math.max(1, r.height),
  })
  if (
    liveBox
    && box.top === liveBox.top
    && box.left === liveBox.left
    && box.width === liveBox.width
    && box.height === liveBox.height
  ) {
    return
  }
  liveBox = box
  writeMaskBox(box, 1)
  flushFlowSurfacePath(box)
}

function caseFramePinned() {
  return !!props.caseMediaEl && pinTo.value === props.caseMediaEl
}

/** The frame may only re-enter the card once this corridor has fully arrived. */
function caseFrameShouldBePinned() {
  return mobileActive
    ? mobileCaseArrived || mobileCaseProgress >= CASE_PIN_P
    : desktopLiveS >= 1 + CASE_PIN_P
}

/** Park the completed surface inside the case figure so it scrolls with content. */
function pinCaseFrame() {
  const host = props.caseMediaEl
  const el = frame.value
  if (!host || !el) return
  if (pinTo.value === host) {
    syncPinnedMask()
    caseSurfaceReady.value = true
    return
  }

  unpinFrame()
  pinHost = host
  el.style.position = 'absolute'
  el.style.top = '0px'
  el.style.left = '0px'
  el.style.width = '100%'
  el.style.height = '100%'
  el.style.right = 'auto'
  el.style.bottom = 'auto'
  el.style.transform = ''
  pinTo.value = host

  pinRo?.disconnect()
  pinRo = new ResizeObserver(() => syncPinnedMask())
  pinRo.observe(host)
  void nextTick(() => {
    syncPinnedMask()
    caseSurfaceReady.value = pinTo.value === host
  })
}

function unpinFrame() {
  const el = frame.value
  if (!pinTo.value || !el) return
  const r = el.getBoundingClientRect()
  pinRo?.disconnect()
  pinRo = null
  const box = roundBox({
    top: r.top,
    left: r.left,
    width: Math.max(1, r.width),
    height: Math.max(1, r.height),
  })
  // Freeze in viewport coords so the teleport back to the shell doesn't jump.
  el.style.position = 'fixed'
  applyBox(el, box)
  liveBox = box
  writeMaskBox(box, 1)
  flushFlowSurfacePath(box)
  pinTo.value = null
  pinHost = null
  void nextTick(() => {
    if (!frame.value || pinTo.value) return
    frame.value.style.position = 'absolute'
    applyBox(frame.value, box)
  })
}

function pinFrame(hop: Exclude<MobileHop, 'center'>) {
  if (!stageChangesAllowed()) {
    return
  }
  const host = pinSlot(hop)
  const el = frame.value
  if (!host || !el) return
  if (pinTo.value === host) {
    syncPinnedMask()
    return
  }
  unpinFrame()
  pinHost = host
  el.style.top = '0px'
  el.style.left = '0px'
  el.style.width = '100%'
  el.style.height = '100%'
  el.style.right = 'auto'
  el.style.bottom = 'auto'
  el.style.transform = ''
  pinTo.value = host
  pinRo?.disconnect()
  pinRo = new ResizeObserver(() => {
    if (!stageChangesAllowed()) return
    syncPinnedMask()
  })
  pinRo.observe(host)
  void nextTick(() => syncPinnedMask())
}

function settleHop(hop: MobileHop) {
  if (hop === 'term' || hop === 'word') pinFrame(hop)
}

/** Live viewport box for “Kadoflow” — pin slot already includes margin pad. */
function wordPose(): SurfaceBox | null {
  const slot = pinSlot('word')
  const live = readBox(slot)
  if (live) {
    const doc = readDocBox(slot)
    if (doc) lastWordDoc = doc
    return live
  }
  if (lastWordDoc) return docToViewport(lastWordDoc)
  return null
}

/** Live viewport box for the hop destination. */
function hopPose(hop: MobileHop): SurfaceBox | null {
  if (hop === 'term') return readBox(pinSlot('term')) ?? readBox(props.termEl)
  if (hop === 'word') return wordPose()
  return centerPose
}

function killHopTween() {
  hopTween?.kill()
  hopTween = null
  mobileScrubBridge = null
  hopFromBox = null
  hopProgress = 0
}

/**
 * Single entry for stage changes.
 * Forward-lock only blocks reverse *bounce* right after an animated forward hop;
 * intentional upward scroll clears the lock.
 */
function requestStage(next: MobileStage, animate: boolean) {
  if (!stageChangesAllowed() && next !== 'scrub') {
    // During quiet boot only allow snapping back to scrub paint — never pin.
    if (next === 'scrub' && mobileStage !== 'scrub') {
      mobileStage = 'scrub'
      killHopTween()
      paintHeroRest()
    }
    return
  }

  const now = typeof performance !== 'undefined' ? performance.now() : 0
  const curRank = STAGE_RANK[mobileStage]
  const nextRank = STAGE_RANK[next]

  if (next === mobileStage && !hopTween) return
  if (next === mobileStage && hopTween) return

  if (nextRank < curRank && now < stageLockUntil) return

  // Lock only for animated forward hops (not boot snaps).
  if (animate && nextRank > curRank) {
    stageLockUntil = now + STAGE_FORWARD_LOCK_MS
  }

  if (next === 'scrub') enterScrub(animate)
  else tweenToHop(next, animate)
}

function tweenToHop(hop: MobileHop, animate: boolean) {
  if (!gsapMod || !frame.value) return
  const dest = hopPose(hop)
  if (!dest) return

  const wasPinned = !!pinTo.value
  const fromRect = wasPinned ? frame.value.getBoundingClientRect() : null
  unpinFrame()
  mobileStage = hop
  killHopTween()

  const startHop = () => {
    if (!frame.value) return
    if (fromRect) {
      const from = roundBox({
        top: fromRect.top,
        left: fromRect.left,
        width: Math.max(1, fromRect.width),
        height: Math.max(1, fromRect.height),
      })
      applyBox(frame.value, from)
      liveBox = from
    }
    const from = liveBox ?? dest
    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      paintBox(dest, 1)
      settleHop(hop)
      return
    }

    let fallbackDest = { ...dest }
    hopFromBox = { ...from }
    hopProgress = 0
    const gsap = gsapMod!.default
    const proxy = { t: 0 }
    hopTween = gsap.to(proxy, {
      t: 1,
      duration: HOP_DURATION,
      ease: HOP_EASE,
      onUpdate: () => {
        hopProgress = proxy.t
        const liveDest = hopPose(hop)
        if (liveDest) fallbackDest = { ...liveDest }
        paintBox(lerpBox(hopFromBox!, fallbackDest, hopProgress), 1)
      },
      onComplete: () => {
        hopTween = null
        hopFromBox = null
        hopProgress = 0
        const finalDest = hopPose(hop) ?? fallbackDest
        paintBox(finalDest, 1)
        settleHop(hop)
      },
    })
  }

  if (wasPinned) void nextTick(startHop)
  else startHop()
}

/**
 * Hand control back to the scrub corridor. A skipped multi-waypoint reverse
 * uses the same normalized velocity cap instead of snapping center → Hero.
 */
function enterScrub(animate: boolean, fromOverride?: SurfaceBox | null) {
  const current = fromOverride ?? readBox(frame.value) ?? liveBox
  const currentMorph = flowSurfaceMask.morph
  mobileStage = 'scrub'
  killHopTween()
  const wasPinned = !!pinTo.value
  unpinFrame()
  const paint = () => {
    if (!heroPose || !stonePose) return
    const p = scrubProgressAt(window.scrollY)
    scrubTargetP = p
    if (
      !animate
      || !current
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      scrubLiveP = p
      paintScrubAt(p)
      return
    }
    mobileScrubBridge = {
      from: { ...current },
      fromMorph: currentMorph,
      progress: 0,
    }
    // Threshold callbacks may have pinned the DOM to an already skipped
    // waypoint. Restore the case corridor's last actually painted box before
    // the bridge starts so no stale pin flashes for one frame.
    paintBox(current, currentMorph)
    ensureTick()
  }
  if (wasPinned) void nextTick(paint)
  else paint()
}

function stageFromScroll(): MobileStage {
  const stoneMark = props.stoneEl ?? props.toEl
  const body = props.bodyEl
  if (!stoneMark || !body) return 'scrub'

  const y = window.scrollY
  // Body needed for corridor capture; square hop prefers the Kadoflow word.
  // During boot / unloaded stone image, markers sit near 0 and every hop looks “active”.
  if (!markersReliable()) {
    if (props.fromEl) {
      const top =
        sectionOf(props.fromEl).getBoundingClientRect().top + window.scrollY
      if (y <= top + window.innerHeight * 0.85) return 'scrub'
    }
    // Mid-page with bad markers — keep current stage, don't invent hops.
    return mobileStage
  }

  // Kadoflow `top 20%` — start hop to unbound square (fallback: body center).
  const squareMark = props.wordEl ?? body
  const squareAt = props.wordEl ? 0.2 : 0.5
  if (y >= scrollYForTopAt(squareMark, squareAt)) return 'center'
  if (y >= scrollYForCenterTop(stoneMark)) return 'word'
  if (y >= scrollYForTopAt(stoneMark, 0.1)) return 'term'
  return 'scrub'
}

function syncMobileStage(animate: boolean) {
  requestStage(stageFromScroll(), animate)
}

let lastScrollY = 0
/** Ignore ST onEnter/onLeaveBack while boot layout is settling. */
let suppressStageCallbacks = false
let layoutResyncTimers: number[] = []
let removeLayoutResync: (() => void) | null = null
/** fonts.ready is already resolved after first load — re-then() must not loop. */
let fontsResyncBound = false
let captureFailCount = 0

function clearLayoutResync() {
  for (const id of layoutResyncTimers) window.clearTimeout(id)
  layoutResyncTimers = []
  removeLayoutResync?.()
  removeLayoutResync = null
}

function scheduleCaptureRetry() {
  captureFailCount += 1
  if (captureFailCount > 10) {
    return
  }
  const delay = Math.min(60 * captureFailCount, 480)
  layoutResyncTimers.push(
    window.setTimeout(() => {
      resyncAfterLayout()
    }, delay),
  )
}

function scheduleLayoutResync() {
  clearLayoutResync()
  // Fewer beats — each used to stack with a second full morph on SPA home entry.
  const delays = [120, 500, 1400]
  for (const ms of delays) {
    layoutResyncTimers.push(
      window.setTimeout(() => {
        resyncAfterLayout()
      }, ms),
    )
  }

  const stone = props.stoneEl
  const onStone = () => resyncAfterLayout()
  if (stone instanceof HTMLImageElement) {
    if (!stone.complete) {
      stone.addEventListener('load', onStone, { once: true })
      removeLayoutResync = () => stone.removeEventListener('load', onStone)
    }
  }

  // Only bind once: document.fonts.ready stays resolved forever after first load.
  // Re-arming .then() on every capture-fail → infinite morph.start/fail/end microtasks.
  if (!fontsResyncBound && document.fonts?.ready) {
    fontsResyncBound = true
    void document.fonts.ready.then(() => {
      resyncAfterLayout()
    })
  }
}

function resyncAfterLayout() {
  if (!gsapMod || !stMod || !frame.value) return
  if (!props.fromEl || !props.toEl) return
  if (morphBooting) return
  // Corridor never built (first paint missed refs) — full rebuild, not a soft sync.
  if (mobileTriggers.length === 0 && !trigger) {
    buildMorph()
    return
  }
  const ok = capturePoses()
  if (!ok) {
    ensureHeroRestPlaceholder()
    bootAlignHeroVisibility()
    scheduleCaptureRetry()
    return
  }
  captureFailCount = 0
  if (mobileActive) {
    suppressStageCallbacks = true
    // Paint only — pin/Teleport here re-enters ST refresh and freezes the tab.
    if (mobileCaseProgress > 0.005) {
      paintMobileCaseSegment(mobileCaseProgress)
    } else if (mobileStage === 'scrub' || !stageChangesAllowed()) {
      if (heroPose && scrubProgressAt(window.scrollY) < 0.05) paintHeroRest()
      else paintScrub(window.scrollY, true)
    } else if (mobileStage === 'center' && centerPose) {
      paintBox(centerPose, 1)
    }
    // Soft resync during quiet window: paint only. Full ST refresh waits until settle.
    if (stageChangesAllowed()) {
      scheduleDeferredRefresh(stMod.ScrollTrigger)
    }
    if (scrubProgressAt(window.scrollY) < 0.02 && heroPose) {
      mobileStage = 'scrub'
      paintHeroRest()
    }
    suppressStageCallbacks = false
    // Stage hops only after quiet window — never from layout thrash mid-boot.
    if (stageChangesAllowed()) {
      requestAnimationFrame(() => {
        if (stageChangesAllowed()) syncMobileStage(false)
      })
    }
  } else if (trigger) {
    paintDesktop()
    ensureTick()
  }
}

/** Scroll-driven stage reconcile — catches missed leaveBacks when scrolling up. */
function reconcileFromScroll() {
  if (!stageChangesAllowed()) {
    if (mobileStage === 'scrub' && !hopTween) paintScrub()
    return
  }
  const y = window.scrollY
  const scrollingUp = y < lastScrollY - 1
  if (scrollingUp) {
    // Intentional upward scroll — don't let forward-lock trap the reverse path.
    stageLockUntil = 0
  }
  lastScrollY = y

  // The case corridor owns the frame after the center-square stage.
  if (mobileCaseArrived || mobileCaseProgress > 0.005) return

  if (mobileScrubBridge) {
    scrubTargetP = scrubProgressAt(y)
    ensureTick()
    return
  }

  const next = stageFromScroll()
  if (next === mobileStage) {
    if (next === 'scrub' && !hopTween) paintScrub()
    else if (next === 'center' && !hopTween && centerPose) paintBox(centerPose, 1)
    return
  }

  // Don't yank an in-flight forward hop back on threshold flicker —
  // but do interrupt when the user is clearly scrolling up.
  if (hopTween && STAGE_RANK[next] < STAGE_RANK[mobileStage] && !scrollingUp) return

  // Animate hop↔hop both directions (scrub entry stays a snap via enterScrub).
  requestStage(next, next !== 'scrub')
}

function tick(now: number) {
  raf = 0
  if (!lastTs) lastTs = now
  const dt = Math.min(0.064, Math.max(0, (now - lastTs) / 1000))
  lastTs = now

  // Mobile scrub: light lag toward scroll target (box + morph share scrubLiveP).
  if (mobileActive) {
    if (
      mobileCaseFromBox
      && (
        mobileCaseProgress > SURFACE_MORPH_EPSILON
        || mobileCaseTargetProgress > SURFACE_MORPH_EPSILON
      )
    ) {
      mobileCaseProgress = updateContinuousProgress(
        mobileCaseProgress,
        mobileCaseTargetProgress,
        dt,
        {
          lag: CASE_SCRUB_LAG,
          maxVelocity: SURFACE_MORPH_MAX_VELOCITY,
          epsilon: SURFACE_MORPH_EPSILON,
        },
      )
      paintMobileCaseSegment(mobileCaseProgress)
      const handOffReverse =
        mobileCaseTargetProgress <= SURFACE_MORPH_EPSILON
        && mobileCaseProgress <= MOBILE_CASE_REVERSE_HANDOFF_P
      if (handOffReverse) {
        const handoffBox = liveBox ? { ...liveBox } : readBox(frame.value)
        mobileCaseProgress = 0
        mobileCaseFromBox = null
        showCaseFill.value = false
        caseFillOpacity.value = 0
        // A fast reverse can cross every mobile waypoint while the case
        // corridor still owns the frame. Resume from the current box without
        // waiting for another touch/wheel event or decelerating to rest at Kado.
        if (stageChangesAllowed()) {
          const next = stageFromScroll()
          // Threshold callbacks may already have changed `mobileStage` while
          // the case corridor was still painting over them. Resume from the
          // frame's real current box even when the logical stage already
          // equals the destination.
          if (next === 'scrub') enterScrub(true, handoffBox)
          else tweenToHop(next, true)
        }
      } else if (
        Math.abs(mobileCaseTargetProgress - mobileCaseProgress)
        >= SURFACE_MORPH_EPSILON
      ) {
        raf = requestAnimationFrame(tick)
      }
      return
    }

    if (mobileScrubBridge && heroPose && stonePose) {
      const bridge = mobileScrubBridge
      bridge.progress = updateContinuousProgress(bridge.progress, 1, dt, {
        lag: MOBILE_SCRUB_LAG,
        maxVelocity: SURFACE_MORPH_MAX_VELOCITY,
        epsilon: SURFACE_MORPH_EPSILON,
      })
      const p = scrubProgressAt(window.scrollY)
      scrubTargetP = p
      const to = lerpBox(heroPose, stonePose, p)
      const morph = bridge.fromMorph + (p - bridge.fromMorph) * bridge.progress
      paintBox(lerpBox(bridge.from, to, bridge.progress), morph)
      if (bridge.progress < 1 - SURFACE_MORPH_EPSILON) {
        raf = requestAnimationFrame(tick)
      } else {
        mobileScrubBridge = null
        scrubLiveP = p
        paintScrubAt(p)
      }
      return
    }

    if (mobileStage === 'scrub' && !hopTween && !pinTo.value && heroPose && stonePose) {
      scrubLiveP = updateContinuousProgress(scrubLiveP, scrubTargetP, dt, {
        lag: MOBILE_SCRUB_LAG,
        maxVelocity: SURFACE_MORPH_MAX_VELOCITY,
        epsilon: SURFACE_MORPH_EPSILON,
      })
      paintScrubAt(scrubLiveP)
      if (Math.abs(scrubTargetP - scrubLiveP) >= SURFACE_MORPH_EPSILON) {
        raf = requestAnimationFrame(tick)
      }
    }
    return
  }

  const sTarget = computeDesktopTarget()
  const snapMorph = useMobileCorridor()
  if (snapMorph) {
    desktopLiveS = sTarget
    paintDesktop(sTarget)
    return
  }

  if (!Number.isFinite(sTarget)) {
    desktopLiveS = 0
    paintDesktop(0)
    return
  }

  // One continuous target across Hero → Kado → Cases. Never retarget to the
  // middle waypoint: that made the exponential follow decelerate to rest at
  // Kado before it was allowed to continue toward Hero.
  const touchesCaseSegment = desktopLiveS > 1 || sTarget > 1
  desktopLiveS = updateContinuousProgress(desktopLiveS, sTarget, dt, {
    lag: touchesCaseSegment ? CASE_SCRUB_LAG : props.plan.lag,
    maxVelocity: SURFACE_MORPH_MAX_VELOCITY,
    epsilon: SURFACE_MORPH_EPSILON,
  })

  paintDesktop(desktopLiveS)

  if (Math.abs(sTarget - desktopLiveS) >= SURFACE_MORPH_EPSILON) {
    raf = requestAnimationFrame(tick)
  }
}

function ensureTick() {
  if (!raf) {
    lastTs = 0
    raf = requestAnimationFrame(tick)
  }
}

function killMorph() {
  trigger?.kill()
  trigger = null
  caseTrigger?.kill()
  caseTrigger = null
  desktopTargetS = 0
  desktopLiveS = 0
  mobileCaseProgress = 0
  mobileCaseTargetProgress = 0
  mobileCaseArrived = false
  mobileCaseFromBox = null
  mobileScrubBridge = null
  caseMediaActive = false
  setCaseSurfaceDocked(false)
  caseSurfaceReady.value = false
  for (const t of mobileTriggers) t.kill()
  mobileTriggers = []
  killHopTween()
  caseMediaMorphTween?.kill()
  caseMediaMorphTween = null
  killCaseSettleTween()
  unpinFrame()
  pinRo?.disconnect()
  pinRo = null
  clearLayoutResync()
  suppressStageCallbacks = false
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
}

/** Last corridor identity — skip full rebuild when only stone/term/body refs settle. */
let lastFromEl: HTMLElement | null = null
let lastToEl: HTMLElement | null = null
let lastPlan: SurfaceMorphPlan | null = null
let lastCaseSectionEl: HTMLElement | null = null
let lastCaseMediaEl: HTMLElement | null = null

/** Prevent re-entrant buildMorph ↔ ScrollTrigger.refresh softlocks (SPA return to `/`). */
let morphGen = 0
let morphWatchTimer = 0
let morphBooting = false
/** After SPA mount, markers/layout thrash — pin/Teleport here freezes the tab. */
let morphQuietUntil = 0
let refreshDepth = 0

function stageChangesAllowed() {
  if (morphBooting || suppressStageCallbacks) return false
  if (typeof performance !== 'undefined' && performance.now() < morphQuietUntil) {
    return false
  }
  return true
}

function beginMorphQuiet(ms = 1600) {
  if (typeof performance === 'undefined') return
  morphQuietUntil = Math.max(morphQuietUntil, performance.now() + ms)
}

function safeRefresh(ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger) {
  if (ScrollTrigger.isRefreshing || refreshDepth > 0) {
    return
  }
  refreshDepth += 1
  try {
    ScrollTrigger.refresh()
  } catch {
    /* refresh can race with teardown */
  } finally {
    refreshDepth -= 1
  }
}

/** Keep ScrollTrigger.refresh off the first home-entry frame (felt as a hitch). */
function scheduleDeferredRefresh(
  ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger,
  after?: () => void,
) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      safeRefresh(ScrollTrigger)
      after?.()
    })
  })
}

function buildMobileMorph(gsap: typeof import('gsap').default, ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger) {
  const stoneMark = props.stoneEl ?? props.toEl
  const body = props.bodyEl
  const triggerFrom = sectionOf(props.fromEl!)
  if (!stoneMark || !body || !heroPose || !stonePose) return

  // Block stage/pin changes while ST is sorting itself out — Teleport pin during
  // refresh is what hard-froze the tab on logo→home navigations.
  suppressStageCallbacks = true

  // Stage reconcile (missed leaveBacks when scrolling up).
  mobileTriggers.push(
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: () => {
        if (!stageChangesAllowed()) return
        reconcileFromScroll()
      },
    }),
  )

  // 5) Continue the final mobile surface square into the case image.
  // The case figure is the destination, so it also follows dynamic content height.
  if (props.caseSectionEl && props.caseMediaEl) {
    mobileTriggers.push(
      ScrollTrigger.create({
        trigger: props.caseSectionEl,
        start: CASE_SCRUB_START,
        end: CASE_SCRUB_END,
        invalidateOnRefresh: true,
        onEnter: () => {
          if (caseMediaMorphTween) return
          const current = readBox(frame.value) ?? liveBox
          mobileCaseFromBox = current ? { ...current } : null
          // A waypoint hop may still be settling when a fast swipe reaches cases.
          // From here the scroll corridor owns the frame, exactly like desktop.
          killHopTween()
          killCaseSettleTween()
          unpinFrame()
          caseSurfaceReady.value = false
          if (mobileCaseFromBox) paintBox(mobileCaseFromBox, 1)
        },
        onUpdate: (self) => {
          mobileCaseTargetProgress = self.progress
          if (
            caseSettleTween
            && mobileCaseTargetProgress < MOBILE_CASE_SETTLE_P
          ) {
            killCaseSettleTween()
          }
          ensureTick()
        },
        onRefresh: (self) => {
          // Layout refresh is not user motion: align immediately so a restored
          // scroll position does not animate in from a stale box.
          mobileCaseTargetProgress = self.progress
          mobileCaseProgress = self.progress
          if (mobileCaseProgress > 0.005) paintMobileCaseSegment(mobileCaseProgress)
        },
        onLeaveBack: () => {
          mobileCaseTargetProgress = 0
          ensureTick()
        },
      }),
    )
  }

  // 1) Scrub hero → stone until stone `top 10%`.
  mobileTriggers.push(
    ScrollTrigger.create({
      trigger: triggerFrom,
      start: 'top top',
      endTrigger: stoneMark,
      end: 'top 10%',
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        if (mobileStage !== 'scrub') return
        scrubTargetP = self.progress
        ensureTick()
      },
      onRefresh: () => {
        captureMobilePoses()
        if (hopTween || !stageChangesAllowed()) {
          if (heroPose && scrubProgressAt(window.scrollY) < 0.05) paintHeroRest()
          return
        }
        if (typeof performance !== 'undefined' && performance.now() < stageLockUntil) return
        // Refresh: only repaint — never requestStage/pin (that re-enters refresh).
        if (!markersReliable() && scrubProgressAt(window.scrollY) < 0.02) {
          if (heroPose) paintHeroRest()
          return
        }
        if (mobileStage === 'scrub') paintScrub(window.scrollY, true)
      },
    }),
  )

  // 2–4) Threshold triggers (forward hops). Upward path also covered by reconcileFromScroll.
  mobileTriggers.push(
    ScrollTrigger.create({
      trigger: stoneMark,
      start: 'top 10%',
      invalidateOnRefresh: true,
      onEnter: () => {
        if (!stageChangesAllowed()) return
        requestStage('term', true)
      },
      onLeaveBack: () => {
        if (!stageChangesAllowed()) return
        requestStage('scrub', false)
      },
    }),
  )

  mobileTriggers.push(
    ScrollTrigger.create({
      trigger: stoneMark,
      start: 'center top',
      invalidateOnRefresh: true,
      onEnter: () => {
        if (!stageChangesAllowed()) return
        requestStage('word', true)
      },
      onLeaveBack: () => {
        if (!stageChangesAllowed()) return
        requestStage('term', true)
      },
    }),
  )

  mobileTriggers.push(
    ScrollTrigger.create({
      trigger: props.wordEl ?? body,
      start: props.wordEl ? 'top 20%' : 'center top',
      invalidateOnRefresh: true,
      onEnter: () => {
        if (!stageChangesAllowed()) return
        requestStage('center', true)
      },
      onLeaveBack: () => {
        if (!stageChangesAllowed()) return
        requestStage('word', true)
      },
    }),
  )

  lastScrollY = window.scrollY
  // Snap the currently active corridor only — never pin/Teleport while ST is refreshing.
  if (mobileCaseProgress > 0.005) paintMobileCaseSegment(mobileCaseProgress)
  else paintHeroRest()
  mobileStage = 'scrub'
  // Defer refresh so logo→home first frame isn't blocked by ST measure.
  scheduleDeferredRefresh(ScrollTrigger)
  if (heroPose && scrubProgressAt(window.scrollY) < 0.02) {
    paintHeroRest()
  }
  // suppressStageCallbacks cleared by buildMorph finally
  scheduleLayoutResync()
}

function buildMorph() {
  if (!gsapMod || !stMod || !frame.value) return
  if (morphBooting) {
    return
  }

  const gen = ++morphGen
  morphBooting = true
  suppressStageCallbacks = true
  try {
    killMorph()
    // killMorph clears suppress — keep boot quiet.
    suppressStageCallbacks = true
    if (gen !== morphGen) return

    // Host mounts before page sections — keep retrying until slots exist.
    if (!props.fromEl || !props.toEl) {
      bootAlignHeroVisibility()
      scheduleLayoutResync()
      return
    }

    // Always pin a visible hero rest first — corridor capture must not gate first paint.
    ensureHeroRestPlaceholder()

    const gsap = gsapMod.default
    const { ScrollTrigger } = stMod
    gsap.registerPlugin(ScrollTrigger)
    parseEase = (name: string) => gsap.parseEase(name)

    if (!capturePoses()) {
      bootAlignHeroVisibility()
      scheduleCaptureRetry()
      return
    }
    captureFailCount = 0
    if (gen !== morphGen) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      if (mobileActive && centerPose) {
        paintBox(centerPose, 1)
      } else {
        target.h = 1
        target.v = 1
        live.h = 1
        live.v = 1
        paintDesktop()
      }
      return
    }

    target.h = 0
    target.v = 0
    live.h = 0
    live.v = 0
    liveBox = null
    mobileStage = 'scrub'
    stageLockUntil = 0

    if (mobileActive) {
      buildMobileMorph(gsap, ScrollTrigger)
      lastFromEl = props.fromEl ?? null
      lastToEl = props.toEl ?? null
      lastPlan = props.plan ?? null
      lastCaseSectionEl = props.caseSectionEl ?? null
      lastCaseMediaEl = props.caseMediaEl ?? null
      return
    }

    const triggerFrom = sectionOf(props.fromEl!)
    const triggerTo = sectionOf(props.toEl!)

    trigger = ScrollTrigger.create({
      trigger: triggerFrom,
      endTrigger: triggerTo,
      start: 'top top',
      end: 'center center',
      invalidateOnRefresh: true,
      onUpdate: () => {
        ensureTick()
      },
      onRefresh: () => {
        if (morphBooting) return
        capturePoses()
        ensureTick()
      },
    })

    if (props.caseSectionEl && props.caseMediaEl) {
      // ONE scrub both ways — same lag as hero→kado. No hop / no second undock ST.
      caseTrigger = ScrollTrigger.create({
        trigger: props.caseSectionEl,
        start: CASE_SCRUB_START,
        end: CASE_SCRUB_END,
        invalidateOnRefresh: true,
        onUpdate: () => {
          ensureTick()
        },
        onRefresh: () => {
          if (morphBooting) return
          ensureTick()
        },
      })
    } else {
      caseTrigger = null
    }

    const s = computeDesktopTarget()
    desktopTargetS = s
    desktopLiveS = s
    paintDesktop(s)
    ensureTick()

    scheduleDeferredRefresh(ScrollTrigger, () => {
      if (gen !== morphGen || !trigger) return
      const curS = computeDesktopTarget()
      desktopTargetS = curS
      desktopLiveS = curS
      paintDesktop(curS)
    })
    scheduleLayoutResync()
    lastFromEl = props.fromEl ?? null
    lastToEl = props.toEl ?? null
    lastPlan = props.plan ?? null
    lastCaseSectionEl = props.caseSectionEl ?? null
    lastCaseMediaEl = props.caseMediaEl ?? null
  } finally {
    if (gen === morphGen) {
      beginMorphQuiet(1800)
      morphBooting = false
      suppressStageCallbacks = false
    }
  }
}

function onResize() {
  if (isMobileChromeHeightOnlyResize()) return
  capturePoses()
  if (mobileActive) {
    if (mobileCaseProgress > 0.005) {
      paintMobileCaseSegment(mobileCaseProgress)
      return
    }
    if (pinTo.value) {
      if (stageChangesAllowed()) syncPinnedMask()
      return
    }
    if (stageChangesAllowed()) syncMobileStage(false)
    else if (heroPose && scrubProgressAt(window.scrollY) < 0.05) paintHeroRest()
    else paintScrub(window.scrollY, true)
    return
  }
  paintDesktop()
  ensureTick()
}

function onCaseMediaScroll() {
  if (caseFramePinned()) {
    syncPinnedMask()
    return
  }
  if (mobileActive || hopTween || caseMediaMorphTween) return
  ensureTick()
}

onMounted(async () => {
  resetFlowSurfaceMaskSession()
  gsapMod = await import('gsap')
  stMod = await import('gsap/ScrollTrigger')
  await nextTick()
  // Let the route/page DOM settle before ST — avoids refresh↔pin softlock on SPA entry.
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  registerFlowSurfaceClipPathEl(clipPathEl.value)
  registerFlowSurfaceLiveBoxNudge((deltaY) => {
    if (liveBox) liveBox = { ...liveBox, top: liveBox.top + deltaY }
  })
  // Don't buildMorph here alone — props watch also drives corridor; gate duplicates.
  if (props.fromEl && props.toEl) buildMorph()
  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('scroll', onCaseMediaScroll, { passive: true })
})

onUnmounted(() => {
  morphGen += 1
  morphBooting = false
  lastFromEl = null
  lastToEl = null
  lastPlan = null
  lastCaseSectionEl = null
  lastCaseMediaEl = null
  fontsResyncBound = false
  captureFailCount = 0
  if (morphWatchTimer) window.clearTimeout(morphWatchTimer)
  clearLayoutResync()
  registerFlowSurfaceClipPathEl(null)
  registerFlowSurfaceLiveBoxNudge(null)
  killMorph()
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onCaseMediaScroll)
})

watch(clipPathEl, (el) => {
  registerFlowSurfaceClipPathEl(el)
})

watch(
  () =>
    [
      props.fromEl,
      props.toEl,
      props.stoneEl,
      props.termEl,
      props.bodyEl,
      props.caseSectionEl,
      props.caseMediaEl,
      props.plan,
    ] as const,
  () => {
    if (morphWatchTimer) window.clearTimeout(morphWatchTimer)
    morphWatchTimer = window.setTimeout(() => {
      morphWatchTimer = 0
      const from = props.fromEl ?? null
      const to = props.toEl ?? null
      const plan = props.plan ?? null
      const hasCorridor = !!trigger || mobileTriggers.length > 0
      const sameCorridor =
        hasCorridor
        && from === lastFromEl
        && to === lastToEl
        && plan === lastPlan
        && props.caseSectionEl === lastCaseSectionEl
        && props.caseMediaEl === lastCaseMediaEl
      if (sameCorridor) {
        // Stone/term/body often arrive a tick later — soft resync, not kill+rebuild.
        resyncAfterLayout()
        ensureTick()
        return
      }
      fromPose = null
      toPose = null
      liveBox = null
      mobileActive = false
      buildMorph()
    }, 64)
  },
)

// Word appears after line-fill — refresh doc cache only (no corridor rebuild).
watch(
  () => props.wordEl,
  (el) => {
    const doc = readDocBox(el)
    if (doc) lastWordDoc = doc
  },
)

watch(caseMediaMorphNonce, () => {
  if (caseSurfaceMedia.value) {
    switchCasePhoto(caseSurfaceMedia.value, true)
  }
})

watch(caseMediaPrepareNonce, () => {
  caseMediaMorphTween?.kill()
  caseMediaMorphTween = null
  killCaseSettleTween()
  // A pinned frame follows its host's size synchronously. Freeze it in viewport
  // coordinates first; the following case switch will tween it to the new host.
  if (caseFramePinned()) {
    caseSurfaceReady.value = false
    unpinFrame()
  }
})

watch(
  caseSurfaceMedia,
  (media) => {
    if (!media) return
    const isVisibleInCases = showCaseFill.value || desktopLiveS >= 0.85 || mobileCaseProgress > 0.005 || caseMediaActive
    if (isVisibleInCases) {
      switchCasePhoto(media, true)
    } else {
      setFillLayer(activeFillLayer, media)
      lastSwitchedSrc = media.src
    }
    if (caseMediaActive || showCaseFill.value) caseFillOpacity.value = 1
  },
  { deep: true },
)
</script>

<template>
  <div
    ref="shellEl"
    data-flow-surface-host
    class="pointer-events-none fixed inset-0 z-[5]"
  >
    <svg
      width="0"
      height="0"
      class="absolute left-0 top-0 overflow-hidden"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath :id="FLOW_SURFACE_CLIP_ID" clipPathUnits="userSpaceOnUse">
          <path ref="clipPathEl" />
        </clipPath>
      </defs>
    </svg>

    <Teleport :to="pinTo || 'body'" :disabled="!pinTo">
      <div
        ref="frame"
        data-flow-surface-frame
        class="absolute overflow-visible"
      >
        <FlowSurface
          mode="window"
          class="inset-0 size-full"
          :tone-class="toneClass"
          :tone-opacity="surfaceToneOpacity"
        >
          <HomeHeroStage
            v-if="stageRest.w > 2"
            :rest-top="stageRest.top"
            :rest-left="stageRest.left"
            :stage-width="stageRest.w"
            :stage-height="stageRest.h"
            :section-el="heroSectionEl"
          />
          <div
            class="case-surface-fill"
            :class="{ 'case-surface-fill--on': showCaseFill }"
            :aria-hidden="(!showCaseFill).toString()"
          >
            <div
              ref="fillFrontEl"
              class="case-surface-fill__media"
              :style="{
                opacity: caseFillOpacity,
                backgroundColor: fillFrontVideo ? fillFrontMedia?.wash : undefined,
              }"
            >
              <img
                v-if="caseMediaReady"
                class="case-surface-fill__asset"
                :class="{
                  'case-surface-fill__asset--behind-video': showCaseFill && fillFrontVideo,
                }"
                :src="fillFrontSrc"
                :alt="fillFrontAlt"
                decoding="async"
              >
              <video
                v-if="showCaseFill && fillFrontVideo"
                class="case-surface-fill__asset case-surface-fill__video"
                autoplay
                muted
                loop
                playsinline
                preload="metadata"
                :poster="fillFrontVideo.poster"
                aria-hidden="true"
              >
                <source
                  v-if="fillFrontVideo.mobileWebm"
                  media="(max-width: 767.98px)"
                  :src="fillFrontVideo.mobileWebm"
                  type="video/webm"
                >
                <source
                  v-if="fillFrontVideo.mobileMp4"
                  media="(max-width: 767.98px)"
                  :src="fillFrontVideo.mobileMp4"
                  type="video/mp4"
                >
                <source :src="fillFrontVideo.webm" type="video/webm">
                <source :src="fillFrontVideo.mp4" type="video/mp4">
              </video>
            </div>
            <div
              ref="fillBackEl"
              class="case-surface-fill__media"
              :style="{
                opacity: caseFillOpacity,
                backgroundColor: fillBackVideo ? fillBackMedia?.wash : undefined,
              }"
            >
              <img
                v-if="caseMediaReady"
                class="case-surface-fill__asset"
                :class="{
                  'case-surface-fill__asset--behind-video': showCaseFill && fillBackVideo,
                }"
                :src="fillBackSrc"
                :alt="fillBackAlt"
                decoding="async"
              >
              <video
                v-if="showCaseFill && fillBackVideo"
                class="case-surface-fill__asset case-surface-fill__video"
                autoplay
                muted
                loop
                playsinline
                preload="metadata"
                :poster="fillBackVideo.poster"
                aria-hidden="true"
              >
                <source
                  v-if="fillBackVideo.mobileWebm"
                  media="(max-width: 767.98px)"
                  :src="fillBackVideo.mobileWebm"
                  type="video/webm"
                >
                <source
                  v-if="fillBackVideo.mobileMp4"
                  media="(max-width: 767.98px)"
                  :src="fillBackVideo.mobileMp4"
                  type="video/mp4"
                >
                <source :src="fillBackVideo.webm" type="video/webm">
                <source :src="fillBackVideo.mp4" type="video/mp4">
              </video>
            </div>
          </div>
        </FlowSurface>
      </div>
    </Teleport>
  </div>
</template>

<style>
.case-surface-fill {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
}

.case-surface-fill--on {
  opacity: 1;
}

.case-surface-fill__media {
  position: absolute;
  inset: 0;
  overflow: hidden;
  clip-path: inset(0 0 0 0);
  will-change: clip-path, opacity;
}

.case-surface-fill__asset {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.case-surface-fill__asset--behind-video {
  opacity: 0;
}

</style>
