<script setup lang="ts">
/**
 * Fixed Flow Surface — one clipped window.
 * Desktop: hero → stone (plan h/v lag).
 * Mobile: scrub hero→stone, then trigger-tweens stone→term→Kadoflow→center.
 */
import {
  applyBox,
  docToViewport,
  heroToKadoPlan,
  lerpBox,
  mixBox,
  padBox,
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
  FLOW_SURFACE_CLIP_ID,
  flowSurfaceMask,
  flushFlowSurfacePath,
  registerFlowSurfaceClipPathEl,
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
/** Soft follow while pinned — keep tiny lag so scroll jitter doesn’t chatter. */
const FOLLOW_LAG = 0.02
/** If farther than this (px), snap closer before lerping. */
const FOLLOW_MAX_GAP = 10
const FOLLOW_SETTLE_PX = 0.35
/** Ignore reverse hop triggers right after a forward hop (scroll bounce). */
const STAGE_FORWARD_LOCK_MS = HOP_DURATION * 1000 + 120

const props = withDefaults(
  defineProps<{
    fromEl?: HTMLElement | null
    toEl?: HTMLElement | null
    /** Rock image — mobile scroll markers. */
    stoneEl?: HTMLElement | null
    /** Title + phonetic — hop after stone `top 10%`. */
    termEl?: HTMLElement | null
    /** “Kadoflow” word — hop at stone `center top`. */
    wordEl?: HTMLElement | null
    /** Body block — hop at `center top` → unbound square. */
    bodyEl?: HTMLElement | null
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
    plan: () => heroToKadoPlan,
    toneClass: 'bg-stone',
  },
)

const frame = ref<HTMLElement | null>(null)
const clipPathEl = ref<SVGPathElement | null>(null)
/** Hero-rest pose — stage keeps this size/origin; frame morphs around it. */
const stageRest = reactive({ top: 0, left: 0, w: 1, h: 1 })
const heroSectionEl = computed(() => {
  const el = props.fromEl
  if (!el) return null
  return (el.closest('section') as HTMLElement | null) ?? el
})

let gsapMod: typeof import('gsap') | null = null
let stMod: typeof import('gsap/ScrollTrigger') | null = null
let trigger: { kill: () => void; progress: number } | null = null
let mobileTriggers: { kill: () => void }[] = []
let hopTween: { kill: () => void } | null = null
let target = { h: 0, v: 0 }
let live = { h: 0, v: 0 }
let fromPose: SurfaceBox | null = null
let toPose: SurfaceBox | null = null

/** Mobile corridor state */
let mobileActive = false
let mobileStage: MobileStage = 'scrub'
let heroPose: SurfaceBox | null = null
let stonePose: SurfaceBox | null = null
let centerPose: SurfaceBox | null = null
let scrubStartY = 0
let scrubEndY = 0
let liveBox: SurfaceBox | null = null
/** Snapshot used as hop tween start (destination tracks live each frame). */
let hopFromBox: SurfaceBox | null = null
let hopProgress = 0
let followTarget: SurfaceBox | null = null
/** Unrounded follow pose — paint snaps to px, this keeps smooth lag. */
let followLive: SurfaceBox | null = null
let followRaf = 0
let followLastTs = 0
/** Last good Kadoflow box in *document* space — viewport via docToViewport. */
let lastWordDoc: SurfaceBox | null = null
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

function boxGap(a: SurfaceBox, b: SurfaceBox) {
  return Math.max(
    Math.abs(a.top - b.top),
    Math.abs(a.left - b.left),
    Math.abs(a.width - b.width),
    Math.abs(a.height - b.height),
  )
}

/** Pull `from` toward `to` until the gap is at most `maxGap`. */
function clampGap(from: SurfaceBox, to: SurfaceBox, maxGap: number): SurfaceBox {
  const gap = boxGap(from, to)
  if (gap <= maxGap) return from
  return lerpBox(from, to, 1 - maxGap / gap)
}

function captureDesktopPoses() {
  if (!props.fromEl || !props.toEl) return false

  const fromDoc = readDocBox(props.fromEl)
  const toDoc = readDocBox(props.toEl)
  if (!fromDoc || !toDoc) return false

  const fromSection = sectionOf(props.fromEl)
  const toSection = sectionOf(props.toEl)

  const scrollStart = fromSection.getBoundingClientRect().top + window.scrollY
  fromPose = poseAtScrollY(fromDoc, scrollStart)

  const scrollEnd = scrollYForCenterCenter(toSection)
  toPose = poseAtScrollY(toDoc, scrollEnd)

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
    flowSurfaceMask.pointerInteractive = true
    return
  }
  if (y > top + window.innerHeight * 0.12) {
    flowSurfaceMask.morph = 1
    flowSurfaceMask.pointerInteractive = false
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
  flowSurfaceMask.pointerInteractive = flowSurfaceMask.morph < IDLE_EPS
}

function paintBox(box: SurfaceBox, morph: number) {
  if (!frame.value) return
  const next = roundBox(box)
  if (
    liveBox
    && next.top === liveBox.top
    && next.left === liveBox.left
    && next.width === liveBox.width
    && next.height === liveBox.height
    && Math.abs(flowSurfaceMask.morph - morph) < 0.001
  ) {
    return
  }
  liveBox = next
  writeMaskBox(next, morph)
  applyBox(frame.value, next)
  flushFlowSurfacePath(next)
}

function paintDesktop() {
  if (!fromPose || !toPose) return
  const box = mixBox(fromPose, toPose, live.h, live.v)
  // min(h,v): average hit ~0.9 while vertical still mid-flight (surface not under stone yet).
  paintBox(box, Math.min(live.h, live.v))
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

function paintScrub(scrollY = window.scrollY) {
  if (!heroPose || !stonePose) {
    ensureHeroRestPlaceholder()
    return
  }
  const p = scrubProgressAt(scrollY)
  const ease = parseEase ? parseEase('power2.inOut')(p) : p
  paintBox(lerpBox(heroPose, stonePose, ease), p)
}

/** Live viewport box for “Kadoflow” — never reuse a stale viewport snapshot. */
function wordPose(): SurfaceBox | null {
  const pad = layoutMarginPx()
  const live = readBox(props.wordEl)
  if (live) {
    const doc = readDocBox(props.wordEl)
    if (doc) lastWordDoc = doc
    return padBox(live, pad)
  }
  if (lastWordDoc) return padBox(docToViewport(lastWordDoc), pad)
  return null
}

/** Live viewport box for the active pin target (tracks while scrolling). */
function hopPose(hop: MobileHop): SurfaceBox | null {
  if (hop === 'term') return readBox(props.termEl)
  if (hop === 'word') return wordPose()
  return centerPose
}

function killHopTween() {
  hopTween?.kill()
  hopTween = null
  hopFromBox = null
  hopProgress = 0
}

function stopFollow() {
  if (followRaf) {
    cancelAnimationFrame(followRaf)
    followRaf = 0
  }
  followLastTs = 0
  followTarget = null
  followLive = null
}

function sampleFollowTarget() {
  if (mobileStage === 'term' || mobileStage === 'word') {
    followTarget = hopPose(mobileStage)
    return
  }
  if (mobileStage === 'center') {
    followTarget = centerPose
    return
  }
  followTarget = null
}

function tickFollow(now: number) {
  followRaf = 0
  if (!mobileActive || hopTween || mobileStage === 'scrub') return

  sampleFollowTarget()
  if (!followTarget) return

  if (!followLastTs) followLastTs = now
  const dt = Math.min(0.064, Math.max(0, (now - followLastTs) / 1000))
  followLastTs = now

  if (!followLive) followLive = liveBox ? { ...liveBox } : { ...followTarget }

  followLive = clampGap(followLive, followTarget, FOLLOW_MAX_GAP)
  const k = 1 - Math.exp(-dt / FOLLOW_LAG)
  followLive = lerpBox(followLive, followTarget, k)
  if (boxGap(followLive, followTarget) <= FOLLOW_SETTLE_PX) {
    followLive = { ...followTarget }
  }

  paintBox(followLive, 1)

  if (boxGap(followLive, followTarget) > FOLLOW_SETTLE_PX) {
    followRaf = requestAnimationFrame(tickFollow)
  }
}

function ensureFollow() {
  if (!mobileActive || hopTween) return
  if (mobileStage !== 'term' && mobileStage !== 'word' && mobileStage !== 'center') return
  if (!followRaf) {
    followLastTs = 0
    followRaf = requestAnimationFrame(tickFollow)
  }
}

/** Scroll sample — don't hard-snap; soft follow handles paint. */
function onPinnedScroll() {
  if (!mobileActive || mobileStage === 'scrub' || hopTween) return
  sampleFollowTarget()
  ensureFollow()
}

/**
 * Single entry for stage changes.
 * Forward-lock only blocks reverse *bounce* right after an animated forward hop;
 * intentional upward scroll clears the lock.
 */
function requestStage(next: MobileStage, animate: boolean) {
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

  stopFollow()
  mobileStage = hop
  killHopTween()

  const from = liveBox ?? dest
  if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    paintBox(dest, 1)
    ensureFollow()
    return
  }

  // Keep a fallback dest if word/term briefly fails mid-tween — never fall back to term on word hops.
  let fallbackDest = { ...dest }
  hopFromBox = { ...from }
  hopProgress = 0
  const gsap = gsapMod.default
  const proxy = { t: 0 }
  hopTween = gsap.to(proxy, {
    t: 1,
    duration: HOP_DURATION,
    ease: HOP_EASE,
    onUpdate: () => {
      hopProgress = proxy.t
      const liveDest = hopPose(hop)
      if (liveDest) fallbackDest = { ...liveDest }
      // Live destination: frozen viewport dest caused overshoot (scroll moved the word up).
      paintBox(lerpBox(hopFromBox!, fallbackDest, hopProgress), 1)
    },
    onComplete: () => {
      hopTween = null
      hopFromBox = null
      hopProgress = 0
      const finalDest = hopPose(hop) ?? fallbackDest
      paintBox(finalDest, 1)
      sampleFollowTarget()
      ensureFollow()
    },
  })
}

/**
 * Hand control back to the scrub corridor immediately.
 * No hopTween — a return tween was blocking scrub onUpdate and jumped morph 1→0 at the end
 * (hero popped in with no fade).
 */
function enterScrub() {
  mobileStage = 'scrub'
  stopFollow()
  killHopTween()
  if (!heroPose || !stonePose) return
  paintScrub()
}

function stageFromScroll(): MobileStage {
  const stoneMark = props.stoneEl ?? props.toEl
  const body = props.bodyEl
  if (!stoneMark || !body) return 'scrub'

  const y = window.scrollY
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

  // Body `center top` — square after Kadoflow (later than stone `center top`).
  if (y >= scrollYForCenterTop(body)) return 'center'
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

function clearLayoutResync() {
  for (const id of layoutResyncTimers) window.clearTimeout(id)
  layoutResyncTimers = []
  removeLayoutResync?.()
  removeLayoutResync = null
}

function resyncAfterLayout() {
  if (!gsapMod || !stMod || !frame.value) return
  if (!props.fromEl || !props.toEl) return
  // Corridor never built (first paint missed refs) — full rebuild, not a soft sync.
  if (mobileTriggers.length === 0 && !trigger) {
    buildMorph()
    return
  }
  const ok = capturePoses()
  if (!ok) {
    ensureHeroRestPlaceholder()
    bootAlignHeroVisibility()
    return
  }
  if (mobileActive) {
    suppressStageCallbacks = true
    syncMobileStage(false)
    stMod.ScrollTrigger.refresh()
    syncMobileStage(false)
    if (scrubProgressAt(window.scrollY) < 0.02 && heroPose) {
      mobileStage = 'scrub'
      paintBox(heroPose, 0)
    }
    suppressStageCallbacks = false
  } else if (trigger) {
    setTargetsFromProgress(trigger.progress)
    live.h = target.h
    live.v = target.v
    paintDesktop()
    ensureTick()
    if (trigger.progress < 0.02) {
      live.h = 0
      live.v = 0
      target.h = 0
      target.v = 0
      paintDesktop()
    }
  }
}

function scheduleLayoutResync() {
  clearLayoutResync()
  const delays = [50, 150, 400, 900, 1800]
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

  void document.fonts?.ready?.then(() => {
    resyncAfterLayout()
  })
}

/** Scroll-driven stage reconcile — catches missed leaveBacks when scrolling up. */
function reconcileFromScroll() {
  const y = window.scrollY
  if (y < lastScrollY - 1) {
    // Intentional upward scroll — don't let forward-lock trap the hero.
    stageLockUntil = 0
  }
  lastScrollY = y

  const next = stageFromScroll()
  if (next === mobileStage) {
    if (next === 'scrub' && !hopTween) paintScrub()
    else onPinnedScroll()
    return
  }

  // Don't yank an in-flight forward hop back (threshold flicker).
  if (hopTween && STAGE_RANK[next] < STAGE_RANK[mobileStage]) return

  const forward = STAGE_RANK[next] > STAGE_RANK[mobileStage]
  requestStage(next, forward && next !== 'scrub')
}

function setTargetsFromProgress(progress: number) {
  if (!parseEase) {
    target.h = progress
    target.v = progress
    return
  }
  const next = targetsFromScrollProgress(props.plan, progress, parseEase)
  target.h = next.h
  target.v = next.v
}

function tick(now: number) {
  raf = 0
  if (!lastTs) lastTs = now
  const dt = Math.min(0.064, Math.max(0, (now - lastTs) / 1000))
  lastTs = now

  // Mobile hops + scrub paint themselves; desktop lag only here.
  if (mobileActive) return

  const snapMorph = useMobileCorridor()
  if (snapMorph) {
    live.h = target.h
    live.v = target.v
    paintDesktop()
    return
  }

  const lag = Math.max(0.05, props.plan.lag)
  const k = 1 - Math.exp(-dt / lag)
  live.h += (target.h - live.h) * k
  live.v += (target.v - live.v) * k

  if (nearTarget()) {
    live.h = target.h
    live.v = target.v
  }

  paintDesktop()

  if (!nearTarget()) {
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
  for (const t of mobileTriggers) t.kill()
  mobileTriggers = []
  killHopTween()
  stopFollow()
  clearLayoutResync()
  suppressStageCallbacks = false
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
}

function buildMobileMorph(gsap: typeof import('gsap').default, ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger) {
  const stoneMark = props.stoneEl ?? props.toEl
  const body = props.bodyEl
  const triggerFrom = sectionOf(props.fromEl!)
  if (!stoneMark || !body || !heroPose || !stonePose) return

  // Soft-follow + stage reconcile (missed leaveBacks when scrolling up).
  mobileTriggers.push(
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: () => reconcileFromScroll(),
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
        const ease = parseEase ? parseEase('power2.inOut')(self.progress) : self.progress
        paintBox(lerpBox(heroPose!, stonePose!, ease), self.progress)
      },
      onRefresh: () => {
        captureMobilePoses()
        if (hopTween) return
        if (typeof performance !== 'undefined' && performance.now() < stageLockUntil) return
        // Refresh during boot with collapsed markers must not paint morph=1.
        if (!markersReliable() && scrubProgressAt(window.scrollY) < 0.02) {
          if (heroPose) paintBox(heroPose, 0)
          return
        }
        syncMobileStage(false)
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
        if (suppressStageCallbacks) return
        requestStage('term', true)
      },
      onLeaveBack: () => {
        if (suppressStageCallbacks) return
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
        if (suppressStageCallbacks) return
        requestStage('word', true)
      },
      onLeaveBack: () => {
        if (suppressStageCallbacks) return
        requestStage('term', true)
      },
    }),
  )

  mobileTriggers.push(
    ScrollTrigger.create({
      trigger: body,
      start: 'center top',
      invalidateOnRefresh: true,
      onEnter: () => {
        if (suppressStageCallbacks) return
        requestStage('center', true)
      },
      onLeaveBack: () => {
        if (suppressStageCallbacks) return
        requestStage('word', true)
      },
    }),
  )

  lastScrollY = window.scrollY
  // Boot: quiet ST callbacks while we snap from scroll (refresh used to fire false onEnter).
  suppressStageCallbacks = true
  syncMobileStage(false)
  ScrollTrigger.refresh()
  syncMobileStage(false)
  // First screen hard-rest if scrub progress is still essentially zero.
  if (scrubProgressAt(window.scrollY) < 0.02 && heroPose) {
    mobileStage = 'scrub'
    paintBox(heroPose, 0)
  }
  suppressStageCallbacks = false
  scheduleLayoutResync()
}

function buildMorph() {
  killMorph()
  if (!gsapMod || !stMod || !frame.value) return

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
    scheduleLayoutResync()
    return
  }

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
    onUpdate: (self) => {
      setTargetsFromProgress(self.progress)
      ensureTick()
    },
    onRefresh: (self) => {
      capturePoses()
      setTargetsFromProgress(self.progress)
      ensureTick()
    },
  })

  setTargetsFromProgress(trigger.progress)
  live.h = target.h
  live.v = target.v
  paintDesktop()
  ensureTick()
  ScrollTrigger.refresh()
  setTargetsFromProgress(trigger.progress)
  live.h = target.h
  live.v = target.v
  paintDesktop()
  // First screen: never leave morph elevated after refresh quirks.
  if (trigger.progress < 0.02) {
    live.h = 0
    live.v = 0
    target.h = 0
    target.v = 0
    paintDesktop()
  }
  scheduleLayoutResync()
}

function onResize() {
  if (isMobileChromeHeightOnlyResize()) return
  capturePoses()
  if (mobileActive) {
    syncMobileStage(false)
    return
  }
  paintDesktop()
  ensureTick()
}

onMounted(async () => {
  gsapMod = await import('gsap')
  stMod = await import('gsap/ScrollTrigger')
  await nextTick()
  registerFlowSurfaceClipPathEl(clipPathEl.value)
  buildMorph()
  window.addEventListener('resize', onResize, { passive: true })
})

onUnmounted(() => {
  registerFlowSurfaceClipPathEl(null)
  killMorph()
  window.removeEventListener('resize', onResize)
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
      props.plan,
    ] as const,
  async () => {
    await nextTick()
    fromPose = null
    toPose = null
    liveBox = null
    mobileActive = false
    buildMorph()
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
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-[1]">
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

    <div
      ref="frame"
      class="absolute overflow-visible will-change-[top,left,width,height]"
    >
      <FlowSurface
        mode="window"
        class="inset-0 size-full"
        :tone-class="toneClass"
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
  </div>
</template>
