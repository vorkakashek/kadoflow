<script setup lang="ts">
import { homeCases } from '~/utils/homeCases'

const route = useRoute()
const item = computed(() =>
  homeCases.find((caseItem) => caseItem.id === route.params.id),
)
const { detailContentVisible } = useCaseDetailTransition()

onMounted(() => {
  // Direct entries have not visited the home route yet. Warm its component
  // while the user reads the case so the return transition can mount it under
  // the fullscreen cover without a route-chunk pause.
  void preloadRouteComponents('/')
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
      </section>

      <section class="case-detail__content">
        <p class="case-detail__eyebrow">Фокус внимания</p>
        <p class="case-detail__tags">{{ item.focusTags.join(' · ') }}</p>
        <img
          :src="item.media.src"
          :alt="item.media.alt"
          class="case-detail__image"
          loading="eager"
          fetchpriority="high"
          decoding="async"
        >
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
  min-height: 40svh;
  place-items: center;
  padding-block: calc(var(--layout-surface-top) + clamp(1rem, 2vw, 2rem)) clamp(1rem, 2vw, 2rem);
  text-align: center;
}

.case-detail__content {
  width: 100%;
  margin: 0 auto;
  padding-top: clamp(1.5rem, 3vw, 3rem);
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

.case-detail__blurb {
  max-width: 34rem;
  margin: clamp(2.5rem, 6vw, 4rem) 0 0;
  font-size: var(--type-lead);
  line-height: 1.35;
}

.case-detail__image {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  margin-top: 1.25rem;
  object-fit: cover;
}

.case-detail__eyebrow,
.case-detail__tags,
.case-detail__image {
  transition:
    opacity 1.6s cubic-bezier(0.22, 1, 0.36, 1),
    transform 1.6s cubic-bezier(0.22, 1, 0.36, 1);
}

.case-detail--entering h1,
.case-detail--entering .case-detail__eyebrow,
.case-detail--entering .case-detail__tags,
.case-detail--entering .case-detail__image {
  opacity: 0;
}

.case-detail--entering .case-detail__eyebrow,
.case-detail--entering .case-detail__tags,
.case-detail--entering .case-detail__image {
  transform: translateY(2rem);
}

/* Once the fullscreen image has cleared, bring the page in as a short cascade. */
.case-detail:not(.case-detail--entering) .case-detail__eyebrow {
  transition-delay: 0.2s;
}

.case-detail:not(.case-detail--entering) .case-detail__tags {
  transition-delay: 0.34s;
}

.case-detail:not(.case-detail--entering) .case-detail__image {
  transition-delay: 0.48s;
}

@media (prefers-reduced-motion: reduce) {
  h1,
  .case-detail__eyebrow,
  .case-detail__tags,
  .case-detail__image {
    transition: none;
  }
}
</style>
