<script setup lang="ts">
/**
 * Home — «Кадо́ — путь цветов.»
 * Grid: empty col 1 & 12 · photo cols 2–6 · text cols 7–11.
 * Body: line-by-line ash→ink fill on scroll (1.5× type).
 * Mobile surface waypoints: stone → term → Kadoflow word → center square
 * (square hop starts when Kadoflow hits top 20%).
 */
const BRAND = 'Kadoflow'
const BODY_TEXT =
  'Kadoflow переносит этот принцип в цифровую среду: создаёт для каждой задачи собственный визуальный язык и собирает его в работающую систему.'
/** Scroll lag for the whole fill timeline. */
const FILL_SCRUB = 1.1
/** Gap between line starts (= line duration so N+1 waits until N finishes). */
const FILL_LINE_STAGGER = 1

const section = ref<HTMLElement | null>(null)
/** Stone morph target (desktop end + mobile waypoint 1). */
const surfaceTarget = ref<HTMLElement | null>(null)
/** Rock image — scroll marker «top 10%». */
const stoneEl = ref<HTMLElement | null>(null)
/** Title + phonetic block — mobile waypoint after stone. */
const termTarget = ref<HTMLElement | null>(null)
/** First word “Kadoflow” — mobile waypoint with pad (set after line-fill build). */
const kadoflowWord = ref<HTMLElement | null>(null)
const topFocusEl = ref<HTMLElement | null>(null)
const bodyFocusEl = ref<HTMLElement | null>(null)
const bodyEl = ref<HTMLElement | null>(null)

const { canvasMotionPaused, open: pageCanvasOpen, busy: pageCanvasBusy, surfaceOn, heroGlRevealBusy } = usePageCanvas()

defineExpose({
  section,
  surfaceTarget,
  stoneEl,
  termTarget,
  kadoflowWord,
  bodyFocusEl,
})

useViewportFocusRefs([stoneEl, topFocusEl], {
  blur: 16,
  delay: 0.14,
  duration: 0.75,
  stagger: 0.1,
})

let fillCtx: { revert: () => void } | null = null
let levitateCtx: { revert: () => void } | null = null
let gsapMod: typeof import('gsap').default | null = null
let stMod: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let resizeObserver: ResizeObserver | null = null
let rebuildTimer = 0

/** Measure word tops → wrap each visual line (ash base + ink clip L→R). */
function buildLineFill(host: HTMLElement): HTMLElement[] {
  host.textContent = ''
  // Keep previous word el until the new brand node exists — nulling it rebuilt the
  // whole Flow Surface corridor and could hide hero on first paint.
  const measure = document.createElement('span')
  measure.style.whiteSpace = 'normal'
  host.appendChild(measure)

  const parts = BODY_TEXT.split(/(\s+)/).filter((p) => p.length)
  const wordSpans: HTMLSpanElement[] = []
  for (const part of parts) {
    const span = document.createElement('span')
    span.textContent = part
    measure.appendChild(span)
    wordSpans.push(span)
  }

  const lines: string[] = []
  let buf = ''
  let lineTop = Number.NaN
  for (const span of wordSpans) {
    const top = span.offsetTop
    if (!Number.isNaN(lineTop) && Math.abs(top - lineTop) > 1) {
      lines.push(buf)
      buf = ''
    }
    lineTop = top
    buf += span.textContent ?? ''
  }
  if (buf) lines.push(buf)

  host.textContent = ''
  const inkEls: HTMLElement[] = []
  for (let i = 0; i < lines.length; i++) {
    let lineText = lines[i]!
    const row = document.createElement('span')
    row.className = 'kado-body__line'

    if (i === 0 && lineText.startsWith(BRAND)) {
      const wrap = document.createElement('span')
      wrap.className = 'kado-brand'
      const pin = document.createElement('span')
      pin.className = 'kado-surface-pin kado-surface-pin--pad'
      pin.setAttribute('data-flow-pin', 'word')
      pin.setAttribute('aria-hidden', 'true')
      const label = document.createElement('span')
      label.className = 'kado-brand__text'
      label.textContent = BRAND
      wrap.append(pin, label)
      row.appendChild(wrap)
      kadoflowWord.value = wrap
      lineText = lineText.slice(BRAND.length).replace(/^\s+/, '')
      // Explicit space node — leading space inside the next span can collapse.
      if (lineText.length) row.appendChild(document.createTextNode(' '))
    }

    if (lineText.length) {
      const run = document.createElement('span')
      run.className = 'kado-body__run'

      const ash = document.createElement('span')
      ash.className = 'kado-body__ash'
      ash.textContent = lineText

      const ink = document.createElement('span')
      ink.className = 'kado-body__ink'
      ink.setAttribute('aria-hidden', 'true')
      ink.textContent = lineText
      ink.style.clipPath = 'inset(0 100% 0 0)'

      run.append(ash, ink)
      row.appendChild(run)
      inkEls.push(ink)
    }

    host.appendChild(row)
  }
  return inkEls
}

/** Ignore scrollbar / chrome jitter — only real column reflow should rebuild lines. */
const MIN_REBUILD_WIDTH_DELTA = 48

function hostFillIntact() {
  const host = bodyEl.value
  return !!host?.querySelector('.kado-body__ink')
}

async function setupLineFill(force = false) {
  if (!force && canvasMotionPaused()) return
  if (!force && fillCtx && hostFillIntact()) {
    try {
      stMod?.update()
    } catch {
      /* ignore */
    }
    return
  }

  fillCtx?.revert()
  fillCtx = null

  const host = bodyEl.value
  const trigger = bodyFocusEl.value
  if (!host || !trigger) return

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    host.textContent = BODY_TEXT
    host.style.color = 'var(--palette-ink)'
    kadoflowWord.value = null
    return
  }

  const inks = buildLineFill(host)
  if (!inks.length) return

  if (!gsapMod || !stMod) {
    gsapMod = (await import('gsap')).default
    const st = await import('gsap/ScrollTrigger')
    stMod = st.ScrollTrigger
    gsapMod.registerPlugin(stMod)
  }
  const gsap = gsapMod

  fillCtx = gsap.context(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger,
        start: 'top 85%',
        end: 'bottom 40%',
        scrub: FILL_SCRUB,
        invalidateOnRefresh: false,
      },
    })
    inks.forEach((ink, i) => {
      tl.fromTo(
        ink,
        { clipPath: 'inset(0px 100% 0px 0px)' },
        { clipPath: 'inset(0px 0% 0px 0px)', ease: 'none', duration: 1 },
        i * FILL_LINE_STAGGER,
      )
    })
  }, section.value ?? undefined)

  try {
    stMod?.update()
  } catch {
    /* ignore */
  }
}

let lastHostWidth = 0
let fillMountedAt = 0

function scheduleRebuild() {
  if (canvasMotionPaused()) return
  // Skip RO rebuilds during the first quiet second after SPA mount.
  if (fillMountedAt && performance.now() - fillMountedAt < 1200) return
  if (rebuildTimer) window.clearTimeout(rebuildTimer)
  rebuildTimer = window.setTimeout(() => {
    rebuildTimer = 0
    void setupLineFill(true)
  }, 120)
}

/** Home often mounts under the menu overlay during a hop — build after unlock. */
async function waitHeroGlReveal(maxMs = 2400) {
  const deadline = performance.now() + maxMs
  while (heroGlRevealBusy.value && performance.now() < deadline) {
    await new Promise<void>((r) => {
      requestAnimationFrame(() => r())
    })
  }
}

async function ensureLineFill() {
  if (hostFillIntact()) return
  await waitHeroGlReveal()
  if (canvasMotionPaused()) return
  await setupLineFill(true)
}

async function setupStoneLevitation() {
  levitateCtx?.revert()
  levitateCtx = null

  if (typeof window === 'undefined') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const el = stoneEl.value
  if (!el) return

  const gsap = (await import('gsap')).default

  levitateCtx = gsap.context(() => {
    // Multi-harmonic buoyancy: each axis has its own phase & coprime period
    // with smooth sine.inOut easing for physical, weightless floating.

    // 1. Vertical float (main breathing bob)
    gsap.fromTo(
      el,
      { y: 8 },
      {
        y: -14,
        duration: 3.4,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      },
    )

    // 2. Horizontal drift (smooth lateral sway)
    gsap.fromTo(
      el,
      { x: -7 },
      {
        x: 8,
        duration: 4.7,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      },
    )

    // 3. Subtle 2D roll / tilt around center of gravity
    gsap.fromTo(
      el,
      { rotation: -1.6 },
      {
        rotation: 2.2,
        duration: 5.3,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      },
    )

    // 4. Subtle 3D pitch (tilt front/back)
    gsap.fromTo(
      el,
      { rotationX: -2.5 },
      {
        rotationX: 3.2,
        duration: 4.1,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      },
    )

    // 5. Subtle 3D yaw (gentle turn towards camera light)
    gsap.fromTo(
      el,
      { rotationY: -3 },
      {
        rotationY: 3.5,
        duration: 5.9,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      },
    )
  }, el)
}

watch(
  () => pageCanvasOpen.value || pageCanvasBusy.value || surfaceOn.value,
  async (active) => {
    if (active) return
    await nextTick()
    requestAnimationFrame(() => {
      void ensureLineFill()
      void setupStoneLevitation()
    })
  },
)

onMounted(async () => {
  fillMountedAt = performance.now()
  await nextTick()
  await ensureLineFill()
  void setupStoneLevitation()
  lastHostWidth = bodyFocusEl.value?.clientWidth ?? 0
  if (bodyFocusEl.value) {
    resizeObserver = new ResizeObserver(() => {
      const w = bodyFocusEl.value?.clientWidth ?? 0
      if (Math.abs(w - lastHostWidth) < MIN_REBUILD_WIDTH_DELTA) return
      lastHostWidth = w
      scheduleRebuild()
    })
    resizeObserver.observe(bodyFocusEl.value)
  }
})

onUnmounted(() => {
  if (rebuildTimer) window.clearTimeout(rebuildTimer)
  resizeObserver?.disconnect()
  fillCtx?.revert()
  levitateCtx?.revert()
  levitateCtx = null
})
</script>

<template>
  <section
    ref="section"
    class="kado pointer-events-auto relative z-10 w-full"
    :style="{
      paddingInline: 'var(--layout-margin-content)',
      paddingTop: 'var(--space-section)',
      paddingBottom: 'calc(var(--kado-bottom-space, var(--space-block)) * 2)',
    }"
  >
    <div
      class="relative mx-auto grid w-full"
      :style="{
        maxWidth: 'var(--layout-content-max)',
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
        columnGap: 'var(--layout-gutter)',
        rowGap: 'var(--space-block)',
      }"
    >
      <div class="relative col-span-12 flex justify-center md:col-span-5 md:col-start-2">
        <div class="kado-stone-wrap relative w-fit max-w-full">
          <div
            ref="surfaceTarget"
            class="kado-surface-target pointer-events-none absolute left-1/2 top-[10%] -z-10 -translate-x-1/2"
            aria-hidden="true"
          />
          <img
            ref="stoneEl"
            src="/home/rock.webp"
            alt="Камень"
            class="kado-focus kado-stone relative z-10 mx-auto h-auto max-h-[70vh] w-auto max-w-full object-contain"
            width="854"
            height="1634"
            loading="lazy"
            decoding="async"
          >
        </div>
      </div>

      <div class="relative col-span-12 md:col-span-5 md:col-start-7 md:self-stretch">
        <div
          class="kado-copy flex flex-col gap-[var(--space-block)] md:absolute md:inset-x-0 md:top-[10%] md:h-[80%] md:gap-0"
        >
          <div
            ref="topFocusEl"
            class="kado-focus grid w-full text-forest"
            :style="{
              gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
              columnGap: 'var(--layout-gutter)',
            }"
          >
            <div
              ref="termTarget"
              class="kado-term col-span-6"
            >
              <div
                class="kado-surface-pin"
                data-flow-pin="term"
                aria-hidden="true"
              />
              <h2 class="kado-title">
                Кадо́ — путь цветов.
              </h2>
              <p class="kado-phonetic">
                [/ ka-dō]
              </p>
            </div>
            <p class="kado-deck col-span-6 md:col-span-4 md:col-start-2">
              Японское искусство композиции, где свобода природной формы обретает точный порядок.
            </p>
          </div>

          <div
            ref="bodyFocusEl"
            class="kado-body-wrap mt-auto w-full"
          >
            <p
              ref="bodyEl"
              class="kado-body relative w-full"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
@media (max-width: 767.98px) {
  .kado {
    --kado-bottom-space: calc(var(--space-block) * 2);
  }
}

.kado-surface-target {
  /* Mobile: +4 cols vs desktop rest pose (4 → 8). */
  width: var(--layout-span-8);
  height: 80%;
}

@media (min-width: 768px) {
  .kado-surface-target {
    width: var(--layout-span-4);
  }
}

.kado-stone-wrap {
  perspective: 1200px;
}

.kado-stone {
  transform-origin: 50% 62%;
  will-change: transform, filter, opacity;
}

.kado-focus {
  will-change: filter, opacity;
}

.kado-term {
  position: relative;
  display: flex;
  flex-direction: column;
  /* Mobile: half the previous 12px title↔phonetic gap. */
  row-gap: 6px;
  overflow: visible;
}

.kado-surface-pin {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.kado-surface-pin--pad {
  inset: calc(-1 * var(--layout-margin));
}

.kado-title,
.kado-phonetic {
  position: relative;
  z-index: 1;
}

@media (min-width: 768px) {
  .kado-term {
    row-gap: 12px;
  }
}

.kado-title {
  font-size: var(--type-slogan);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.kado-phonetic {
  font-size: var(--type-nav);
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 1.3;
  opacity: 0.72;
}

.kado-deck {
  margin-top: 12px;
  font-size: var(--type-lead);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.35;
}

.kado-body-wrap {
  overflow: visible;
}

.kado-body {
  font-size: calc(var(--type-slogan) * 1.5);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.25;
  overflow: visible;
}

@media (min-width: 768px) {
  .kado-body {
    font-size: var(--type-slogan);
  }
}

.kado-body :deep(.kado-body__line) {
  position: relative;
  display: block;
}

.kado-body :deep(.kado-body__run) {
  position: relative;
  display: inline-block;
}

.kado-body :deep(.kado-body__ash) {
  /* Lighter than ash so ink fill reads clearly on sand */
  color: color-mix(in srgb, var(--palette-ash) 32%, var(--palette-sand));
}

.kado-body :deep(.kado-body__ink) {
  position: absolute;
  inset: 0;
  color: var(--palette-ink);
  clip-path: inset(0 100% 0 0);
  pointer-events: none;
}

.kado-body :deep(.kado-brand) {
  position: relative;
  display: inline-block;
  color: var(--palette-ink);
}

.kado-body :deep(.kado-brand__text) {
  position: relative;
  z-index: 1;
}
</style>
