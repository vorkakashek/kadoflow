<script setup lang="ts">
import type { ProjectCaseMedia } from '~/utils/projectCaseDetails'

const props = withDefaults(defineProps<{
  media: ProjectCaseMedia[]
  railSpeed?: number
}>(), {
  railSpeed: 1,
})
</script>

<template>
  <CaseHorizontalRail
    v-if="props.media.length > 1"
    class="project-story__media project-story__media--scroll"
    :class="`project-story__media--${props.media.length}`"
    :desktop-grab-speed="props.railSpeed"
  >
    <CaseMediaItem
      v-for="(mediaItem, index) in props.media"
      :key="`${mediaItem.src}-${mediaItem.alt}-${index}`"
      :media="mediaItem"
    />
  </CaseHorizontalRail>
  <div
    v-else-if="props.media.length"
    class="project-story__media"
    :class="`project-story__media--${props.media.length}`"
  >
    <CaseMediaItem
      v-for="(mediaItem, index) in props.media"
      :key="`${mediaItem.src}-${mediaItem.alt}-${index}`"
      :media="mediaItem"
    />
  </div>
</template>
