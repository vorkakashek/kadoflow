<script setup lang="ts">
defineProps<{
  src: string
  alt: string
  poster?: string
}>()

const videoEl = ref<HTMLVideoElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)
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
    // Browsers may decline muted autoplay despite the required attributes.
  })
}

function syncMotionPreference() {
  reducedMotion.value = motionQuery?.matches ?? false
  syncPlayback()
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionQuery.addEventListener('change', syncMotionPreference)

  observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting
    syncPlayback()
  }, { threshold: 0.15 })
  if (rootEl.value) observer.observe(rootEl.value)

  document.addEventListener('visibilitychange', syncPlayback)
  syncMotionPreference()
})

onBeforeUnmount(() => {
  motionQuery?.removeEventListener('change', syncMotionPreference)
  observer?.disconnect()
  document.removeEventListener('visibilitychange', syncPlayback)
})
</script>

<template>
  <figure ref="rootEl" class="case-autoplay-video">
    <video
      ref="videoEl"
      :poster="poster"
      preload="metadata"
      muted
      loop
      playsinline
      aria-hidden="true"
    >
      <source :src="src" type="video/mp4">
    </video>
    <figcaption class="sr-only">{{ alt }}</figcaption>
  </figure>
</template>

<style scoped>
.case-autoplay-video {
  margin: 0;
}

.case-autoplay-video video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
