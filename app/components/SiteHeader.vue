<script setup lang="ts">
import { isMobileChromeHeightOnlyResize } from '~/utils/mobileViewport'

const links = [
  { label: 'кейсы', href: '#cases' },
  { label: 'услуги', href: '#services' },
  { label: 'контакт', href: '#contact' },
]

const scrolled = ref(false)
const shellEl = ref<HTMLElement | null>(null)
const barEl = ref<HTMLElement | null>(null)
/** Extra px so FAB sits above the visual viewport bottom (= same edge gap as `right`). */
const fabBottomExtra = ref(0)

/** Wait before collapse so a tiny nudge doesn’t snap the bar */
const COLLAPSE_DELAY_MS = 220
const ANIM_DURATION = 0.55
/** Below this, skip scroll collapse (no 1-col side gutters, keep full vertical inset). */
const COLLAPSE_MIN_WIDTH = 768
let collapseTimer = 0
let gsapMod: typeof import('gsap').default | null = null

async function gsap() {
  if (!gsapMod) gsapMod = (await import('gsap')).default
  return gsapMod
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
  <header class="pointer-events-none fixed inset-x-0 top-0 z-30">
    <!--
      GSAP tweens width + side + vertical inset together (md+ only).
      Mobile: logo centered; menu is a bottom-right FAB (thumb zone).
    -->
    <div
      ref="shellEl"
      class="w-full"
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
          to="/"
          class="header-logo-link col-span-12 justify-self-center md:col-span-3 md:col-start-1 md:justify-self-start"
          aria-label="Kadoflow — на главную"
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
          class="header-chip site-nav col-span-5 col-start-6 hidden w-fit items-center gap-x-2 justify-self-start md:flex md:col-span-3 md:col-start-8 lg:gap-x-3"
          :class="{ 'header-chip--scrolled': scrolled }"
          aria-label="Основная"
        >
          <a
            v-for="(link, index) in links"
            :key="link.href"
            :href="link.href"
            class="nav-link text-ink"
          >
            {{ link.label }}<span v-if="index < links.length - 1">,</span>
          </a>
        </nav>

        <button
          type="button"
          class="header-chip site-nav col-span-1 col-start-12 hidden items-center justify-end gap-2 justify-self-end text-ink md:flex"
          :class="{ 'header-chip--scrolled': scrolled }"
          aria-label="Открыть меню"
        >
          <span>меню</span>
          <span class="flex gap-1" aria-hidden="true">
            <span class="size-1 rounded-full bg-ink" />
            <span class="size-1 rounded-full bg-ink" />
          </span>
        </button>
      </div>
    </div>
  </header>

  <!-- Mobile thumb-zone menu — pinned to visual viewport bottom (matches right inset). -->
  <button
    type="button"
    class="menu-fab header-chip site-nav pointer-events-auto fixed z-40 flex items-center gap-2 text-ink md:hidden"
    :class="{ 'header-chip--scrolled': scrolled }"
    :style="{
      bottom: `calc(${fabBottomExtra}px + 2 * var(--layout-margin) + var(--safe-bottom))`,
    }"
    aria-label="Открыть меню"
  >
    <span class="menu-fab-label">меню</span>
    <span class="flex gap-1" aria-hidden="true">
      <span class="size-1 rounded-full bg-ink" />
      <span class="size-1 rounded-full bg-ink" />
    </span>
  </button>
</template>

<style scoped>
.header-bar {
  box-sizing: border-box;
}

.header-logo-link {
  min-width: max-content;
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

.menu-fab {
  /* Thumb zone: 2× layout margin (margin itself is tight on mobile). */
  right: calc(2 * var(--layout-margin) + var(--safe-right));
  /* `bottom` set inline from visualViewport so chrome hide/show keeps the same edge gap as `right`. */
  margin: 0;
  /* Always visible underlay + pill radius (near-circular ends). */
  border-radius: 9999px;
  padding: 10px 16px;
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
  transition: opacity var(--motion-base) var(--motion-ease);
}

.nav-link:hover {
  opacity: var(--motion-hover-opacity);
}
</style>
