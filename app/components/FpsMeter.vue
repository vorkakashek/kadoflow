<script setup lang="ts">
/**
 * Lightweight whole-page FPS meter (rAF). Toggle with ?fps=0 to hide.
 */
const visible = ref(true)
const fps = ref(0)
const frameMs = ref(0)
const READOUT_INTERVAL_MS = 250

let raf = 0
let frames = 0
let lastSecond = 0
let lastFrame = 0
let lastReadout = 0
let latestFrameMs = 0

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  if (params.get('fps') === '0') {
    visible.value = false
    return
  }

  lastSecond = performance.now()
  lastFrame = lastSecond
  lastReadout = lastSecond

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    frames += 1
    latestFrameMs = Math.round(now - lastFrame)
    lastFrame = now

    if (now - lastReadout >= READOUT_INTERVAL_MS) {
      frameMs.value = latestFrameMs
      lastReadout = now
    }

    const elapsed = now - lastSecond
    if (elapsed >= 1000) {
      fps.value = Math.round((frames * 1000) / elapsed)
      frames = 0
      lastSecond = now
    }
  }
  raf = requestAnimationFrame(loop)
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div
    v-if="visible"
    class="fps-meter pointer-events-none fixed top-0 right-0 z-[9999] select-none"
    aria-hidden="true"
  >
    <span>{{ fps }}</span>
    <span class="fps-meter__sub">fps</span>
    <span class="fps-meter__sub">· {{ frameMs }}ms</span>
  </div>
</template>

<style scoped>
.fps-meter {
  margin: calc(var(--safe-top, 0px) + 8px) calc(var(--safe-right, 0px) + 8px) 0 0;
  padding: 4px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--palette-ink) 78%, transparent);
  color: var(--palette-milk, #f5f1e8);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  line-height: 1.2;
  tabular-nums: true;
  font-variant-numeric: tabular-nums;
}

.fps-meter__sub {
  margin-left: 4px;
  font-weight: 400;
  opacity: 0.72;
}
</style>
