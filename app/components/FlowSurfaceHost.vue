<script setup lang="ts">
/**
 * Fixed Flow Surface — hangs in the background.
 * Scroll drives content-tied pose targets; live box eases with plan.lag (~0.1s).
 * Poses are cached viewport snapshots (no 1:1 chase after arriving).
 */
import {
  applyBox,
  applyBoxTransform,
  heroToKadoPlan,
  mixBox,
  poseAtScrollY,
  readDocBox,
  scrollYForCenterCenter,
  targetsFromScrollProgress,
  type SurfaceBox,
  type SurfaceMorphPlan,
} from '~/utils/flowSurfaceMorph'
import { flowSurfaceMask, flushFlowSurfacePath } from '~/composables/useFlowSurfaceMask'
import {
  isAppleTouchDevice,
  isCoarsePointer,
  isMobileChromeHeightOnlyResize,
  isNarrowViewport,
} from '~/utils/mobileViewport'

const props = withDefaults(
  defineProps<{
    fromEl?: HTMLElement | null
    toEl?: HTMLElement | null
    plan?: SurfaceMorphPlan
    toneClass?: string
  }>(),
  {
    fromEl: null,
    toEl: null,
    plan: () => heroToKadoPlan,
    toneClass: 'bg-stone',
  },
)

const frame = ref<HTMLElement | null>(null)

let gsapMod: typeof import('gsap') | null = null
let stMod: typeof import('gsap/ScrollTrigger') | null = null
let trigger: { kill: () => void; progress: number } | null = null
/** Scroll-driven targets */
let target = { h: 0, v: 0 }
/** Smoothed live morph (painted) */
let live = { h: 0, v: 0 }
/** Cached viewport poses — fixed in screen space */
let fromPose: SurfaceBox | null = null
let toPose: SurfaceBox | null = null

let raf = 0
let lastTs = 0
let parseEase: ((name: string) => (t: number) => number) | null = null
/** Touch mid-morph uses CSS scale; track so we rebuild path on enter/exit. */
let transformMorphActive = false

const IDLE_EPS = 0.02

function isTouchUi() {
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

/** Snapshot hero rest + kado rest as viewport boxes (content triggers, not live chase). */
function capturePoses() {
  if (!props.fromEl || !props.toEl) return false

  const fromDoc = readDocBox(props.fromEl)
  const toDoc = readDocBox(props.toEl)
  if (!fromDoc || !toDoc) return false

  const fromSection = sectionOf(props.fromEl)
  const toSection = sectionOf(props.toEl)

  // Hero pose: as when section top hits viewport top (ST start)
  const scrollStart = fromSection.getBoundingClientRect().top + window.scrollY
  fromPose = poseAtScrollY(fromDoc, scrollStart)

  // Kado pose: as when section center hits viewport center (ST end)
  const scrollEnd = scrollYForCenterCenter(toSection)
  toPose = poseAtScrollY(toDoc, scrollEnd)

  return true
}

function writeMaskBox(box: SurfaceBox) {
  flowSurfaceMask.top = box.top
  flowSurfaceMask.left = box.left
  flowSurfaceMask.width = Math.max(1, box.width)
  flowSurfaceMask.height = Math.max(1, box.height)
  flowSurfaceMask.morph = Math.min(1, Math.max(0, (live.h + live.v) * 0.5))
  flowSurfaceMask.pointerInteractive = live.h < IDLE_EPS && live.v < IDLE_EPS
}

function paint() {
  if (!frame.value || !fromPose || !toPose) return

  const box = mixBox(fromPose, toPose, live.h, live.v)
  const morph = Math.min(1, Math.max(0, (live.h + live.v) * 0.5))
  const touchMid = isTouchUi() && morph > 0.02 && morph < 0.98

  writeMaskBox(box)

  if (touchMid) {
    // Compositor morph: basis = hero rest size, path frozen — no per-frame path rebuild.
    if (!transformMorphActive) {
      transformMorphActive = true
      // One last path at hero-rest size before we scale the frame.
      flushFlowSurfacePath({
        top: fromPose.top,
        left: fromPose.left,
        width: fromPose.width,
        height: fromPose.height,
      })
    }
    applyBoxTransform(frame.value, box, fromPose)
    return
  }

  if (transformMorphActive) {
    transformMorphActive = false
  }
  applyBox(frame.value, box)
  flushFlowSurfacePath(box)
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

  // Mobile (incl. Android): snap morph to scroll — lag trails keep rebuilding
  // path/clip after the finger stops and tanks FPS mid hero→kado.
  const snapMorph =
    isAppleTouchDevice() || isNarrowViewport() || isCoarsePointer()
  if (snapMorph) {
    live.h = target.h
    live.v = target.v
    paint()
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

  paint()

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
  transformMorphActive = false
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
}

function buildMorph() {
  killMorph()
  if (!gsapMod || !stMod || !frame.value || !props.fromEl || !props.toEl) return

  const gsap = gsapMod.default
  const { ScrollTrigger } = stMod
  gsap.registerPlugin(ScrollTrigger)
  parseEase = (name: string) => gsap.parseEase(name)

  if (!capturePoses()) return

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    target.h = 1
    target.v = 1
    live.h = 1
    live.v = 1
    paint()
    return
  }

  target.h = 0
  target.v = 0
  live.h = 0
  live.v = 0

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
  // Jump live to current target on (re)build so resize doesn’t ease from 0
  live.h = target.h
  live.v = target.v
  paint()
  ensureTick()
  ScrollTrigger.refresh()
}

function onResize() {
  // Toolbar show/hide ≠ real layout resize — skip to avoid absolute/fixed jumps.
  if (isMobileChromeHeightOnlyResize()) return
  capturePoses()
  paint()
  ensureTick()
}

onMounted(async () => {
  gsapMod = await import('gsap')
  stMod = await import('gsap/ScrollTrigger')
  await nextTick()
  buildMorph()
  window.addEventListener('resize', onResize, { passive: true })
})

onUnmounted(() => {
  killMorph()
  window.removeEventListener('resize', onResize)
})

watch(
  () => [props.fromEl, props.toEl, props.plan] as const,
  async () => {
    await nextTick()
    fromPose = null
    toPose = null
    buildMorph()
  },
)
</script>

<template>
  <div
    class="pointer-events-none fixed inset-0 z-[1]"
    aria-hidden="true"
  >
    <div ref="frame" class="absolute overflow-visible will-change-[transform,top,left,width,height]">
      <FlowSurface
        mode="window"
        class="inset-0 size-full"
        :tone-class="toneClass"
      />
    </div>
  </div>
</template>
