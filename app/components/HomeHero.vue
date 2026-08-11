<script setup lang="ts">
/**
 * Hero — section stays in document flow (pose + scroll height).
 * Visual shell teleports into a fixed rest-size mount (sibling of the morphing
 * stone frame): no scroll chase jitter, no morph scale squash, no living
 * clip-path wrapping WebGL.
 */
import {
  useFlowSurfaceMask,
} from '~/composables/useFlowSurfaceMask'
import { isCoarsePointer, isNarrowViewport } from '~/utils/mobileViewport'

const SCENE_FADE_MORPH = 0.45
const SCENE_RESTORE_MORPH = 0.05
const HERO_MOUNT_ID = 'flow-surface-hero-mount'

const section = ref<HTMLElement | null>(null)
const surfaceSlot = ref<HTMLElement | null>(null)
const focusEl = ref<HTMLElement | null>(null)
const mediaEl = ref<HTMLElement | null>(null)
const sloganEl = ref<HTMLElement | null>(null)
const titleEl = ref<HTMLElement | null>(null)

const mask = useFlowSurfaceMask()
const sceneLive = ref(true)
const mobileLite = ref(false)
const mountReady = ref(false)
if (import.meta.client) {
  mobileLite.value = isNarrowViewport() || isCoarsePointer()
}

defineExpose({ section, surfaceSlot })

let ctx: { revert: () => void } | null = null
let gsapRef: typeof import('gsap').default | null = null
let sceneDismissed = false
let mediaFadeTween: { kill: () => void } | null = null

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
  if (mediaEl.value) gsapRef.set(mediaEl.value, { opacity: 1 })
  sceneLive.value = true
}

onMounted(async () => {
  if (!section.value) return

  const mobile = isNarrowViewport() || isCoarsePointer()
  mobileLite.value = mobile
  mountReady.value = !!document.getElementById(HERO_MOUNT_ID)

  watch(
    () => mask.morph,
    (m) => {
      if (!mobileLite.value) return
      if (m > SCENE_FADE_MORPH) dismissScene()
      else if (m < SCENE_RESTORE_MORPH) restoreScene()
    },
  )

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)
  gsapRef = gsap

  ctx = gsap.context(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    ScrollTrigger.config({ ignoreMobileResize: true })

    const nextBlock = section.value?.nextElementSibling as HTMLElement | null
    const exitStart = () => {
      const el = section.value
      if (!el) return 'top top'
      const h = el.offsetHeight
      const vh = window.innerHeight
      const pastRest = Math.max(0, h - vh) + Math.round(vh * 0.08)
      return `top+=${pastRest} top`
    }
    const exitSt = {
      trigger: section.value,
      start: exitStart,
      endTrigger: nextBlock ?? section.value,
      end: nextBlock ? (mobile ? 'center center' : 'top center') : 'bottom top',
      scrub: mobile ? true : 0.4,
      invalidateOnRefresh: true,
    }

    if (focusEl.value && !mobile) {
      gsap.fromTo(
        focusEl.value,
        { filter: 'blur(0px)' },
        {
          filter: 'blur(14px)',
          ease: 'none',
          scrollTrigger: { ...exitSt, scrub: 0.35 },
        },
      )
    }

    if (mediaEl.value) {
      if (!mobile) {
        const mediaExit = gsap.timeline({
          scrollTrigger: {
            ...exitSt,
            onUpdate: (self) => {
              const live = self.progress < 0.97
              if (sceneLive.value !== live) sceneLive.value = live
            },
            onLeave: () => {
              sceneLive.value = false
            },
            onEnterBack: () => {
              sceneLive.value = true
            },
          },
        })
        mediaExit.fromTo(
          mediaEl.value,
          { filter: 'blur(0px)' },
          { filter: 'blur(28px)', duration: 0.7, ease: 'none' },
          0.3,
        )
        mediaExit.fromTo(
          mediaEl.value,
          { opacity: 1 },
          { opacity: 0, duration: 0.5, ease: 'none' },
          0.5,
        )
      }
    }

    const copyTl = gsap.timeline({
      scrollTrigger: { ...exitSt, scrub: true },
    })
    const copyEls = [sloganEl.value, titleEl.value].filter(Boolean)
    if (copyEls.length) {
      copyTl.fromTo(
        copyEls,
        { opacity: 1 },
        { opacity: 0, duration: mobile ? 0.35 : 0.2, ease: 'none' },
        mobile ? 0.1 : 0.8,
      )
    }

    requestAnimationFrame(() => ScrollTrigger.refresh())
  }, section.value)
})

onUnmounted(() => {
  mediaFadeTween?.kill()
  ctx?.revert()
})
</script>

<template>
  <section
    ref="section"
    class="hero pointer-events-none relative z-10 w-full overflow-visible"
    :style="{ height: 'var(--app-screen)' }"
  >
    <!-- Pose probe for FlowSurfaceHost morph (layout only). -->
    <div
      ref="surfaceSlot"
      class="pointer-events-none absolute"
      aria-hidden="true"
      :style="{
        top: 'var(--layout-surface-top)',
        right: 'var(--layout-margin)',
        bottom: 'var(--layout-margin)',
        left: 'var(--layout-margin)',
      }"
    />

    <!--
      Lives inside the fixed clipped surface — same compositor layer as the stone.
      No translateY stick chase (wheel scroll was fighting JS one frame behind).
    -->
    <Teleport v-if="mountReady" :to="`#${HERO_MOUNT_ID}`">
      <div
        class="hero-shell pointer-events-none absolute inset-0"
      >
        <div ref="focusEl" class="hero-focus relative size-full min-h-0 overflow-hidden">
          <div
            ref="mediaEl"
            class="pointer-events-auto absolute inset-0"
            aria-hidden="true"
          >
            <ClientOnly>
              <HeroSwarmCanvas class="size-full" :active="sceneLive" />
            </ClientOnly>
          </div>

          <div class="pointer-events-none absolute inset-0 z-10 flex min-h-0 flex-col">
            <div
              class="hero-copy mx-auto grid h-full w-full min-h-0 px-[var(--layout-margin)] md:px-0"
              :style="{
                maxWidth: 'var(--layout-content-max)',
                gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                columnGap: 'var(--layout-gutter)',
                paddingBlock: 'var(--space-block)',
              }"
            >
              <div
                class="col-span-12 flex min-h-0 flex-col justify-between md:col-span-10 md:col-start-2"
              >
                <p
                  ref="sloganEl"
                  class="hero-slogan text-ink"
                >
                  Свобода формы. Порядок процесса.
                </p>

                <div
                  ref="titleEl"
                  class="flex flex-col gap-10"
                >
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
    </Teleport>
  </section>
</template>

<style scoped>
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
