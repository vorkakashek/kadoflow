<script setup lang="ts">
/**
 * Fixed Flow Surface — one clipped window.
 * Desktop: hero → stone scrub, then kado → the gray case frame (same lag, both
 * directions via ScrollTrigger onUpdate). The Cases section owns its media;
 * this host only travels to and from the case figure.
 * Mobile: scrub hero→stone with a light lag (not 1:1), box+morph on one live P
 * so stage glue / copy / GL stay in phase; then hop to term/word and continue
 * through Cases into work formats with reversible timed transitions.
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
  type SurfaceBox,
  type SurfaceMorphPlan,
} from '~/utils/flowSurfaceMorph'

const emit = defineEmits<{
  ready: []
}>()
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

/** The site's minimal mode keeps the core Surface choreography intact. */
function systemReducedMotion() {
  return import.meta.client
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type MobileHop = 'term' | 'word'
type MobileStage = 'scrub' | MobileHop

const STAGE_RANK: Record<MobileStage, number> = {
  scrub: 0,
  term: 1,
  word: 2,
}

const HOP_DURATION = 0.42
const HOP_EASE = 'power2.inOut'
/**
 * Desktop kado→cases: one scrub corridor (same lag as hero→kado).
 * start = begin leaving the stone; end = fully on the case photo.
 * Shifted ~15% lower so the transition starts later on scroll down.
 */
const CASE_SCRUB_START = 'top 60%'
const CASE_SCRUB_END = 'top 18%'
/** Desktop scroll-follow softness for the final Kado → case-media approach. */
const CASE_SCRUB_LAG = 0.13
/** Cases → work formats: release the project image into the next surface slot. */
const FORMATS_SCRUB_START = 'top 82%'
const FORMATS_SCRUB_END = 'top 35%'
/**
 * Desktop scroll-driven surface morph limit, in normalized morph segments/sec.
 * Mobile uses a much shorter tail below to stay close to native touch scroll.
 */
const SURFACE_MORPH_MAX_VELOCITY = 1.55
const SURFACE_MORPH_EPSILON = 0.0008
/** Treat the Surface as parked once lagged progress passes this. */
const CASE_PARK_P = 0.85
/** Let the project image meet the Surface before its slow final approach ends. */
const CASE_MEDIA_REVEAL_START_P = 0.76
/** Fade the travelling image out during the first half of either exit path. */
const CASE_MEDIA_EXIT_END_P = 0.48
/** Keep independently antialiased rounded edges from touching while layered. */
const CASE_MEDIA_SURFACE_INSET_PX = 0.75
/** Kadoflow → Cases forward handoff and Cases → Kadoflow return marker. */
const MOBILE_CASE_HOP_FORWARD = 'top 30%'
const MOBILE_CASE_HOP_REVERSE = 'top 90%'
const MOBILE_CASE_HOP_DURATION = 0.9
const MOBILE_CASE_HOP_EASE = 'sine.inOut'
const MOBILE_CASE_HOP_MIN_DURATION = 0.08
const MOBILE_FORMATS_HOP_DURATION = 0.72
const MOBILE_FORMATS_TRIGGER = 'top 78%'
const MOBILE_CASE_DIRECTION_REVERSAL_PX = 10
/** Pin only at the true endpoint; pinning at 96% caused a visible 4% jump. */
const CASE_PIN_P = 0.999
/** Ignore reverse hop triggers right after a forward hop (scroll bounce). */
const STAGE_FORWARD_LOCK_MS = HOP_DURATION * 1000 + 120
/** Mobile hero→stone scrub keeps only a tiny smoothing tail. */
const MOBILE_SCRUB_LAG = 0.018
const MOBILE_SCRUB_MAX_VELOCITY = 10
/** Short release from a pinned Kado waypoint back into the live scrub corridor. */
const MOBILE_SCRUB_BRIDGE_LAG = 0.045
const MOBILE_SCRUB_BRIDGE_MAX_VELOCITY = 4.5

const props = withDefaults(
  defineProps<{
    fromEl?: HTMLElement | null
    toEl?: HTMLElement | null
    /** Rock image — mobile scroll markers. */
    stoneEl?: HTMLElement | null
    /** Title + phonetic — hop after stone `top 10%`. */
    termEl?: HTMLElement | null
    /** “Kadoflow” word — hop at stone `center top`; Cases handoff at word `top 20%`. */
    wordEl?: HTMLElement | null
    /** Body block — layout / capture; Cases handoff uses wordEl when present. */
    bodyEl?: HTMLElement | null
    /** Cases section — desktop kado→case scrub trigger. */
    caseSectionEl?: HTMLElement | null
    /** Case mockup figure — scrub destination (surface occupies this box). */
    caseMediaEl?: HTMLElement | null
    /** Work-formats section — desktop trigger for the next continuous segment. */
    formatsSectionEl?: HTMLElement | null
    /** Plain surface slot at the left of the work-formats list. */
    formatsSurfaceEl?: HTMLElement | null
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
    formatsSectionEl: null,
    formatsSurfaceEl: null,
    plan: () => heroToKadoPlan,
    toneClass: 'bg-stone',
  },
)

const preload = useBrandPreload()
const homeCases = useHomeCases()
const {
  activeCaseId,
  surfaceDocked: caseSurfaceDocked,
  surfaceReady: caseSurfaceReady,
  surfaceReturning: caseSurfaceReturning,
  caseMediaVisible,
  routePhase,
  homeReturnPending: caseDetailHomeReturnPending,
  setSurfaceDocked,
  setSurfaceReady,
  setCaseMediaVisible,
  setSurfaceReturning,
  beginCasesEntry,
  consumeHomeReturnSurface,
} = useHomeExperience()
const activeCaseWash = computed(() => (
  homeCases.value.find(item => item.id === activeCaseId.value)?.wash
  ?? 'var(--palette-stone)'
))

function returningHomeFromCaseDetail() {
  return caseDetailHomeReturnPending.value
    || routePhase.value === 'returning-home'
}

function setCaseSurfaceDocked(on: boolean) {
  if (on) setSurfaceReturning(false)
  setSurfaceDocked(on)
}

const frame = ref<HTMLElement | null>(null)
const shellEl = ref<HTMLElement | null>(null)
const clipPathEl = ref<SVGPathElement | null>(null)
/** Cold mobile entry: reveal the complete Hero surface from its lower edge. */
const heroEntryArmed = ref(false)
const heroEntryRunning = ref(false)
let heroEntryTimer = 0
let stopHeroEntryRevealWatch: (() => void) | null = null
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
let formatsTrigger: { kill: () => void; progress: number } | null = null
let mobileTriggers: { kill: () => void }[] = []
let hopTween: { kill: () => void } | null = null
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
let surfaceReadyEmitted = false

/** Keep the SSR primer for one committed live frame, then hand paint ownership over. */
function announceSurfaceReady() {
  if (surfaceReadyEmitted || !frame.value) return
  surfaceReadyEmitted = true
  requestAnimationFrame(() => {
    requestAnimationFrame(() => emit('ready'))
  })
}

let gsapMod: typeof import('gsap') | null = null
let stMod: typeof import('gsap/ScrollTrigger') | null = null
let motionBootPromise: Promise<void> | null = null
let motionBootTimer = 0
let motionIdleId: number | null = null
let removeMotionIntent: (() => void) | null = null
let hostUnmounted = false
let keepAliveActive = true
const initialCasesHashEntry = ref(false)

async function bootMotionEngine() {
  if (motionBootPromise) return motionBootPromise
  motionBootPromise = (async () => {
    if (motionBootTimer) {
      window.clearTimeout(motionBootTimer)
      motionBootTimer = 0
    }
    if (motionIdleId !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(motionIdleId)
      motionIdleId = null
    }
    removeMotionIntent?.()
    removeMotionIntent = null

    const [nextGsap, nextScrollTrigger] = await Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
    ])
    if (hostUnmounted) return
    gsapMod = nextGsap
    stMod = nextScrollTrigger
    gsapMod.default.registerPlugin(stMod.ScrollTrigger)
    gsapMod.default.ticker.fps(0)
    gsapMod.default.ticker.lagSmoothing(0)
    gsapMod.default.config({ force3D: true, nullTargetWarn: false })
    stMod.ScrollTrigger.config({ ignoreMobileResize: true })
    if (props.fromEl && props.toEl) buildMorph()
  })()
  return motionBootPromise
}

function scheduleColdMotionBoot() {
  const onIntent = () => void bootMotionEngine()
  const intentEvents: Array<keyof WindowEventMap> = [
    'wheel',
    'touchstart',
    'pointerdown',
    'keydown',
  ]
  for (const event of intentEvents) {
    window.addEventListener(event, onIntent, { once: true, passive: true })
  }
  removeMotionIntent = () => {
    for (const event of intentEvents) window.removeEventListener(event, onIntent)
  }

  // Let the fully usable static Hero own the critical rendering window. The
  // scroll engine is still guaranteed to boot later if the visitor is idle.
  motionBootTimer = window.setTimeout(() => {
    motionBootTimer = 0
    if ('requestIdleCallback' in window) {
      motionIdleId = window.requestIdleCallback(
        () => {
          motionIdleId = null
          void bootMotionEngine()
        },
        { timeout: 1500 },
      )
    } else {
      void bootMotionEngine()
    }
  }, 3500)
}

/** Mobile corridor state */
let mobileActive = false
/** Reversible mobile Kadoflow → Cases hop progress. */
let mobileCaseProgress = 0
let caseSettleTween: { kill: () => void } | null = null
let caseHopGen = 0
let caseHopDirection: 'forward' | 'reverse' | null = null
let caseHopOppositePx = 0
let formatsSettleTween: { kill: () => void } | null = null
let formatsHopGen = 0
let formatsHopDirection: 'forward' | 'reverse' | null = null
let mobileFormatsArrived = false
/** Stays latched across case layout refreshes; clears only on a real reverse. */
let mobileCaseArrived = false
/** Smooth bridge from a skipped mobile waypoint back into the Hero scrub. */
let mobileScrubBridge: {
  from: SurfaceBox
  fromMorph: number
  progress: number
} | null = null
let mobileStage: MobileStage = 'scrub'
let heroPose: SurfaceBox | null = null
let stonePose: SurfaceBox | null = null
let scrubStartY = 0
let scrubEndY = 0
/** Frozen to the stable 100svh Hero height; mobile browser chrome must not move thresholds. */
let mobileTriggerViewportHeight = 0
let mobileTriggerViewportWidth = 0
let mobileCaseHandoffY: { forwardY: number } | null = null
/** Reverse fires only after the Cases section has entered, then crossed 90% upward. */
let mobileCaseReverseArmed = false
let lastCaseSectionTop: number | null = null
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

function stableMobileTriggerViewportHeight() {
  const width = window.innerWidth
  if (!mobileTriggerViewportHeight || width !== mobileTriggerViewportWidth) {
    const heroSection = props.fromEl ? sectionOf(props.fromEl) : null
    const heroHeight = heroSection?.getBoundingClientRect().height ?? 0
    mobileTriggerViewportHeight = Math.max(1, heroHeight || window.innerHeight)
    mobileTriggerViewportWidth = width
  }
  return mobileTriggerViewportHeight
}

function syncStageRest(pose: SurfaceBox) {
  stageRest.top = pose.top
  stageRest.left = pose.left
  stageRest.w = Math.max(1, pose.width)
  stageRest.h = Math.max(1, pose.height)
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

  const wordDoc = readDocBox(props.wordEl)
  if (wordDoc) lastWordDoc = wordDoc
  mobileCaseHandoffY = null

  mobileActive = true
  fromPose = heroPose
  toPose = stonePose
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
    announceSurfaceReady()
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

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value))
}

function smoothUnit(value: number) {
  const t = clampUnit(value)
  return t * t * (3 - 2 * t)
}

function caseMediaApproachOpacity(progress: number) {
  return smoothUnit(
    (progress - CASE_MEDIA_REVEAL_START_P) / (1 - CASE_MEDIA_REVEAL_START_P),
  )
}

function caseMediaExitOpacity(progress: number) {
  return 1 - smoothUnit(progress / CASE_MEDIA_EXIT_END_P)
}

let lastCaseToneCss = ''

function paintCaseSurfaceTone(mediaOpacity: number) {
  const el = frame.value
  if (!el) return
  // Media opacity already has a smoothstep curve. Reuse its whole range so the
  // tone travels continuously instead of reaching the case colour too early.
  const mix = clampUnit(mediaOpacity)
  if (mix <= 0.001) {
    if (lastCaseToneCss) el.style.removeProperty('--flow-surface-tone')
    lastCaseToneCss = ''
    return
  }

  const casePercent = Math.round(mix * 1000) / 10
  const stonePercent = Math.round((100 - casePercent) * 10) / 10
  const css = casePercent >= 99.9
    ? activeCaseWash.value
    : `color-mix(in srgb, var(--palette-stone) ${stonePercent}%, ${activeCaseWash.value} ${casePercent}%)`
  if (css === lastCaseToneCss) return
  lastCaseToneCss = css
  el.style.setProperty('--flow-surface-tone', css)
}

function paintSurfaceUnderCaseMedia(box: SurfaceBox, mediaOpacity: number) {
  // Reach the full inset quickly, while the photo is still nearly transparent;
  // restore the exact Surface box before the photo has fully disappeared.
  const inset = CASE_MEDIA_SURFACE_INSET_PX
    * smoothUnit(clampUnit(mediaOpacity) / 0.08)
  paintCaseSurfaceTone(mediaOpacity)
  paintBox({
    top: box.top + inset,
    left: box.left + inset,
    width: Math.max(1, box.width - inset * 2),
    height: Math.max(1, box.height - inset * 2),
  }, 1)
}

let caseMediaFlightEl: HTMLElement | null = null

function getCaseMediaFlightEl() {
  if (caseMediaFlightEl?.isConnected) return caseMediaFlightEl
  caseMediaFlightEl = props.caseMediaEl?.querySelector<HTMLElement>(
    '[data-case-local-media]',
  ) ?? null
  return caseMediaFlightEl
}

function clearCaseMediaFlight() {
  const host = props.caseMediaEl
  const ownsInlineGeometry = host?.hasAttribute('data-case-media-flight') ?? false
  host?.removeAttribute('data-case-media-flight')
  if (!ownsInlineGeometry) return
  const media = getCaseMediaFlightEl()
  if (!media) return
  for (const property of [
    'inset',
    'left',
    'top',
    'right',
    'bottom',
    'width',
    'height',
    'opacity',
    'transition',
  ]) {
    media.style.removeProperty(property)
  }
}

/**
 * Keep the local raster in the exact live Surface box. Width and height are
 * animated as layout dimensions rather than CSS scale, so object-fit keeps
 * cropping the image instead of stretching it.
 */
function paintCaseMediaFlight(
  box: SurfaceBox,
  caseBox: SurfaceBox,
  opacity: number,
) {
  const media = getCaseMediaFlightEl()
  const host = props.caseMediaEl
  const visible = opacity > 0.002
  setCaseMediaVisible(visible)
  if (!media || !host || !visible) {
    clearCaseMediaFlight()
    return
  }

  host.setAttribute('data-case-media-flight', '')
  media.style.inset = 'auto'
  media.style.left = `${box.left - caseBox.left}px`
  media.style.top = `${box.top - caseBox.top}px`
  media.style.right = 'auto'
  media.style.bottom = 'auto'
  media.style.width = `${Math.max(1, box.width)}px`
  media.style.height = `${Math.max(1, box.height)}px`
  media.style.opacity = `${clampUnit(opacity)}`
  media.style.transition = 'none'
}

function formatsSurfacePose(): SurfaceBox | null {
  return readBox(props.formatsSurfaceEl)
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
  if (formatsTrigger && formatsTrigger.progress > 0) {
    return 2 + Math.min(1, Math.max(0, formatsTrigger.progress))
  }
  if (caseTrigger && caseTrigger.progress > 0) {
    return 1 + Math.min(1, Math.max(0, caseTrigger.progress))
  }
  if (trigger) {
    return Math.min(1, Math.max(0, trigger.progress))
  }
  return 0
}

function paintHeroToKadoSegment(t: number) {
  if (
    caseSurfaceDocked.value
    || caseMediaActive
    || caseSurfaceReady.value
    || caseMediaVisible.value
  ) {
    caseMediaActive = false
    setSurfaceDocked(false)
    setSurfaceReady(false)
    setCaseMediaVisible(false)
    clearCaseMediaFlight()
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
  const docked = t >= CASE_PARK_P
  if (docked !== caseMediaActive) {
    caseMediaActive = docked
    setSurfaceDocked(docked)
  }
  const from = kadoLivePose()
  const to = caseMediaPose()
  if (!from && !to) return
  if (!to) {
    setCaseMediaVisible(false)
    clearCaseMediaFlight()
    paintBox(from!, 1)
    return
  }
  if (!from) {
    paintBox(to, 1)
    setCaseMediaVisible(true)
    clearCaseMediaFlight()
    return
  }
  if (t >= CASE_PIN_P) {
    // Desktop remains in the fixed host. Teleporting the fully arrived frame
    // into the case figure forces a one-frame repaint in Chromium, visible as
    // a flash both on first Kado → Cases scroll and under the return proxy.
    if (mobileActive) pinCaseFrame()
    else {
      paintSurfaceUnderCaseMedia(to, 1)
      setSurfaceReady(true)
    }
    setCaseMediaVisible(true)
    clearCaseMediaFlight()
    return
  }
  setSurfaceReady(false)
  if (caseFramePinned()) unpinFrame()
  // t===1 -> case pose; t===0 -> live stone. Same path both ways, no seam.
  const box = lerpBox(from, to, t)
  const mediaOpacity = caseMediaApproachOpacity(t)
  paintSurfaceUnderCaseMedia(box, mediaOpacity)
  paintCaseMediaFlight(box, to, mediaOpacity)
}

function paintCasesToFormatsSegment(t: number) {
  const from = caseMediaPose()
  const to = formatsSurfacePose()
  if (!from && !to) return

  if (t > SURFACE_MORPH_EPSILON) {
    if (caseMediaActive) {
      caseMediaActive = false
    }
    if (caseSurfaceDocked.value) setSurfaceDocked(false)
    if (caseSurfaceReady.value) setSurfaceReady(false)
  } else if (!caseMediaActive || !caseSurfaceReady.value) {
    caseMediaActive = true
    setSurfaceDocked(true)
    setSurfaceReady(true)
  }

  if (!to) {
    paintBox(from!, 1)
    setCaseMediaVisible(true)
    clearCaseMediaFlight()
    return
  }
  if (!from) {
    setCaseMediaVisible(false)
    clearCaseMediaFlight()
    paintBox(to, 1)
    return
  }
  const box = lerpBox(from, to, t)
  if (t <= SURFACE_MORPH_EPSILON) {
    paintBox(box, 1)
    setCaseMediaVisible(true)
    clearCaseMediaFlight()
  } else {
    const mediaOpacity = caseMediaExitOpacity(t)
    paintSurfaceUnderCaseMedia(box, mediaOpacity)
    paintCaseMediaFlight(box, from, mediaOpacity)
  }
}

function finishHeroEntryReveal() {
  if (heroEntryTimer) window.clearTimeout(heroEntryTimer)
  heroEntryTimer = 0
  heroEntryRunning.value = false
  heroEntryArmed.value = false
  stopHeroEntryRevealWatch?.()
  stopHeroEntryRevealWatch = null
}

function startHeroEntryReveal() {
  if (!heroEntryArmed.value || heroEntryRunning.value) return
  requestAnimationFrame(() => {
    if (hostUnmounted || !heroEntryArmed.value) return
    heroEntryRunning.value = true
    // Safety cleanup if animationend is lost during mobile browser chrome resize.
    heroEntryTimer = window.setTimeout(finishHeroEntryReveal, 1100)
  })
}

function onFrameAnimationEnd(event: AnimationEvent) {
  if (event.animationName === 'flow-surface-hero-entry') finishHeroEntryReveal()
}

/** Autonomous live-target hop into the case media, followed by a Teleport pin. */
function settleMobileCaseFrame(
  initialDest: SurfaceBox,
  duration: number,
  startProgress: number,
) {
  if (!gsapMod || !frame.value || caseSettleTween || caseFramePinned()) return

  const start = liveBox ? { ...liveBox } : { ...initialDest }
  let fallbackDest = { ...initialDest }
  const proxy = { t: 0 }
  setSurfaceReady(false)
  caseSettleTween = gsapMod.default.to(proxy, {
    t: 1,
    duration: systemReducedMotion()
      ? 0
      : duration,
    ease: MOBILE_CASE_HOP_EASE,
    onUpdate: () => {
      const liveDest = caseMediaPose()
      if (liveDest) fallbackDest = { ...liveDest }
      mobileCaseProgress = startProgress + (1 - startProgress) * proxy.t
      const box = lerpBox(start, fallbackDest, proxy.t)
      const mediaOpacity = caseMediaApproachOpacity(mobileCaseProgress)
      paintSurfaceUnderCaseMedia(box, mediaOpacity)
      paintCaseMediaFlight(
        box,
        fallbackDest,
        mediaOpacity,
      )
    },
    onComplete: () => {
      caseSettleTween = null
      caseHopDirection = null
      caseHopOppositePx = 0
      mobileCaseProgress = 1
      mobileCaseArrived = true
      const sectionTop = props.caseSectionEl?.getBoundingClientRect().top
      lastCaseSectionTop = typeof sectionTop === 'number' && Number.isFinite(sectionTop)
        ? sectionTop
        : null
      mobileCaseReverseArmed = lastCaseSectionTop != null
        && lastCaseSectionTop <= stableMobileTriggerViewportHeight() * 0.9
      caseMediaActive = true
      setSurfaceDocked(true)
      const dest = caseMediaPose() ?? fallbackDest
      paintBox(dest, 1)
      pinCaseFrame()
      setCaseMediaVisible(true)
      clearCaseMediaFlight()
      void nextTick(() => {
        if (mobileFormatsShouldBeActive()) {
          enterMobileFormatsFrame()
        }
      })
    },
  })
}

/**
 * The fullscreen detail-return image already performs the visible flight.
 * Prepare the final FlowSurface geometry underneath it. HomeCases owns the
 * destination raster that the fullscreen proxy dissolves into.
 */
function dockMobileCaseFrameUnderDetailReturn(dest: SurfaceBox) {
  consumeHomeReturnSurface()
  caseHopGen += 1
  killHopTween()
  killCaseSettleTween()
  unpinFrame()

  caseHopDirection = null
  caseHopOppositePx = 0
  mobileCaseProgress = 1
  mobileCaseArrived = true
  mobileCaseReverseArmed = false
  lastCaseSectionTop = null
  caseMediaActive = true
  setSurfaceReturning(false)
  setSurfaceReady(false)
  setCaseSurfaceDocked(true)
  paintBox(dest, 1)
  pinCaseFrame()
  setCaseMediaVisible(true)
  clearCaseMediaFlight()
}

/**
 * Crossing the Cases endpoint uses the same bounded live-target hop as the
 * term/word pins. A fast fling must not wait for lagged scrub progress to reach
 * 96% while the card keeps moving with native scroll.
 */
function enterMobileCaseFrame() {
  if (mobileCaseArrived) return
  if (caseHopDirection === 'forward' && caseSettleTween) return
  const dest = caseMediaPose()
  if (!dest) return
  if (returningHomeFromCaseDetail()) {
    dockMobileCaseFrameUnderDetailReturn(dest)
    return
  }
  const startProgress = Math.min(1, Math.max(0, mobileCaseProgress))
  const duration = Math.max(
    MOBILE_CASE_HOP_MIN_DURATION,
    MOBILE_CASE_HOP_DURATION * (1 - startProgress),
  )
  const current = readBox(frame.value) ?? liveBox
  const wasPinned = !!pinTo.value
  const gen = ++caseHopGen
  killHopTween()
  killCaseSettleTween()
  caseHopDirection = 'forward'
  setSurfaceReturning(false)
  mobileCaseReverseArmed = false
  lastCaseSectionTop = null
  caseHopOppositePx = 0
  unpinFrame()
  mobileCaseProgress = Math.max(startProgress, SURFACE_MORPH_EPSILON)
  mobileCaseArrived = false
  caseMediaActive = true
  setSurfaceDocked(false)
  beginCasesEntry()
  setSurfaceReady(false)
  const startEnter = () => {
    if (gen !== caseHopGen) return
    if (current) {
      liveBox = { ...current }
      paintBox(current, 1)
    }
    settleMobileCaseFrame(caseMediaPose() ?? dest, duration, startProgress)
  }
  if (wasPinned) void nextTick(startEnter)
  else startEnter()
}

/** Reverse threshold hop: detach from Cases and return directly to Kadoflow. */
function leaveMobileCaseFrame() {
  if (!gsapMod || !frame.value || !wordPose()) return
  if (caseHopDirection === 'reverse' && caseSettleTween) return
  const startProgress = mobileCaseArrived
    ? 1
    : Math.min(1, Math.max(0, mobileCaseProgress))
  if (startProgress <= SURFACE_MORPH_EPSILON && !caseSettleTween) return
  const duration = Math.max(
    MOBILE_CASE_HOP_MIN_DURATION,
    MOBILE_CASE_HOP_DURATION * startProgress,
  )
  const from = readBox(frame.value) ?? liveBox
  if (!from) return

  const gen = ++caseHopGen
  killCaseSettleTween()
  caseHopDirection = 'reverse'
  setSurfaceReturning(true)
  mobileCaseReverseArmed = false
  caseHopOppositePx = 0
  const wasPinned = caseFramePinned()
  unpinFrame()
  mobileCaseArrived = false
  mobileCaseProgress = Math.max(startProgress, SURFACE_MORPH_EPSILON)
  setSurfaceReady(false)

  const startReverse = () => {
    if (gen !== caseHopGen) return
    if (!gsapMod || !frame.value) return
    const start = { ...from }
    const proxy = { t: 0 }
    caseSettleTween = gsapMod.default.to(proxy, {
      t: 1,
      duration: systemReducedMotion()
        ? 0
        : duration,
      ease: MOBILE_CASE_HOP_EASE,
      onUpdate: () => {
        const dest = wordPose() ?? start
        mobileCaseProgress = startProgress * (1 - proxy.t)
        const box = lerpBox(start, dest, proxy.t)
        const caseBox = caseMediaPose()
        const mediaOpacity = caseMediaApproachOpacity(mobileCaseProgress)
        paintSurfaceUnderCaseMedia(box, mediaOpacity)
        if (caseBox) {
          paintCaseMediaFlight(
            box,
            caseBox,
            mediaOpacity,
          )
        }
      },
      onComplete: () => {
        caseSettleTween = null
        caseHopDirection = null
        caseHopOppositePx = 0
        mobileCaseProgress = 0
        caseMediaActive = false
        setSurfaceDocked(false)
        setCaseMediaVisible(false)
        clearCaseMediaFlight()
        const dest = wordPose()
        if (dest) paintBox(dest, 1)
        mobileStage = 'word'
        const next = stageChangesAllowed() ? stageFromScroll() : 'word'
        if (next === 'word') pinFrame('word')
        else if (next === 'scrub') enterScrub(true, dest)
        else tweenToHop(next, true)
      },
    })
  }

  if (wasPinned) void nextTick(startReverse)
  else startReverse()
}

function mobileFormatsShouldBeActive() {
  const section = props.formatsSectionEl
  if (!section) return false
  return section.getBoundingClientRect().top
    <= stableMobileTriggerViewportHeight() * 0.78
}

function killFormatsSettleTween() {
  formatsSettleTween?.kill()
  formatsSettleTween = null
  formatsHopDirection = null
}

/** Cases → formats: reveal and fly the same Surface behind the list. */
function enterMobileFormatsFrame() {
  if (!gsapMod || !frame.value || !mobileCaseArrived || mobileFormatsArrived) return
  if (formatsHopDirection === 'forward' && formatsSettleTween) return
  const dest = formatsSurfacePose()
  const from = readBox(frame.value) ?? liveBox
  if (!dest || !from) return

  const gen = ++formatsHopGen
  killFormatsSettleTween()
  formatsHopDirection = 'forward'
  const wasPinned = !!pinTo.value
  setSurfaceReady(false)
  unpinFrame()
  caseMediaActive = false
  setSurfaceDocked(false)

  const startForward = () => {
    if (gen !== formatsHopGen || !gsapMod) return
    let fallbackDest = { ...dest }
    const start = { ...from }
    const proxy = { t: 0 }
    formatsSettleTween = gsapMod.default.to(proxy, {
      t: 1,
      duration: systemReducedMotion() ? 0 : MOBILE_FORMATS_HOP_DURATION,
      ease: MOBILE_CASE_HOP_EASE,
      onUpdate: () => {
        const liveDest = formatsSurfacePose()
        if (liveDest) fallbackDest = { ...liveDest }
        const box = lerpBox(start, fallbackDest, proxy.t)
        const caseBox = caseMediaPose()
        const mediaOpacity = caseMediaExitOpacity(proxy.t)
        paintSurfaceUnderCaseMedia(box, mediaOpacity)
        if (caseBox) {
          paintCaseMediaFlight(box, caseBox, mediaOpacity)
        }
      },
      onComplete: () => {
        formatsSettleTween = null
        formatsHopDirection = null
        mobileFormatsArrived = true
        setCaseMediaVisible(false)
        clearCaseMediaFlight()
        paintBox(formatsSurfacePose() ?? fallbackDest, 1)
        pinFormatsFrame()
      },
    })
  }

  if (wasPinned) void nextTick(startForward)
  else startForward()
}

/** Formats → Cases: restore the Surface beneath the local case media. */
function leaveMobileFormatsFrame() {
  if (!gsapMod || !frame.value) return
  if (!mobileFormatsArrived && !formatsSettleTween) return
  if (formatsHopDirection === 'reverse' && formatsSettleTween) return
  const dest = caseMediaPose()
  const from = readBox(frame.value) ?? liveBox
  if (!dest || !from) return

  const gen = ++formatsHopGen
  killFormatsSettleTween()
  formatsHopDirection = 'reverse'
  mobileFormatsArrived = false
  const wasPinned = !!pinTo.value
  unpinFrame()
  setSurfaceReady(false)

  const startReverse = () => {
    if (gen !== formatsHopGen || !gsapMod) return
    let fallbackDest = { ...dest }
    const start = { ...from }
    const proxy = { t: 0 }
    formatsSettleTween = gsapMod.default.to(proxy, {
      t: 1,
      duration: systemReducedMotion() ? 0 : MOBILE_FORMATS_HOP_DURATION,
      ease: MOBILE_CASE_HOP_EASE,
      onUpdate: () => {
        const liveDest = caseMediaPose()
        if (liveDest) fallbackDest = { ...liveDest }
        const box = lerpBox(start, fallbackDest, proxy.t)
        const mediaOpacity = caseMediaExitOpacity(1 - proxy.t)
        paintSurfaceUnderCaseMedia(box, mediaOpacity)
        paintCaseMediaFlight(
          box,
          fallbackDest,
          mediaOpacity,
        )
      },
      onComplete: () => {
        formatsSettleTween = null
        formatsHopDirection = null
        caseMediaActive = true
        setSurfaceDocked(true)
        paintBox(caseMediaPose() ?? fallbackDest, 1)
        pinCaseFrame()
        setCaseMediaVisible(true)
        clearCaseMediaFlight()
      },
    })
  }

  if (wasPinned) void nextTick(startReverse)
  else startReverse()
}

function killCaseSettleTween() {
  caseSettleTween?.kill()
  caseSettleTween = null
  caseHopDirection = null
  caseHopOppositePx = 0
}

function mobileCaseHopOwnsFrame() {
  return !!caseHopDirection
    || !!caseSettleTween
    || mobileCaseArrived
    || mobileCaseProgress > SURFACE_MORPH_EPSILON
}

function paintDesktop(s = desktopLiveS) {
  if (mobileActive) return
  if (hopTween) return

  const { segmentIndex, localT } = resolveCorridorSegment(s, 3)
  if (segmentIndex === 2) {
    paintCasesToFormatsSegment(localT)
  } else if (segmentIndex === 1) {
    paintKadoToCasesSegment(localT)
  } else {
    paintHeroToKadoSegment(localT)
  }
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
function pinSlot(hop: MobileHop): HTMLElement | null {
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

/** Park the completed surface inside the case figure so it scrolls with content. */
function pinCaseFrame() {
  const host = props.caseMediaEl
  const el = frame.value
  if (!host || !el) return
  if (pinTo.value === host) {
    syncPinnedMask()
    setSurfaceReady(true)
    setCaseMediaVisible(true)
    clearCaseMediaFlight()
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

  setCaseMediaVisible(true)
  clearCaseMediaFlight()

  pinRo?.disconnect()
  pinRo = new ResizeObserver(() => syncPinnedMask())
  pinRo.observe(host)
  void nextTick(() => {
    syncPinnedMask()
    setSurfaceReady(pinTo.value === host)
  })
}

function formatsFramePinned() {
  return !!props.formatsSurfaceEl && pinTo.value === props.formatsSurfaceEl
}

/** Attach the settled mobile surface to the slot behind the formats list. */
function pinFormatsFrame() {
  const host = props.formatsSurfaceEl
  const el = frame.value
  if (!host || !el) return
  setCaseMediaVisible(false)
  clearCaseMediaFlight()
  if (pinTo.value === host) {
    syncPinnedMask()
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
  void nextTick(() => syncPinnedMask())
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

function pinFrame(hop: MobileHop) {
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
  pinFrame(hop)
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
  return wordPose()
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
  if (mobileCaseHopOwnsFrame()) return
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
    if (!animate || systemReducedMotion()) {
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
 * uses the same normalized velocity cap instead of snapping a skipped pin → Hero.
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
      || systemReducedMotion()
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
  // Body is needed for corridor capture; the final handoff prefers Kadoflow.
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

  // Kadoflow `top 20%` is owned by the direct Cases handoff trigger.
  const squareMark = props.wordEl ?? body
  const squareAt = props.wordEl ? 0.2 : 0.5
  if (y >= scrollYForTopAt(squareMark, squareAt)) return 'word'
  if (y >= scrollYForCenterTop(stoneMark)) return 'word'
  if (y >= scrollYForTopAt(stoneMark, 0.1)) return 'term'
  return 'scrub'
}

function mobileCaseHandoffBounds() {
  if (mobileCaseHandoffY) return mobileCaseHandoffY
  const mark = props.wordEl ?? props.bodyEl
  if (!mark) return null
  const fraction = (position: string, fallback: number) => {
    const match = position.match(/(-?\d+(?:\.\d+)?)%$/)
    const percent = match ? Number.parseFloat(match[1]!) : Number.NaN
    return Number.isFinite(percent) ? percent / 100 : fallback
  }
  const markDoc = readDocBox(mark) ?? (props.wordEl ? lastWordDoc : null)
  if (!markDoc) return null
  const viewportHeight = stableMobileTriggerViewportHeight()
  mobileCaseHandoffY = {
    forwardY:
      markDoc.top - viewportHeight * fraction(MOBILE_CASE_HOP_FORWARD, 0.3),
  }
  return mobileCaseHandoffY
}

/** Live crossing: Cases top reaches 90% of the stable viewport while scrolling upward. */
function crossedMobileCaseReverseMarker(
  scrollingUp: boolean,
  scrollDelta: number,
) {
  if (!mobileCaseArrived || !props.caseSectionEl) return false
  const top = props.caseSectionEl.getBoundingClientRect().top
  const match = MOBILE_CASE_HOP_REVERSE.match(/(-?\d+(?:\.\d+)?)%$/)
  const percent = match ? Number.parseFloat(match[1]!) / 100 : 0.9
  const line = stableMobileTriggerViewportHeight() * percent
  // If layout restored directly inside Cases, derive the prior live top from
  // this native scroll delta so the first large upward step cannot skip 90%.
  const previousTop = lastCaseSectionTop ?? (top + scrollDelta)

  if (top <= line) mobileCaseReverseArmed = true
  lastCaseSectionTop = top

  return !!(
    scrollingUp
    && mobileCaseReverseArmed
    && previousTop != null
    && previousTop < line
    && top >= line
  )
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
  const delays = [120, 500, 2000]
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
      if (caseSettleTween) {
        // The active hop already tracks its live destination.
      } else if (caseFramePinned()) syncPinnedMask()
      else {
        const dest = caseMediaPose()
        if (dest) paintBox(dest, 1)
      }
    } else if (mobileStage === 'scrub' || !stageChangesAllowed()) {
      if (heroPose && scrubProgressAt(window.scrollY) < 0.05) paintHeroRest()
      else paintScrub(window.scrollY, true)
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
        if (!stageChangesAllowed()) return
        reconcileFromScroll()
        if (!mobileCaseHopOwnsFrame()) syncMobileStage(false)
      })
    }
  } else if (trigger) {
    paintDesktop()
    ensureTick()
  }
}

/** Scroll-driven stage reconcile — catches missed leaveBacks when scrolling up. */
function reconcileFromScroll() {
  const y = window.scrollY
  const scrollDelta = y - lastScrollY
  const scrollingUp = scrollDelta < -1
  const scrollingDown = scrollDelta > 1
  lastScrollY = y

  const formatsActive = mobileFormatsShouldBeActive()
  if (formatsActive) {
    if (
      mobileCaseArrived
      && !mobileFormatsArrived
      && formatsHopDirection !== 'forward'
    ) {
      enterMobileFormatsFrame()
    }
    if (mobileFormatsArrived || formatsSettleTween) return
  } else if (mobileFormatsArrived || formatsSettleTween) {
    leaveMobileFormatsFrame()
    return
  }

  // While the timed handoff is running, accumulate intentional movement in the
  // opposite direction. This ignores 1px native-scroll jitter but still
  // reverses promptly from the currently painted geometry.
  if (caseHopDirection) {
    const oppositeDelta = caseHopDirection === 'forward'
      ? Math.max(0, -scrollDelta)
      : Math.max(0, scrollDelta)
    const continuing = caseHopDirection === 'forward' ? scrollingDown : scrollingUp
    if (oppositeDelta > 0) caseHopOppositePx += oppositeDelta
    else if (continuing) caseHopOppositePx = 0

    if (caseHopOppositePx >= MOBILE_CASE_DIRECTION_REVERSAL_PX) {
      stageLockUntil = 0
      if (caseHopDirection === 'forward') leaveMobileCaseFrame()
      else enterMobileCaseFrame()
    }
    return
  }

  if (crossedMobileCaseReverseMarker(scrollingUp, scrollDelta)) {
    leaveMobileCaseFrame()
    return
  }

  // Trigger callbacks are hints; layout-derived state is authoritative. If a
  // callback is missed during a fast fling/refresh, the next scroll update
  // repairs the handoff instead of leaving the surface stranded offscreen.
  if (!morphBooting && !suppressStageCallbacks) {
    const bounds = mobileCaseHandoffBounds()
    if (
      bounds
      && y >= bounds.forwardY
      && !mobileCaseArrived
      && mobileCaseProgress <= SURFACE_MORPH_EPSILON
    ) {
      enterMobileCaseFrame()
      return
    }
  }

  if (!stageChangesAllowed()) {
    if (mobileStage === 'scrub' && !hopTween) paintScrub()
    return
  }
  if (scrollingUp) {
    // Intentional upward scroll — don't let forward-lock trap the reverse path.
    stageLockUntil = 0
  }

  // The direct Kadoflow ↔ Cases hop owns the frame in both directions.
  if (caseSettleTween || mobileCaseArrived || mobileCaseProgress > 0.005) return

  if (mobileScrubBridge) {
    scrubTargetP = scrubProgressAt(y)
    ensureTick()
    return
  }

  const next = stageFromScroll()
  if (next === mobileStage) {
    if (next === 'scrub' && !hopTween) paintScrub()
    return
  }

  // Don't yank an in-flight forward hop back on threshold flicker —
  // but do interrupt when the user is clearly scrolling up.
  if (hopTween && STAGE_RANK[next] < STAGE_RANK[mobileStage] && !scrollingUp) return

  // Reverse release into scrub must bridge from the actual pinned box.
  requestStage(next, true)
}

function tick(now: number) {
  raf = 0
  if (!keepAliveActive) return
  if (!lastTs) lastTs = now
  const dt = Math.min(0.064, Math.max(0, (now - lastTs) / 1000))
  lastTs = now

  // Mobile scrub: light lag toward scroll target (box + morph share scrubLiveP).
  if (mobileActive) {
    if (mobileScrubBridge && heroPose && stonePose) {
      const bridge = mobileScrubBridge
      bridge.progress = updateContinuousProgress(bridge.progress, 1, dt, {
        lag: MOBILE_SCRUB_BRIDGE_LAG,
        maxVelocity: MOBILE_SCRUB_BRIDGE_MAX_VELOCITY,
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
        maxVelocity: MOBILE_SCRUB_MAX_VELOCITY,
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
  if (!keepAliveActive) return
  if (!raf) {
    lastTs = 0
    raf = requestAnimationFrame(tick)
  }
}

function killMorph() {
  caseHopGen += 1
  formatsHopGen += 1
  trigger?.kill()
  trigger = null
  caseTrigger?.kill()
  caseTrigger = null
  formatsTrigger?.kill()
  formatsTrigger = null
  desktopTargetS = 0
  desktopLiveS = 0
  mobileCaseProgress = 0
  mobileCaseArrived = false
  mobileCaseHandoffY = null
  mobileCaseReverseArmed = false
  lastCaseSectionTop = null
  mobileScrubBridge = null
  caseMediaActive = false
  setSurfaceReturning(false)
  setCaseSurfaceDocked(false)
  setSurfaceReady(false)
  setCaseMediaVisible(false)
  clearCaseMediaFlight()
  frame.value?.style.removeProperty('--flow-surface-tone')
  lastCaseToneCss = ''
  for (const t of mobileTriggers) t.kill()
  mobileTriggers = []
  killHopTween()
  killCaseSettleTween()
  killFormatsSettleTween()
  mobileFormatsArrived = false
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
let lastFormatsSectionEl: HTMLElement | null = null
let lastFormatsSurfaceEl: HTMLElement | null = null

/** Prevent re-entrant buildMorph ↔ ScrollTrigger.refresh softlocks (SPA return to `/`). */
let morphGen = 0
let morphWatchTimer = 0
let morphBooting = false
/** After SPA mount, markers/layout thrash — pin/Teleport here freezes the tab. */
let morphQuietUntil = 0
let refreshDepth = 0

function stageChangesAllowed() {
  if (!keepAliveActive || morphBooting || suppressStageCallbacks) return false
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

  // 2–3) Stable stone threshold hops. Upward path is also covered by native-scroll reconcile.
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
        requestStage('scrub', true)
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

  if (props.formatsSectionEl && props.formatsSurfaceEl) {
    mobileTriggers.push(
      ScrollTrigger.create({
        trigger: props.formatsSectionEl,
        start: MOBILE_FORMATS_TRIGGER,
        invalidateOnRefresh: true,
        onEnter: () => {
          if (!stageChangesAllowed()) return
          enterMobileFormatsFrame()
        },
        onLeaveBack: () => {
          if (!stageChangesAllowed()) return
          leaveMobileFormatsFrame()
        },
      }),
    )
  }

  lastScrollY = window.scrollY
  paintHeroRest()
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

    const reduced = systemReducedMotion()
    if (reduced) {
      if (mobileActive) {
        const handoffY = mobileCaseHandoffBounds()?.forwardY
          ?? Number.POSITIVE_INFINITY
        if (props.formatsSurfaceEl && mobileFormatsShouldBeActive()) {
          mobileCaseProgress = 1
          mobileCaseArrived = true
          mobileFormatsArrived = true
          caseMediaActive = false
          setCaseSurfaceDocked(false)
          const dest = formatsSurfacePose()
          if (dest) paintBox(dest, 1)
          requestAnimationFrame(() => pinFormatsFrame())
        } else if (props.caseMediaEl && window.scrollY >= handoffY) {
          mobileCaseProgress = 1
          mobileCaseArrived = true
          caseMediaActive = true
          setCaseSurfaceDocked(true)
          const dest = caseMediaPose()
          if (dest) paintBox(dest, 1)
          requestAnimationFrame(() => pinCaseFrame())
        } else {
          const stage = stageFromScroll()
          if (stage === 'scrub') paintScrub(window.scrollY, true)
          else {
            const dest = hopPose(stage)
            if (dest) paintBox(dest, 1)
          }
        }
        announceSurfaceReady()
        return
      }
      target.h = 1
      target.v = 1
      live.h = 1
      live.v = 1
      paintDesktop()
      announceSurfaceReady()
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
      // A cold /#cases load has no preceding Hero → Kado journey. Place the
      // surface at its actual initial viewport target before the first paint.
      if (initialCasesHashEntry.value) {
        const dest = caseMediaPose()
        if (dest) {
          mobileCaseProgress = 1
          mobileCaseArrived = true
          caseMediaActive = true
          setCaseSurfaceDocked(true)
          paintBox(dest, 1)
          requestAnimationFrame(() => {
            pinCaseFrame()
          })
        }
      }
      // A detail → home return already has its own fullscreen image flight.
      // Dock the real surface immediately after the mobile corridor has painted
      // its initial rest pose, while that overlay is still fully covering it.
      if (returningHomeFromCaseDetail()) {
        const dest = caseMediaPose()
        if (dest) dockMobileCaseFrameUnderDetailReturn(dest)
      }
      announceSurfaceReady()
      lastFromEl = props.fromEl ?? null
      lastToEl = props.toEl ?? null
      lastPlan = props.plan ?? null
      lastCaseSectionEl = props.caseSectionEl ?? null
      lastCaseMediaEl = props.caseMediaEl ?? null
      lastFormatsSectionEl = props.formatsSectionEl ?? null
      lastFormatsSurfaceEl = props.formatsSurfaceEl ?? null
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

    if (props.formatsSectionEl && props.formatsSurfaceEl) {
      formatsTrigger = ScrollTrigger.create({
        trigger: props.formatsSectionEl,
        start: FORMATS_SCRUB_START,
        end: FORMATS_SCRUB_END,
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
      formatsTrigger = null
    }

    const s = computeDesktopTarget()
    desktopTargetS = s
    desktopLiveS = s
    paintDesktop(s)
    announceSurfaceReady()
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
    lastFormatsSectionEl = props.formatsSectionEl ?? null
    lastFormatsSurfaceEl = props.formatsSurfaceEl ?? null
  } finally {
    if (gen === morphGen) {
      beginMorphQuiet(1800)
      morphBooting = false
      suppressStageCallbacks = false
    }
  }
}

function onResize() {
  if (!keepAliveActive) return
  if (isMobileChromeHeightOnlyResize()) return
  capturePoses()
  if (mobileActive) {
    if (mobileFormatsArrived || formatsSettleTween) {
      if (formatsSettleTween) return
      if (formatsFramePinned()) syncPinnedMask()
      else {
        const dest = formatsSurfacePose()
        if (dest) paintBox(dest, 1)
        if (mobileFormatsArrived) pinFormatsFrame()
      }
      return
    }
    if (mobileCaseProgress > 0.005) {
      if (caseSettleTween) return
      if (caseFramePinned()) syncPinnedMask()
      else {
        const dest = caseMediaPose()
        if (dest) paintBox(dest, 1)
        if (mobileCaseArrived) pinCaseFrame()
      }
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
  if (!keepAliveActive) return
  if (mobileActive) {
    if (stageChangesAllowed()) reconcileFromScroll()
    if (formatsFramePinned() || caseFramePinned()) syncPinnedMask()
    return
  }
  if (caseFramePinned()) {
    syncPinnedMask()
    return
  }
  if (mobileActive || hopTween) return
  ensureTick()
}

onMounted(async () => {
  resetFlowSurfaceMaskSession()
  hostUnmounted = false
  initialCasesHashEntry.value = window.location.hash === '#cases'
    && !preload.revealed.value
    && !returningHomeFromCaseDetail()
  const coldDirectEntry = !preload.revealed.value
    && !returningHomeFromCaseDetail()
    && !initialCasesHashEntry.value
  const animateMobileHeroEntry = coldDirectEntry
    && (isNarrowViewport() || isCoarsePointer())
    && !systemReducedMotion()
  if (animateMobileHeroEntry) {
    heroEntryArmed.value = true
    heroEntryRunning.value = false
    stopHeroEntryRevealWatch = watch(
      () => preload.revealed.value,
      (revealed) => {
        if (revealed) startHeroEntryReveal()
      },
      { immediate: true },
    )
  }
  await nextTick()
  // Let the route/page DOM settle before ST — avoids refresh↔pin softlock on SPA entry.
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  if (hostUnmounted) return
  registerFlowSurfaceClipPathEl(clipPathEl.value)
  registerFlowSurfaceLiveBoxNudge((deltaY) => {
    if (liveBox) liveBox = { ...liveBox, top: liveBox.top + deltaY }
  })
  // Paint the real Hero surface and copy before loading the scroll engine.
  // This hands off the SSR primer without putting GSAP on the LCP path.
  ensureHeroRestPlaceholder()
  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('scroll', onCaseMediaScroll, { passive: true })
  if (coldDirectEntry) scheduleColdMotionBoot()
  else void bootMotionEngine()
})

onUnmounted(() => {
  hostUnmounted = true
  if (motionBootTimer) window.clearTimeout(motionBootTimer)
  motionBootTimer = 0
  finishHeroEntryReveal()
  if (motionIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(motionIdleId)
  }
  motionIdleId = null
  removeMotionIntent?.()
  removeMotionIntent = null
  morphGen += 1
  morphBooting = false
  lastFromEl = null
  lastToEl = null
  lastPlan = null
  lastCaseSectionEl = null
  lastCaseMediaEl = null
  lastFormatsSectionEl = null
  lastFormatsSurfaceEl = null
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

onDeactivated(() => {
  keepAliveActive = false
  if (raf) cancelAnimationFrame(raf)
  raf = 0
})

onActivated(() => {
  keepAliveActive = true
  void nextTick(() => {
    requestAnimationFrame(() => {
      if (!keepAliveActive || hostUnmounted) return
      capturePoses()
      onResize()
      ensureTick()
    })
  })
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
      props.formatsSectionEl,
      props.formatsSurfaceEl,
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
        && props.formatsSectionEl === lastFormatsSectionEl
        && props.formatsSurfaceEl === lastFormatsSurfaceEl
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
    mobileCaseHandoffY = null
  },
)

watch(activeCaseId, async () => {
  mobileCaseHandoffY = null
  await nextTick()
  if (caseFramePinned()) {
    syncPinnedMask()
  } else if (caseSurfaceReady.value) {
    const dest = caseMediaPose()
    if (dest) paintBox(dest, 1)
  }
})

// The Cases media ref can arrive just after the corridor itself. Complete the
// same hidden handoff then, but never consume it before a live mobile corridor
// exists: a later buildMorph() would otherwise reset the prepared frame.
watch(
  [caseDetailHomeReturnPending, () => props.caseMediaEl],
  ([pending, mediaEl]) => {
    if (
      !pending
      || !mediaEl
      || !mobileActive
      || mobileTriggers.length === 0
      || morphBooting
    ) return
    const dest = caseMediaPose()
    if (dest) dockMobileCaseFrameUnderDetailReturn(dest)
  },
  { flush: 'post' },
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
        :class="{
          'flow-surface-frame--hero-entry': heroEntryArmed,
          'flow-surface-frame--hero-entry-running': heroEntryRunning,
          'flow-surface-frame--case-hidden': caseSurfaceReady,
        }"
        style="top: var(--layout-surface-top); left: var(--layout-margin); width: calc(100% - var(--layout-margin) * 2); height: calc(100% - var(--layout-surface-top) - var(--layout-margin));"
        @animationend="onFrameAnimationEnd"
      >
        <FlowSurface
          mode="window"
          class="inset-0 size-full"
          :tone-class="toneClass"
          tone-color="var(--flow-surface-tone, var(--palette-stone))"
          :active="!caseSurfaceReady"
        >
          <HomeHeroStage
            v-if="stageRest.w > 2"
            :rest-top="stageRest.top"
            :rest-left="stageRest.left"
            :stage-width="stageRest.w"
            :stage-height="stageRest.h"
            :section-el="heroSectionEl"
          />
        </FlowSurface>
      </div>
    </Teleport>
  </div>
</template>

<style>
.flow-surface-frame--hero-entry {
  clip-path: inset(100% 0 0 0);
}

.flow-surface-frame--hero-entry-running {
  animation: flow-surface-hero-entry 0.86s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.flow-surface-frame--case-hidden {
  opacity: 0;
}

@keyframes flow-surface-hero-entry {
  from { clip-path: inset(100% 0 0 0); }
  to { clip-path: inset(0 0 0 0); }
}

</style>
