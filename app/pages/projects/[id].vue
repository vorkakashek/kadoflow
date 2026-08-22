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
  const audience = item.value?.id === 'audience'

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)

  mediaParallaxCtx?.revert()
  mediaParallaxCtx = gsap.context(() => {
    gsap.fromTo(
      media,
      { yPercent: 0 },
      {
        // Audience uses a shorter crop window. Its oversized image travels
        // upward inside that window until the frame's lower edge clears the
        // top of the viewport; other cases retain their existing page drift.
        yPercent: audience ? -55 : 30,
        ease: 'none',
        scrollTrigger: {
          trigger: mediaEnterEl.value ?? media,
          start: audience
            ? 'top bottom'
            : () => `top top+=${Math.round(media.offsetHeight * 0.3)}px`,
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
      <div class="case-detail__first-screen">
        <section class="case-detail__hero">
          <h1>
            <span>{{ item.title }},</span>
            <span class="case-detail__summary">{{ item.blurb.replace('\n', ' ') }}</span>
          </h1>
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
            :class="{
              'case-detail__media--audience': item.id === 'audience',
              'case-detail__media--video': item.id === 'baltika' && item.media.video,
            }"
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
        </section>
      </div>
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
  place-items: start;
  padding-block: calc(var(--layout-surface-top) + clamp(1rem, 2vw, 2rem)) clamp(1rem, 2vw, 2rem);
  text-align: left;
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
  border-top: 1px solid color-mix(in srgb, currentColor 24%, transparent);
}

@media (min-width: 768px) {
  .case-detail__hero {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    column-gap: var(--layout-gutter);
  }

  .case-detail__hero h1 {
    grid-column: 2 / -2;
  }

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
  gap: 0;
  line-height: 1.1;
}

.case-detail__role-tags span {
  font-weight: 500;
  white-space: nowrap;
}

h1 {
  width: 100%;
  margin: 0;
  font-size: clamp(3rem, 8vw, 8rem);
  font-weight: 400;
  letter-spacing: -0.05em;
  line-height: 0.95;
  transition: opacity 2.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.case-detail__summary {
  display: block;
}

@media (max-width: 767.98px) {
  .case-detail__first-screen {
    box-sizing: border-box;
    display: flex;
    min-height: var(--app-screen);
    flex-direction: column;
    padding-bottom: clamp(1rem, 3svh, 1.5rem);
  }

  .case-detail__hero {
    min-height: 0;
    row-gap: 1rem;
    padding-block: calc(var(--layout-surface-top) + 1rem) 3.5rem;
  }

  h1 {
    font-size: var(--type-hero);
  }

  .case-detail__content {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    padding-top: 0;
  }

  .case-detail__meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--layout-gutter);
    row-gap: 0.75rem;
    padding-top: 1rem;
  }

  .case-detail__meta:not(.case-detail__meta--with-collaboration) > :nth-child(3) {
    grid-column: 1 / -1;
  }

  .case-detail__tags {
    margin-top: 0;
  }

  .case-detail__media {
    margin-top: auto;
    margin-bottom: 0;
  }

  .case-detail__image {
    aspect-ratio: auto;
  }
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

.case-detail__media--audience .case-detail__image {
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  object-fit: cover;
}

/* Audience keeps its full portrait image behind the shortened frame. The
   frame is another 25% lower than the previous 4:3 crop; the inner element
   preserves the full raster height for the longer parallax travel. */
.case-detail__media--audience {
  aspect-ratio: 16 / 9;
  margin-bottom: clamp(2rem, 6vw, 6rem);
  overflow: hidden;
}

.case-detail__media--audience .case-detail__media-parallax {
  height: 222.222%;
}

.case-detail__meta,
.case-detail__media {
  transition:
    opacity 1.6s cubic-bezier(0.22, 1, 0.36, 1),
    transform 1.6s cubic-bezier(0.22, 1, 0.36, 1);
}

.case-detail--entering h1,
.case-detail--entering .case-detail__meta,
.case-detail--entering .case-detail__media {
  opacity: 0;
}

.case-detail--entering .case-detail__meta,
.case-detail--entering .case-detail__media {
  transform: translateY(2rem);
}

.case-detail:not(.case-detail--entering) .case-detail__meta {
  transition-delay: 0.2s;
}

.case-detail:not(.case-detail--entering) .case-detail__media {
  transition-delay: 0.48s;
}

@media (prefers-reduced-motion: reduce) {
  h1,
  .case-detail__meta,
  .case-detail__media {
    transition: none;
  }
}
</style>
