<script setup lang="ts">
import { isMobileChromeHeightOnlyResize, isThumbNav } from '~/utils/mobileViewport'
import { headerLinks } from '~/utils/siteNav'
import { setChipBgOrigin } from '~/utils/chipHoverBg'
import { preloadHomeSceneAssets } from '~/utils/preloadHomeMotion'
import { CHIP_FIT_EASE, CHIP_FIT_S } from '~/utils/chipFit'

const {
  open: canvasOpen,
  surfaceOn: canvasSurface,
  busy: menuBusy,
  toggleCanvas,
  fabLabelOn,
  registerFabFit,
  pageIrisLive,
} = usePageCanvas()
const route = useRoute()
const links = headerLinks
/** Optimistic “you are here” so the chip fill doesn’t wait for the iris hop. */
const navHerePath = ref(route.path)
const scrolled = ref(false)
const canvasForced = computed(() => canvasSurface.value || canvasOpen.value)
/** Menu pins the bar to the default wide layout — never the compact scroll state. */
const headerCollapsed = computed(
  () => scrolled.value && !canvasForced.value,
)
/** Expand with morph after PageIris finishes (stay compact under the sand). */
let pendingExpand = false
const shellEl = ref<HTMLElement | null>(null)
const barEl = ref<HTMLElement | null>(null)
const fabEl = ref<HTMLElement | null>(null)
const logoEl = ref<HTMLElement | null>(null)
const logoImgEl = ref<HTMLImageElement | null>(null)
const isOverCases = ref(false)
const caseInverse = useState('home-case-inverse', () => false)
const logoInverted = computed(() => isOverCases.value && caseInverse.value)
const navEl = ref<HTMLElement | null>(null)
const menuBtnEl = ref<HTMLElement | null>(null)
const menuSlotEl = ref<HTMLElement | null>(null)
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

function onMenuHoverEnter(e: PointerEvent) {
  const el = e.currentTarget
  if (!(el instanceof HTMLElement)) return
  setChipBgOrigin(el, e)
  el.classList.add('is-chip-hover')
}

function onMenuHoverLeave(e: PointerEvent) {
  const el = e.currentTarget
  if (!(el instanceof HTMLElement)) return
  const next = e.relatedTarget
  if (next instanceof Node && el.contains(next)) return
  el.classList.remove('is-chip-hover')
}

/** After busy ends, :hover may be true while the fill class was cleared. */
function restoreMenuHoverFill() {
  for (const el of [menuBtnEl.value, fabEl.value]) {
    if (!(el instanceof HTMLElement)) continue
    if (el.matches(':hover')) el.classList.add('is-chip-hover')
    else el.classList.remove('is-chip-hover')
  }
}

function navPathKey(path: string) {
  return path.replace(/\/+$/, '') || '/'
}

function isNavHere(to: string) {
  return navPathKey(navHerePath.value) === navPathKey(to)
}

function markNavHere(to: string, e?: PointerEvent) {
  if (
    e
    && (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
  ) {
    return
  }
  navHerePath.value = to
}

function onNavPointerDown(to: string, e: PointerEvent) {
  markNavHere(to, e)
}

watch(() => route.path, (path) => {
  navHerePath.value = path
})

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
let collapseTimer = 0
let gsapMod: typeof import('gsap').default | null = null
let stMod: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let logoCasesSt: { kill: () => void } | null = null
let logoToneTries = 0
let fabFitTl: { kill: () => void } | null = null
let fabFitResolve: (() => void) | null = null

async function setupLogoCasesTrigger() {
  logoCasesSt?.kill()
  logoCasesSt = null

  if (route.path !== '/') {
    isOverCases.value = false
    logoToneTries = 0
    return
  }

  await nextTick()
  const cases = document.getElementById('cases')
  const logo = logoImgEl.value
  if (!logo) return
  if (!cases) {
    if (logoToneTries < 24) {
      logoToneTries += 1
      requestAnimationFrame(() => {
        void setupLogoCasesTrigger()
      })
    }
    return
  }
  logoToneTries = 0

  if (!gsapMod) gsapMod = (await import('gsap')).default
  if (!stMod) {
    const mod = await import('gsap/ScrollTrigger')
    stMod = mod.ScrollTrigger
    gsapMod.registerPlugin(stMod)
  }

  logoCasesSt = stMod.create({
    trigger: cases,
    start: () => {
      const r = logo.getBoundingClientRect()
      return `top ${Math.round(r.bottom)}px`
    },
    end: () => {
      const r = logo.getBoundingClientRect()
      return `bottom ${Math.round(r.top + r.height * 0.5)}px`
    },
    invalidateOnRefresh: true,
    onToggle: (self) => {
      isOverCases.value = self.isActive
    },
    onRefresh: (self) => {
      isOverCases.value = self.isActive
    },
  })
  isOverCases.value = logoCasesSt.isActive
}

function refreshLogoCasesTone() {
  if (!logoCasesSt || !stMod) return
  try {
    stMod.refresh()
  } catch {
    /* The header remains usable if ScrollTrigger is already being torn down. */
  }
}

async function gsap() {
  if (!gsapMod) gsapMod = (await import('gsap')).default
  return gsapMod
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
  /** Mobile: vertical insets −15%; top logo gap +20% on top of that. */
  const mobile = !canCollapseHeader()
  const insetY = mobile ? inset * 0.85 : inset
  const insetTop = mobile ? insetY * 1.2 : insetY
  const logoH = mobile ? headerContent * 1.1 : headerContent

  return {
    expanded,
    collapsed,
    collapseSides: collapse,
    sidePad,
    height: collapse
      ? inset * 0.5 + headerContent + inset
      : insetTop + logoH + insetY,
    paddingTop: collapse ? inset * 0.5 : insetTop,
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
    syncMenuFloat()
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
    onUpdate: syncMenuFloat,
    onComplete: () => {
      syncMenuFloat()
    },
  })
}

function resetHeaderWide(animate: boolean) {
  if (collapseTimer) {
    window.clearTimeout(collapseTimer)
    collapseTimer = 0
  }
  pendingExpand = false
  scrolled.value = false
  fabLabelOn.value = true
  window.scrollTo(0, 0)
  lastFabScrollY = 0
  void fitFabLabel(true, true)
  void morph(animate)
}

function onScroll() {
  syncMenuFloat()
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
  const label = fab.querySelector('.menu-sizer-menu') as HTMLElement | null
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

function syncMenuFloat() {
  const slot = menuSlotEl.value
  const btn = menuBtnEl.value
  if (!slot || !btn || typeof window === 'undefined') return
  if (thumbNav.value) return
  const r = slot.getBoundingClientRect()
  const bh = btn.offsetHeight || r.height
  /* Center on the invisible grid slot so the chip shares the logo/nav row.
     Margin must stay 0 (see .menu-btn--float) so `top` maps to the border box. */
  btn.style.margin = '0'
  btn.style.top = `${Math.round(r.top + (r.height - bh) / 2)}px`
  btn.style.right = `${Math.round(window.innerWidth - r.right)}px`
}

function fitDeskChipWord() {
  if (canvasOpen.value || canvasSurface.value) return
  const btn = menuBtnEl.value
  if (!btn || thumbNav.value) return
  const word = btn.querySelector('.menu-chip-word') as HTMLElement | null
  const sizer = btn.querySelector('.menu-sizer-menu') as HTMLElement | null
  if (!word || !sizer) return
  word.style.width = `${Math.ceil(sizer.scrollWidth)}px`
}

function onResize() {
  if (isMobileChromeHeightOnlyResize()) {
    syncMenuFloat()
    return
  }
  refreshTokens()
  void morph(false)
  syncMenuFloat()
  refreshLogoCasesTone()
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
    syncMenuFloat()
    return
  }
  fabBottomExtra.value = Math.min(
    96,
    Math.max(0, window.innerHeight - vv.offsetTop - vv.height),
  )
  syncMenuFloat()
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
    fitDeskChipWord()
    syncMenuFloat()
    void setupLogoCasesTrigger()
  })
  void document.fonts?.ready.then(() => {
    fitDeskChipWord()
    if (thumbNav.value) void fitFabLabel(fabLabelOn.value, true)
    syncMenuFloat()
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

  watch(menuBusy, (on, was) => {
    if (was && !on) void nextTick(restoreMenuHoverFill)
  })

  watch(
    () => route.path,
    () => {
      void setupLogoCasesTrigger()
      if (canvasForced.value) {
        pendingExpand = false
        scrolled.value = false
        return
      }
      const wasCollapsed = scrolled.value && canCollapseHeader()
      if (wasCollapsed && pageIrisLive.value) {
        // Stay compact under the sand; expand with morph after the iris opens.
        if (collapseTimer) {
          window.clearTimeout(collapseTimer)
          collapseTimer = 0
        }
        window.scrollTo(0, 0)
        lastFabScrollY = 0
        fabLabelOn.value = true
        void fitFabLabel(true, true)
        pendingExpand = true
        return
      }
      resetHeaderWide(wasCollapsed)
    },
  )

  watch(pageIrisLive, (live, was) => {
    if (was && !live && pendingExpand) {
      resetHeaderWide(true)
    }
  })

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
  logoCasesSt?.kill()
  logoCasesSt = null
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
    class="pointer-events-none fixed inset-x-0 top-0 z-[113] site-header"
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
        class="header-bar pointer-events-none mx-auto grid max-w-full items-center"
        :class="{ 'header-bar--scrolled': headerCollapsed }"
        :style="{
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          columnGap: 'var(--layout-gutter)',
        }"
      >
        <NuxtLink
          ref="logoEl"
          to="/"
          class="header-logo-link pointer-events-auto col-span-12 justify-self-center md:col-span-3 md:col-start-1 md:justify-self-start"
          aria-label="Kadoflow — на главную"
          :tabindex="canvasSurface ? -1 : 0"
          @pointerenter="preloadHomeSceneAssets"
        >
          <img
            ref="logoImgEl"
            src="/brand/logo-ru-mini.svg"
            alt="Kadoflow"
            class="header-logo"
            :class="{ 'header-logo--inverted': logoInverted }"
            width="206"
            height="40"
            decoding="sync"
            fetchpriority="high"
          >
        </NuxtLink>

        <nav
          ref="navEl"
          class="header-nav header-chip site-nav pointer-events-auto col-span-5 col-start-6 hidden w-fit items-center justify-self-start md:flex md:col-span-3 md:col-start-8 gap-x-[-1.5rem]"
          :class="{ 'header-chip--scrolled': headerCollapsed }"
          aria-label="Основная"
        >
          <NuxtLink
            v-for="(link, index) in links"
            :key="link.to"
            :to="link.to"
            class="nav-link chip-scale-host text-ink"
            :class="{ 'is-chip-on nav-link--here': isNavHere(link.to) }"
            :aria-current="isNavHere(link.to) ? 'page' : undefined"
            @pointerenter="onChipPointer"
            @pointerleave="onChipPointer"
            @focusin="onChipPointer"
            @pointerdown="onNavPointerDown(link.to, $event)"
          >
            <span class="chip-scale-bg" aria-hidden="true">
              <span class="chip-scale-bg__fill" />
            </span>
            <span class="nav-link__label">{{ link.label }}</span>
            <span v-if="index < links.length - 1" class="nav-link__comma">,</span>
          </NuxtLink>
        </nav>

        <span
          ref="menuSlotEl"
          class="header-desk-menu menu-btn menu-btn-slot header-chip site-nav col-span-1 col-start-12 hidden items-center justify-end gap-2 justify-self-end pointer-events-none invisible md:flex"
          aria-hidden="true"
        >
          <span class="menu-chip-word">меню</span>
          <span class="menu-dots">
            <span class="menu-dot" />
            <span class="menu-dot" />
          </span>
        </span>
      </div>
    </div>
  </header>

  <Teleport to="body">
    <button
      ref="menuBtnEl"
      type="button"
      class="header-desk-menu menu-btn menu-btn--float header-chip site-nav chip-scale-host items-center justify-end gap-2 text-ink"
      :class="{
        'header-chip--scrolled': headerCollapsed,
        'header-intro-hide': introPending,
        'menu-chip-busy': menuBusy,
      }"
      :aria-busy="menuBusy"
      :aria-expanded="canvasOpen"
      :aria-label="canvasOpen ? 'Закрыть меню' : 'Открыть меню'"
      @pointerenter="onMenuHoverEnter"
      @pointerleave="onMenuHoverLeave"
      @click="toggleCanvas"
    >
      <span class="chip-scale-bg" aria-hidden="true">
        <span class="chip-scale-bg__fill" />
      </span>
      <span class="menu-chip-word">
        <span class="menu-chip-sizers" aria-hidden="true">
          <span class="menu-sizer-menu">меню</span>
          <span class="menu-sizer-back">закрыть</span>
        </span>
        <span class="menu-chip-window">
          <span class="menu-chip-track">
            <span class="menu-chip-line">меню</span>
            <span class="menu-chip-line">закрыть</span>
          </span>
        </span>
      </span>
      <span class="menu-dots" aria-hidden="true">
        <span class="menu-dot" />
        <span class="menu-dot" />
      </span>
    </button>
  </Teleport>

  <!-- Mobile thumb-zone menu — pinned to visual viewport bottom (matches right inset). -->
  <Teleport to="body">
    <button
      ref="fabEl"
      type="button"
      class="menu-fab site-nav chip-scale-host pointer-events-auto flex items-center text-ink"
      :class="{
        'menu-fab--compact': !fabLabelOn,
        'menu-chip-busy': menuBusy,
      }"
      :tabindex="0"
      :style="{
        bottom: `calc(${fabBottomExtra}px + 2 * var(--layout-margin) + var(--safe-bottom, 0px))`,
      }"
      :aria-busy="menuBusy"
      :aria-expanded="canvasOpen"
      :aria-label="canvasOpen ? 'Закрыть меню' : 'Открыть меню'"
      @pointerenter="onMenuHoverEnter"
      @pointerleave="onMenuHoverLeave"
      @click="toggleCanvas"
    >
      <span class="chip-scale-bg" aria-hidden="true">
        <span class="chip-scale-bg__fill" />
      </span>
      <span class="menu-chip-word menu-fab-word" aria-hidden="true">
        <span class="menu-chip-sizers">
          <span class="menu-sizer-menu">меню</span>
          <span class="menu-sizer-back">закрыть</span>
        </span>
        <span class="menu-chip-window">
          <span class="menu-chip-track">
            <span class="menu-chip-line">меню</span>
            <span class="menu-chip-line">закрыть</span>
          </span>
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
  isolation: isolate;
  transition: opacity 0.32s var(--motion-ease, ease), visibility 0.32s;
}

/* Under the menu overlay; above the SPA hop veil so chrome stays put. */
html.page-canvas-surface .site-header {
  z-index: 100;
}

html.page-iris-lock:not(.page-canvas-surface) .site-header {
  z-index: 113;
}

/* Sand iris + chip fill clash — keep nav chrome clear while the hop covers. */
html.page-iris-lock .header-chip,
html.page-iris-lock .header-chip--scrolled {
  background-color: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  transition: none;
}

/* Instant while the close overlay still covers — a 0.32s fade after zoom
   looks like the header remounting. */
html.page-canvas-lock .site-header,
html.page-canvas-lock .menu-fab,
html.page-canvas-lock .menu-btn--float {
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
  transition: filter 0.35s var(--motion-ease, ease);
}

.header-logo--inverted {
  filter: brightness(0) invert(1);
}

@media (max-width: 767px) {
  .header-logo {
    height: calc(var(--layout-header-content) * 1.1);
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

/* Desktop nav pill: small inline chrome so hover fills sit inside the group. */
@media (min-width: 768px) {
  .header-nav.header-chip {
    padding-left: 4px;
    padding-right: 4px;
    margin-left: -4px;
    margin-right: -4px;
  }
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

.menu-btn--float {
  position: fixed;
  z-index: 114;
  pointer-events: auto;
  display: none;
  /* Fixed `top` is the margin edge — any leftover chip margin
     (-8px from .header-chip) lifts the whole control off the header axis. */
  margin: 0;
}

@media (min-width: 768px) and (pointer: fine) {
  .menu-btn--float {
    display: inline-flex;
  }
}

.menu-chip-busy {
  /* Keep hit-testing — pointer-events:none clears :hover and it won’t
     return until the next move (often looks like hover “falls off”). */
  cursor: default;
}

.menu-chip-word {
  position: relative;
  z-index: 1;
  display: block;
  flex: 0 0 auto;
  overflow: hidden;
  height: 1.25em;
  width: 0;
}

.menu-btn-slot .menu-chip-word {
  width: max-content;
  transform: none;
}

.menu-chip-sizers {
  position: absolute;
  left: 0;
  top: 0;
  width: max-content;
  visibility: hidden;
  pointer-events: none;
  white-space: nowrap;
}

.menu-chip-sizers span {
  display: block;
  width: max-content;
}

.menu-chip-window {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.menu-chip-track {
  display: flex;
  flex-direction: column;
}

.menu-chip-line {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 1.25em;
  white-space: nowrap;
}

.menu-btn:disabled,
.menu-fab:disabled {
  pointer-events: none;
  cursor: default;
  opacity: 0.55;
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

html.page-canvas-surface .menu-dots {
  transition: none;
}

html.page-canvas-surface .menu-btn:hover .menu-dots,
html.page-canvas-surface .menu-fab:hover .menu-dots,
html.page-canvas-surface .menu-btn:focus-visible .menu-dots,
html.page-canvas-surface .menu-fab:focus-visible .menu-dots,
html.page-canvas-surface .menu-btn[aria-expanded='true'] .menu-dots,
html.page-canvas-surface .menu-fab[aria-expanded='true'] .menu-dots {
  transform: none;
}

.menu-fab {
  position: fixed;
  top: auto;
  left: auto;
  right: calc(2 * var(--layout-margin) + var(--safe-right, 0px));
  bottom: calc(2 * var(--layout-margin) + var(--safe-bottom, 0px));
  z-index: 114;
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
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.nav-link {
  position: relative;
  z-index: 0;
  display: inline-flex;
  align-items: baseline;
  cursor: pointer;
  text-decoration: none;
  gap: 0;
  padding: 8px 18px;
  margin: -8px -4px;
  border-radius: 9999px;
  background: transparent;
}

.nav-link__label {
  position: relative;
  z-index: 1;
}

.nav-link__comma {
  position: relative;
  z-index: 1;
  margin-left: 0.02em;
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
