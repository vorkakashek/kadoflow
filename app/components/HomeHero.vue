<script setup lang="ts">
/**
 * Hero scroll section — in-flow title/description + the morph pose target.
 * Only the swarm and slogan live inside FlowSurfaceHost's clipped window.
 */
import { isMobileChromeHeightOnlyResize } from '~/utils/mobileViewport'

const { locale, tm } = useI18n()
const heroTitleLines = computed(() => {
  locale.value
  return tm('home.hero.titleLines') as string[]
})
const heroTitleLineChars = computed(() => (
  heroTitleLines.value.map(line => Array.from(line))
))
const heroDescriptionLines = computed(() => {
  locale.value
  return tm('home.hero.descriptionLines') as string[]
})

const heroIntroPending = useState<boolean>('home-hero-intro-pending', () => true)
const section = ref<HTMLElement | null>(null)
const surfaceSlot = ref<HTMLElement | null>(null)
const copyExitY = ref(0)
const copyExitOpacity = ref(1)

const COPY_EXIT_RANGE_VH = 0.42
const COPY_EXIT_TRAVEL_VH = 0.5
const COPY_FADE_START_VH = 0.3
const COPY_FADE_END_VH = 0.55
let copyMotionRaf = 0
let copyMotionVh = 0
let copyMotionWidth = 0

function copyMotionBaseVh() {
  if (typeof window === 'undefined') return 1
  const width = window.innerWidth
  if (!copyMotionVh || width !== copyMotionWidth) {
    copyMotionVh = Math.max(1, window.innerHeight)
    copyMotionWidth = width
  }
  return copyMotionVh
}

function updateCopyExit() {
  if (typeof window === 'undefined') return
  const vh = copyMotionBaseVh()
  const sectionTop = section.value
    ? section.value.getBoundingClientRect().top + window.scrollY
    : 0
  const scrolled = Math.max(0, window.scrollY - sectionTop)
  const progress = Math.min(1, scrolled / (vh * COPY_EXIT_RANGE_VH))
  const fadeProgress = Math.min(
    1,
    Math.max(
      0,
      (scrolled - vh * COPY_FADE_START_VH)
        / (vh * (COPY_FADE_END_VH - COPY_FADE_START_VH)),
    ),
  )
  const easedFade = fadeProgress * fadeProgress * (3 - 2 * fadeProgress)
  copyExitY.value = progress * vh * COPY_EXIT_TRAVEL_VH
  copyExitOpacity.value = 1 - easedFade
}

function onCopyScroll() {
  if (copyMotionRaf) return
  copyMotionRaf = requestAnimationFrame(() => {
    copyMotionRaf = 0
    updateCopyExit()
  })
}

function onCopyResize() {
  if (!isMobileChromeHeightOnlyResize()) {
    copyMotionVh = 0
    copyMotionWidth = 0
  }
  updateCopyExit()
}

onMounted(() => {
  updateCopyExit()
  window.addEventListener('scroll', onCopyScroll, { passive: true })
  window.addEventListener('resize', onCopyResize, { passive: true })
})

onUnmounted(() => {
  if (copyMotionRaf) cancelAnimationFrame(copyMotionRaf)
  window.removeEventListener('scroll', onCopyScroll)
  window.removeEventListener('resize', onCopyResize)
})

defineProps<{
  surfaceReady?: boolean
}>()

defineExpose({ section, surfaceSlot })
</script>

<template>
  <section
    ref="section"
    class="hero pointer-events-none relative w-full overflow-visible touch-pan-y"
  >
    <div
      class="home-hero__copy mx-auto grid shrink-0 text-ink"
      :class="{ 'home-hero__copy--intro-hidden': heroIntroPending }"
      :style="{
        maxWidth: 'var(--layout-content-max)',
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
        columnGap: 'var(--layout-gutter)',
      }"
    >
      <div
        data-hero-title-block
        class="home-hero__title-block relative z-0 col-span-12 flex flex-col md:col-span-8 md:col-start-3"
        :style="{
          opacity: copyExitOpacity,
          transform: `translate3d(0, ${copyExitY}px, 0)`,
        }"
      >
        <h1
          class="home-hero__title"
          :aria-label="heroTitleLines.join(' ')"
        >
          <span
            v-for="(line, lineIndex) in heroTitleLineChars"
            :key="lineIndex"
            class="home-hero__title-line-mask"
            aria-hidden="true"
          >
            <span
              v-for="(char, charIndex) in line"
              :key="`${char}-${charIndex}`"
              class="home-hero__title-char"
            >{{ char === ' ' ? '\u00a0' : char }}</span>
          </span>
        </h1>
        <div
          class="home-hero__desc-lines"
        >
          <div
            v-for="(line, lineIndex) in heroDescriptionLines"
            :key="lineIndex"
            class="home-hero__desc-mask"
          >
            <p
              data-hero-description-line
              class="home-hero__desc"
            >
              {{ line }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="home-hero__scene-grid mx-auto grid">
      <div
        ref="surfaceSlot"
        class="home-hero__surface-slot pointer-events-none relative col-span-12 md:col-span-10 md:col-start-2"
      >
        <!--
          SSR first frame for the surface. The live FlowSurface is intentionally
          lazy; keeping its tone + grain here prevents a blank panel and makes the
          decorative raster discoverable before client JavaScript. The primer is
          removed only after the live surface has painted underneath it.
        -->
        <div
          v-if="!surfaceReady"
          class="home-hero__surface-primer bg-stone"
          aria-hidden="true"
        >
          <div class="home-hero__surface-primer-grain" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
:global(:root) {
  --home-surface-grain: image-set(
    url('/textures/grain-tile-v2-256.avif') type('image/avif'),
    url('/textures/grain-tile-v2-256.webp') type('image/webp')
  );
}

.home-hero__surface-primer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 12px;
}

.hero {
  min-height: var(--app-screen);
  padding-bottom: var(--layout-margin);
}

.home-hero__copy {
  width: var(--layout-content);
  padding-top: calc(var(--layout-surface-top) + var(--space-block));
}

.home-hero__copy--intro-hidden {
  opacity: 0;
  visibility: hidden;
}

.home-hero__title-block {
  align-items: center;
  container-type: inline-size;
  gap: 12px;
  color: var(--palette-ink);
  text-align: center;
  will-change: transform, opacity;
}

.home-hero__title {
  width: 100%;
  font-size: clamp(48px, 15cqi, 168px);
  font-weight: 600;
  font-synthesis: none;
  letter-spacing: -0.03em;
  line-height: 0.9;
  white-space: nowrap;
}

.home-hero__title-line-mask {
  display: block;
  width: max-content;
  margin-inline: auto;
  overflow: hidden;
  padding-top: 0.08em;
  padding-right: 0.04em;
}

.home-hero__title-char {
  display: inline-block;
  will-change: transform;
}

.home-hero__desc-lines {
  width: 100%;
  max-width: none;
}

.home-hero__desc-mask {
  width: 100%;
  overflow: hidden;
}

.home-hero__desc {
  margin: 0;
  color: var(--palette-ink);
  font-size: calc(var(--type-slogan) * 0.9);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.2;
  will-change: transform;
}

.home-hero__scene-grid {
  width: var(--layout-content);
  margin-top: calc(var(--space-4) * 2);
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
}

.home-hero__surface-slot {
  aspect-ratio: 4 / 5;
}

.home-hero__surface-primer-grain {
  position: absolute;
  inset: 0;
  background-image: var(--home-surface-grain);
  background-position: 0 0;
  background-repeat: repeat;
  background-size: 224px 224px;
  opacity: 0.2;
  mix-blend-mode: soft-light;
}

@media (max-width: 767.98px) {
  .home-hero__surface-primer-grain {
    background-size: 176px 176px;
  }
}

@media (min-width: 768px) {
  .home-hero__title-block {
    gap: 40px;
  }

  .home-hero__desc-lines {
    max-width: 36ch;
  }

  .home-hero__desc {
    font-size: var(--type-slogan);
  }

  .home-hero__surface-slot {
    aspect-ratio: 16 / 9;
  }
}

@media (min-width: 1024px) {
  .home-hero__desc-lines {
    max-width: none;
  }

  .home-hero__desc {
    white-space: nowrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-hero__title-block {
    transform: none !important;
  }
}
</style>
