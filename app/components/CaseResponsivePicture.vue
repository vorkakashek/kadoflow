<script setup lang="ts">
import type { ProjectCaseMedia } from '~/utils/projectCaseDetails'

defineProps<{
  media: ProjectCaseMedia
  imageClass?: string
}>()
</script>

<template>
  <picture>
    <source v-if="media.avifSrcset" type="image/avif" :srcset="media.avifSrcset" :sizes="media.sizes">
    <source v-if="media.webpSrcset" type="image/webp" :srcset="media.webpSrcset" :sizes="media.sizes">
    <img
      :src="media.src"
      :alt="media.alt"
      :width="media.width"
      :height="media.height"
      :class="imageClass"
      :style="media.aspectRatio ? { aspectRatio: media.aspectRatio } : undefined"
      loading="lazy"
      decoding="async"
    >
  </picture>
</template>
