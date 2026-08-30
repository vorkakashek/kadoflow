<script setup lang="ts">
import type { ProjectCaseTextMediaRailBlock } from '~/utils/projectCaseDetails'

const props = defineProps<{
  block: ProjectCaseTextMediaRailBlock
}>()
</script>

<template>
  <section class="case-text-media-rail audience-case audience-case--live">
    <h2 v-html="props.block.title" />
    <p class="audience-case__lede">{{ props.block.text }}</p>
    <CaseHorizontalRail
      class="audience-case__admin-media audience-case__admin-media--scroll"
      :desktop-grab-speed="props.block.railSpeed ?? 1"
    >
      <CaseResponsivePicture
        v-for="(media, index) in props.block.media"
        :key="`${media.src}-${index}`"
        :media="media"
        class="audience-case__responsive-picture"
        :class="index === 0
          ? 'audience-case__responsive-picture--admin-small'
          : 'audience-case__responsive-picture--admin-large'"
      />
    </CaseHorizontalRail>
  </section>
</template>

<style scoped>
.case-text-media-rail { margin-top: var(--space-section); }

h2 {
  max-width: none;
  margin: 0 auto;
  font-size: clamp(2.75rem, 6.5vw, 7.5rem);
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 0.91;
  text-align: center;
}

.audience-case__lede {
  width: calc(50% - (var(--layout-gutter) / 2));
  max-width: none;
  margin: var(--space-4) auto 0;
  color: color-mix(in srgb, var(--palette-milk, #f5f1e8) 78%, #0a0501);
  font-size: clamp(1.25rem, 2.1vw, 2rem);
  letter-spacing: -0.01em;
  line-height: 1.18;
  text-align: center;
}

.audience-case__admin-media { margin-top: var(--space-6); }

:deep(.case-horizontal-rail__content) {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 7fr);
  align-items: start;
  gap: var(--layout-gutter);
}

.audience-case__responsive-picture {
  display: block;
  min-width: 0;
  overflow: hidden;
}

.audience-case__responsive-picture--admin-small { aspect-ratio: 16 / 10; }
.audience-case__responsive-picture--admin-large {
  aspect-ratio: 4 / 5;
  margin-top: var(--space-5);
}

.audience-case__responsive-picture :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (max-width: 767.98px) {
  .case-text-media-rail { margin-top: calc(var(--space-section) * 0.5); }
  h2 { font-size: clamp(1.875rem, 8vw, 2.25rem); }
  .audience-case__lede {
    width: 100%;
    margin-inline: 0;
    font-size: var(--type-case-body);
    text-align: left;
  }
  .audience-case__responsive-picture--admin-large { margin-top: var(--space-4); }
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
  :deep(.case-horizontal-rail__content > .audience-case__responsive-picture) {
    flex: 0 0 auto;
    width: auto;
    height: var(--case-rail-mobile-media-height);
    margin-top: 0;
  }
  :deep(.case-horizontal-rail__content > .audience-case__responsive-picture > img) {
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
