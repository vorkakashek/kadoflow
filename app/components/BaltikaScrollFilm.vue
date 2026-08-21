<script setup lang="ts">
defineProps<{
  webm: string
  mp4: string
  mobileWebm?: string
  mobileMp4?: string
  poster: string
  alt: string
}>()

const sectionEl = ref<HTMLElement | null>(null)
const videoEl = ref<HTMLVideoElement | null>(null)
const reducedMotion = ref(false)

let motionQuery: MediaQueryList | null = null
let observer: IntersectionObserver | null = null
let inView = false

function syncPlayback() {
  const video = videoEl.value
  if (!video) return

  if (reducedMotion.value || document.hidden || !inView) {
    video.pause()
    return
  }

  void video.play().catch(() => {
    // Autoplay can be declined by a browser despite muted/playsinline.
  })
}

function syncMotionPreference() {
  reducedMotion.value = motionQuery?.matches ?? false
  syncPlayback()
}

function onVisibilityChange() {
  syncPlayback()
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionQuery.addEventListener('change', syncMotionPreference)

  observer = new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting
      syncPlayback()
    },
    { threshold: 0.15 },
  )
  if (sectionEl.value) observer.observe(sectionEl.value)

  document.addEventListener('visibilitychange', onVisibilityChange)
  syncMotionPreference()
})

onBeforeUnmount(() => {
  motionQuery?.removeEventListener('change', syncMotionPreference)
  observer?.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <section ref="sectionEl" class="baltika-scroll-film">
    <video
      ref="videoEl"
      class="baltika-scroll-film__video"
      :poster="poster"
      preload="metadata"
      muted
      loop
      playsinline
      aria-hidden="true"
    >
      <source
        v-if="mobileWebm"
        media="(max-width: 767.98px)"
        :src="mobileWebm"
        type="video/webm"
      >
      <source
        v-if="mobileMp4"
        media="(max-width: 767.98px)"
        :src="mobileMp4"
        type="video/mp4"
      >
      <source :src="webm" type="video/webm">
      <source :src="mp4" type="video/mp4">
    </video>
    <p class="sr-only">{{ alt }}</p>
  </section>
</template>

<style scoped>
.baltika-scroll-film {
  margin: 0;
}

.baltika-scroll-film__video {
  display: block;
  width: min(100%, 68rem);
  margin-inline: auto;
  aspect-ratio: 1;
  object-fit: cover;
  /* The source is opaque white. Match the home-case treatment so its white
     resolves into Baltika’s milk wash instead of reading as a white rectangle. */
  mix-blend-mode: multiply;
}

@media (prefers-reduced-motion: reduce) {
  .baltika-scroll-film__video {
    mix-blend-mode: normal;
  }
}
</style>
