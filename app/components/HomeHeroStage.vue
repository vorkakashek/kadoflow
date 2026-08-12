<script setup lang="ts">
/**
 * Hero visuals — inside the Flow Surface clipped window.
 * No own clip-path: parent clip cuts stone + 3D + text together.
 * Stage is rest-sized and offset so frame morph clips over it (no layout squash).
 */
import { flowSurfaceMask, useFlowSurfaceMask } from '~/composables/useFlowSurfaceMask'
import { isCoarsePointer, isNarrowViewport } from '~/utils/mobileViewport'

const SCENE_FADE_MORPH = 0.3
const SCENE_RESTORE_MORPH = 0.05
/** Morph-driven stage fade — keyed to min(h,v) arrive progress. */
const FADE_OUT_START = 0.3
const FADE_OUT_END = 0.7
/** Mobile: fade much earlier in the hero→kado corridor. */
const FADE_OUT_START_MOBILE = 0.01
const FADE_OUT_END_MOBILE = 0.12
/**
 * Swarm/media bleed past the stage box (px).
 * Must cover stacked roam+hover outward (~2× dent + bow) so the GL edge never shows.
 */
const SCENE_BLEED_Y = 168
const SCENE_BLEED_X = 168
/** Copy rides scroll from the first pixel (not the fade window). Full shift over 1vh. */
const COPY_PARALLAX_VH = 0.55

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
/** Text parallax Y (px). Negative = up. Driven by section scroll, not fade. */
const copyY = ref(0)

let ctx: { revert: () => void } | null = null
let gsapRef: typeof import('gsap').default | null = null
let stRef: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let sceneDismissed = false
let mediaFadeTween: { kill: () => void } | null = null
let parallaxRaf = 0

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

/** Parallax from first scroll px of the hero section — independent of morph fade. */
function updateCopyParallax() {
  if (typeof window === 'undefined') return
  const el = props.sectionEl
  if (!el) {
    copyY.value = 0
    return
  }
  const sectionTop = el.getBoundingClientRect().top + window.scrollY
  const scrolled = Math.max(0, (window.scrollY || 0) - sectionTop)
  const range = Math.max(1, window.innerHeight)
  const t = Math.min(1, scrolled / range)
  copyY.value = -t * window.innerHeight * COPY_PARALLAX_VH
}

function onParallaxScroll() {
  if (parallaxRaf) return
  parallaxRaf = requestAnimationFrame(() => {
    parallaxRaf = 0
    updateCopyParallax()
  })
}

function dismissScene() {
  if (sceneDismissed || !mediaEl.value) return
  sceneDismissed = true
  mediaFadeTween?.kill()
  if (!gsapRef) {
    mediaEl.value.style.opacity = '0'
    sceneLive.value = false
    return
  }
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
  if (mask.morph > SCENE_RESTORE_MORPH) return
  sceneDismissed = false
  mediaFadeTween?.kill()
  mediaFadeTween = null
  if (mediaEl.value) {
    if (gsapRef) {
      gsapRef.to(mediaEl.value, { opacity: 1, duration: 0.35, ease: 'power1.out' })
    } else {
      mediaEl.value.style.opacity = '1'
    }
  }
  sceneLive.value = true
}

watch(
  () => mask.morph,
  (m) => {
    const op = opacityForMorph(m)
    contentOpacity.value = op
    const show = op > 0.08
    // Freeze only mid-morph — at hero rest edges stay live + cursor dent.
    setFrozen(m > 0.02 && m < 0.98)

    // Mobile: opacity follows morph corridor; WebGL only at rest.
    if (mobileLite.value) {
      const live = m < 0.02
      sceneLive.value = live
      if (live && mediaEl.value) {
        mediaEl.value.style.opacity = '1'
        sceneDismissed = false
      }
      return
    }

    if (!show) {
      sceneLive.value = false
      // Mid-page boot / full fade — mark dismissed so restore can run on the way back.
      if (!sceneDismissed) {
        sceneDismissed = true
        if (mediaEl.value && !mediaFadeTween) {
          mediaEl.value.style.opacity = '0'
        }
      }
      return
    }

    if (m > SCENE_FADE_MORPH) {
      dismissScene()
      return
    }

    if (m < SCENE_RESTORE_MORPH) {
      restoreScene()
      return
    }

    if (!sceneDismissed) sceneLive.value = true
  },
  { immediate: true },
)

watch(
  () => props.sectionEl,
  () => {
    updateCopyParallax()
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
          scrollTrigger: {
            ...exitSt,
            scrub: 0.35,
            // Late blur only — opacity is driven by morph min(h,v), not this scrub.
            start: () => {
              const h = sectionEl.offsetHeight
              const vh = window.innerHeight
              const pastRest = Math.max(0, h - vh) + Math.round(vh * 0.72)
              return `top+=${pastRest} top`
            },
          },
        },
      )
    }

    // Opacity / WebGL lifetime: morph watch only (min h,v). No early scrub fades.
    if (mediaEl.value) {
      ScrollTrigger.create({
        ...exitSt,
        onEnterBack: () => {
          if (opacityForMorph(mask.morph) > 0.08) sceneLive.value = true
        },
      })
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
  // Don't freeze at rest — living edges + hover need an unfrozen silhouette.
  setFrozen(false)
  updateCopyParallax()
  window.addEventListener('scroll', onParallaxScroll, { passive: true })
})

onUnmounted(() => {
  setFrozen(false)
  mediaFadeTween?.kill()
  ctx?.revert()
  if (parallaxRaf) cancelAnimationFrame(parallaxRaf)
  window.removeEventListener('scroll', onParallaxScroll)
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
        class="absolute"
        :class="mobileLite ? 'pointer-events-none' : 'pointer-events-auto'"
        aria-hidden="true"
        :style="{
          top: `-${SCENE_BLEED_Y}px`,
          left: `-${SCENE_BLEED_X}px`,
          width: `calc(100% + ${SCENE_BLEED_X * 2}px)`,
          height: `calc(100% + ${SCENE_BLEED_Y * 2}px)`,
        }"
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
            <div ref="titleEl" class="hero-title-block flex flex-col">
              <h1 class="hero-title text-ink">
                <span class="block">Авторская&nbsp;студия</span>
                <span class="block">дизайна и&nbsp;разработки</span>
              </h1>
              <p class="hero-desc text-ash md:max-w-[36ch]">
                Создаю выразительные сайты под&nbsp;ключ — от&nbsp;структуры до&nbsp;запуска.
              </p>
            </div>

            <p ref="sloganEl" class="hero-slogan text-ink">
              Свобода&nbsp;формы. Порядок&nbsp;процесса.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero-copy {
  /* Mobile: same inset on sides and above the title. */
  padding-inline: var(--layout-margin-content);
  padding-top: var(--layout-margin-content);
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

.hero-title-block {
  gap: 16px;
}

.hero-slogan {
  font-size: calc(var(--type-slogan) * 0.72);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.hero-desc {
  font-size: var(--type-slogan);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

/* Mobile: pull type down so 17 Pro–class widths don’t pack the stack. */
@media (max-width: 767px) {
  .hero-slogan {
    font-size: calc(var(--type-slogan) * 0.62);
  }

  .hero-title {
    font-size: calc(var(--type-hero) * 0.84);
    line-height: 1.08;
  }

  .hero-desc {
    font-size: calc(var(--type-slogan) * 0.9);
  }

  .hero-title-block {
    gap: 12px;
  }
}

@media (min-width: 768px) {
  .hero-title-block {
    gap: 40px;
  }
}
</style>
