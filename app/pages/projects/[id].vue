<script setup lang="ts">
import { homeCases } from '~/utils/homeCases'

const route = useRoute()
const item = computed(() =>
  homeCases.find((caseItem) => caseItem.id === route.params.id),
)
const {
  request: detailTransitionRequest,
  active: detailTransitionActive,
  detailContentVisible,
} = useCaseDetailTransition()
const brandPreload = useBrandPreload()
const mediaEnterEl = ref<HTMLElement | null>(null)
const mediaParallaxEl = ref<HTMLElement | null>(null)

let mediaParallaxCtx: { revert: () => void } | null = null
let directRevealFrame = 0
let stopDirectRevealWatch: (() => void) | null = null

// A direct request has no fullscreen cover to stage the page underneath. Start
// it from the same hidden pose and release it after the hydrated DOM has painted.
const isDirectEntry = !detailTransitionRequest.value && !detailTransitionActive.value
if (isDirectEntry) detailContentVisible.value = false

function releaseDirectEntry() {
  directRevealFrame = requestAnimationFrame(() => {
    directRevealFrame = requestAnimationFrame(() => {
      detailContentVisible.value = true
    })
  })
}

async function setupMediaParallax() {
  const media = mediaParallaxEl.value
  if (!media || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)

  mediaParallaxCtx?.revert()
  mediaParallaxCtx = gsap.context(() => {
    gsap.fromTo(
      media,
      { yPercent: 0 },
      {
        yPercent: 30,
        ease: 'none',
        scrollTrigger: {
          trigger: mediaEnterEl.value ?? media,
          start: () => `top top+=${Math.round(media.offsetHeight * 0.3)}px`,
          end: 'bottom top',
          scrub: 0.65,
          invalidateOnRefresh: true,
        },
      },
    )
  }, mediaEnterEl.value ?? media)
}

onMounted(() => {
  // Direct entries have not visited the home route yet. Warm its component
  // while the user reads the case so the return transition can mount it under
  // the fullscreen cover without a route-chunk pause.
  void preloadRouteComponents('/')
  void nextTick(setupMediaParallax)

  if (isDirectEntry) {
    if (brandPreload.revealed.value) releaseDirectEntry()
    else {
      stopDirectRevealWatch = watch(
        () => brandPreload.revealed.value,
        (revealed) => {
          if (!revealed) return
          stopDirectRevealWatch?.()
          stopDirectRevealWatch = null
          releaseDirectEntry()
        },
      )
    }
  }
})

onBeforeUnmount(() => {
  if (directRevealFrame) cancelAnimationFrame(directRevealFrame)
  stopDirectRevealWatch?.()
  stopDirectRevealWatch = null
  mediaParallaxCtx?.revert()
  mediaParallaxCtx = null
})

if (!item.value) {
  throw createError({ statusCode: 404, statusMessage: 'Кейс не найден' })
}

useHead(() => ({
  title: `${item.value?.title ?? 'Кейс'} — Kadoflow`,
}))
</script>

<template>
  <main
    v-if="item"
    class="case-detail"
    :class="{
      'case-detail--inverse': item.inverse,
      'case-detail--entering': !detailContentVisible,
    }"
    :style="{ backgroundColor: item.wash }"
  >
    <div class="case-detail__inner">
      <section class="case-detail__hero">
        <h1>{{ item.title }}</h1>
        <div class="case-detail__focus" aria-label="фокус">
          <template v-for="(tag, index) in item.focusTags" :key="tag">
            <span class="case-detail__focus-tag">{{ tag }}</span>
            <PhDot v-if="index < item.focusTags.length - 1" :size="8" />
          </template>
        </div>
      </section>

      <section class="case-detail__content">
        <div
          class="case-detail__meta"
          :class="{ 'case-detail__meta--with-collaboration': item.collaboration }"
        >
          <div>
            <p class="case-detail__eyebrow">клиент</p>
            <p class="case-detail__tags">{{ item.client }}</p>
          </div>
          <div>
            <p class="case-detail__eyebrow">год</p>
            <p class="case-detail__tags">{{ item.year }}</p>
          </div>
          <div>
            <p class="case-detail__eyebrow">участие</p>
            <p class="case-detail__tags case-detail__role-tags">
              <span v-for="tag in item.roleTags" :key="tag">{{ tag }}</span>
            </p>
          </div>
          <div v-if="item.collaboration">
            <p class="case-detail__eyebrow">в коллаборации</p>
            <p class="case-detail__tags">{{ item.collaboration }}</p>
          </div>
        </div>
        <div
          ref="mediaEnterEl"
          class="case-detail__media"
          :class="{ 'case-detail__media--video': item.id === 'baltika' && item.media.video }"
        >
          <div ref="mediaParallaxEl" class="case-detail__media-parallax">
            <BaltikaScrollFilm
              v-if="item.id === 'baltika' && item.media.video"
              :webm="item.media.video.webm"
              :mp4="item.media.video.mp4"
              :mobile-webm="item.media.video.mobileWebm"
              :mobile-mp4="item.media.video.mobileMp4"
              :poster="item.media.video.poster"
              :alt="item.media.alt"
            />
            <img
              v-else
              :src="item.media.src"
              :alt="item.media.alt"
              class="case-detail__image"
              loading="eager"
              fetchpriority="high"
              decoding="async"
            >
          </div>
        </div>
        <p class="case-detail__blurb">{{ item.blurb.replace('\n', ' ') }}</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.case-detail {
  min-height: var(--app-screen);
  color: var(--palette-ink, #0a0a0a);
}

.case-detail--inverse {
  color: var(--palette-milk, #f5f1e8);
}

.case-detail__inner {
  width: min(var(--layout-content-max), calc(100% - 2 * var(--layout-margin-content)));
  margin: 0 auto;
  padding-bottom: var(--space-section);
}

.case-detail__hero {
  display: grid;
  /* Keep the opening mark compact so the case itself starts in the first view. */
  box-sizing: border-box;
  min-height: 60svh;
  align-content: center;
  row-gap: 2rem;
  place-items: center;
  padding-block: calc(var(--layout-surface-top) + clamp(1rem, 2vw, 2rem)) clamp(1rem, 2vw, 2rem);
  text-align: center;
}

.case-detail__focus {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  column-gap: clamp(0.75rem, 1.8vw, 1.5rem);
  row-gap: 0.5rem;
  margin: 0;
  font-size: var(--type-nav);
  letter-spacing: -0.02em;
}

.case-detail__focus-tag {
  white-space: nowrap;
}

.case-detail__content {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  margin: 0 auto;
  padding-top: clamp(1.5rem, 3vw, 3rem);
}

.case-detail__meta {
  display: grid;
  gap: 1.25rem;
}

@media (min-width: 768px) {
  .case-detail__content {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    column-gap: var(--layout-gutter);
  }

  .case-detail__meta {
    grid-column: 2 / -2;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--layout-gutter);
  }

  .case-detail__meta--with-collaboration {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .case-detail__media {
    grid-column: 1 / -1;
  }

  .case-detail__blurb {
    grid-column: 2 / -2;
    max-width: none;
  }
}

.case-detail__eyebrow,
.case-detail__tags {
  margin: 0;
  font-size: var(--type-nav);
  letter-spacing: -0.02em;
}

.case-detail__eyebrow {
  opacity: 0.6;
}

.case-detail__tags {
  margin-top: 0.6rem;
  font-weight: 500;
}

.case-detail__role-tags {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
}

.case-detail__role-tags span {
  white-space: nowrap;
}

h1 {
  max-width: 12ch;
  margin: 0;
  font-size: clamp(3rem, 8vw, 8rem);
  font-weight: 400;
  letter-spacing: -0.05em;
  line-height: 0.95;
  transition: opacity 2.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.case-detail__focus {
  transition:
    opacity 1.5s cubic-bezier(0.22, 1, 0.36, 1),
    transform 1.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.case-detail__blurb {
  max-width: 34rem;
  margin: clamp(2.5rem, 6vw, 4rem) 0 0;
  font-size: var(--type-lead);
  line-height: 1.35;
}

.case-detail__media {
  margin-top: 2.5rem;
  /* Reserve the media’s lowest parallax position. */
  margin-bottom: clamp(4rem, 18vw, 22rem);
}

.case-detail__media--video {
  /* Baltika’s square film needs its full 30% travel below the block. */
  margin-bottom: clamp(4rem, 30vw, 24rem);
}

.case-detail__media-parallax {
  will-change: transform;
}

.case-detail__image {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.case-detail__meta,
.case-detail__media {
  transition:
    opacity 1.6s cubic-bezier(0.22, 1, 0.36, 1),
    transform 1.6s cubic-bezier(0.22, 1, 0.36, 1);
}

.case-detail--entering h1,
.case-detail--entering .case-detail__focus,
.case-detail--entering .case-detail__meta,
.case-detail--entering .case-detail__media {
  opacity: 0;
}

.case-detail--entering .case-detail__focus,
.case-detail--entering .case-detail__meta,
.case-detail--entering .case-detail__media {
  transform: translateY(2rem);
}

/* Once the fullscreen image has cleared, bring the page in as a short cascade. */
.case-detail:not(.case-detail--entering) .case-detail__focus {
  transition-delay: 0.9s;
}

.case-detail:not(.case-detail--entering) .case-detail__meta {
  transition-delay: 0.2s;
}

.case-detail:not(.case-detail--entering) .case-detail__media {
  transition-delay: 0.48s;
}

@media (prefers-reduced-motion: reduce) {
  h1,
  .case-detail__focus,
  .case-detail__meta,
  .case-detail__media {
    transition: none;
  }
}
</style>
