<script setup lang="ts">
/**
 * Home — «Кадо́ — путь цветов.»
 * Grid: empty col 1 & 12 · photo cols 2–6 · text cols 7–11.
 * Body: line-by-line ash→ink fill on scroll (1.5× type).
 */
const BODY_TEXT =
  'Kadoflow переносит этот принцип в цифровую среду: создаёт для каждой задачи собственный визуальный язык и собирает его в работающую систему.'

const section = ref<HTMLElement | null>(null)
const surfaceTarget = ref<HTMLElement | null>(null)
const mediaFocusEl = ref<HTMLElement | null>(null)
const topFocusEl = ref<HTMLElement | null>(null)
const bodyFocusEl = ref<HTMLElement | null>(null)
const bodyEl = ref<HTMLElement | null>(null)

defineExpose({
  section,
  surfaceTarget,
})

useViewportFocusRefs([mediaFocusEl, topFocusEl], {
  blur: 16,
  delay: 0.14,
  duration: 0.75,
  stagger: 0.1,
})

let fillCtx: { revert: () => void } | null = null
let gsapMod: typeof import('gsap').default | null = null
let stMod: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let resizeObserver: ResizeObserver | null = null
let rebuildTimer = 0

/** Measure word tops → wrap each visual line (ash base + ink clip L→R). */
function buildLineFill(host: HTMLElement): HTMLElement[] {
  host.textContent = ''
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
  for (const lineText of lines) {
    const row = document.createElement('span')
    row.className = 'kado-body__line'

    const ash = document.createElement('span')
    ash.className = 'kado-body__ash'
    ash.textContent = lineText

    const ink = document.createElement('span')
    ink.className = 'kado-body__ink'
    ink.setAttribute('aria-hidden', 'true')
    ink.textContent = lineText
    ink.style.clipPath = 'inset(0 100% 0 0)'

    row.append(ash, ink)
    host.appendChild(row)
    inkEls.push(ink)
  }
  return inkEls
}

async function setupLineFill() {
  fillCtx?.revert()
  fillCtx = null

  const host = bodyEl.value
  const trigger = bodyFocusEl.value
  if (!host || !trigger) return

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    host.textContent = BODY_TEXT
    host.style.color = 'var(--palette-ink)'
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
  const ScrollTrigger = stMod

  fillCtx = gsap.context(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger,
        start: 'top 85%',
        end: 'bottom 40%',
        scrub: true,
        // Don't rebuild markers on iOS URL-bar height flicker.
        invalidateOnRefresh: false,
      },
    })
    inks.forEach((ink, i) => {
      tl.fromTo(
        ink,
        { clipPath: 'inset(0px 100% 0px 0px)' },
        { clipPath: 'inset(0px 0% 0px 0px)', ease: 'none', duration: 1 },
        i,
      )
    })
  }, section.value ?? undefined)

  ScrollTrigger.refresh()
}

let lastHostWidth = 0

function scheduleRebuild() {
  if (rebuildTimer) window.clearTimeout(rebuildTimer)
  rebuildTimer = window.setTimeout(() => {
    rebuildTimer = 0
    void setupLineFill()
  }, 120)
}

onMounted(async () => {
  await nextTick()
  await setupLineFill()
  lastHostWidth = bodyFocusEl.value?.clientWidth ?? 0
  // Rebuild only on real width changes — never on iOS URL-bar height flicker
  // (window.resize + height-only RO was hard-stopping scroll in the hero).
  if (bodyFocusEl.value) {
    resizeObserver = new ResizeObserver(() => {
      const w = bodyFocusEl.value?.clientWidth ?? 0
      if (Math.abs(w - lastHostWidth) < 2) return
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
})
</script>

<template>
  <section
    ref="section"
    class="kado relative z-10 w-full"
    :style="{
      paddingInline: 'var(--layout-margin-content)',
      paddingBlock: 'var(--space-section)',
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
      <!-- Empty cols 1 & 12 · photo band cols 2–6 (image centered) · text 7–11 -->
      <div class="relative col-span-12 flex justify-center md:col-span-5 md:col-start-2">
        <div class="relative w-fit max-w-full">
          <div
            ref="surfaceTarget"
            class="pointer-events-none absolute left-1/2 top-[10%] -z-10 -translate-x-1/2"
            aria-hidden="true"
            :style="{
              width: 'var(--layout-span-4)',
              height: '80%',
            }"
          />
          <img
            ref="mediaFocusEl"
            src="/home/rock.png"
            alt="Камень"
            class="kado-focus relative z-10 mx-auto h-auto max-h-[70vh] w-auto max-w-full object-contain"
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
              rowGap: '12px',
            }"
          >
            <h2 class="kado-title col-span-6">
              Кадо́ — путь цветов.
            </h2>
            <p class="kado-phonetic col-span-6">
              [/ ka-dō]
            </p>
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
            >
              {{ BODY_TEXT }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.kado-focus {
  will-change: filter, opacity;
  transform: translateZ(0);
}

.kado-title {
  font-size: var(--type-slogan);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.kado-phonetic {
  font-size: var(--type-nav);
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.3;
  opacity: 0.72;
}

.kado-deck {
  font-size: var(--type-lead);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.35;
}

.kado-body {
  font-size: calc(var(--type-slogan) * 1.5);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.kado-body :deep(.kado-body__line) {
  position: relative;
  display: block;
}

.kado-body :deep(.kado-body__ash) {
  color: var(--palette-ash);
}

.kado-body :deep(.kado-body__ink) {
  position: absolute;
  inset: 0;
  color: var(--palette-ink);
  clip-path: inset(0 100% 0 0);
  pointer-events: none;
}
</style>
