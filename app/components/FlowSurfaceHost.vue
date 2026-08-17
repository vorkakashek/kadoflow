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
  scrollYForCenterCenter,
  scrollYForCenterTop,
  scrollYForTopAt,
  targetsFromScrollProgress,
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
/** Parked / fill fully opaque once lagged progress passes this. */
const CASE_PARK_P = 0.98
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
const caseSurfaceMedia = useState<{ src: string; alt: string } | null>(
  'home-case-surface-media',
  () => null,
)
/** Bumped by HomeCases after a case switch so we morph the parked box. */
const caseMediaMorphNonce = useState('home-case-media-morph-nonce', () => 0)

/** Template: hide hero stage / show case fill. */
const showCaseFill = ref(false)
const fillFrontEl = ref<HTMLImageElement | null>(null)
const fillBackEl = ref<HTMLImageElement | null>(null)
const fillFrontSrc = ref('')
const fillFrontAlt = ref('')
const fillBackSrc = ref('')
const fillBackAlt = ref('')
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
      if (activeFillLayer === 0) {
        fillFrontSrc.value = media.src
        fillFrontAlt.value = media.alt
      } else {
        fillBackSrc.value = media.src
        fillBackAlt.value = media.alt
      }
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

function paintDesktop(s = desktopLiveS) {
  if (mobileActive) return
  // Case↔case morph in flight — onUpdate owns paint.
  if (hopTween) return

  if (s >= 1) {
    // Kado <-> Cases corridor (s in [1, 2], segment progress t in [0, 1])
    const t = Math.min(1, Math.max(0, s - 1))
    const media = caseSurfaceMedia.value
    if (media) {
      if (activeFillLayer === 0) {
        fillFrontSrc.value = media.src
        fillFrontAlt.value = media.alt
      } else {
        fillBackSrc.value = media.src
        fillBackAlt.value = media.alt
      }
      lastSwitchedSrc = media.src
    }

    const docked = t >= CASE_PARK_P
    if (docked !== caseMediaActive) {
      caseMediaActive = docked
      caseSurfaceDocked.value = docked
    }
    // Soft fade in for photo + desaturation of surface tone
    const fadeT = Math.min(1, Math.max(0, (t - 0.1) / 0.9))
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
    // t===1 → live photo; t===0 → live stone. Same path both ways, no seam.
    paintBox(lerpBox(from, to, t), 1)
    return
  }

  // Hero <-> Kado corridor (s < 1)
  if (showCaseFill.value || caseSurfaceDocked.value || caseMediaActive) {
    showCaseFill.value = false
    caseFillOpacity.value = 0
    caseMediaActive = false
    caseSurfaceDocked.value = false
  }

  const p = Math.min(1, Math.max(0, s))
  const { h, v } = targetsFromScrollProgress(props.plan, p, parseEase ?? ((_) => (u) => u))
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

/** While parked: morph surface box to the current case media figure (case switch). */
function morphParkedCaseMedia(animate: boolean) {
  if (mobileActive || desktopLiveS < (1 + CASE_PARK_P) || !gsapMod || !frame.value) return
  const dest = caseMediaPose()
  if (!dest) return

  const from = liveBox ?? dest
  if (
    !animate
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    paintBox(dest, 1)
    return
  }

  // Don't fight mobile hop / other tweens.
  if (hopTween) return

  hopFromBox = { ...from }
  hopProgress = 0
  const gsap = gsapMod.default
  const proxy = { t: 0 }
  let fallbackDest = { ...dest }
  hopTween = gsap.to(proxy, {
    t: 1,
    duration: CASE_MORPH_DURATION,
    ease: CASE_MORPH_EASE,
    onUpdate: () => {
      hopProgress = proxy.t
      const liveDest = caseMediaPose()
      if (liveDest) fallbackDest = { ...liveDest }
      paintBox(lerpBox(hopFromBox!, fallbackDest, hopProgress), 1)
    },
    onComplete: () => {
      hopTween = null
      hopFromBox = null
      hopProgress = 0
      paintBox((caseMediaPose() ?? fallbackDest), 1)
      caseMediaActive = true
    },
  })
}

/**
 * Sequential photo wipe on case switch:
 * 1. Old photo collapses right-to-left: inset(0 0% 0 0) -> inset(0 100% 0 0)
 * 2. Morph box dimensions (if changed)
 * 3. New photo expands left-to-right: inset(0 100% 0 0) -> inset(0 0% 0 0)
 */
function switchCasePhoto(media: { src: string; alt: string }, animate: boolean) {
  if (lastSwitchedSrc === media.src) return
  lastSwitchedSrc = media.src

  if (
    !animate
    || !caseMediaActive
    || !gsapMod
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    photoSwitchTl?.kill()
    photoSwitchTl = null
    if (activeFillLayer === 0) {
      fillFrontSrc.value = media.src
      fillFrontAlt.value = media.alt
      if (fillFrontEl.value) {
        gsapMod?.default.set(fillFrontEl.value, { clipPath: 'inset(0 0% 0 0)', autoAlpha: 1 })
      }
      if (fillBackEl.value) {
        gsapMod?.default.set(fillBackEl.value, { clipPath: 'inset(0 100% 0 0)', autoAlpha: 0 })
      }
    } else {
      fillBackSrc.value = media.src
      fillBackAlt.value = media.alt
      if (fillBackEl.value) {
        gsapMod?.default.set(fillBackEl.value, { clipPath: 'inset(0 0% 0 0)', autoAlpha: 1 })
      }
      if (fillFrontEl.value) {
        gsapMod?.default.set(fillFrontEl.value, { clipPath: 'inset(0 100% 0 0)', autoAlpha: 0 })
      }
    }
    morphParkedCaseMedia(false)
    return
  }

  const gsap = gsapMod.default
  photoSwitchTl?.kill()

  const curEl = activeFillLayer === 0 ? fillFrontEl.value : fillBackEl.value
  const nextEl = activeFillLayer === 0 ? fillBackEl.value : fillFrontEl.value

  if (activeFillLayer === 0) {
    fillBackSrc.value = media.src
    fillBackAlt.value = media.alt
  } else {
    fillFrontSrc.value = media.src
    fillFrontAlt.value = media.alt
  }

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

  // Step 1: Old photo collapses right-to-left
  tl.to(curEl, {
    clipPath: 'inset(0 100% 0 0)',
    duration: 0.5,
    ease: 'power2.in',
  }, 0)

  // Step 2: At 0.5s (old photo fully gone): morph box to new mockup dimensions
  tl.call(() => {
    morphParkedCaseMedia(true)
  }, undefined, 0.5)

  // Step 3: New photo expands left-to-right
  tl.to(nextEl, {
    clipPath: 'inset(0 0% 0 0)',
    duration: 0.75,
    ease: 'power2.out',
  }, 0.5)
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

  if (next === 'scrub') enterScrub()
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
 * Hand control back to the scrub corridor immediately.
 * Unpin first so the frame is viewport-fixed again, then paint the scrub pose.
 */
function enterScrub() {
  mobileStage = 'scrub'
  killHopTween()
  const wasPinned = !!pinTo.value
  unpinFrame()
  const paint = () => {
    if (!heroPose || !stonePose) return
    paintScrub(window.scrollY, true)
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
    if (mobileStage === 'scrub' || !stageChangesAllowed()) {
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
    if (mobileStage === 'scrub' && !hopTween && !pinTo.value && heroPose && stonePose) {
      const lag = Math.max(0.04, MOBILE_SCRUB_LAG)
      const k = 1 - Math.exp(-dt / lag)
      scrubLiveP += (scrubTargetP - scrubLiveP) * k
      if (Math.abs(scrubTargetP - scrubLiveP) < 0.00035) scrubLiveP = scrubTargetP
      paintScrubAt(scrubLiveP)
      if (Math.abs(scrubTargetP - scrubLiveP) >= 0.00035) {
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

  const lag = Math.max(0.06, props.plan.lag)
  const k = 1 - Math.exp(-dt / lag)
  desktopLiveS += (sTarget - desktopLiveS) * k

  if (Math.abs(sTarget - desktopLiveS) < 0.0008) {
    desktopLiveS = sTarget
  }

  paintDesktop(desktopLiveS)

  if (Math.abs(sTarget - desktopLiveS) >= 0.0008) {
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
  caseMediaActive = false
  setCaseSurfaceDocked(false)
  for (const t of mobileTriggers) t.kill()
  mobileTriggers = []
  killHopTween()
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
  // Snap scrub paint only — never pin/Teleport while ST is refreshing.
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
  if (mobileActive || hopTween) return
  paintDesktop()
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
  if (!caseMediaActive) return
  if (caseSurfaceMedia.value) {
    switchCasePhoto(caseSurfaceMedia.value, true)
  }
})

watch(
  caseSurfaceMedia,
  (media) => {
    if (!media) return
    if (caseMediaActive) {
      switchCasePhoto(media, true)
    } else {
      if (activeFillLayer === 0) {
        fillFrontSrc.value = media.src
        fillFrontAlt.value = media.alt
      } else {
        fillBackSrc.value = media.src
        fillBackAlt.value = media.alt
      }
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
            <img
              v-if="fillFrontSrc"
              ref="fillFrontEl"
              class="case-surface-fill__img"
              :src="fillFrontSrc"
              :alt="fillFrontAlt"
              :style="{ opacity: caseFillOpacity }"
              decoding="async"
            >
            <img
              v-if="fillBackSrc"
              ref="fillBackEl"
              class="case-surface-fill__img"
              :src="fillBackSrc"
              :alt="fillBackAlt"
              :style="{ opacity: caseFillOpacity }"
              decoding="async"
            >
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

.case-surface-fill__img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  clip-path: inset(0 0 0 0);
  will-change: clip-path;
}
</style>
