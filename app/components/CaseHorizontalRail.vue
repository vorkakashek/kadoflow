<script setup lang="ts">
const props = withDefaults(defineProps<{
  desktopScrollSpeed?: number
}>(), {
  desktopScrollSpeed: 1,
})

const viewportEl = ref<HTMLElement | null>(null)
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

function sync() {
  const viewport = viewportEl.value
  const bar = barEl.value
  if (!viewport || !bar) return

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
  event.preventDefault()
  const bar = barEl.value
  if (!bar) return
  scrollToThumb(event.clientX - bar.getBoundingClientRect().left - thumbWidth.value / 2)
}

function onThumbPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
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
    event.preventDefault()
    viewport.scrollBy({ left: step, behavior: 'smooth' })
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    viewport.scrollBy({ left: -step, behavior: 'smooth' })
  }
}

function onViewportPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || event.button !== 0) return
  const viewport = viewportEl.value
  if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return

  viewportDragging = true
  viewportDragStartX = event.clientX
  viewportDragStartScrollLeft = viewport.scrollLeft
  viewport.setPointerCapture(event.pointerId)
  event.preventDefault()
}

function onViewportPointerMove(event: PointerEvent) {
  if (!viewportDragging) return
  const viewport = viewportEl.value
  if (!viewport) return
  viewport.scrollLeft = viewportDragStartScrollLeft
    - (event.clientX - viewportDragStartX) * props.desktopScrollSpeed
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
}

function onViewportWheel(event: WheelEvent) {
  const viewport = viewportEl.value
  if (!viewport || props.desktopScrollSpeed <= 1 || window.innerWidth < 768) return

  const overflow = viewport.scrollWidth - viewport.clientWidth
  if (overflow <= 1) return

  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? viewport.clientWidth
      : 1
  const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY)
    * unit
    * props.desktopScrollSpeed
  if (Math.abs(delta) < 0.01) return

  const canMove = delta > 0
    ? viewport.scrollLeft < overflow - 1
    : viewport.scrollLeft > 1
  if (!canMove) return

  event.preventDefault()
  viewport.scrollLeft += delta
}

onMounted(() => {
  resizeObserver = new ResizeObserver(sync)
  if (viewportEl.value) resizeObserver.observe(viewportEl.value)
  if (barEl.value) resizeObserver.observe(barEl.value)
  sync()
})

onUnmounted(() => resizeObserver?.disconnect())
</script>

<template>
  <div class="case-horizontal-rail">
    <div
      ref="viewportEl"
      class="case-horizontal-rail__viewport"
      tabindex="0"
      aria-label="Горизонтальная галерея"
      @scroll="sync"
      @wheel="onViewportWheel"
      @keydown="onKeydown"
      @pointerdown="onViewportPointerDown"
      @pointermove="onViewportPointerMove"
      @pointerup="onViewportPointerUp"
      @pointercancel="onViewportPointerUp"
    >
      <div class="case-horizontal-rail__content">
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
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .case-horizontal-rail__viewport::-webkit-scrollbar { display: none; }

  .case-horizontal-rail__content {
    display: flex;
    width: max-content;
    gap: var(--space-1);
  }

  .case-horizontal-rail__bar {
    display: block;
    height: 8px;
    margin-top: var(--space-2);
    padding-block: 3px;
    cursor: pointer;
    touch-action: none;
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
    top: -2px;
    display: block;
    height: 4px;
    border-radius: 999px;
    background: currentColor;
    cursor: grab;
    touch-action: none;
  }

  .case-horizontal-rail__thumb:active { cursor: grabbing; }
}
</style>
