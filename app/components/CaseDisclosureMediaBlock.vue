<script setup lang="ts">
import type { ProjectCaseDisclosureMediaBlock } from '~/utils/projectCaseDetails'

const props = defineProps<{
  block: ProjectCaseDisclosureMediaBlock
}>()

const emit = defineEmits<{
  layoutChange: []
}>()
</script>

<template>
  <section class="case-disclosure-media audience-case audience-case--disclosure">
    <CaseNarrativeDisclosure
      :disclosure-id="`case-${props.block.id}`"
      :title="props.block.title"
      :paragraphs="props.block.paragraphs"
      @layout-change="emit('layoutChange')"
    />
    <CaseResponsivePicture :media="props.block.media" class="audience-case__media-wide" />
  </section>
</template>

<style scoped>
.case-disclosure-media {
  margin-top: var(--space-section);
  text-align: center;
}

.audience-case__media-wide {
  display: block;
  margin-top: var(--case-disclosure-media-gap);
}

.audience-case__media-wide :deep(img) {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 8;
  object-fit: cover;
}

@media (max-width: 767.98px) {
  .audience-case__media-wide :deep(img) {
    aspect-ratio: var(--case-media-mobile-aspect-ratio, 2215 / 3278) !important;
  }
}
</style>
