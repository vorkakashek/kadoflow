<script setup lang="ts">
/**
 * Hero visuals — inside the Flow Surface clipped window.
 * No own clip-path: parent clip cuts stone + 3D + text together.
 * Stage is rest-sized and offset so frame morph clips over it (no layout squash).
 */
import { flowSurfaceMask, useFlowSurfaceMask } from '~/composables/useFlowSurfaceMask'
import { isCoarsePointer, isNarrowViewport } from '~/utils/mobileViewport'

const SCENE_FADE_MORPH = 0.45
const SCENE_RESTORE_MORPH = 0.05
/** Morph-driven stage fade (works both scroll directions). */
const FADE_OUT_START = 0.55
const FADE_OUT_END = 0.88
/** Mobile: fade much earlier in the hero→kado corridor. */
const FADE_OUT_START_MOBILE = 0.01
const FADE_OUT_END_MOBILE = 0.12
/** Copy rides morph 0→1 upward (hang-in-place feel). */
const COPY_PARALLAX_VH = 0.35

const props = defineProps<{
  /** Hero-rest viewport origin — stage counters frame morph so copy doesn't slide. */
  restTop: number
  restLeft: number
  stageWidth: number
  stageHeight: number
  sectionEl?: HTMLElement | null
}>()

const mask = useFlowSurfaceMask()
/** Frame-local offset: keep stage glued to rest pose in the viewport. */
const stageLeft = computed(() => props.restLeft - mask.left)
const stageTop = computed(() => props.restTop - mask.top)
const focusEl = ref<HTMLElement | null>(null)
const mediaEl = ref<HTMLElement | null>(null)
const copyEl = ref<HTMLElement | null>(null)
const sloganEl = ref<HTMLElement | null>(null)
const titleEl = ref<HTMLElement | null>(null)

const mobileLite = ref(false)
if (import.meta.client) {
  mobileLite.value = isNarrowViewport() || isCoarsePointer()
}

const sceneLive = ref(true)
/** Whole hero stack opacity — never unmount; eased by morph. */
const contentOpacity = ref(1)
/** Text parallax Y (px). Negative = up. Morph 0→1. */
const copyY = ref(0)

let ctx: { revert: () => void } | null = null
let gsapRef: typeof import('gsap').default | null = null
let stRef: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let sceneDismissed = false
let mediaFadeTween: { kill: () => void } | null = null

function setFrozen(on: boolean) {
  flowSurfaceMask.freezeSilhouette = on
}

function opacityForMorph(m: number) {
  const start = mobileLite.value ? FADE_OUT_START_MOBILE : FADE_OUT_START
  const end = mobileLite.value ? FADE_OUT_END_MOBILE : FADE_OUT_END
  if (m <= start) return 1
  if (m >= end) return 0
  return 1 - (m - start) / (end - start)
}

function copyParallaxY(m: number) {
  if (typeof window === 'undefined') return 0
  const t = Math.min(1, Math.max(0, m))
  return -t * window.innerHeight * COPY_PARALLAX_VH
}

function dismissScene() {
  if (sceneDismissed || !mediaEl.value || !gsapRef) return
  sceneDismissed = true
  mediaFadeTween?.kill()
  mediaFadeTween = gsapRef.to(mediaEl.value, {
    opacity: 0,
    duration: 0.4,
    ease: 'power1.out',
    onComplete: () => {
      sceneLive.value = false
    },
  })
}

function restoreScene() {
  if (!sceneDismissed || !gsapRef) return
  if (mask.morph > SCENE_RESTORE_MORPH) return
  sceneDismissed = false
  mediaFadeTween?.kill()
  mediaFadeTween = null
  if (mediaEl.value) {
    gsapRef.to(mediaEl.value, { opacity: 1, duration: 0.35, ease: 'power1.out' })
  }
  sceneLive.value = true
}

watch(
  () => mask.morph,
  (m) => {
    const op = opacityForMorph(m)
    contentOpacity.value = op
    copyY.value = copyParallaxY(m)
    const show = op > 0.08
    setFrozen(show)

    // Mobile: same morph fade as PC; kill WebGL as soon as morph leaves rest.
    if (mobileLite.value) {
      sceneLive.value = m < 0.02
      return
    }

    if (!show) {
      sceneLive.value = false
      return
    }
    if (!sceneDismissed) sceneLive.value = true
    if (m > SCENE_FADE_MORPH) dismissScene()
    else if (m < SCENE_RESTORE_MORPH) restoreScene()
  },
)

async function ensureGsap() {
  if (gsapRef && stRef) return
  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)
  gsapRef = gsap
  stRef = ScrollTrigger
}

async function setupExitMotion(sectionEl: HTMLElement) {
  ctx?.revert()
  ctx = null

  const mobile = isNarrowViewport() || isCoarsePointer()
  mobileLite.value = mobile
  // Mobile: no scroll exit blur/opacity — content just leaves with the clip.
  if (mobile) return

  await ensureGsap()
  const gsap = gsapRef!
  const ScrollTrigger = stRef!

  await nextTick()

  ctx = gsap.context(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    ScrollTrigger.config({ ignoreMobileResize: true })

    const nextBlock = sectionEl.nextElementSibling as HTMLElement | null
    const exitStart = () => {
      const h = sectionEl.offsetHeight
      const vh = window.innerHeight
      const pastRest = Math.max(0, h - vh) + Math.round(vh * 0.08)
      return `top+=${pastRest} top`
    }
    const exitSt = {
      trigger: sectionEl,
      start: exitStart,
      endTrigger: nextBlock ?? sectionEl,
      end: nextBlock ? 'top center' : 'bottom top',
      scrub: 0.4,
      invalidateOnRefresh: true,
    }

    if (copyEl.value) {
      gsap.fromTo(
        copyEl.value,
        { filter: 'blur(0px)' },
        {
          filter: 'blur(14px)',
          ease: 'none',
          scrollTrigger: { ...exitSt, scrub: 0.35 },
        },
      )
    }

    if (mediaEl.value) {
      const mediaExit = gsap.timeline({
        scrollTrigger: {
          ...exitSt,
          onUpdate: (self: { progress: number }) => {
            const live = self.progress < 0.97
            if (sceneLive.value !== live) sceneLive.value = live
          },
          onLeave: () => {
            sceneLive.value = false
          },
          onEnterBack: () => {
            if (opacityForMorph(mask.morph) > 0.08) sceneLive.value = true
          },
        },
      })
      mediaExit.fromTo(
        mediaEl.value,
        { opacity: 1 },
        { opacity: 0, duration: 0.5, ease: 'none' },
        0.5,
      )
    }

    const copyTl = gsap.timeline({
      scrollTrigger: { ...exitSt, scrub: true },
    })
    const copyEls = [sloganEl.value, titleEl.value].filter(Boolean)
    if (copyEls.length) {
      copyTl.fromTo(
        copyEls,
        { opacity: 1 },
        { opacity: 0, duration: 0.2, ease: 'none' },
        0.8,
      )
    }

    requestAnimationFrame(() => ScrollTrigger.refresh())
  }, sectionEl)
}

watch(
  () => props.sectionEl,
  async (el) => {
    if (!el) {
      ctx?.revert()
      ctx = null
      return
    }
    await setupExitMotion(el)
  },
  { immediate: true },
)

onMounted(() => {
  setFrozen(true)
})

onUnmounted(() => {
  setFrozen(false)
  mediaFadeTween?.kill()
  ctx?.revert()
})
</script>

<template>
  <div
    class="hero-stage pointer-events-none absolute overflow-visible"
    :style="{
      top: `${stageTop}px`,
      left: `${stageLeft}px`,
      width: `${Math.max(1, props.stageWidth)}px`,
      height: `${Math.max(1, props.stageHeight)}px`,
      opacity: contentOpacity,
    }"
  >
    <div
      ref="focusEl"
      class="hero-focus relative size-full min-h-0"
    >
      <div
        ref="mediaEl"
        class="absolute inset-0"
        :class="mobileLite ? 'pointer-events-none' : 'pointer-events-auto'"
        aria-hidden="true"
      >
        <ClientOnly>
          <HeroSwarmCanvas class="size-full" :active="sceneLive" />
        </ClientOnly>
      </div>

      <div
        ref="copyEl"
        class="pointer-events-none absolute inset-0 z-10 flex min-h-0 flex-col will-change-transform"
        :style="{ transform: `translate3d(0, ${copyY}px, 0)` }"
      >
        <div
          class="hero-copy mx-auto grid h-full w-full min-h-0"
          :style="{
            maxWidth: 'var(--layout-content-max)',
            gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
            columnGap: 'var(--layout-gutter)',
          }"
        >
          <div
            class="col-span-12 flex min-h-0 flex-col justify-between md:col-span-10 md:col-start-2"
          >
            <p ref="sloganEl" class="hero-slogan text-ink">
              Свобода формы. Порядок процесса.
            </p>

            <div ref="titleEl" class="flex flex-col gap-10">
              <h1 class="hero-title text-ink">
                <span class="block">Авторская студия</span>
                <span class="block">дизайна и разработки</span>
              </h1>
              <p class="hero-desc text-ash md:max-w-[36ch]">
                Создаю выразительные сайты под ключ — от структуры до запуска.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero-copy {
  /* Mobile: wide sides, normal top, roomier bottom. */
  padding-inline: var(--layout-margin-content);
  padding-top: var(--space-block);
  padding-bottom: calc(2 * var(--space-block));
}

@media (min-width: 768px) {
  .hero-copy {
    padding-inline: 0;
    padding-top: var(--space-block);
    padding-bottom: var(--space-block);
  }
}

.hero-title {
  font-size: var(--type-hero);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.05;
}

.hero-slogan,
.hero-desc {
  font-size: var(--type-slogan);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
</style>
