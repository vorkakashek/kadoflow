<script setup lang="ts">
import type { ProjectCaseMotionFeatureBlock } from '~/utils/projectCaseDetails'

const props = defineProps<{
  block: ProjectCaseMotionFeatureBlock
}>()
</script>

<template>
  <section class="case-motion-feature audience-case audience-case--motion">
    <h2 v-html="props.block.title" />
    <p class="audience-case__motion-secondary case-text-fill">{{ props.block.fillText }}</p>
    <CaseAutoplayVideo
      class="audience-case__media-full"
      :src="props.block.media.src"
      :mobile-src="props.block.media.mobileSrc"
      :poster="props.block.media.poster"
      :mobile-poster="props.block.media.mobilePoster"
      :alt="props.block.media.alt"
    />
  </section>
</template>

<style scoped>
.case-motion-feature {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  margin-top: var(--space-section);
}

h2 {
  grid-column: 1 / -1;
  max-width: none;
  margin: 0 auto;
  font-size: clamp(2.75rem, 6.5vw, 7.5rem);
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 0.91;
  text-align: center;
}

.audience-case__motion-secondary {
  grid-column: 4 / -4;
  box-sizing: border-box;
  max-width: none;
  margin: var(--space-5) 0;
  font-size: clamp(1.75rem, 3.5vw, 4rem);
  font-weight: 300;
  letter-spacing: -0.01em;
  line-height: 1.04;
  text-align: center;
}

.audience-case__media-full {
  grid-column: 1 / -1;
  aspect-ratio: 16 / 8;
  margin-top: var(--space-6);
}

@media (min-width: 768px) and (max-width: 1279.98px) {
  .audience-case__motion-secondary { grid-column: 2 / -2; }
}

@media (max-width: 767.98px) {
  .case-motion-feature { grid-template-columns: 1fr; }
  h2 {
    grid-column: 1;
    font-size: clamp(1.875rem, 8vw, 2.25rem);
  }
  .audience-case__motion-secondary {
    grid-column: 1;
    margin-top: var(--space-5);
    margin-bottom: calc(var(--space-5) * 0.5);
  }
  .audience-case__media-full { grid-column: 1; }
}
</style>
