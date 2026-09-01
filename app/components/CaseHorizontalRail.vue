<script setup lang="ts">
const props = withDefaults(defineProps<{
  desktopGrabSpeed?: number
}>(), {
  desktopGrabSpeed: 1,
})
const { t } = useI18n()
const { motionActive } = useCaseDetailExperience()

const viewportEl = ref<HTMLElement | null>(null)
const contentEl = ref<HTMLElement | null>(null)
const barEl = ref<HTMLElement | null>(null)
const needed = ref(false)
const thumbWidth = ref(0)
const thumbOffset = ref(0)

let resizeObserver: ResizeObserver | null = null
let dragging = false
let dragOffset = 0
let viewportDragging = false
let viewportDragStartX = 0
let viewportDragStartScrollLeft = 0
let viewportDragLastX = 0
let viewportDragLastTime = 0
let viewportDragVelocity = 0
let inertiaFrame = 0
let initialPositionLocked = true
let touchStartX = 0
let touchStartY = 0

function unlockInitialPosition() {
  initialPositionLocked = false
}

function stopViewportInertia() {
  if (inertiaFrame) cancelAnimationFrame(inertiaFrame)
  inertiaFrame = 0
  viewportDragVelocity = 0
}

function startViewportInertia() {
  const viewport = viewportEl.value
  if (
    !viewport
    || !motionActive.value
    || Math.abs(viewportDragVelocity) < 0.015
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) return

  let lastTime = performance.now()
  const tick = (now: number) => {
    const elapsed = Math.min(40, Math.max(1, now - lastTime))
    lastTime = now

    const overflow = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const previous = viewport.scrollLeft
    const next = Math.min(overflow, Math.max(0, previous + viewportDragVelocity * elapsed))
    viewport.scrollLeft = next
    viewportDragVelocity *= Math.exp(-elapsed / 280)

    if (Math.abs(next - previous) < 0.01 || Math.abs(viewportDragVelocity) < 0.015) {
      inertiaFrame = 0
      viewportDragVelocity = 0
      return
    }

    inertiaFrame = requestAnimationFrame(tick)
  }

  inertiaFrame = requestAnimationFrame(tick)
}

watch(motionActive, (active) => {
  if (!active) stopViewportInertia()
})

function sync() {
  const viewport = viewportEl.value
  const bar = barEl.value
  if (!viewport || !bar) return

  // Lazy media can change the rail width several frames after mount. Until the
  // visitor actually touches the rail, keep those reflows anchored to item one.
  if (initialPositionLocked && Math.abs(viewport.scrollLeft) > 0.5) {
    viewport.scrollLeft = 0
  }

  const overflow = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
  const barWidth = bar.clientWidth
  needed.value = overflow > 1 && barWidth > 0
  if (!needed.value) {
    thumbWidth.value = barWidth
    thumbOffset.value = 0
    return
  }

  thumbWidth.value = Math.max(40, Math.min(barWidth, barWidth * (viewport.clientWidth / viewport.scrollWidth)))
  const thumbRange = Math.max(0, barWidth - thumbWidth.value)
  thumbOffset.value = thumbRange * (viewport.scrollLeft / overflow)
}

function scrollToThumb(offset: number) {
  const viewport = viewportEl.value
  const bar = barEl.value
  if (!viewport || !bar || !needed.value) return
  const thumbRange = Math.max(0, bar.clientWidth - thumbWidth.value)
  const clamped = Math.min(thumbRange, Math.max(0, offset))
  const overflow = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
  viewport.scrollLeft = thumbRange > 0 ? (clamped / thumbRange) * overflow : 0
}

function onTrackPointerDown(event: PointerEvent) {
  if (event.button !== 0 || (event.target as HTMLElement).closest('.case-horizontal-rail__thumb')) return
  unlockInitialPosition()
  event.preventDefault()
  const bar = barEl.value
  if (!bar) return
  scrollToThumb(event.clientX - bar.getBoundingClientRect().left - thumbWidth.value / 2)
}

function onThumbPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  unlockInitialPosition()
  event.preventDefault()
  const bar = barEl.value
  if (!bar) return
  dragging = true
  dragOffset = event.clientX - bar.getBoundingClientRect().left - thumbOffset.value
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onThumbPointerMove(event: PointerEvent) {
  if (!dragging) return
  const bar = barEl.value
  if (!bar) return
  scrollToThumb(event.clientX - bar.getBoundingClientRect().left - dragOffset)
}

function onThumbPointerUp(event: PointerEvent) {
  if (!dragging) return
  dragging = false
  try {
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  } catch {
    // The pointer may already have been released by the browser.
  }
}

function onKeydown(event: KeyboardEvent) {
  const viewport = viewportEl.value
  if (!viewport) return
  const step = Math.max(120, Math.round(viewport.clientWidth * 0.72))
  if (event.key === 'ArrowRight') {
    unlockInitialPosition()
    event.preventDefault()
    viewport.scrollBy({ left: step, behavior: 'smooth' })
  }
  if (event.key === 'ArrowLeft') {
    unlockInitialPosition()
    event.preventDefault()
    viewport.scrollBy({ left: -step, behavior: 'smooth' })
  }
}

function onViewportPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'mouse') {
    touchStartX = event.clientX
    touchStartY = event.clientY
    return
  }
  if (event.button !== 0) return
  unlockInitialPosition()
  const viewport = viewportEl.value
  if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return

  stopViewportInertia()
  viewportDragging = true
  viewportDragStartX = event.clientX
  viewportDragStartScrollLeft = viewport.scrollLeft
  viewportDragLastX = event.clientX
  viewportDragLastTime = performance.now()
  viewport.setPointerCapture(event.pointerId)
  event.preventDefault()
}

function onViewportPointerMove(event: PointerEvent) {
  if (event.pointerType !== 'mouse') {
    const deltaX = Math.abs(event.clientX - touchStartX)
    const deltaY = Math.abs(event.clientY - touchStartY)
    if (deltaX > 6 && deltaX > deltaY) unlockInitialPosition()
    return
  }
  if (!viewportDragging) return
  const viewport = viewportEl.value
  if (!viewport) return
  const now = performance.now()
  const delta = event.clientX - viewportDragLastX
  const elapsed = Math.max(1, now - viewportDragLastTime)
  viewport.scrollLeft = viewportDragStartScrollLeft
    - (event.clientX - viewportDragStartX) * props.desktopGrabSpeed
  const instantaneousVelocity = -(delta * props.desktopGrabSpeed) / elapsed
  viewportDragVelocity = viewportDragVelocity * 0.35 + instantaneousVelocity * 0.65
  viewportDragLastX = event.clientX
  viewportDragLastTime = now
}

function onViewportWheel(event: WheelEvent) {
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) unlockInitialPosition()
}

function onViewportPointerUp(event: PointerEvent) {
  if (!viewportDragging) return
  viewportDragging = false
  const viewport = viewportEl.value
  try {
    viewport?.releasePointerCapture(event.pointerId)
  } catch {
    // The pointer may already have been released by the browser.
  }
  startViewportInertia()
}

onMounted(() => {
  resizeObserver = new ResizeObserver(sync)
  if (viewportEl.value) viewportEl.value.scrollLeft = 0
  if (viewportEl.value) resizeObserver.observe(viewportEl.value)
  if (contentEl.value) resizeObserver.observe(contentEl.value)
  if (barEl.value) resizeObserver.observe(barEl.value)
  sync()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  stopViewportInertia()
})
</script>

<template>
  <div class="case-horizontal-rail">
    <div
      ref="viewportEl"
      class="case-horizontal-rail__viewport"
      tabindex="0"
      :aria-label="t('projects.detail.horizontalGallery')"
      @scroll="sync"
      @wheel.passive="onViewportWheel"
      @keydown="onKeydown"
      @pointerdown="onViewportPointerDown"
      @pointermove="onViewportPointerMove"
      @pointerup="onViewportPointerUp"
      @pointercancel="onViewportPointerUp"
      @lostpointercapture="onViewportPointerUp"
    >
      <div ref="contentEl" class="case-horizontal-rail__content">
        <slot />
      </div>
    </div>
    <div
      ref="barEl"
      class="case-horizontal-rail__bar"
      :class="{ 'is-needed': needed }"
      aria-hidden="true"
      @pointerdown="onTrackPointerDown"
    >
      <div
        class="case-horizontal-rail__thumb"
        :style="{
          width: `${thumbWidth}px`,
          transform: `translate3d(${thumbOffset}px, 0, 0)`,
        }"
        @pointerdown.stop="onThumbPointerDown"
        @pointermove="onThumbPointerMove"
        @pointerup="onThumbPointerUp"
        @pointercancel="onThumbPointerUp"
      />
    </div>
  </div>
</template>

<style scoped>
.case-horizontal-rail__bar { display: none; }

@media (max-width: 767.98px) {
  .case-horizontal-rail__viewport {
    overflow-x: auto;
    overflow-y: hidden;
    overflow-anchor: none;
    scrollbar-width: none;
    touch-action: pan-x pan-y pinch-zoom;
    -webkit-overflow-scrolling: touch;
  }

  .case-horizontal-rail__viewport::-webkit-scrollbar { display: none; }

  .case-horizontal-rail__content {
    display: flex;
    width: max-content;
    box-sizing: border-box;
    gap: var(--space-1);
    padding-inline: var(--layout-margin);
    overflow-anchor: none;
  }

  .case-horizontal-rail__bar {
    display: block;
    width: 80vw;
    height: 8px;
    margin: var(--space-2) calc(50% - 40vw) 0;
    padding-block: 3px;
    cursor: pointer;
    touch-action: pan-y;
  }

  .case-horizontal-rail__bar::before {
    display: block;
    height: 2px;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 20%, transparent);
    content: '';
  }

  .case-horizontal-rail__thumb {
    position: relative;
    top: -3px;
    display: block;
    height: 4px;
    border-radius: 999px;
    background: currentColor;
    cursor: grab;
    touch-action: pan-y;
  }

  .case-horizontal-rail__thumb:active { cursor: grabbing; }
}
</style>
