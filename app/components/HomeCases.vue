<script setup lang="ts">
/**
 * Home cases — one viewport stage + left rail switcher.
 * Grid: 2 list | 1 gap | 9 content.
 * Section bg teleports to `#home-cases-bg-host` (page z-1) under Flow Surface (z-5)
 * and under main (z-10). Never teleport to body — body z beats `.pc-live-stack`.
 * Desktop: figure is a pose slot; the case photo fills the Flow Surface.
 * Mobile: photo stays in the figure (no surface hop).
 */
import {
  homeCaseBackground,
  homeCases,
  type HomeCase,
} from '~/utils/homeCases'
import { setChipBgOrigin } from '~/utils/chipHoverBg'
import {
  hasFinePointer,
  isAppleTouchDevice,
  isCoarsePointer,
  isNarrowViewport,
} from '~/utils/mobileViewport'

const BLANK_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const rootEl = ref<HTMLElement | null>(null)
const mediaEl = ref<HTMLElement | null>(null)
const mediaImgFrontEl = ref<HTMLImageElement | null>(null)
const mediaImgBackEl = ref<HTMLImageElement | null>(null)
const mobileFrontSrc = ref(homeCases[0]?.media.src ?? BLANK_IMAGE)
const mobileFrontAlt = ref(homeCases[0]?.media.alt ?? '')
const mobileBackSrc = ref(BLANK_IMAGE)
const mobileBackAlt = ref('')
let mobileActiveLayer = 0

const bgPortalEl = ref<HTMLElement | null>(null)
const bgObjectEl = ref<HTMLElement | null>(null)
const bgParallaxEl = ref<HTMLElement | null>(null)
const bgFrontEl = ref<HTMLElement | null>(null)
const bgBackEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const railEl = ref<HTMLElement | null>(null)
/** Avoid SSR Teleport into `#home-cases-bg-host` (hydration child mismatch). */
const mountBgPortal = ref(false)
const mobileCases = ref(false)

const activeId = ref(homeCases[0]?.id ?? 'audience')
const switching = ref(false)
const caseSurfaceDocked = useState('home-case-surface-docked', () => false)
const caseSurfaceMedia = useState<{ src: string; alt: string } | null>(
  'home-case-surface-media',
  () => null,
)
const caseMediaMorphNonce = useState('home-case-media-morph-nonce', () => 0)
const caseInverse = useState('home-case-inverse', () => !!homeCases[0]?.inverse)

const activeCase = computed(
  () => homeCases.find((c) => c.id === activeId.value) ?? homeCases[0],
)

const sections = computed(() => {
  const el = rootEl.value
  return el ? [el] : []
})

defineExpose({
  sections,
  rootEl,
  mediaEl,
})

function onRailBtnPointerEnter(item: HomeCase, e: PointerEvent) {
  const el = e.currentTarget
  if (el instanceof HTMLElement) setChipBgOrigin(el, e)
  // Desktop only (mouse / fine pointer): switch on hover
  if (e.pointerType === 'mouse' || (hasFinePointer() && !mobileCases.value)) {
    void selectCase(item)
  }
}

function onRailBtnClick(item: HomeCase) {
  // Touch / mobile only: switch case on tap/click
  // On desktop with fine pointer / mouse: ignore click (already switched on hover, avoids glitch)
  if (mobileCases.value || isCoarsePointer() || !hasFinePointer()) {
    void selectCase(item)
  }
}

function onChipPointer(e: PointerEvent) {
  const el = e.currentTarget
  if (el instanceof HTMLElement) setChipBgOrigin(el, e)
}

function prefersReduce() {
  return (
    typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function isMobileCases() {
  return isAppleTouchDevice() || isNarrowViewport() || isCoarsePointer()
}

function refreshMobileCases() {
  mobileCases.value = isMobileCases()
}

function publishSurfaceMedia(item: HomeCase | undefined) {
  if (!item) {
    caseSurfaceMedia.value = null
    return
  }
  caseSurfaceMedia.value = {
    src: item.media.src,
    alt: item.media.alt,
  }
}

watch(
  activeCase,
  (item) => {
    publishSurfaceMedia(item)
    caseInverse.value = !!item?.inverse
  },
  { immediate: true },
)

let gsapMod: typeof import('gsap').default | null = null
let stMod: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let parallaxCtx: { revert: () => void } | null = null
let enterCtx: { revert: () => void } | null = null
let enterTl: { kill: () => void } | null = null
let switchTl: { kill: () => void } | null = null
let bgPortalRo: ResizeObserver | null = null
/** Which absolute bg layer is currently visible (0 | 1). */
let bgFront = 0

async function ensureGsap() {
  if (!gsapMod) gsapMod = (await import('gsap')).default
  if (!stMod) {
    const mod = await import('gsap/ScrollTrigger')
    stMod = mod.ScrollTrigger
    gsapMod.registerPlugin(stMod)
  }
  return gsapMod
}

/** Copy blocks only — media + section bg are not staged. */
type StageCopyParts = {
  title: HTMLElement | null
  blurb: HTMLElement | null
  /** Whole focus-tags list (not per-chip). */
  focusBlock: HTMLElement | null
  /** Whole role-tags list. */
  roleBlock: HTMLElement | null
  all: HTMLElement[]
}

function stageCopyParts(): StageCopyParts {
  const stage = stageEl.value
  if (!stage) {
    return {
      title: null,
      blurb: null,
      focusBlock: null,
      roleBlock: null,
      all: [],
    }
  }
  const title = stage.querySelector<HTMLElement>('.cases-title')
  const blurb = stage.querySelector<HTMLElement>('.cases-blurb')
  const focusBlock = stage.querySelector<HTMLElement>(
    '.cases-tags-motion--focus',
  )
  const roleBlock = stage.querySelector<HTMLElement>(
    '.cases-tags-motion--role',
  )
  const all = [title, blurb, focusBlock, roleBlock].filter(
    (el): el is HTMLElement => !!el,
  )
  return { title, blurb, focusBlock, roleBlock, all }
}

function railAnimTargets(): HTMLElement[] {
  const rail = railEl.value
  if (!rail) return []
  return Array.from(rail.querySelectorAll<HTMLElement>('.cases-rail__btn'))
}

const COPY_IN = {
  titleX: -28,
  blurbY: 20,
  tagX: 24,
  dur: 0.75,
  roleDelay: 0.12,
} as const

const COPY_OUT = {
  titleX: -20,
  blurbY: 16,
  tagX: 20,
  dur: 0.35,
  roleDelay: 0.04,
} as const

function setCopyHidden(
  gsap: typeof import('gsap').default,
  parts: StageCopyParts,
) {
  if (parts.title) {
    gsap.set(parts.title, {
      opacity: 0,
      x: COPY_IN.titleX,
      y: 0,
      clearProps: 'visibility',
    })
  }
  if (parts.blurb) {
    gsap.set(parts.blurb, {
      opacity: 0,
      x: 0,
      y: COPY_IN.blurbY,
      clearProps: 'visibility',
    })
  }
  if (parts.focusBlock) {
    gsap.set(parts.focusBlock, {
      opacity: 0,
      x: COPY_IN.tagX,
      y: 0,
      clearProps: 'visibility',
    })
  }
  if (parts.roleBlock) {
    gsap.set(parts.roleBlock, {
      opacity: 0,
      x: COPY_IN.tagX,
      y: 0,
      clearProps: 'visibility',
    })
  }
}

/** Title ←→, blurb ↑↓, tag lists as whole blocks RTL. */
function tweenCopyIn(
  tl: {
    to: (
      targets: HTMLElement | HTMLElement[],
      vars: Record<string, unknown>,
      position?: number | string,
    ) => unknown
  },
  parts: StageCopyParts,
  at = 0,
) {
  if (parts.title) {
    tl.to(
      parts.title,
      { opacity: 1, x: 0, duration: COPY_IN.dur, ease: 'power3.out' },
      at,
    )
  }
  if (parts.blurb) {
    tl.to(
      parts.blurb,
      { opacity: 1, y: 0, duration: COPY_IN.dur, ease: 'power3.out' },
      at + 0.1,
    )
  }
  if (parts.focusBlock) {
    tl.to(
      parts.focusBlock,
      {
        opacity: 1,
        x: 0,
        duration: COPY_IN.dur * 0.95,
        ease: 'power3.out',
      },
      at + 0.08,
    )
  }
  if (parts.roleBlock) {
    tl.to(
      parts.roleBlock,
      {
        opacity: 1,
        x: 0,
        duration: COPY_IN.dur * 0.95,
        ease: 'power3.out',
      },
      at + COPY_IN.roleDelay,
    )
  }
}

/** Reverse of in — same axes, opacity → 0. */
function tweenCopyOut(
  tl: {
    to: (
      targets: HTMLElement | HTMLElement[],
      vars: Record<string, unknown>,
      position?: number | string,
    ) => unknown
  },
  parts: StageCopyParts,
  at = 0,
) {
  if (parts.title) {
    tl.to(
      parts.title,
      {
        opacity: 0,
        x: COPY_OUT.titleX,
        duration: COPY_OUT.dur,
        ease: 'power2.in',
      },
      at,
    )
  }
  if (parts.blurb) {
    tl.to(
      parts.blurb,
      {
        opacity: 0,
        y: COPY_OUT.blurbY,
        duration: COPY_OUT.dur,
        ease: 'power2.in',
      },
      at + 0.05,
    )
  }
  if (parts.focusBlock) {
    tl.to(
      parts.focusBlock,
      {
        opacity: 0,
        x: COPY_OUT.tagX,
        duration: COPY_OUT.dur,
        ease: 'power2.in',
      },
      at + 0.04,
    )
  }
  if (parts.roleBlock) {
    tl.to(
      parts.roleBlock,
      {
        opacity: 0,
        x: COPY_OUT.tagX,
        duration: COPY_OUT.dur,
        ease: 'power2.in',
      },
      at + COPY_OUT.roleDelay,
    )
  }
}

function paintBgLayer(el: HTMLElement | null, item: HomeCase) {
  if (!el) return
  el.style.background = homeCaseBackground(item)
}

/** Keep teleported bg aligned to the cases section inside the page host. */
function syncBgPortal() {
  const section = rootEl.value
  const portal = bgPortalEl.value
  if (!section || !portal) return
  const host = portal.offsetParent as HTMLElement | null
  if (!host) {
    portal.style.top = `${section.offsetTop}px`
    portal.style.height = `${section.offsetHeight}px`
    return
  }
  const s = section.getBoundingClientRect()
  const h = host.getBoundingClientRect()
  portal.style.top = `${s.top - h.top}px`
  portal.style.height = `${s.height}px`
}

async function setupParallax() {
  parallaxCtx?.revert()
  parallaxCtx = null
  syncBgPortal()

  const section = rootEl.value
  const portal = bgPortalEl.value
  const objectEl = bgObjectEl.value
  const textureEl = bgParallaxEl.value
  if (!section || !portal || !objectEl || !textureEl) return

  const gsap = await ensureGsap()
  if (prefersReduce()) {
    gsap.set(portal, { y: 0 })
    gsap.set(objectEl, { y: 0 })
    gsap.set(textureEl, { yPercent: 0 })
    return
  }

  // Frame starts lower and travels further up; texture drifts inside the plate.
  parallaxCtx = gsap.context(() => {
    const st = {
      trigger: section,
      start: 'top bottom',
      end: 'bottom top',
      scrub: 1.15,
      invalidateOnRefresh: true,
    }
    gsap.fromTo(
      portal,
      { y: 120 },
      {
        y: -100,
        ease: 'none',
        scrollTrigger: st,
      },
    )
    gsap.fromTo(
      objectEl,
      { y: 48 },
      {
        y: -56,
        ease: 'none',
        scrollTrigger: { ...st },
      },
    )
    gsap.fromTo(
      textureEl,
      { yPercent: -16 },
      {
        yPercent: 16,
        ease: 'none',
        scrollTrigger: { ...st },
      },
    )
  }, portal)
}

async function setupEnterMotion() {
  enterCtx?.revert()
  enterCtx = null

  const section = rootEl.value
  if (!section) return

  const gsap = await ensureGsap()
  if (prefersReduce()) {
    const rail = railAnimTargets()
    const parts = stageCopyParts()
    if (rail.length) gsap.set(rail, { clearProps: 'opacity,visibility,transform' })
    if (parts.all.length) {
      gsap.set(parts.all, { clearProps: 'opacity,visibility,transform' })
    }
    return
  }

  let localEnter: { kill: () => void } | null = null

  const playIn = () => {
    if (switching.value) return
    localEnter?.kill()
    enterTl?.kill()
    const rail = railAnimTargets()
    const parts = stageCopyParts()
    if (!rail.length && !parts.all.length) return

    if (rail.length) {
      gsap.set(rail, { opacity: 0, y: 28, clearProps: 'visibility' })
    }
    setCopyHidden(gsap, parts)

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    localEnter = tl
    enterTl = tl
    if (rail.length) {
      tl.to(rail, { opacity: 1, y: 0, duration: 1.1, stagger: 0.14 }, 0)
    }
    tweenCopyIn(tl, parts, rail.length ? 0.18 : 0)
  }

  const resetOut = () => {
    if (switching.value) return
    localEnter?.kill()
    enterTl?.kill()
    const rail = railAnimTargets()
    const parts = stageCopyParts()
    if (!rail.length && !parts.all.length) {
      enterTl = null
      localEnter = null
      return
    }

    const tl = gsap.timeline({ defaults: { ease: 'power2.in' } })
    localEnter = tl
    enterTl = tl
    if (rail.length) {
      tl.to(
        rail,
        { opacity: 0, y: 20, duration: 0.55, stagger: 0.05 },
        0,
      )
    }
    tweenCopyOut(tl, parts, 0)
  }

  enterCtx = gsap.context(() => {
    const rail = railAnimTargets()
    const parts = stageCopyParts()
    if (rail.length) {
      gsap.set(rail, { opacity: 0, y: 28, clearProps: 'visibility' })
    }
    setCopyHidden(gsap, parts)

    const st = stMod!.create({
      trigger: section,
      // Later than before (~15%): was top 48% → top 33%.
      start: 'top 33%',
      end: 'bottom 18%',
      onEnter: playIn,
      onEnterBack: playIn,
      onLeave: resetOut,
      onLeaveBack: resetOut,
    })
    if (st.isActive) playIn()
  }, section)
}

function waitTimeline(tl: {
  totalDuration?: () => number
  progress?: () => number
  eventCallback: (type: string, callback: (() => void) | null) => unknown
}) {
  return new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    // Empty / already-finished timelines never fire onComplete if we attach late.
    const dur = typeof tl.totalDuration === 'function' ? tl.totalDuration() : 0
    const prog = typeof tl.progress === 'function' ? tl.progress() : 0
    if (!(dur > 0) || prog >= 1) {
      finish()
      return
    }
    tl.eventCallback('onComplete', finish)
    tl.eventCallback('onInterrupt', finish)
  })
}

let switchGen = 0
let targetCaseId = homeCases[0]?.id ?? 'audience'
let bgTl: { kill: () => void } | null = null
let mediaPhotoTl: { kill: () => void } | null = null

function transitionBackground(next: HomeCase, gsap: typeof import('gsap').default) {
  const a = bgFrontEl.value
  const b = bgBackEl.value
  if (!a || !b) {
    paintBgLayer(bgFrontEl.value, next)
    return
  }

  bgTl?.kill()
  const front = bgFront === 0 ? a : b
  const back = bgFront === 0 ? b : a

  // Paint the incoming layer with the new case's background
  paintBgLayer(back, next)

  // Incoming layer starts below (+8% Y), scaled up (1.1), opacity 0
  gsap.set(back, {
    yPercent: 8,
    scale: 1.1,
    autoAlpha: 0,
  })

  const tl = gsap.timeline({
    defaults: { duration: 0.65 },
    onComplete: () => {
      bgFront = bgFront === 0 ? 1 : 0
      gsap.set(front, { autoAlpha: 0, clearProps: 'transform' })
      bgTl = null
    },
  })
  bgTl = tl

  // Disappearing layer: moves up (yPercent: -8), scale up (scale: 1.1), opacity -> 0
  tl.to(
    front,
    {
      yPercent: -8,
      scale: 1.1,
      autoAlpha: 0,
      ease: 'power2.inOut',
    },
    0,
  )

  // Appearing layer: moves up (yPercent: 0), scale down (scale: 1), opacity -> 1
  tl.to(
    back,
    {
      yPercent: 0,
      scale: 1,
      autoAlpha: 1,
      ease: 'power2.out',
    },
    0,
  )
}

async function selectCase(item: HomeCase) {
  if (targetCaseId === item.id) return
  targetCaseId = item.id

  const gsap = await ensureGsap()

  if (prefersReduce()) {
    activeId.value = item.id
    paintBgLayer(bgFront === 0 ? bgFrontEl.value : bgBackEl.value, item)
    publishSurfaceMedia(item)
    if (caseSurfaceDocked.value) caseMediaMorphNonce.value += 1
    return
  }

  const gen = ++switchGen
  switching.value = true

  enterTl?.kill()
  enterTl = null
  switchTl?.kill()
  switchTl = null
  mediaPhotoTl?.kill()
  mediaPhotoTl = null

  // 1. Background transition starts immediately upon click
  transitionBackground(item, gsap)

  // 2. Desktop FlowSurface photo wipe starts immediately with 0 delay
  publishSurfaceMedia(item)
  caseMediaMorphNonce.value += 1

  // 3. Mobile photo wipe transition (if on mobile) starts immediately
  if (mobileCases.value) {
    const curEl = mobileActiveLayer === 0 ? mediaImgFrontEl.value : mediaImgBackEl.value
    const nextEl = mobileActiveLayer === 0 ? mediaImgBackEl.value : mediaImgFrontEl.value
    if (mobileActiveLayer === 0) {
      mobileBackSrc.value = item.media.src
      mobileBackAlt.value = item.media.alt
    } else {
      mobileFrontSrc.value = item.media.src
      mobileFrontAlt.value = item.media.alt
    }
    if (curEl && nextEl) {
      gsap.set(nextEl, { clipPath: 'inset(0 100% 0 0)', autoAlpha: 1 })
      const pTl = gsap.timeline({
        onComplete: () => {
          mobileActiveLayer = mobileActiveLayer === 0 ? 1 : 0
          gsap.set(curEl, { clipPath: 'inset(0 100% 0 0)', autoAlpha: 0 })
          mediaPhotoTl = null
        },
      })
      mediaPhotoTl = pTl
      pTl.to(curEl, { clipPath: 'inset(0 100% 0 0)', duration: 0.5, ease: 'power2.in' }, 0)
      pTl.to(nextEl, { clipPath: 'inset(0 0% 0 0)', duration: 0.75, ease: 'power2.out' }, 0.5)
    }
  }

  // 4. Animate old copy out quickly
  const parts = stageCopyParts()
  const out = gsap.timeline({ defaults: { ease: 'power2.in' } })
  switchTl = out
  tweenCopyOut(out, parts, 0)
  await waitTimeline(out)
  if (gen !== switchGen) return

  // 5. Update case ID & DOM
  activeId.value = item.id
  await nextTick()
  if (gen !== switchGen) return
  syncBgPortal()

  // 6. Animate new copy in
  const nextParts = stageCopyParts()
  setCopyHidden(gsap, nextParts)
  const inn = gsap.timeline({ defaults: { ease: 'power3.out' } })
  switchTl = inn
  tweenCopyIn(inn, nextParts, 0)
  await waitTimeline(inn)

  if (gen === switchGen) {
    switching.value = false
    switchTl = null
  }
}

onMounted(async () => {
  refreshMobileCases()
  mountBgPortal.value = true
  await nextTick()
  syncBgPortal()
  const first = activeCase.value
  if (first) {
    paintBgLayer(bgFrontEl.value, first)
    publishSurfaceMedia(first)
    mobileFrontSrc.value = first.media.src
    mobileFrontAlt.value = first.media.alt
    if (bgBackEl.value) {
      const gsap = await ensureGsap()
      gsap.set(bgBackEl.value, { autoAlpha: 0 })
    }
  }
  await setupParallax()
  await setupEnterMotion()
  window.addEventListener('resize', syncBgPortal, { passive: true })
  window.addEventListener('resize', refreshMobileCases, { passive: true })
  window.addEventListener('scroll', syncBgPortal, { passive: true })

  if (rootEl.value && typeof ResizeObserver !== 'undefined') {
    bgPortalRo?.disconnect()
    bgPortalRo = new ResizeObserver(() => syncBgPortal())
    bgPortalRo.observe(rootEl.value)
  }
})

onBeforeUnmount(() => {
  switchTl?.kill()
  switchTl = null
  bgTl?.kill()
  bgTl = null
  mediaPhotoTl?.kill()
  mediaPhotoTl = null
  enterTl?.kill()
  enterTl = null
  parallaxCtx?.revert()
  parallaxCtx = null
  enterCtx?.revert()
  enterCtx = null
  bgPortalRo?.disconnect()
  bgPortalRo = null
  window.removeEventListener('resize', syncBgPortal)
  window.removeEventListener('resize', refreshMobileCases)
  window.removeEventListener('scroll', syncBgPortal)
})
</script>

<template>
  <section
    id="cases"
    ref="rootEl"
    class="home-cases pointer-events-auto relative z-10 w-full"
    :class="{ 'home-cases--inverse': activeCase?.inverse }"
    :data-case-id="activeCase?.id"
    :aria-label="`Кейс: ${activeCase?.title ?? ''}`"
  >
    <!--
      Under Flow Surface (z-5) + under main (z-10): host is page-local z-1.
      Teleporting to body with z>1 buried content + surface under the wash.
    -->
    <Teleport
      v-if="mountBgPortal"
      to="#home-cases-bg-host"
    >
      <div
        ref="bgPortalEl"
        class="cases-bg-portal"
        aria-hidden="true"
      >
        <div ref="bgObjectEl" class="cases-bg-object">
          <div ref="bgParallaxEl" class="cases-bg-parallax">
            <div ref="bgFrontEl" class="cases-bg cases-bg--layer" />
            <div ref="bgBackEl" class="cases-bg cases-bg--layer" />
          </div>
        </div>
      </div>
    </Teleport>

    <div
      class="cases-inner relative z-[1] mx-auto grid w-full"
      :style="{
        maxWidth: 'var(--layout-content-max)',
        paddingInline: 'var(--layout-margin-content)',
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
        columnGap: 'var(--layout-gutter)',
      }"
    >
      <nav
        ref="railEl"
        class="cases-rail col-span-12 md:col-span-2"
        aria-label="Кейсы"
      >
        <ul class="cases-rail__list">
          <li
            v-for="item in homeCases"
            :key="item.id"
          >
            <button
              type="button"
              class="cases-rail__btn chip-scale-host"
              :class="{ 'cases-rail__btn--active': item.id === activeId }"
              :aria-pressed="item.id === activeId"
              :aria-busy="switching"
              @pointerenter="onRailBtnPointerEnter(item, $event)"
              @click="onRailBtnClick(item)"
            >
              <span class="chip-scale-bg" aria-hidden="true">
                <span class="chip-scale-bg__fill" />
              </span>
              <span class="cases-rail__label">{{ item.label }}</span>
            </button>
          </li>
        </ul>
      </nav>

      <div
        v-if="activeCase"
        ref="stageEl"
        class="cases-stage col-span-12 md:col-span-9 md:col-start-4"
      >
        <div class="cases-stage__visual">
          <h2 class="cases-title">
            {{ activeCase.title }}
          </h2>
          <figure
            ref="mediaEl"
            class="cases-media"
            :class="`cases-media--${activeCase.media.orientation ?? 'portrait'}`"
            :style="
              activeCase.media.cols
                ? { width: `var(--layout-span-${activeCase.media.cols})`, maxWidth: '100%' }
                : undefined
            "
          >
            <img
              ref="mediaImgFrontEl"
              :src="mobileCases ? mobileFrontSrc : activeCase.media.src"
              :alt="mobileCases ? mobileFrontAlt : ''"
              class="cases-media__img"
              :class="{ 'cases-media__img--ghost': !mobileCases }"
              :aria-hidden="(!mobileCases).toString()"
              loading="eager"
              decoding="async"
            >
            <img
              ref="mediaImgBackEl"
              :src="mobileBackSrc"
              :alt="mobileCases ? mobileBackAlt : ''"
              class="cases-media__img cases-media__img--back"
              :class="{ 'cases-media__img--ghost': !mobileCases }"
              :aria-hidden="(!mobileCases).toString()"
              loading="eager"
              decoding="async"
            >
          </figure>
        </div>

        <aside class="cases-aside">
          <div class="cases-aside__top">
            <div class="cases-tags-motion cases-tags-motion--focus">
              <p class="cases-tags">
                <template
                  v-for="(tag, i) in activeCase.focusTags"
                  :key="`f-${tag}`"
                >
                  <span
                    v-if="i"
                    class="cases-tags__sep"
                    aria-hidden="true"
                  >·</span>
                  <span class="cases-tags__item">{{ tag }}</span>
                </template>
              </p>
            </div>
            <p class="cases-blurb">
              <span
                v-for="(line, i) in activeCase.blurb.split('\n').filter(Boolean)"
                :key="i"
                class="cases-blurb__line"
              >{{ line }}</span>
            </p>
          </div>
          <div class="cases-tags-motion cases-tags-motion--role">
            <p class="cases-tags cases-tags--role">
              <template
                v-for="(tag, i) in activeCase.roleTags"
                :key="`r-${tag}`"
              >
                <span
                  v-if="i"
                  class="cases-tags__sep"
                  aria-hidden="true"
                >·</span>
                <span class="cases-tags__item">{{ tag }}</span>
              </template>
            </p>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-cases {
  color: var(--palette-ink);
  /* One viewport + fluid header chrome so the fixed nav doesn’t eat the stage. */
  min-height: calc(100svh + var(--layout-surface-top));
  min-height: calc(100dvh + var(--layout-surface-top));
  background: transparent;
}

.home-cases--inverse {
  color: var(--palette-milk, #f5f1e8);
}

.cases-inner {
  /*
    Top: header chrome + extra section gap so copy clears the fixed nav.
    Bottom: section rhythm from the fluid scale.
  */
  padding-top: calc(var(--layout-surface-top) + var(--space-section));
  padding-bottom: var(--space-section);
}

.cases-rail {
  display: flex;
  align-items: center;
  min-height: 0;
}

.cases-rail__list {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin: 0;
  padding: 0;
  list-style: none;
  width: 100%;
}

@media (min-width: 768px) {
  .cases-rail {
    align-self: stretch;
  }

  .cases-rail__list {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: flex-start;
    gap: 0.75rem;
    width: auto;
  }
}

.cases-rail__btn {
  position: relative;
  z-index: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  max-width: 100%;
  min-height: 2.75rem;
  padding: 0.65rem 1.15rem;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 14%, transparent);
  color: inherit;
  font: inherit;
  font-size: var(--type-nav);
  letter-spacing: -0.02em;
  line-height: 1.2;
  cursor: pointer;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition:
    background-color 0.28s var(--motion-ease, ease),
    color 0.28s var(--motion-ease, ease),
    backdrop-filter 0.28s var(--motion-ease, ease);
}

.cases-rail__label {
  position: relative;
  z-index: 1;
}

.cases-rail__btn--active {
  background: var(--palette-milk, #f5f1e8);
  color: var(--palette-ink);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.cases-rail__btn--active .chip-scale-bg {
  display: none;
}

.home-cases:not(.home-cases--inverse) .cases-rail__btn--active {
  background: var(--palette-ink);
  color: var(--palette-milk, #f5f1e8);
}

.home-cases--inverse .cases-rail__btn .chip-scale-bg__fill {
  background-color: color-mix(in srgb, var(--palette-sand) 72%, transparent);
}

.cases-stage {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  min-width: 0;
  align-items: stretch;
}

@media (min-width: 768px) {
  .cases-stage {
    grid-template-columns: repeat(9, minmax(0, 1fr));
    column-gap: var(--layout-gutter);
    row-gap: 0;
    /* Section min-height − cases-inner fluid padding. */
    min-height: calc(
      100svh + var(--layout-surface-top)
      - (var(--layout-surface-top) + var(--space-section))
      - var(--space-section)
    );
    min-height: calc(
      100dvh + var(--layout-surface-top)
      - (var(--layout-surface-top) + var(--space-section))
      - var(--space-section)
    );
    align-items: end;
  }
}

.cases-stage__visual {
  display: flex;
  flex-direction: column;
  gap: var(--layout-gutter);
  min-width: 0;
}

@media (min-width: 768px) {
  .cases-stage__visual {
    grid-column: 1 / span 5;
    align-self: end;
    justify-content: flex-end;
  }
}

.cases-title {
  margin: 0;
  font-size: clamp(2.5rem, 4.6vw, 4rem);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1.05;
}

.cases-media {
  position: relative;
  margin: 0;
  min-width: 0;
  /* Desktop: empty pose slot — surface (z-5) shows through; photo lives inside it. */
  isolation: isolate;
  overflow: hidden;
}

.cases-media__img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 2px;
  object-fit: cover;
  clip-path: inset(0 0 0 0);
  will-change: clip-path;
}

.cases-media__img--back {
  position: absolute;
  inset: 0;
}

.cases-media__img--ghost {
  opacity: 0;
  pointer-events: none;
  user-select: none;
}

.cases-media--landscape .cases-media__img {
  width: 100%;
}

.cases-aside {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 2.5rem;
  min-width: 0;
}

@media (min-width: 768px) {
  .cases-aside {
    grid-column: 6 / span 4;
    align-self: stretch;
    padding-top: 0.35rem;
  }
}

.cases-aside__top {
  display: flex;
  flex-direction: column;
  gap: 60px;
}

.cases-tags-motion {
  display: block;
  will-change: transform, opacity;
}

.cases-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: calc(var(--layout-gutter) * 0.3);
  margin: 0;
  font-size: var(--type-nav);
  letter-spacing: -0.02em;
  line-height: 1.35;
  opacity: 0.55;
}

@media (min-width: 768px) {
  .cases-tags {
    justify-content: flex-end;
    text-align: right;
  }
}

.cases-tags__sep {
  flex: 0 0 auto;
}

.cases-tags__item {
  display: inline-block;
}

.cases-blurb {
  display: flex;
  flex-direction: column;
  margin: 0;
  font-size: var(--type-lead);
  letter-spacing: -0.02em;
  line-height: 1.35;
  text-align: left;
}

.cases-blurb__line {
  display: block;
}
</style>

<!-- Teleported bg lives in #home-cases-bg-host — unscoped so classes apply. -->
<style>
.cases-bg-portal {
  position: absolute;
  left: 0;
  width: 100%;
  overflow: hidden;
  pointer-events: none;
  will-change: transform;
}

.cases-bg-object {
  position: absolute;
  inset: -22% 0;
  will-change: transform;
}

.cases-bg-parallax {
  position: absolute;
  inset: -14% 0;
  will-change: transform;
}

.cases-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.cases-bg--layer {
  opacity: 1;
  transform-origin: center center;
  will-change: transform, opacity;
}
</style>
