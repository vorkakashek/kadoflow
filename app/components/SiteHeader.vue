<script setup lang="ts">
import { isMobileChromeHeightOnlyResize } from '~/utils/mobileViewport'
import { headerLinks } from '~/utils/siteNav'

const { open: canvasOpen, surfaceOn: canvasSurface, toggleCanvas } = usePageCanvas()
const links = headerLinks

const scrolled = ref(false)
const shellEl = ref<HTMLElement | null>(null)
const barEl = ref<HTMLElement | null>(null)
const fabEl = ref<HTMLElement | null>(null)
const logoEl = ref<HTMLElement | null>(null)
const navEl = ref<HTMLElement | null>(null)
const menuBtnEl = ref<HTMLElement | null>(null)
/** Extra px so FAB sits above the visual viewport bottom (= same edge gap as `right`). */
const fabBottomExtra = ref(0)
const introPending = ref(true)

/** Page canvas pins body (scrollY→0) — ignore that fake scroll for collapse morph. */
function canvasLocksScroll() {
  return (
    canvasSurface.value
    || canvasOpen.value
    || document.documentElement.classList.contains('page-canvas-lock')
  )
}

/** Wait before collapse so a tiny nudge doesn’t snap the bar */
const COLLAPSE_DELAY_MS = 220
const ANIM_DURATION = 0.44
/** Below this, skip scroll collapse (no 1-col side gutters, keep full vertical inset). */
const COLLAPSE_MIN_WIDTH = 768
/** Nav underline: draw full wavy line, then straighten. Leave wipe stays. (−20% vs first timings.) */
const NAV_DRAW_S = 0.44
const NAV_FLAT_S = 0.224
const NAV_LEAVE_AMP_S = 0.144
const NAV_LEAVE_WIPE_S = 0.24
const NAV_LEAVE_WIPE_DELAY = 0.048
const NAV_WAVE_AMP = 3.4
const NAV_WAVE_VB_W = 64
let collapseTimer = 0
let gsapMod: typeof import('gsap').default | null = null
const navWaveTls = new WeakMap<Element, { kill: () => void }>()
/** Last wave amp per link — leave must resume from here, not snap to 0. */
const navWaveAmp = new WeakMap<Element, number>()

async function gsap() {
  if (!gsapMod) gsapMod = (await import('gsap')).default
  return gsapMod
}

function wavePathD(amp: number) {
  const a = Math.max(0, amp)
  // Fewer, longer waves — not a tight ripple.
  return `M1 4 Q 12 ${4 - a} 23 4 Q 34 ${4 + a} 45 4 Q 54 ${4 - a * 0.65} 63 4`
}

function applyWaveAmp(root: Element, path: SVGPathElement, amp: number) {
  navWaveAmp.set(root, amp)
  path.setAttribute('d', wavePathD(amp))
}

function navWaveParts(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return null
  const path = el.querySelector('.nav-link__wave-path') as SVGPathElement | null
  const reveal = el.querySelector('.nav-link__reveal') as SVGRectElement | null
  if (!path || !reveal) return null
  return { path, reveal, root: el }
}

async function onNavEnter(e: Event) {
  const parts = navWaveParts(e.currentTarget)
  if (!parts) return
  const { path, reveal, root } = parts
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyWaveAmp(root, path, 0)
    reveal.setAttribute('x', '0')
    reveal.setAttribute('width', String(NAV_WAVE_VB_W))
    return
  }
  const g = await gsap()
  navWaveTls.get(root)?.kill()

  const morph = { amp: NAV_WAVE_AMP }
  applyWaveAmp(root, path, NAV_WAVE_AMP)
  g.set(reveal, { attr: { x: 0, width: 0 } })

  const tl = g.timeline()
  navWaveTls.set(root, tl)

  // 1) Draw the full wavy line L→R.
  tl.to(reveal, {
    attr: { width: NAV_WAVE_VB_W },
    duration: NAV_DRAW_S,
    ease: 'none',
  })
  // 2) Only after it's fully drawn — settle waves into a straight line.
  tl.to(morph, {
    amp: 0,
    duration: NAV_FLAT_S,
    ease: 'power2.out',
    onUpdate: () => {
      applyWaveAmp(root, path, morph.amp)
    },
  })
}

async function onNavLeave(e: Event) {
  const parts = navWaveParts(e.currentTarget)
  if (!parts) return
  const { path, reveal, root } = parts
  const g = await gsap()
  navWaveTls.get(root)?.kill()

  // Resume from current amp (interrupted draw/flatten) — no snap to straight.
  const fromAmp = navWaveAmp.get(root) ?? 0
  const morph = { amp: fromAmp }
  const ampNeed = Math.max(0, NAV_WAVE_AMP - fromAmp) / NAV_WAVE_AMP
  const ampDur = NAV_LEAVE_AMP_S * ampNeed
  const wipeAt = ampDur > 0 ? NAV_LEAVE_WIPE_DELAY : 0

  const tl = g.timeline()
  navWaveTls.set(root, tl)

  // Straight → wave (or already wavy), then wipe exits to the right.
  if (ampDur > 0) {
    tl.to(
      morph,
      {
        amp: NAV_WAVE_AMP,
        duration: ampDur,
        ease: 'power1.out',
        onUpdate: () => {
          applyWaveAmp(root, path, morph.amp)
        },
      },
      0,
    )
  } else {
    applyWaveAmp(root, path, NAV_WAVE_AMP)
  }
  tl.to(
    reveal,
    {
      attr: { x: NAV_WAVE_VB_W, width: 0 },
      duration: NAV_LEAVE_WIPE_S,
      ease: 'power1.in',
      onComplete: () => {
        applyWaveAmp(root, path, 0)
      },
    },
    wipeAt,
  )
}

function canCollapseHeader() {
  return window.matchMedia(`(min-width: ${COLLAPSE_MIN_WIDTH}px)`).matches
}

/** Resolve a CSS size token to used px (clamp/min/var all work). */
function measureTokenWidth(cssWidth: string): number {
  const probe = document.createElement('div')
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;width:${cssWidth}`
  document.body.appendChild(probe)
  const w = probe.getBoundingClientRect().width
  probe.remove()
  return w
}

/**
 * Expanded: full shell, no side pad (logo at col 1), full header-inset.
 * Collapsed (md+): content band + side pad = empty cols 1 & 12; tighter vertical inset.
 * Mobile stays expanded — no 1-col edge gutters and no vertical inset shrink.
 */
function layoutMetrics() {
  const shell = shellEl.value
  const expanded = shell?.clientWidth ?? 0
  const contentBand = measureTokenWidth('var(--layout-content)')
  const collapsed = Math.min(expanded, contentBand > 0 ? contentBand : expanded)
  const gutter = measureTokenWidth('var(--layout-gutter)')
  const margin = measureTokenWidth('var(--layout-margin)')
  const inset = measureTokenWidth('var(--layout-header-inset)') || margin
  const headerContent = measureTokenWidth('var(--layout-header-content)') || 32
  const collapse = scrolled.value && canCollapseHeader()
  /** Offset to column 2 on a 12-col track of width `collapsed` */
  const sidePad = collapse ? (collapsed + gutter) / 12 : 0
  /** Mobile: tighten vertical logo insets ~15%. */
  const mobile = !canCollapseHeader()
  const insetY = mobile ? inset * 0.85 : inset
  const logoH = mobile ? headerContent * 0.8 : headerContent

  return {
    expanded,
    collapsed,
    collapseSides: collapse,
    sidePad,
    height: collapse
      ? inset * 0.5 + headerContent + inset
      : insetY * 2 + logoH,
    paddingTop: collapse ? inset * 0.5 : insetY,
    paddingBottom: collapse ? inset : insetY,
  }
}

function applyBox(
  bar: HTMLElement,
  width: number,
  height: number,
  paddingTop: number,
  paddingBottom: number,
  sidePad: number,
) {
  bar.style.width = `${width}px`
  bar.style.maxWidth = '100%'
  bar.style.height = `${height}px`
  bar.style.paddingTop = `${paddingTop}px`
  bar.style.paddingBottom = `${paddingBottom}px`
  bar.style.paddingLeft = `${sidePad}px`
  bar.style.paddingRight = `${sidePad}px`
}

async function morph(animate: boolean) {
  const bar = barEl.value
  if (!bar) return

  const m = layoutMetrics()
  if (m.expanded < 1) return

  const width = m.collapseSides ? m.collapsed : m.expanded

  if (!animate) {
    if (gsapMod) gsapMod.killTweensOf(bar)
    applyBox(bar, width, m.height, m.paddingTop, m.paddingBottom, m.sidePad)
    return
  }

  const g = await gsap()
  g.to(bar, {
    width,
    height: m.height,
    paddingTop: m.paddingTop,
    paddingBottom: m.paddingBottom,
    paddingLeft: m.sidePad,
    paddingRight: m.sidePad,
    duration: ANIM_DURATION,
    ease: 'power2.inOut',
    overwrite: 'auto',
  })
}

function onScroll() {
  if (canvasLocksScroll()) return

  const past = window.scrollY > 8

  if (!past) {
    if (collapseTimer) {
      window.clearTimeout(collapseTimer)
      collapseTimer = 0
    }
    if (scrolled.value) {
      scrolled.value = false
      void morph(true)
    }
    return
  }

  if (scrolled.value || collapseTimer) return

  collapseTimer = window.setTimeout(() => {
    collapseTimer = 0
    if (canvasLocksScroll()) return
    if (window.scrollY > 8) {
      scrolled.value = true
      void morph(true)
    }
  }, COLLAPSE_DELAY_MS)
}

function onResize() {
  if (isMobileChromeHeightOnlyResize()) return
  void morph(false)
}

/**
 * Keep the FAB’s visible bottom inset equal to the right inset.
 * iOS/Android chrome show/hide changes visualViewport vs layout viewport —
 * plain `bottom: …` then drifts while `right` stays correct.
 */
function syncFabViewport() {
  const vv = window.visualViewport
  if (!vv) {
    fabBottomExtra.value = 0
    return
  }
  fabBottomExtra.value = Math.max(
    0,
    window.innerHeight - vv.offsetTop - vv.height,
  )
}

onMounted(() => {
  void morph(false)
  onScroll()
  syncFabViewport()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize, { passive: true })
  window.visualViewport?.addEventListener('resize', syncFabViewport)
  window.visualViewport?.addEventListener('scroll', syncFabViewport)

  const preload = useBrandPreload()
  introPending.value = !preload.revealed.value

  watch(
    () => preload.revealed.value,
    async (on) => {
      if (!on) return
      const g = await gsap()

      const domOf = (v: unknown): HTMLElement | null => {
        if (!v) return null
        if (v instanceof HTMLElement) return v
        const el = (v as { $el?: unknown }).$el
        return el instanceof HTMLElement ? el : null
      }

      const logo = domOf(logoEl.value)
      const menuBtn = domOf(menuBtnEl.value)
      const fab = domOf(fabEl.value)
      const navLinks = navEl.value
        ? Array.from(navEl.value.querySelectorAll('.nav-link'))
        : []

      if (logo) g.set(logo, { autoAlpha: 0, y: -12 })
      if (navLinks.length) g.set(navLinks, { autoAlpha: 0, y: -10 })
      if (menuBtn) g.set(menuBtn, { autoAlpha: 0, y: -10 })
      if (fab) g.set(fab, { autoAlpha: 0, y: 16 })
      if (shellEl.value) g.set(shellEl.value, { autoAlpha: 1 })

      introPending.value = false
      await nextTick()

      const tl = g.timeline({ defaults: { ease: 'power3.out' } })
      // Stagger after iris — logo → links → menu / FAB.
      if (logo) tl.to(logo, { autoAlpha: 1, y: 0, duration: 0.65 }, 0.35)
      if (navLinks.length) {
        tl.to(
          navLinks,
          { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.1 },
          0.55,
        )
      }
      if (menuBtn) tl.to(menuBtn, { autoAlpha: 1, y: 0, duration: 0.6 }, 0.95)
      if (fab) tl.to(fab, { autoAlpha: 1, y: 0, duration: 0.65 }, 0.7)
    },
    { immediate: true },
  )
})

onUnmounted(() => {
  if (collapseTimer) window.clearTimeout(collapseTimer)
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
  window.visualViewport?.removeEventListener('resize', syncFabViewport)
  window.visualViewport?.removeEventListener('scroll', syncFabViewport)
  if (barEl.value && gsapMod) gsapMod.killTweensOf(barEl.value)
})
</script>

<template>
  <header
    class="pointer-events-none fixed inset-x-0 top-0 z-[100] site-header"
    :class="{ 'site-header--canvas': canvasSurface }"
    :aria-hidden="canvasSurface ? 'true' : undefined"
  >
    <!--
      GSAP tweens width + side + vertical inset together (md+ only).
      Mobile: logo centered; menu is a bottom-right FAB (thumb zone).
    -->
    <div
      ref="shellEl"
      class="w-full"
      :class="{ 'header-intro-hide': introPending }"
      :style="{ paddingInline: 'var(--layout-margin)' }"
    >
      <div
        ref="barEl"
        class="header-bar pointer-events-auto mx-auto grid max-w-full items-center"
        :class="{ 'header-bar--scrolled': scrolled }"
        :style="{
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          columnGap: 'var(--layout-gutter)',
        }"
      >
        <NuxtLink
          ref="logoEl"
          to="/"
          class="header-logo-link col-span-12 justify-self-center md:col-span-3 md:col-start-1 md:justify-self-start"
          aria-label="Kadoflow — на главную"
          :tabindex="canvasSurface ? -1 : 0"
        >
          <img
            src="/brand/logo-ru-mini.svg"
            alt="Kadoflow"
            class="header-logo"
            width="206"
            height="40"
            decoding="sync"
            fetchpriority="high"
          >
        </NuxtLink>

        <nav
          ref="navEl"
          class="header-nav header-chip site-nav col-span-5 col-start-6 hidden w-fit items-center justify-self-start md:flex md:col-span-3 md:col-start-8 gap-x-[-1.5rem]"
          :class="{ 'header-chip--scrolled': scrolled }"
          aria-label="Основная"
        >
          <NuxtLink
            v-for="(link, index) in links"
            :key="link.to"
            :to="link.to"
            class="nav-link text-ink"
            @pointerenter="onNavEnter"
            @pointerleave="onNavLeave"
            @focusin="onNavEnter"
            @focusout="onNavLeave"
          >
            <span class="nav-link__text">
              <span class="nav-link__label">{{ link.label }}</span>
              <svg
                class="nav-link__wave"
                viewBox="0 0 64 8"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <clipPath
                    :id="`nav-wave-clip-${index}`"
                    clipPathUnits="userSpaceOnUse"
                  >
                    <rect
                      class="nav-link__reveal"
                      x="0"
                      y="0"
                      width="0"
                      height="8"
                    />
                  </clipPath>
                </defs>
                <path
                  class="nav-link__wave-path"
                  :clip-path="`url(#nav-wave-clip-${index})`"
                  d="M1 4 Q 12 0.8 23 4 Q 34 7.2 45 4 Q 54 1.8 63 4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.35"
                  stroke-linecap="butt"
                />
              </svg>
            </span>
            <span v-if="index < links.length - 1" class="nav-link__comma">,</span>
          </NuxtLink>
        </nav>

        <button
          ref="menuBtnEl"
          type="button"
          class="menu-btn header-chip site-nav col-span-1 col-start-12 hidden items-center justify-end gap-2 justify-self-end text-ink md:flex"
          :class="{ 'header-chip--scrolled': scrolled }"
          :aria-expanded="canvasOpen"
          :aria-label="canvasOpen ? 'Закрыть меню' : 'Открыть меню'"
          @click="toggleCanvas"
        >
          <span class="menu-btn-label">меню</span>
          <span class="menu-dots" aria-hidden="true">
            <span class="menu-dot" />
            <span class="menu-dot" />
          </span>
        </button>
      </div>
    </div>
  </header>

  <!-- Mobile thumb-zone menu — pinned to visual viewport bottom (matches right inset). -->
  <button
    ref="fabEl"
    type="button"
    class="menu-fab menu-btn header-chip site-nav pointer-events-auto fixed z-[100] flex items-center gap-2 text-ink md:hidden"
    :class="{
      'header-chip--scrolled': scrolled,
      'header-intro-hide': introPending,
      'site-header--canvas': canvasSurface,
    }"
    :aria-hidden="canvasSurface ? 'true' : undefined"
    :tabindex="canvasSurface ? -1 : 0"
    :style="{
      bottom: `calc(${fabBottomExtra}px + 2 * var(--layout-margin) + var(--safe-bottom))`,
    }"
    :aria-expanded="canvasOpen"
    :aria-label="canvasOpen ? 'Закрыть меню' : 'Открыть меню'"
    @click="toggleCanvas"
  >
    <span class="menu-fab-label">меню</span>
    <span class="menu-dots" aria-hidden="true">
      <span class="menu-dot" />
      <span class="menu-dot" />
    </span>
  </button>
</template>

<style scoped>
.header-intro-hide {
  opacity: 0;
  visibility: hidden;
}

.site-header {
  transition: opacity 0.32s var(--motion-ease, ease), visibility 0.32s;
}

/* Page Canvas brings its own chrome — hide site header while the surface is up. */
.site-header--canvas {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.menu-fab {
  transition: opacity 0.32s var(--motion-ease, ease), visibility 0.32s;
}

.menu-fab.site-header--canvas {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.header-bar {
  box-sizing: border-box;
}

.header-logo-link {
  min-width: max-content;
  cursor: pointer;
}

.header-logo {
  display: block;
  width: auto;
  height: var(--layout-header-content);
  /* Beat global `img { max-width: 100% }` so the mark doesn’t shrink in a grid col */
  max-width: none;
}

@media (max-width: 767px) {
  .header-logo {
    height: calc(var(--layout-header-content) * 0.8);
  }
}

.header-chip {
  /* 8dp chrome: 8 / 12 */
  padding: 8px 12px;
  margin: -8px -12px;
  border-radius: 8px;
  background-color: transparent;
  transition: background-color var(--motion-base) var(--motion-ease);
}

/* Nav group shares one pill surface (not per-link chips). */
.site-nav.header-chip:not(.menu-btn) {
  border-radius: 9999px;
}

.header-chip--scrolled {
  background-color: color-mix(in srgb, var(--palette-sand) 72%, transparent);
}

/* backdrop-filter is a scroll-compositor tax on mobile Chrome too — solid only. */
@media (max-width: 767px) {
  .header-chip--scrolled {
    background-color: color-mix(in srgb, var(--palette-sand) 88%, transparent);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}

@supports not (-webkit-touch-callout: none) {
  @media (min-width: 768px) {
    .header-chip {
      backdrop-filter: blur(0);
      -webkit-backdrop-filter: blur(0);
      transition:
        background-color var(--motion-base) var(--motion-ease),
        backdrop-filter var(--motion-base) var(--motion-ease),
        -webkit-backdrop-filter var(--motion-base) var(--motion-ease);
    }

    .header-chip--scrolled {
      background-color: color-mix(in srgb, var(--palette-sand) 55%, transparent);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
  }
}

.menu-btn {
  cursor: pointer;
  border-radius: 9999px;
  /* ~1.5× chip horizontal padding (2× then −25%) */
  padding-inline: 18px;
  margin-inline: -18px;
}

.menu-btn:hover,
.menu-btn:focus-visible {
  background-color: color-mix(in srgb, var(--palette-stone) 78%, var(--palette-sand));
}

.menu-btn:active {
  background-color: var(--palette-stone);
}

.menu-btn:hover.header-chip--scrolled,
.menu-btn:focus-visible.header-chip--scrolled {
  background-color: color-mix(in srgb, var(--palette-stone) 70%, var(--palette-sand));
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.menu-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transform-origin: center center;
  transition: transform var(--motion-base) var(--motion-ease);
  will-change: transform;
}

.menu-dot {
  display: block;
  width: 4px;
  height: 4px;
  border-radius: 9999px;
  background: currentColor;
}

.menu-btn:hover .menu-dots,
.menu-btn:focus-visible .menu-dots,
.menu-btn:active .menu-dots,
.menu-btn[aria-expanded='true'] .menu-dots {
  transform: rotate(90deg);
}

.menu-fab {
  /* Thumb zone: 2× layout margin (margin itself is tight on mobile). */
  right: calc(2 * var(--layout-margin) + var(--safe-right));
  /* `bottom` set inline from visualViewport so chrome hide/show keeps the same edge gap as `right`. */
  margin: 0;
  /* Always visible underlay + pill radius (near-circular ends). */
  border-radius: 9999px;
  padding: 10px 24px;
  background-color: color-mix(in srgb, var(--palette-sand) 72%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.menu-fab.header-chip--scrolled {
  background-color: color-mix(in srgb, var(--palette-sand) 80%, transparent);
  /* Keep blur — global mobile .header-chip--scrolled turns it off. */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.menu-fab:hover,
.menu-fab:focus-visible {
  background-color: color-mix(in srgb, var(--palette-stone) 82%, var(--palette-sand));
}

.menu-fab:active {
  background-color: var(--palette-stone);
}

.menu-btn-label,
.menu-fab-label {
  /* Optical vertical center — raw metrics sit a hair low. */
  transform: translateY(-2px);
}

.site-nav {
  /* Between nav and lead — lead was too large for the chip row */
  font-size: calc((var(--type-nav) + var(--type-lead)) * 0.5);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.nav-link {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  cursor: pointer;
  text-decoration: none;
  gap: 0;
  /* Side padding matches menu; rounding lives on the nav chip group. */
  padding: 8px 18px;
  margin: -8px -4px;
  border-radius: 0;
  background: transparent;
}

.nav-link__text {
  position: relative;
  display: inline-block;
  padding-bottom: 0.28em;
}

.nav-link__comma {
  margin-left: 0.02em;
}

.nav-link__wave {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 0.48em;
  overflow: hidden;
  pointer-events: none;
  color: var(--palette-ink);
}

.nav-link__wave-path {
  fill: none;
}

@media (prefers-reduced-motion: reduce) {
  .menu-dots {
    transition: none;
  }

  .menu-btn:hover .menu-dots,
  .menu-btn:focus-visible .menu-dots,
  .menu-btn:active .menu-dots {
    transform: none;
  }
}
</style>
