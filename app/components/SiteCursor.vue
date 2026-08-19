<script setup lang="ts">
const HOT_SEL = [
  'a',
  'button',
  '[role="button"]',
  '[role="link"]',
  'input',
  'textarea',
  'select',
  'summary',
  'label',
  '[tabindex]:not([tabindex="-1"])',
  '.pc-frame__sheet',
  '.hero-swarm',
  '.custom-scrollbar__track',
  '.custom-scrollbar__thumb',
].join(',')

/** Header chips — fade the dot instead of the “hot” grow. */
const CHIP_FADE_SEL = [
  '.nav-link',
  '.menu-btn--float',
  '.menu-fab',
  '.header-logo-link',
].join(',')

const TEXT_SEL = [
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="color"]):not([type="range"]):not([type="hidden"])',
  'textarea',
  '[contenteditable="true"]',
].join(',')

const { suppressed } = useSiteCursor()
const rootEl = ref<HTMLElement | null>(null)
const enabled = ref(false)
const hot = ref(false)
const away = ref(true)
const textOver = ref(false)
const chipFade = ref(false)
let moveRaf = 0
let pointerX = 0
let pointerY = 0

function canUse() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

function applyPos(x: number, y: number) {
  const el = rootEl.value
  if (!el) return
  el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
}

function setTextOver(on: boolean) {
  if (textOver.value === on) return
  textOver.value = on
  document.documentElement.classList.toggle('has-site-cursor-text', on)
}

function probe(x: number, y: number) {
  const node = document.elementFromPoint(x, y)
  if (!(node instanceof Element)) {
    hot.value = false
    chipFade.value = false
    setTextOver(false)
    return
  }
  const overText = !!node.closest(TEXT_SEL)
  setTextOver(overText)
  const overChip = !!node.closest(CHIP_FADE_SEL)
  chipFade.value = overChip
  hot.value = !overText && !overChip && !!node.closest(HOT_SEL)
}

function flushMove() {
  moveRaf = 0
  away.value = false
  applyPos(pointerX, pointerY)
  probe(pointerX, pointerY)
}

function onMove(e: PointerEvent) {
  if (e.pointerType === 'touch') return
  pointerX = e.clientX
  pointerY = e.clientY
  if (!moveRaf) moveRaf = requestAnimationFrame(flushMove)
}

function onDocLeave(e: PointerEvent) {
  const next = e.relatedTarget
  if (next instanceof Node && document.documentElement.contains(next)) return
  if (moveRaf) {
    cancelAnimationFrame(moveRaf)
    moveRaf = 0
  }
  away.value = true
  hot.value = false
  chipFade.value = false
}

onMounted(() => {
  if (!canUse()) return
  enabled.value = true
  document.documentElement.classList.add('has-site-cursor')
  window.addEventListener('pointermove', onMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onDocLeave)
})

onUnmounted(() => {
  if (moveRaf) cancelAnimationFrame(moveRaf)
  window.removeEventListener('pointermove', onMove)
  document.documentElement.removeEventListener('pointerleave', onDocLeave)
  document.documentElement.classList.remove('has-site-cursor', 'has-site-cursor-text')
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="enabled"
      ref="rootEl"
      class="site-cursor"
      :class="{
        'site-cursor--hot': hot,
        'site-cursor--hide': suppressed || away || textOver || chipFade,
      }"
      aria-hidden="true"
    >
      <span class="site-cursor__dot" />
    </div>
  </Teleport>
</template>

<style>
.site-cursor {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 10050;
  width: 8px;
  height: 8px;
  pointer-events: none;
  mix-blend-mode: difference;
  will-change: transform, opacity;
  opacity: 1;
  transition: opacity 0.28s var(--motion-ease, ease);
}

.site-cursor__dot {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #fff;
  transform: scale(1);
  transform-origin: 50% 50%;
  will-change: transform;
  transition: transform 0.2s var(--motion-ease, ease);
}

.site-cursor--hot .site-cursor__dot {
  transform: scale(1.55);
}

.site-cursor--hide {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .site-cursor {
    transition: none;
  }

  .site-cursor__dot {
    transition: none;
  }
}
</style>
