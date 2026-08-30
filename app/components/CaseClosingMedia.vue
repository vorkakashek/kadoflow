<script setup lang="ts">
import type { ProjectCaseMedia } from '~/utils/projectCaseDetails'

withDefaults(defineProps<{
  media: ProjectCaseMedia
  variant?: 'audience' | 'story'
}>(), {
  variant: 'story',
})
</script>

<template>
  <figure
    :class="variant === 'audience' ? 'audience-case__closing-media' : 'project-story__closing-media'"
  >
    <picture>
      <source v-if="media.avifSrcset" type="image/avif" :srcset="media.avifSrcset" :sizes="media.sizes">
      <source v-if="media.webpSrcset" type="image/webp" :srcset="media.webpSrcset" :sizes="media.sizes">
      <img
        :src="media.src"
        :alt="media.alt"
        :width="media.width"
        :height="media.height"
        loading="lazy"
        decoding="async"
      >
    </picture>
  </figure>
</template>

<style scoped>
.project-story__closing-media,
.audience-case__closing-media {
  width: 100%;
  margin: 0;
  overflow: hidden;
}

.project-story__closing-media { height: min(82svh, 68rem); }

.audience-case__closing-media {
  height: calc(75svh - 40px);
  min-height: calc(22rem - 40px);
}

picture,
img {
  display: block;
  width: 100%;
  height: 100%;
}

img { object-fit: cover; }

@media (max-width: 767.98px) {
  .project-story__closing-media {
    height: 62svh;
    min-height: 22rem;
  }

  .audience-case__closing-media { min-height: calc(18rem - 40px); }
}
</style>
