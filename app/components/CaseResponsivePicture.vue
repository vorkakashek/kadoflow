<script setup lang="ts">
import type { ProjectCaseMedia } from '~/utils/projectCaseDetails'

defineProps<{
  media: ProjectCaseMedia
  imageClass?: string
}>()
</script>

<template>
  <picture>
    <source v-if="media.mobileAvifSrcset" type="image/avif" :srcset="media.mobileAvifSrcset" :sizes="media.sizes" media="(max-width: 767.98px)">
    <source v-if="media.mobileWebpSrcset" type="image/webp" :srcset="media.mobileWebpSrcset" :sizes="media.sizes" media="(max-width: 767.98px)">
    <source v-if="media.mobileSrc" :srcset="media.mobileSrc" media="(max-width: 767.98px)">
    <source v-if="media.avifSrcset" type="image/avif" :srcset="media.avifSrcset" :sizes="media.sizes">
    <source v-if="media.webpSrcset" type="image/webp" :srcset="media.webpSrcset" :sizes="media.sizes">
    <img
      :src="media.src"
      :alt="media.alt"
      :width="media.width"
      :height="media.height"
      :class="imageClass"
      :style="{
        aspectRatio: media.aspectRatio,
        '--case-media-mobile-aspect-ratio': media.mobileAspectRatio,
      }"
      loading="lazy"
      decoding="async"
    >
  </picture>
</template>
