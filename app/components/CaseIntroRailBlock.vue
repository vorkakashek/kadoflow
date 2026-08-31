<script setup lang="ts">
import type { ProjectCaseIntroRailBlock } from '~/utils/projectCaseDetails'

const props = defineProps<{
  block: ProjectCaseIntroRailBlock
}>()
</script>

<template>
  <section class="case-intro-rail audience-case audience-case--intro">
    <h2 v-html="props.block.title" />
    <div class="audience-case__copy audience-case__copy--split">
      <p v-for="paragraph in props.block.paragraphs" :key="paragraph">{{ paragraph }}</p>
    </div>
    <CaseHorizontalRail
      class="audience-case__media-pair audience-case__media-pair--scroll"
      :desktop-grab-speed="props.block.railSpeed ?? 1"
    >
      <CaseResponsivePicture
        v-for="(media, index) in props.block.media"
        :key="`${media.src}-${index}`"
        :media="media"
        class="audience-case__wave-media"
        :class="index === 0 ? 'audience-case__wave-media--portrait' : 'audience-case__wave-media--landscape'"
      />
    </CaseHorizontalRail>
  </section>
</template>

<style scoped>
.case-intro-rail {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  margin-top: var(--space-6);
}

h2 {
  grid-column: 2 / span 5;
  grid-row: 1;
  max-width: none;
  margin: 0;
  font-size: clamp(2.75rem, 4.2vw, 6rem);
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 0.91;
  text-align: left;
  white-space: nowrap;
}

p { margin: 0; }

.audience-case__copy {
  display: grid;
  grid-column: 6 / -2;
  grid-row: 2;
  grid-template-columns: 1fr;
  row-gap: var(--space-2);
  margin-top: var(--space-4);
  color: color-mix(in srgb, var(--palette-milk, #f5f1e8) 78%, #0a0501);
  font-size: var(--type-case-body-large);
  font-weight: 300;
  letter-spacing: -0.01em;
  line-height: 1.28;
}

.audience-case__media-pair { grid-column: 1 / -1; margin-top: var(--space-6); }

:deep(.case-horizontal-rail__content) {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 7fr);
  align-items: start;
  gap: var(--layout-gutter);
}

.audience-case__wave-media {
  display: block;
  overflow: hidden;
}

.audience-case__wave-media--portrait {
  aspect-ratio: 4 / 5;
  margin-top: var(--space-6);
}

.audience-case__wave-media--landscape { aspect-ratio: 16 / 10; }

.audience-case__wave-media :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (min-width: 768px) and (max-width: 1279.98px) {
  h2,
  .audience-case__copy {
    grid-column: 2 / -2;
  }
}

@media (max-width: 767.98px) {
  .case-intro-rail { grid-template-columns: 1fr; }
  h2 {
    grid-column: 1;
    font-size: clamp(1.875rem, 8vw, 2.25rem);
    white-space: normal;
  }
  .audience-case__copy {
    grid-column: 1;
    margin-top: var(--space-4);
  }
  .audience-case__copy p { font-size: var(--type-case-body); }
  .audience-case__media-pair { grid-column: 1; }
  .audience-case__wave-media--portrait { margin-top: var(--space-4); }
  :deep(.case-horizontal-rail__viewport) {
    display: block;
    width: 100vw;
    margin-inline: calc(50% - 50vw);
  }
  :deep(.case-horizontal-rail__content) {
    --case-rail-mobile-media-height: min(62svh, 72vw);
    display: flex;
    width: max-content;
    align-items: flex-start;
    gap: var(--space-1);
  }
  :deep(.case-horizontal-rail__content > picture) {
    flex: 0 0 auto;
    width: auto;
    height: var(--case-rail-mobile-media-height);
    margin-top: 0;
  }
  :deep(.case-horizontal-rail__content > picture > img) {
    width: auto;
    max-width: none;
    height: 100%;
    margin-top: 0;
    object-fit: contain;
  }
  :deep(.case-horizontal-rail__bar) {
    width: 80vw;
    margin-inline: calc(50% - 40vw);
  }
}
</style>
