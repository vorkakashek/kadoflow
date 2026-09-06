<script setup lang="ts">
type WorkFormat = {
  title: string
  description: string
  preview: string
  previewAvif: string
  alt: string
}

const { tm, t } = useI18n()
defineProps<{ surfaceReady?: boolean }>()
const rootEl = ref<HTMLElement | null>(null)
const surfaceEl = ref<HTMLElement | null>(null)
const previewEl = ref<HTMLElement | null>(null)
const activeIndex = ref(0)
const previewVisible = ref(false)
const hoverPreviewEnabled = ref(false)
const mobileThumbsEnabled = ref(false)
const { open: pageCanvasOpen, busy: pageCanvasBusy } = usePageCanvas()

const formats = computed(() => tm('home.formats.items') as WorkFormat[])
const activeFormat = computed(() => formats.value[activeIndex.value] ?? formats.value[0])

function smallPreview(src: string) {
  return src.replace('-960.', '-480.')
}

defineExpose({ rootEl, surfaceEl })

let frame = 0
let lastPaintTime = 0
let previewWidth = 0
let previewHeight = 0
let targetX = 0
let targetY = 0
let currentX = 0
let currentY = 0
const previewFollowResponseMs = 50

function measurePreview() {
  const box = previewEl.value?.getBoundingClientRect()
  if (!box) return
  previewWidth = box.width
  previewHeight = box.height
}

function resolvePreviewPosition(clientX: number, clientY: number) {
  const width = previewWidth || Math.min(window.innerWidth * 0.28, 512)
  const height = previewHeight || width
  return {
    x: clientX - width / 2,
    y: clientY - height / 2,
  }
}

function paintPreview(timestamp: number) {
  frame = 0
  const el = previewEl.value
  if (!el) return

  const elapsedMs = lastPaintTime
    ? Math.min(timestamp - lastPaintTime, 32)
    : 1000 / 60
  const follow = reducedMotion
    ? 1
    : 1 - Math.exp(-elapsedMs / previewFollowResponseMs)
  lastPaintTime = timestamp

  currentX += (targetX - currentX) * follow
  currentY += (targetY - currentY) * follow
  el.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`

  if (Math.abs(targetX - currentX) > 0.2 || Math.abs(targetY - currentY) > 0.2) {
    frame = requestAnimationFrame(paintPreview)
  }
  else {
    lastPaintTime = 0
  }
}

function schedulePreviewPaint() {
  if (!frame) frame = requestAnimationFrame(paintPreview)
}

function setPointerTarget(event: PointerEvent, snap = false) {
  const position = resolvePreviewPosition(event.clientX, event.clientY)
  targetX = position.x
  targetY = position.y
  if (snap) {
    currentX = targetX
    currentY = targetY
  }
  schedulePreviewPaint()
}

async function activate(index: number, event?: PointerEvent) {
  if (!hoverPreviewEnabled.value) return
  const wasVisible = previewVisible.value
  activeIndex.value = index
  previewVisible.value = true
  await nextTick()
  measurePreview()
  if (event) setPointerTarget(event, !wasVisible)
}

function onPointerMove(event: PointerEvent) {
  if (!hoverPreviewEnabled.value || !previewVisible.value) return
  setPointerTarget(event)
}

function onPointerLeave(event?: PointerEvent) {
  previewVisible.value = false

  const list = event?.currentTarget
  if (list instanceof HTMLElement) {
    const bounds = list.getBoundingClientRect()
    const position = resolvePreviewPosition(
      Math.min(bounds.right, Math.max(bounds.left, event.clientX)),
      Math.min(bounds.bottom, Math.max(bounds.top, event.clientY)),
    )
    targetX = position.x
    targetY = position.y
    schedulePreviewPaint()
    return
  }

  if (frame) cancelAnimationFrame(frame)
  frame = 0
  lastPaintTime = 0
}

function onFocus(index: number) {
  if (!hoverPreviewEnabled.value) return
  activeIndex.value = index
  previewVisible.value = true
}

function onBlur(event: FocusEvent) {
  const next = event.relatedTarget
  if (!(next instanceof Node) || !rootEl.value?.contains(next)) {
    previewVisible.value = false
  }
}

let hoverMedia: MediaQueryList | null = null
let mobileThumbMedia: MediaQueryList | null = null
let reducedMotionMedia: MediaQueryList | null = null
let reducedMotion = false

function syncHoverPreviewMode() {
  hoverPreviewEnabled.value = !!hoverMedia?.matches
  mobileThumbsEnabled.value = !!mobileThumbMedia?.matches
  reducedMotion = !!reducedMotionMedia?.matches
  if (!hoverPreviewEnabled.value) previewVisible.value = false
}

watch(
  () => pageCanvasOpen.value || pageCanvasBusy.value,
  (navigationActive) => {
    if (navigationActive) onPointerLeave()
  },
)

onBeforeRouteLeave(() => {
  onPointerLeave()
})

onDeactivated(() => {
  onPointerLeave()
})

onMounted(() => {
  hoverMedia = window.matchMedia('(hover: hover) and (pointer: fine)')
  mobileThumbMedia = window.matchMedia('(max-width: 767.98px)')
  reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncHoverPreviewMode()
  hoverMedia.addEventListener('change', syncHoverPreviewMode)
  mobileThumbMedia.addEventListener('change', syncHoverPreviewMode)
  reducedMotionMedia.addEventListener('change', syncHoverPreviewMode)
  window.addEventListener('resize', measurePreview, { passive: true })
})

onUnmounted(() => {
  if (frame) cancelAnimationFrame(frame)
  hoverMedia?.removeEventListener('change', syncHoverPreviewMode)
  mobileThumbMedia?.removeEventListener('change', syncHoverPreviewMode)
  reducedMotionMedia?.removeEventListener('change', syncHoverPreviewMode)
  window.removeEventListener('resize', measurePreview)
})
</script>

<template>
  <section
    ref="rootEl"
    class="work-formats pointer-events-auto relative z-10 w-full"
    :aria-labelledby="'work-formats-title'"
  >
    <div class="work-formats__layout">
      <header class="work-formats__header">
        <h2 id="work-formats-title" class="work-formats__title">
          {{ t('home.formats.title') }}
        </h2>
        <p class="work-formats__intro">
          {{ t('home.formats.intro') }}
        </p>
      </header>

      <div class="work-formats__body">
        <div
          ref="surfaceEl"
          class="work-formats__surface"
          :class="{ 'is-surface-ready': surfaceReady }"
          aria-hidden="true"
        />

        <ol
          class="work-formats__list"
          :class="{ 'has-active': previewVisible }"
          @pointermove="onPointerMove"
          @pointerleave="onPointerLeave"
        >
          <li
            v-for="(item, index) in formats"
            :key="item.title"
            class="work-formats__item"
            :class="{ 'is-active': previewVisible && activeIndex === index }"
          >
            <div
              class="work-formats__trigger"
              :tabindex="hoverPreviewEnabled ? 0 : undefined"
              :aria-controls="hoverPreviewEnabled ? 'work-formats-preview' : undefined"
              @pointerenter="activate(index, $event)"
              @focus="onFocus(index)"
              @blur="onBlur"
            >
              <span class="work-formats__thumb-slot" aria-hidden="true">
                <picture
                  v-if="mobileThumbsEnabled"
                  class="work-formats__thumb"
                >
                  <source type="image/avif" :srcset="smallPreview(item.previewAvif)">
                  <img
                    :src="smallPreview(item.preview)"
                    alt=""
                    width="160"
                    height="160"
                    loading="lazy"
                    decoding="async"
                  >
                </picture>
              </span>
              <span class="work-formats__marker">
                <span class="work-formats__number">{{ String(index + 1).padStart(3, '0') }}</span>
                <span class="work-formats__arrow" aria-hidden="true">
                  <svg viewBox="0 0 40 40" fill="none">
                    <path d="M5 20h27M23 10l10 10-10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </span>
              </span>
              <span class="work-formats__copy">
                <h3 class="work-formats__name">
                  <span class="work-formats__name-text">{{ item.title }}</span>
                </h3>
                <span class="work-formats__description">{{ item.description }}</span>
              </span>
            </div>
          </li>
        </ol>

        <div
          v-if="hoverPreviewEnabled"
          id="work-formats-preview"
          ref="previewEl"
          class="work-formats__preview"
          :class="{ 'is-visible': previewVisible }"
          role="img"
          :aria-label="activeFormat?.alt"
          aria-live="polite"
        >
          <picture v-if="activeFormat" :key="activeFormat.preview" class="work-formats__picture">
            <source type="image/avif" :srcset="activeFormat.previewAvif">
            <img
              :src="activeFormat.preview"
              :alt="activeFormat.alt"
              width="960"
              height="960"
              loading="lazy"
              decoding="async"
            >
          </picture>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.work-formats {
  min-height: var(--app-screen);
  padding: var(--space-section) var(--layout-margin-content);
}

.work-formats__layout {
  display: grid;
  width: 100%;
  max-width: var(--layout-content-max);
  margin-inline: auto;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  row-gap: var(--space-block);
}

.work-formats__header,
.work-formats__body {
  grid-column: 1 / -1;
}

.work-formats__title {
  margin: 0;
  font-size: var(--type-display);
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 0.98;
}

.work-formats__intro {
  max-width: 38rem;
  margin-top: var(--space-2);
  font-size: var(--type-lead);
  letter-spacing: -0.025em;
  line-height: 1.3;
}

.work-formats__body {
  position: relative;
  display: grid;
  min-height: min(50rem, 70svh);
  grid-template-columns: repeat(8, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  align-items: center;
}

.work-formats__surface {
  position: absolute;
  inset-block: 0;
  left: calc(-1 * (var(--layout-column) + var(--layout-gutter)));
  width: var(--layout-span-4);
  border-radius: var(--radius-surface);
  background: var(--palette-stone);
}

.work-formats__surface.is-surface-ready {
  background: transparent;
}

.work-formats__list {
  position: relative;
  display: flex;
  margin: 0;
  padding: 0;
  grid-column: 1 / -1;
  flex-direction: column;
  list-style: none;
}

.work-formats__item {
  position: relative;
  z-index: 20;
  color: var(--palette-ink);
  transition: color 0.28s ease;
}

.work-formats__item.is-active,
.work-formats__item:focus-within {
  z-index: 40;
}

.work-formats__item + .work-formats__item {
  border-top: 1px solid color-mix(in srgb, var(--palette-ink) 18%, transparent);
}

.work-formats__list.has-active .work-formats__item:not(.is-active):not(:focus-within) {
  color: color-mix(in srgb, var(--palette-ink) 42%, var(--palette-sand));
}

.work-formats__trigger {
  position: relative;
  display: grid;
  width: 100%;
  padding: clamp(1rem, 2.2svh, 1.75rem) 0;
  grid-template-columns: var(--layout-span-1) minmax(0, 1fr);
  column-gap: var(--layout-gutter);
  align-items: start;
  color: inherit;
  text-align: left;
}

.work-formats__trigger:focus-visible {
  outline: 1px solid currentColor;
  outline-offset: 8px;
}

.work-formats__marker {
  position: relative;
  display: grid;
  width: 3ch;
  height: 1.3em;
  justify-self: start;
  align-items: center;
  overflow: hidden;
  font-size: var(--type-lead);
}

.work-formats__number,
.work-formats__arrow {
  width: 100%;
  height: 1em;
  grid-area: 1 / 1;
  transition: opacity 0.24s ease, transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.work-formats__arrow {
  display: flex;
  align-items: center;
  opacity: 0;
  transform: translateX(-100%);
}

.work-formats__thumb-slot {
  display: none;
}

.work-formats__item.is-active .work-formats__arrow,
.work-formats__item:focus-within .work-formats__arrow {
  opacity: 1;
  transform: translateX(0);
}

.work-formats__arrow svg {
  width: 100%;
  height: 100%;
}

.work-formats__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.65rem;
}

.work-formats__name {
  margin: 0;
  font-size: var(--type-slogan);
  font-weight: 600;
  letter-spacing: -0.035em;
  line-height: 1.1;
}

.work-formats__number {
  display: flex;
  align-items: center;
  font-size: inherit;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  line-height: 1.2;
  opacity: 1;
  transform: translateX(0);
}

.work-formats__description {
  max-width: 58rem;
  font-size: var(--type-body);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.35;
}

.work-formats__preview {
  position: fixed;
  z-index: 30;
  top: 0;
  left: 0;
  width: clamp(18rem, 28vw, 32rem);
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--radius-surface);
  background: var(--palette-stone);
  opacity: 0;
  pointer-events: none;
  transform: translate3d(-200vw, -200vh, 0);
  transition: opacity 0.22s ease;
  will-change: transform, opacity;
}

.work-formats__preview.is-visible {
  opacity: 1;
}

.work-formats__picture,
.work-formats__picture img {
  display: block;
  width: 100%;
  height: 100%;
}

.work-formats__picture img {
  object-fit: cover;
}

@media (min-width: 768px) {
  .work-formats__header,
  .work-formats__body {
    grid-column: 3 / span 8;
  }

  .work-formats__description {
    font-size: var(--type-lead);
  }

  .work-formats__item.is-active .work-formats__number,
  .work-formats__item:focus-within .work-formats__number {
    opacity: 0;
    transform: translateX(100%);
  }

  .work-formats__surface {
    /* The live FlowSurface occupies this slot after its first committed paint. */
  }

}

@media (max-width: 767.98px) {
  .work-formats {
    padding-block: calc(var(--space-section) * 0.75);
  }

  .work-formats__body {
    display: grid;
    min-height: 0;
    padding-block: var(--space-block);
    align-items: center;
  }

  .work-formats__surface {
    position: absolute;
    inset-block: 0;
    left: calc(-2 * var(--layout-margin));
    width: calc(100% + 4 * var(--layout-margin));
    height: auto;
    margin: 0;
  }

  .work-formats__trigger {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto auto;
    column-gap: 0;
    row-gap: var(--space-2);
    align-items: stretch;
    padding-block: clamp(2.6rem, 11.2vw, 3.6rem);
  }

  .work-formats__arrow {
    display: none;
  }

  .work-formats__thumb-slot,
  .work-formats__thumb,
  .work-formats__thumb img {
    display: block;
    width: 100%;
    aspect-ratio: 1;
  }

  .work-formats__thumb-slot {
    grid-column: 2;
    grid-row: 1;
    width: clamp(11rem, 56vw, 14rem);
    justify-self: end;
    overflow: hidden;
    border-radius: var(--radius-surface);
    background: var(--palette-stone);
  }

  .work-formats__thumb {
    height: 100%;
  }

  .work-formats__thumb img {
    height: 100%;
    object-fit: cover;
  }

  .work-formats__copy {
    display: contents;
  }

  .work-formats__name {
    display: contents;
    font-size: calc(var(--type-slogan) * 1.3);
  }

  .work-formats__marker {
    grid-column: 1;
    grid-row: 1;
    align-self: end;
    justify-self: start;
    width: auto;
    height: auto;
    overflow: visible;
    font-size: var(--type-nav);
    line-height: 1.1;
  }

  .work-formats__number {
    width: auto;
    height: auto;
    opacity: 1;
    transform: none;
  }

  .work-formats__name-text {
    grid-column: 1 / -1;
    grid-row: 2;
    margin-top: calc(var(--space-2) * 0.5);
  }

  .work-formats__description {
    grid-column: 1 / -1;
    grid-row: 3;
    max-width: none;
  }

  .work-formats__preview {
    position: absolute;
    top: 0;
    right: 0;
    left: auto;
    width: 62vw;
    max-width: 24rem;
    transform: none !important;
  }

  .work-formats__preview.is-visible {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .work-formats__item,
  .work-formats__number,
  .work-formats__arrow,
  .work-formats__preview {
    transition: none;
  }
}
</style>
