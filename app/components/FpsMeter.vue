<script setup lang="ts">
/**
 * Lightweight whole-page FPS meter (rAF). Toggle with ?fps=0 to hide.
 */
const visible = ref(true)
const fps = ref(0)
const frameMs = ref(0)

let raf = 0
let frames = 0
let lastSecond = 0
let lastFrame = 0

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  if (params.get('fps') === '0') {
    visible.value = false
    return
  }

  lastSecond = performance.now()
  lastFrame = lastSecond

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    frames += 1
    frameMs.value = Math.round(now - lastFrame)
    lastFrame = now
    if (now - lastSecond >= 1000) {
      fps.value = frames
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
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.2;
  tabular-nums: true;
  font-variant-numeric: tabular-nums;
}

.fps-meter__sub {
  margin-left: 4px;
  font-weight: 500;
  opacity: 0.72;
}
</style>
