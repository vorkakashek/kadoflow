<script setup lang="ts">
const props = defineProps<{
  webm: string
  mp4: string
  poster: string
  alt: string
}>()

const sectionEl = ref<HTMLElement | null>(null)
const videoEl = ref<HTMLVideoElement | null>(null)
const reducedMotion = ref(false)

let targetProgress = 0
let displayedProgress = 0
let raf = 0
let lastFrameAt = 0
let scrollDirty = true
let motionQuery: MediaQueryList | null = null

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function readScrollProgress() {
  const section = sectionEl.value
  if (!section) return 0

  const rect = section.getBoundingClientRect()
  const travel = Math.max(1, section.offsetHeight - window.innerHeight)
  return clamp01(-rect.top / travel)
}

function stopFrame() {
  if (!raf) return
  cancelAnimationFrame(raf)
  raf = 0
  lastFrameAt = 0
}

function requestFrame() {
  if (!raf && !document.hidden && !reducedMotion.value) {
    raf = requestAnimationFrame(tick)
  }
}

function tick(now: number) {
  raf = 0
  const video = videoEl.value
  if (!video || document.hidden || reducedMotion.value) return

  if (scrollDirty) {
    scrollDirty = false
    targetProgress = readScrollProgress()
  }

  const dt = lastFrameAt ? Math.min(64, now - lastFrameAt) : 16
  lastFrameAt = now
  // A time-based lerp keeps the same soft follow on a 60 Hz or 120 Hz display.
  const follow = 1 - Math.exp(-9 * dt / 1000)
  displayedProgress += (targetProgress - displayedProgress) * follow

  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(video.duration)) {
    const time = displayedProgress * video.duration
    // Seeking more often than a source frame only adds decoder work.
    if (Math.abs(video.currentTime - time) > 1 / 45) video.currentTime = time
  }

  if (scrollDirty || Math.abs(targetProgress - displayedProgress) > 0.0008) {
    requestFrame()
  } else {
    lastFrameAt = 0
  }
}

function syncScroll() {
  scrollDirty = true
  requestFrame()
}

function syncMotionPreference() {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reducedMotion.value) {
    stopFrame()
    return
  }
  displayedProgress = readScrollProgress()
  targetProgress = displayedProgress
  syncScroll()
}

function onLoadedMetadata() {
  displayedProgress = readScrollProgress()
  targetProgress = displayedProgress
  const video = videoEl.value
  if (video && !reducedMotion.value) video.currentTime = displayedProgress * video.duration
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionQuery.addEventListener('change', syncMotionPreference)
  window.addEventListener('scroll', syncScroll, { passive: true })
  window.addEventListener('resize', syncScroll, { passive: true })
  document.addEventListener('visibilitychange', onVisibilityChange)
  syncMotionPreference()
})

function onVisibilityChange() {
  if (document.hidden) stopFrame()
  else syncScroll()
}

onBeforeUnmount(() => {
  motionQuery?.removeEventListener('change', syncMotionPreference)
  window.removeEventListener('scroll', syncScroll)
  window.removeEventListener('resize', syncScroll)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  stopFrame()
})
</script>

<template>
  <section ref="sectionEl" class="baltika-scroll-film">
    <div class="baltika-scroll-film__stage">
      <video
        ref="videoEl"
        class="baltika-scroll-film__video"
        :poster="poster"
        preload="auto"
        muted
        playsinline
        aria-hidden="true"
        @loadedmetadata="onLoadedMetadata"
      >
        <source :src="webm" type="video/webm">
        <source :src="mp4" type="video/mp4">
      </video>
      <p class="sr-only">{{ alt }}</p>
      <p v-if="!reducedMotion" class="baltika-scroll-film__hint" aria-hidden="true">
        Листайте, чтобы управлять движением
      </p>
    </div>
  </section>
</template>

<style scoped>
.baltika-scroll-film {
  height: 200svh;
  margin-top: 1.25rem;
}

.baltika-scroll-film__stage {
  position: sticky;
  top: 0;
  display: grid;
  height: var(--app-screen);
  place-items: center;
}

.baltika-scroll-film__video {
  display: block;
  width: min(100%, 68rem);
  aspect-ratio: 1;
  object-fit: cover;
  background: var(--palette-milk, #f5f1e8);
}

.baltika-scroll-film__hint {
  position: absolute;
  bottom: clamp(1.25rem, 3vw, 2.5rem);
  left: 0;
  margin: 0;
  font-size: var(--type-nav);
  letter-spacing: -0.02em;
  opacity: 0.56;
}

@media (prefers-reduced-motion: reduce) {
  .baltika-scroll-film {
    height: auto;
  }

  .baltika-scroll-film__stage {
    height: auto;
  }
}
</style>
