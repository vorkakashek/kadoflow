<script setup lang="ts">
/**
 * Fixed Flow Surface — one clipped window.
 * Stone + grain + hero stage all live under the same clip-path parent.
 */
import {
  applyBox,
  heroToKadoPlan,
  mixBox,
  poseAtScrollY,
  readDocBox,
  scrollYForCenterCenter,
  targetsFromScrollProgress,
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
let target = { h: 0, v: 0 }
let live = { h: 0, v: 0 }
let fromPose: SurfaceBox | null = null
let toPose: SurfaceBox | null = null

let raf = 0
let lastTs = 0
let parseEase: ((name: string) => (t: number) => number) | null = null

const IDLE_EPS = 0.02

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

function capturePoses() {
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

  syncStageRest(fromPose)
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
  writeMaskBox(box)
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
  live.h = target.h
  live.v = target.v
  paint()
  ensureTick()
  ScrollTrigger.refresh()
}

function onResize() {
  if (isMobileChromeHeightOnlyResize()) return
  capturePoses()
  paint()
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
      class="absolute overflow-hidden will-change-[top,left,width,height]"
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
