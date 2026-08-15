<script setup lang="ts">
import { isMobileChromeHeightOnlyResize, isThumbNav } from '~/utils/mobileViewport'
import { headerLinks } from '~/utils/siteNav'
import { setChipBgOrigin } from '~/utils/chipHoverBg'
import { preloadHomeSceneAssets } from '~/utils/preloadHomeMotion'
import { CHIP_FIT_EASE, CHIP_FIT_S } from '~/utils/chipFit'

const {
  open: canvasOpen,
  surfaceOn: canvasSurface,
  toggleCanvas,
  fabLabelOn,
  registerFabFit,
} = usePageCanvas()
const route = useRoute()
const links = headerLinks
const scrolled = ref(false)
const canvasForced = computed(() => canvasSurface.value || canvasOpen.value)
/** Menu pins the bar to the default wide layout — never the compact scroll state. */
const headerCollapsed = computed(
  () => scrolled.value && !canvasForced.value,
)
const shellEl = ref<HTMLElement | null>(null)
const barEl = ref<HTMLElement | null>(null)
const fabEl = ref<HTMLElement | null>(null)
const logoEl = ref<HTMLElement | null>(null)
const navEl = ref<HTMLElement | null>(null)
const menuBtnEl = ref<HTMLElement | null>(null)
/** Extra px so FAB sits above the visual viewport bottom (= same edge gap as `right`). */
const fabBottomExtra = ref(0)
const thumbNav = ref(false)
const introPending = ref(true)
if (import.meta.client) thumbNav.value = isThumbNav()

let lastFabScrollY = 0
const FAB_LABEL_DIR_PX = 8
/** After menu close, ignore the scroll restoration jump so the word stays visible. */
let fabLabelHoldUntil = 0

function onChipPointer(e: PointerEvent) {
  const el = e.currentTarget
  if (el instanceof HTMLElement) setChipBgOrigin(el, e)
}

/** Page canvas pins body (scrollY→0) — ignore that fake scroll for collapse morph. */
function canvasLocksScroll() {
  return (
    canvasSurface.value
    || canvasOpen.value
    || document.documentElement.classList.contains('page-canvas-lock')
  )
}

/** Wait before collapse so a tiny nudge doesn’t snap the bar */
const COLLAPSE_DELAY_MS = 140
const ANIM_DURATION = 0.58
const ANIM_EASE = 'power3.inOut'
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
let fabFitTl: { kill: () => void } | null = null
let fabFitResolve: (() => void) | null = null
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
let tokenProbe: HTMLDivElement | null = null
let tokenCache: {
  content: number
  gutter: number
  margin: number
  inset: number
  headerContent: number
} | null = null

function measureTokenWidth(cssWidth: string): number {
  if (typeof document === 'undefined') return 0
  if (!tokenProbe) {
    tokenProbe = document.createElement('div')
    tokenProbe.style.cssText =
      'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;height:0'
    document.body.appendChild(tokenProbe)
  }
  tokenProbe.style.width = cssWidth
  return tokenProbe.getBoundingClientRect().width
}

function refreshTokens() {
  tokenCache = {
    content: measureTokenWidth('var(--layout-content)'),
    gutter: measureTokenWidth('var(--layout-gutter)'),
    margin: measureTokenWidth('var(--layout-margin)'),
    inset: measureTokenWidth('var(--layout-header-inset)'),
    headerContent: measureTokenWidth('var(--layout-header-content)'),
  }
}

function tokensNow() {
  if (!tokenCache) refreshTokens()
  return tokenCache!
}

/**
 * Expanded: full shell, no side pad (logo at col 1), full header-inset.
 * Collapsed (md+): content band + side pad = empty cols 1 & 12; tighter vertical inset.
 * Mobile stays expanded — no 1-col edge gutters and no vertical inset shrink.
 */
function layoutMetrics() {
  const shell = shellEl.value
  const expanded = shell?.clientWidth ?? 0
  const t = tokensNow()
  const contentBand = t.content
  const collapsed = Math.min(expanded, contentBand > 0 ? contentBand : expanded)
  const gutter = t.gutter
  const margin = t.margin
  const inset = t.inset || margin
  const headerContent = t.headerContent || 32
  const collapse = headerCollapsed.value && canCollapseHeader()
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

function boxNear(
  bar: HTMLElement,
  width: number,
  height: number,
  paddingTop: number,
  paddingBottom: number,
  sidePad: number,
) {
  const n = (a: number, b: number) => Math.abs(a - b) < 1
  return (
    n(parseFloat(bar.style.width) || 0, width)
    && n(parseFloat(bar.style.height) || 0, height)
    && n(parseFloat(bar.style.paddingTop) || 0, paddingTop)
    && n(parseFloat(bar.style.paddingBottom) || 0, paddingBottom)
    && n(parseFloat(bar.style.paddingLeft) || 0, sidePad)
  )
}

async function morph(animate: boolean) {
  const bar = barEl.value
  if (!bar) return

  const m = layoutMetrics()
  if (m.expanded < 1) return

  const width = m.collapseSides ? m.collapsed : m.expanded
  const reduce =
    typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const snap = !animate || reduce || boxNear(
    bar,
    width,
    m.height,
    m.paddingTop,
    m.paddingBottom,
    m.sidePad,
  )

  if (snap) {
    if (gsapMod) gsapMod.killTweensOf(bar)
    applyBox(bar, width, m.height, m.paddingTop, m.paddingBottom, m.sidePad)
    return
  }

  const g = gsapMod ?? (await gsap())
  g.to(bar, {
    width,
    height: m.height,
    paddingTop: m.paddingTop,
    paddingBottom: m.paddingBottom,
    paddingLeft: m.sidePad,
    paddingRight: m.sidePad,
    duration: ANIM_DURATION,
    ease: ANIM_EASE,
    overwrite: true,
    force3D: false,
  })
}

function resetHeaderWide(animate: boolean) {
  if (collapseTimer) {
    window.clearTimeout(collapseTimer)
    collapseTimer = 0
  }
  scrolled.value = false
  fabLabelOn.value = true
  window.scrollTo(0, 0)
  lastFabScrollY = 0
  void fitFabLabel(true, true)
  void morph(animate)
}

function syncFabLabel() {
  if (!thumbNav.value) return
  if (canvasLocksScroll()) return
  const y = Math.max(0, window.scrollY || 0)
  if (performance.now() < fabLabelHoldUntil) {
    applyFabLabel(true)
    lastFabScrollY = y
    return
  }
  if (y <= 8) {
    applyFabLabel(true)
    lastFabScrollY = y
    return
  }
  const dy = y - lastFabScrollY
  if (Math.abs(dy) < FAB_LABEL_DIR_PX) return
  lastFabScrollY = y
  applyFabLabel(dy < 0)
}

function applyFabLabel(on: boolean, instant = false) {
  if (fabLabelOn.value === on && !instant) return
  fabLabelOn.value = on
  void fitFabLabel(on, instant)
}

async function fitFabLabel(on: boolean, instant = false) {
  const fab = fabEl.value
  if (!fab || !thumbNav.value) return
  const word = fab.querySelector('.menu-fab-word') as HTMLElement | null
  const label = fab.querySelector('.menu-fab-label') as HTMLElement | null
  if (!word || !label) return
  const g = await gsap()
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const labelW = Math.ceil(label.scrollWidth)
  fabFitTl?.kill()
  fabFitTl = null
  const prev = fabFitResolve
  fabFitResolve = null
  prev?.()
  if (instant || reduced) {
    g.set(word, { width: on ? labelW : 0 })
    g.set(fab, {
      paddingLeft: on ? 24 : 14,
      paddingRight: on ? 24 : 14,
      gap: on ? 8 : 0,
    })
    return
  }
  await new Promise<void>((resolve) => {
    fabFitResolve = resolve
    const tl = g.timeline({
      onComplete: () => {
        fabFitTl = null
        const r = fabFitResolve
        fabFitResolve = null
        r?.()
      },
    })
    fabFitTl = tl
    tl.to(
      word,
      {
        width: on ? labelW : 0,
        duration: CHIP_FIT_S,
        ease: CHIP_FIT_EASE,
        overwrite: true,
      },
      0,
    )
    tl.to(
      fab,
      {
        paddingLeft: on ? 24 : 14,
        paddingRight: on ? 24 : 14,
        gap: on ? 8 : 0,
        duration: CHIP_FIT_S,
        ease: CHIP_FIT_EASE,
        overwrite: true,
      },
      0,
    )
  })
}

function onScroll() {
  syncFabLabel()
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
  refreshTokens()
  void morph(false)
}

/**
 * Keep the FAB’s visible bottom inset equal to the right inset.
 * iOS/Android chrome show/hide changes visualViewport vs layout viewport —
 * plain `bottom: …` then drifts while `right` stays correct.
 */
function syncFabViewport() {
  const vv = window.visualViewport
  if (!vv || vv.height < 80) {
    fabBottomExtra.value = 0
    return
  }
  fabBottomExtra.value = Math.min(
    96,
    Math.max(0, window.innerHeight - vv.offsetTop - vv.height),
  )
}

function syncThumbNav() {
  thumbNav.value = isThumbNav()
}

onMounted(() => {
  registerFabFit(fitFabLabel)
  refreshTokens()
  void gsap()
  void morph(false)
  onScroll()
  syncThumbNav()
  syncFabViewport()
  void nextTick(() => {
    void fitFabLabel(fabLabelOn.value, true)
  })
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('resize', syncThumbNav, { passive: true })
  window.visualViewport?.addEventListener('resize', syncFabViewport)
  window.visualViewport?.addEventListener('scroll', syncFabViewport)

  watch(
    canvasForced,
    (on, was) => {
      if (was && !on) {
        applyFabLabel(true, true)
        fabLabelHoldUntil = performance.now() + 160
      }
      void morph(true)
    },
    { flush: 'sync' },
  )

  watch(
    () => route.path,
    () => {
      if (canvasForced.value) {
        scrolled.value = false
        return
      }
      resetHeaderWide(false)
    },
  )

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
      if (fab) g.set(fab, { clearProps: 'opacity,visibility,transform' })
      if (shellEl.value) g.set(shellEl.value, { autoAlpha: 1 })

      introPending.value = false
      await nextTick()

      const tl = g.timeline({ defaults: { ease: 'power3.out' } })
      // Stagger after iris — logo → links → desktop menu.
      if (logo) tl.to(logo, { autoAlpha: 1, y: 0, duration: 0.65 }, 0.35)
      if (navLinks.length) {
        tl.to(
          navLinks,
          { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.1 },
          0.55,
        )
      }
      if (menuBtn) tl.to(menuBtn, { autoAlpha: 1, y: 0, duration: 0.6 }, 0.95)
    },
    { immediate: true },
  )
})

onUnmounted(() => {
  if (collapseTimer) window.clearTimeout(collapseTimer)
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('resize', syncThumbNav)
  window.visualViewport?.removeEventListener('resize', syncFabViewport)
  window.visualViewport?.removeEventListener('scroll', syncFabViewport)
  if (barEl.value && gsapMod) gsapMod.killTweensOf(barEl.value)
  fabFitTl?.kill()
  registerFabFit(null)
  tokenProbe?.remove()
  tokenProbe = null
  tokenCache = null
})
</script>

<template>
  <header
    class="pointer-events-none fixed inset-x-0 top-0 z-[100] site-header"
    :inert="canvasSurface"
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
        :class="{ 'header-bar--scrolled': headerCollapsed }"
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
          @pointerenter="preloadHomeSceneAssets"
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
          :class="{ 'header-chip--scrolled': headerCollapsed }"
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
          class="header-desk-menu menu-btn header-chip site-nav chip-scale-host col-span-1 col-start-12 hidden items-center justify-end gap-2 justify-self-end text-ink md:flex"
          :class="{ 'header-chip--scrolled': headerCollapsed }"
          :aria-expanded="canvasOpen"
          :aria-label="canvasOpen ? 'Закрыть меню' : 'Открыть меню'"
          @pointerenter="onChipPointer"
          @pointerleave="onChipPointer"
          @click="toggleCanvas"
        >
          <span class="chip-scale-bg" aria-hidden="true" />
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
  <Teleport to="body">
    <button
      ref="fabEl"
      type="button"
      class="menu-fab site-nav chip-scale-host pointer-events-auto flex items-center text-ink"
      :class="{ 'menu-fab--compact': !fabLabelOn }"
      :inert="canvasSurface"
      :tabindex="canvasSurface ? -1 : 0"
      :style="{
        bottom: `calc(${fabBottomExtra}px + 2 * var(--layout-margin) + var(--safe-bottom, 0px))`,
      }"
      :aria-expanded="canvasOpen"
      :aria-label="canvasOpen ? 'Закрыть меню' : 'Открыть меню'"
      @pointerenter="onChipPointer"
      @pointerleave="onChipPointer"
      @click="toggleCanvas"
    >
      <span class="chip-scale-bg" aria-hidden="true" />
      <span class="menu-fab-word" aria-hidden="true">
        <span class="menu-fab-word__clip">
          <span class="menu-fab-label">меню</span>
        </span>
      </span>
      <span class="menu-dots" aria-hidden="true">
        <span class="menu-dot" />
        <span class="menu-dot" />
      </span>
    </button>
  </Teleport>
</template>

<style scoped>
.header-intro-hide {
  opacity: 0;
  visibility: hidden;
}

.site-header {
  transition: opacity 0.32s var(--motion-ease, ease), visibility 0.32s;
}

/* Instant while the close overlay still covers — a 0.32s fade after zoom
   looks like the header remounting. */
html.page-canvas-lock .site-header,
html.page-canvas-lock .menu-fab {
  transition: none;
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
  transition: background-color 0.58s cubic-bezier(0.645, 0.045, 0.355, 1);
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
        background-color 0.58s cubic-bezier(0.645, 0.045, 0.355, 1),
        backdrop-filter 0.58s cubic-bezier(0.645, 0.045, 0.355, 1),
        -webkit-backdrop-filter 0.58s cubic-bezier(0.645, 0.045, 0.355, 1);
    }

    .header-chip--scrolled {
      background-color: color-mix(in srgb, var(--palette-sand) 55%, transparent);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
  }
}

.menu-btn {
  position: relative;
  cursor: pointer;
  border-radius: 9999px;
  /* ~1.5× chip horizontal padding (2× then −25%) */
  padding-inline: 18px;
  margin-inline: -18px;
}

.menu-dots {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transform-origin: center center;
  transition: transform 0.32s var(--motion-ease, ease);
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
  position: fixed;
  top: auto;
  left: auto;
  right: calc(2 * var(--layout-margin) + var(--safe-right, 0px));
  bottom: calc(2 * var(--layout-margin) + var(--safe-bottom, 0px));
  z-index: 100;
  box-sizing: border-box;
  display: flex;
  margin: 0;
  gap: 8px;
  border: 0;
  cursor: pointer;
  appearance: none;
  font: inherit;
  color: var(--palette-ink);
  border-radius: 9999px;
  padding: 10px 24px;
  opacity: 1;
  visibility: visible;
  background-color: color-mix(in srgb, var(--palette-sand) 80%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.menu-fab:hover .menu-dots,
.menu-fab:focus-visible .menu-dots,
.menu-fab:active .menu-dots,
.menu-fab[aria-expanded='true'] .menu-dots {
  transform: rotate(90deg);
}

/* Desktop + mouse: header chip owns «меню». Phones keep the FAB even in landscape. */
@media (min-width: 768px) and (pointer: fine) {
  .menu-fab {
    display: none;
  }
}

@media (max-width: 767.98px), (pointer: coarse) {
  .header-desk-menu {
    display: none !important;
  }
}

.menu-fab-word {
  display: block;
  overflow: hidden;
  flex: 0 0 auto;
  min-width: 0;
}

.menu-fab-word__clip {
  display: block;
  width: max-content;
}

.menu-fab:active .chip-scale-bg {
  background-color: var(--palette-stone);
}

.menu-btn-label,
.menu-fab-label {
  position: relative;
  z-index: 1;
  display: block;
  white-space: nowrap;
  min-width: max-content;
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
  .menu-fab,
  .menu-fab-word,
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
