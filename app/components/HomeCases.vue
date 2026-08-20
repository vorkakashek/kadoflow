<script setup lang="ts">
/**
 * Home cases — one viewport stage + left rail switcher.
 * Grid: 2 list | 1 gap | 9 content.
 * Section bg teleports to `#home-cases-bg-host` (page z-1) under Flow Surface (z-5)
 * and under main (z-10). Never teleport to body — body z beats `.pc-live-stack`.
 * Desktop: figure is a pose slot; the case photo fills the Flow Surface.
 * Mobile: the figure remains the layout target; Flow Surface morphs into it.
 */
import {
  homeCaseBackground,
  homeCaseDetailPath,
  homeCases,
  type HomeCase,
} from '~/utils/homeCases'
import {
  isAppleTouchDevice,
  isCoarsePointer,
  isNarrowViewport,
} from '~/utils/mobileViewport'

const rootEl = ref<HTMLElement | null>(null)
const mediaEl = ref<HTMLElement | null>(null)
const mediaImgFrontEl = ref<HTMLImageElement | null>(null)

const bgPortalEl = ref<HTMLElement | null>(null)
const bgObjectEl = ref<HTMLElement | null>(null)
const bgParallaxEl = ref<HTMLElement | null>(null)
const bgFrontEl = ref<HTMLElement | null>(null)
const bgBackEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const railEl = ref<HTMLElement | null>(null)
const railListEl = ref<HTMLElement | null>(null)
const blurbEl = ref<HTMLElement | null>(null)
/** Avoid SSR Teleport into `#home-cases-bg-host` (hydration child mismatch). */
const mountBgPortal = ref(false)
const mobileCases = ref(false)

const activeId = useState('home-active-case-id', () => homeCases[0]?.id ?? 'audience')
const switching = ref(false)
const hasSwitched = ref(false)
const caseSurfaceDocked = useState('home-case-surface-docked', () => false)
const caseSurfaceMedia = useState<{ src: string; alt: string } | null>(
  'home-case-surface-media',
  () => null,
)
const caseMediaMorphNonce = useState('home-case-media-morph-nonce', () => 0)
/** Ask FlowSurface to freeze its pinned frame before this card changes size. */
const caseMediaPrepareNonce = useState('home-case-media-prepare-nonce', () => 0)
const caseInverse = useState('home-case-inverse', () => !!homeCases[0]?.inverse)
const { openCaseDetail } = useCaseDetailTransition()

const activeCase = computed(
  () => homeCases.find((c) => c.id === activeId.value) ?? homeCases[0],
)
const blurbLines = computed(() =>
  activeCase.value?.blurb.split('\n').filter(Boolean) ?? [],
)
/** On mobile keep the authored break only when its first phrase fits intact. */
const mobileBlurbBreak = ref(true)

const sections = computed(() => {
  const el = rootEl.value
  return el ? [el] : []
})

defineExpose({
  sections,
  rootEl,
  mediaEl,
})

function onRailBtnClick(item: HomeCase) {
  void selectCase(item)
}

function onCaseDetailLink(item: HomeCase, e: MouseEvent) {
  const media = mediaEl.value
  if (!media) return
  e.preventDefault()
  const rect = media.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return
  openCaseDetail({
    to: homeCaseDetailPath(item),
    origin: 'home',
    src: item.media.src,
    alt: item.media.alt,
    wash: item.wash,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
  })
}

let caseSwipeStart: { x: number; y: number; pointerId: number } | null = null
const CASE_SWIPE_MIN_PX = 44

function onCaseStagePointerDown(e: PointerEvent) {
  if (!mobileCases.value || !e.isPrimary) return
  if (e.target instanceof Element && e.target.closest('a, button')) return
  caseSwipeStart = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
  if (e.currentTarget instanceof HTMLElement) {
    e.currentTarget.setPointerCapture(e.pointerId)
  }
}

function onCaseStagePointerCancel() {
  caseSwipeStart = null
}

function onCaseStagePointerUp(e: PointerEvent) {
  const start = caseSwipeStart
  caseSwipeStart = null
  if (!start || start.pointerId !== e.pointerId || !mobileCases.value) return

  const dx = e.clientX - start.x
  const dy = e.clientY - start.y
  if (Math.abs(dx) < CASE_SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return
  selectAdjacentCase(dx < 0 ? 1 : -1)
}

function scrollActiveCaseLinkIntoView(behavior: ScrollBehavior = 'smooth') {
  const list = railListEl.value
  const active = list?.querySelector<HTMLElement>('.cases-rail__btn--active')
  if (!list || !active) return

  const listBox = list.getBoundingClientRect()
  const activeBox = active.getBoundingClientRect()
  const inlinePad = Number.parseFloat(getComputedStyle(list).paddingLeft) || 0
  const target = Math.max(
    0,
    Math.min(
      list.scrollWidth - list.clientWidth,
      list.scrollLeft + activeBox.left - listBox.left - inlinePad,
    ),
  )
  list.scrollTo({ left: target, behavior })
}

function selectAdjacentCase(direction: 1 | -1) {
  const from = homeCases.findIndex((item) => item.id === targetCaseId)
  const index = from >= 0 ? from : 0
  const next = homeCases[(index + direction + homeCases.length) % homeCases.length]
  if (next) void selectCase(next)
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
  scheduleMobileBlurbBreak()
}

function syncMobileBlurbBreak() {
  const el = blurbEl.value
  const firstLine = blurbLines.value[0]
  if (!el || !firstLine || !mobileCases.value || blurbLines.value.length < 2) {
    mobileBlurbBreak.value = true
    return
  }

  const style = getComputedStyle(el)
  const probe = document.createElement('span')
  probe.textContent = firstLine
  probe.style.position = 'fixed'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  probe.style.whiteSpace = 'nowrap'
  probe.style.width = 'auto'
  probe.style.fontFamily = style.fontFamily
  probe.style.fontSize = style.fontSize
  probe.style.fontWeight = style.fontWeight
  probe.style.fontStyle = style.fontStyle
  probe.style.letterSpacing = style.letterSpacing
  probe.style.lineHeight = style.lineHeight
  probe.style.textTransform = style.textTransform
  document.body.append(probe)
  const firstLineWidth = probe.getBoundingClientRect().width
  probe.remove()
  mobileBlurbBreak.value = firstLineWidth <= el.clientWidth + 0.5
}

function scheduleMobileBlurbBreak() {
  void nextTick(() => requestAnimationFrame(syncMobileBlurbBreak))
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

watch([activeCase, mobileCases], scheduleMobileBlurbBreak, { flush: 'post' })

let gsapMod: typeof import('gsap').default | null = null
let stMod: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let parallaxCtx: { revert: () => void } | null = null
let enterCtx: { revert: () => void } | null = null
let enterTl: { kill: () => void } | null = null
let switchTl: { kill: () => void } | null = null
let bgPortalRo: ResizeObserver | null = null
let blurbRo: ResizeObserver | null = null
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
  return Array.from(rail.querySelectorAll<HTMLElement>('.cases-rail__list > li'))
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
      gsap.set(
        rail,
        mobileCases.value
          ? { opacity: 0, clearProps: 'visibility,transform' }
          : { opacity: 0, y: 28, clearProps: 'visibility' },
      )
    }
    setCopyHidden(gsap, parts)

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    localEnter = tl
    enterTl = tl
    if (rail.length) {
      tl.to(
        rail,
        mobileCases.value
          ? { opacity: 1, duration: 1.1, stagger: 0.14 }
          : { opacity: 1, y: 0, duration: 1.1, stagger: 0.14 },
        0,
      )
    }
    tweenCopyIn(tl, parts, rail.length ? 0.18 : 0)
    if (rail.length) {
      tl.set(rail, { clearProps: 'opacity,transform' }, '>')
    }
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
        mobileCases.value
          ? { opacity: 0, duration: 0.55, stagger: 0.05 }
          : { opacity: 0, y: 20, duration: 0.55, stagger: 0.05 },
        0,
      )
    }
    tweenCopyOut(tl, parts, 0)
  }

  enterCtx = gsap.context(() => {
    const rail = railAnimTargets()
    const parts = stageCopyParts()
    if (rail.length) {
      gsap.set(
        rail,
        mobileCases.value
          ? { opacity: 0, clearProps: 'visibility,transform' }
          : { opacity: 0, y: 28, clearProps: 'visibility' },
      )
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
let heightTl: { kill: () => void } | null = null

function onMediaLayoutReady() {
  if (!caseSurfaceDocked.value) return
  requestAnimationFrame(() => {
    caseMediaMorphNonce.value += 1
  })
}

function tweenSectionHeight(
  gsap: typeof import('gsap').default,
  el: HTMLElement,
  fromH: number,
  toH: number,
) {
  if (Math.abs(toH - fromH) < 2) {
    gsap.set(el, { clearProps: 'height' })
    return
  }

  heightTl?.kill()
  gsap.set(el, { height: fromH })
  heightTl = gsap.to(el, {
    height: toH,
    duration: 0.55,
    ease: 'power2.inOut',
    onUpdate: syncBgPortal,
    onComplete: () => {
      gsap.set(el, { clearProps: 'height' })
      heightTl = null
      syncBgPortal()
    },
  })
}

function transitionBackground(next: HomeCase, gsap: typeof import('gsap').default) {
  const a = bgFrontEl.value
  const b = bgBackEl.value
  if (!a || !b) {
    paintBgLayer(bgFrontEl.value, next)
    return
  }

  // A rapid hover can interrupt the previous crossfade before `bgFront` is
  // committed. Resolve the actually visible layer first; otherwise we can
  // zero the brighter layer and expose the sand page for one frame.
  bgTl?.kill()
  bgTl = null
  const opacityA = Number.parseFloat(getComputedStyle(a).opacity) || 0
  const opacityB = Number.parseFloat(getComputedStyle(b).opacity) || 0
  const front = opacityA >= opacityB ? a : b
  const back = front === a ? b : a
  bgFront = front === a ? 0 : 1

  // Keep a fully opaque plate under the new incoming layer at all times.
  gsap.set(front, { autoAlpha: 1 })

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
      bgFront = back === a ? 0 : 1
      gsap.set(back, { autoAlpha: 1, clearProps: 'transform' })
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
  hasSwitched.value = true

  const gsap = await ensureGsap()

  if (prefersReduce()) {
    activeId.value = item.id
    paintBgLayer(bgFront === 0 ? bgFrontEl.value : bgBackEl.value, item)
    publishSurfaceMedia(item)
    if (caseSurfaceDocked.value) caseMediaMorphNonce.value += 1
    await nextTick()
    scrollActiveCaseLinkIntoView('auto')
    return
  }

  const gen = ++switchGen
  switching.value = true

  enterTl?.kill()
  enterTl = null
  switchTl?.kill()
  switchTl = null
  heightTl?.kill()
  heightTl = null

  // 1. Background transition starts immediately upon click
  transitionBackground(item, gsap)

  // 2. Animate old copy out before the next figure changes its dimensions.
  const parts = stageCopyParts()
  const out = gsap.timeline({ defaults: { ease: 'power2.in' } })
  switchTl = out
  tweenCopyOut(out, parts, 0)
  await waitTimeline(out)
  if (gen !== switchGen) return

  // 3. Freeze the parked surface in its current box before the DOM card changes
  // dimensions. FlowSurface then has a real from→to geometry to interpolate.
  caseMediaPrepareNonce.value += 1
  await nextTick()
  if (gen !== switchGen) return

  // 4. Update case ID & DOM
  const root = rootEl.value
  const fromH = root?.offsetHeight ?? 0
  if (root && fromH) gsap.set(root, { height: fromH })
  activeId.value = item.id
  await nextTick()
  if (gen !== switchGen) return
  // The figure now has its next dimensions. Only now start the photo handoff,
  // so the surface can resize before the outgoing image is wiped.
  publishSurfaceMedia(item)
  caseMediaMorphNonce.value += 1
  scrollActiveCaseLinkIntoView()
  if (root && fromH) {
    root.style.height = 'auto'
    const toH = root.offsetHeight
    gsap.set(root, { height: fromH })
    tweenSectionHeight(gsap, root, fromH, toH)
  }
  syncBgPortal()

  // 5. Animate new copy in
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
    if (bgBackEl.value) {
      const gsap = await ensureGsap()
      gsap.set(bgBackEl.value, { autoAlpha: 0 })
    }
  }
  await setupParallax()
  await setupEnterMotion()
  scrollActiveCaseLinkIntoView('auto')
  window.addEventListener('resize', syncBgPortal, { passive: true })
  window.addEventListener('resize', refreshMobileCases, { passive: true })

  if (rootEl.value && typeof ResizeObserver !== 'undefined') {
    bgPortalRo?.disconnect()
    bgPortalRo = new ResizeObserver(() => syncBgPortal())
    bgPortalRo.observe(rootEl.value)
  }
  if (blurbEl.value && typeof ResizeObserver !== 'undefined') {
    blurbRo?.disconnect()
    blurbRo = new ResizeObserver(() => scheduleMobileBlurbBreak())
    blurbRo.observe(blurbEl.value)
  }
  void document.fonts?.ready.then(() => syncMobileBlurbBreak())
})

onBeforeUnmount(() => {
  switchTl?.kill()
  switchTl = null
  bgTl?.kill()
  bgTl = null
  heightTl?.kill()
  heightTl = null
  enterTl?.kill()
  enterTl = null
  parallaxCtx?.revert()
  parallaxCtx = null
  enterCtx?.revert()
  enterCtx = null
  bgPortalRo?.disconnect()
  bgPortalRo = null
  blurbRo?.disconnect()
  blurbRo = null
  window.removeEventListener('resize', syncBgPortal)
  window.removeEventListener('resize', refreshMobileCases)
})
</script>

<template>
  <section
    id="cases"
    ref="rootEl"
    class="home-cases pointer-events-auto relative z-10 w-full"
    :class="{
      'home-cases--inverse': activeCase?.inverse,
      'home-cases--mobile': mobileCases,
    }"
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
        <ul ref="railListEl" class="cases-rail__list">
          <li
            v-for="item in homeCases"
            :key="item.id"
          >
            <button
              type="button"
              class="cases-rail__btn"
              :class="{
                'cases-rail__btn--active': item.id === activeId,
                'cases-rail__btn--flash': item.id === activeId && hasSwitched,
              }"
              :aria-pressed="item.id === activeId"
              :aria-busy="switching"
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
        @pointerdown="onCaseStagePointerDown"
        @pointerup="onCaseStagePointerUp"
        @pointercancel="onCaseStagePointerCancel"
      >
        <div class="cases-stage__visual">
          <h2 class="cases-title">
            <a
              class="cases-title__link"
              :href="homeCaseDetailPath(activeCase)"
              :aria-label="`Открыть кейс ${activeCase.title}`"
              @click="onCaseDetailLink(activeCase, $event)"
            >
              <span class="cases-title__icon-frame" aria-hidden="true">
                <svg
                  class="cases-title__icon"
                  viewBox="0 0 32 32"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M5 5v10a6 6 0 0 0 6 6h16" />
                  <path d="m21 15 6 6-6 6" />
                </svg>
              </span>
              <span>{{ activeCase.title }}</span>
            </a>
          </h2>
          <figure
            ref="mediaEl"
            class="cases-media"
            :data-case-media="activeCase.media.src"
            :class="`cases-media--${activeCase.media.orientation ?? 'portrait'}`"
            :style="
              activeCase.media.cols && !mobileCases
                ? { width: `var(--layout-span-${activeCase.media.cols})`, maxWidth: '100%' }
                : undefined
            "
          >
            <img
              ref="mediaImgFrontEl"
              :src="activeCase.media.src"
              alt=""
              class="cases-media__img cases-media__img--ghost"
              aria-hidden="true"
              loading="eager"
              decoding="async"
              @load="onMediaLayoutReady"
            >
            <a
              class="cases-media__link"
              :href="homeCaseDetailPath(activeCase)"
              :aria-label="`Открыть кейс ${activeCase.title}`"
              @click="onCaseDetailLink(activeCase, $event)"
            ></a>
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
            <p
              ref="blurbEl"
              class="cases-blurb"
              :class="{ 'cases-blurb--natural': mobileCases && !mobileBlurbBreak }"
            >
              <span
                v-for="(line, i) in blurbLines"
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
  --cases-stage-h: calc(
    100svh + var(--layout-surface-top)
    - (var(--layout-surface-top) + var(--space-section))
    - var(--space-section)
  );
  --cases-stage-h: calc(
    100dvh + var(--layout-surface-top)
    - (var(--layout-surface-top) + var(--space-section))
    - var(--space-section)
  );
  min-height: calc(100svh + var(--layout-surface-top));
  min-height: calc(100dvh + var(--layout-surface-top));
  background: transparent;
  overflow-anchor: none;
}

.home-cases--mobile {
  /* Mobile cases grow with their copy and full-width media, not the viewport. */
  --cases-stage-h: auto;
  min-height: var(--app-screen);
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
  flex-wrap: nowrap;
  gap: 0.65rem;
  margin: 0;
  padding: 0;
  list-style: none;
  width: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.cases-rail__list::-webkit-scrollbar {
  display: none;
}

@media (min-width: 768px) {
  .cases-rail {
    /* Viewport-stage height, not the growing content row — rail stays put. */
    align-self: start;
    height: var(--cases-stage-h);
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
  border: 1px solid transparent;
  border-radius: 999px;
  background-color: color-mix(in srgb, currentColor 12%, transparent);
  color: inherit;
  font: inherit;
  font-size: var(--type-nav);
  letter-spacing: -0.02em;
  line-height: 1.2;
  cursor: pointer;
  opacity: 0.5;
  isolation: isolate;
  overflow: hidden;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition:
    background-color 0.35s var(--motion-ease, ease),
    border-color 0.35s var(--motion-ease, ease),
    color 0.35s var(--motion-ease, ease),
    opacity 0.35s var(--motion-ease, ease),
    backdrop-filter 0.35s var(--motion-ease, ease);
}

.cases-rail__btn .chip-scale-bg {
  transform: scale(0);
  transform-origin: 50% 50%;
  transition: none;
}

.cases-rail__btn .chip-scale-bg__fill {
  background-color: #ffffff;
}

.cases-rail__btn:hover:not(.cases-rail__btn--active) {
  opacity: 1;
}

.cases-rail__label {
  position: relative;
  z-index: 1;
  transition: color 0.35s var(--motion-ease, ease);
}

.cases-rail__btn--active {
  background-color: transparent;
  border-color: currentColor;
  color: inherit;
  opacity: 1;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.cases-rail__btn--active:not(.cases-rail__btn--flash) .chip-scale-bg {
  display: none;
}

.cases-rail__btn--flash .chip-scale-bg {
  animation: case-rail-scale-fade 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.cases-rail__btn--flash .cases-rail__label {
  animation: case-rail-label-contrast 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes case-rail-scale-fade {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  42% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0;
  }
}

@keyframes case-rail-label-contrast {
  0% {
    color: #0a0a0a;
  }
  42% {
    color: #0a0a0a;
  }
  100% {
    color: inherit;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cases-rail__btn--flash .chip-scale-bg,
  .cases-rail__btn--flash .cases-rail__label {
    animation: none;
  }
}

.cases-stage {
  display: flex;
  flex-direction: column;
  min-width: 0;
  align-items: stretch;
}

@media (max-width: 767.98px) {
  .cases-stage {
    touch-action: pan-y;
  }

  .cases-rail {
    position: sticky;
    top: var(--layout-header-inset);
    z-index: 2;
    align-self: start;
    width: calc(100% + var(--layout-margin-content) + var(--layout-margin-content));
    margin-left: calc(-1 * var(--layout-margin-content));
    margin-right: calc(-1 * var(--layout-margin-content));
    margin-bottom: clamp(2.75rem, 12vw, 4.5rem);
  }

  .cases-rail__list {
    gap: 0.325rem;
    padding-inline: var(--layout-margin-content);
    scroll-padding-inline: var(--layout-margin-content);
  }

  /* One mobile reading order: media → title → description → mood → role. */
  .cases-media {
    order: 1;
  }

  .cases-title {
    order: 2;
  }

  .cases-blurb {
    order: 3;
  }

  .cases-tags-motion--focus {
    order: 4;
  }

  .cases-tags-motion--role {
    order: 5;
  }

}

@media (min-width: 768px) {
  .cases-stage {
    display: grid;
    grid-template-columns: repeat(9, minmax(0, 1fr));
    column-gap: var(--layout-gutter);
    row-gap: 0;
    /* Section min-height − cases-inner fluid padding. */
    min-height: var(--cases-stage-h);
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

.cases-title__link {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  color: inherit;
  text-decoration-line: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.14em;
}

.cases-title__link > span:last-child {
  min-width: 0;
}

.cases-title__icon-frame {
  display: flex;
  flex: 0 0 auto;
  width: 0;
  margin-right: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    width 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    margin-right 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease;
}

.cases-title__icon {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  transform: translateX(-100%);
  transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (hover: hover) and (pointer: fine) {
  .cases-title__link:hover .cases-title__icon-frame,
  .cases-title__link:focus-visible .cases-title__icon-frame {
    width: 32px;
    margin-right: 0.35em;
    opacity: 1;
  }

  .cases-title__link:hover .cases-title__icon,
  .cases-title__link:focus-visible .cases-title__icon {
    transform: translateX(0);
  }
}

.cases-media {
  position: relative;
  margin: 0;
  min-width: 0;
  /* Desktop: empty pose slot — surface (z-5) shows through; photo lives inside it. */
  isolation: isolate;
  overflow: hidden;
}

.cases-media__link {
  position: absolute;
  z-index: 2;
  inset: 0;
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
  opacity: 0 !important;
  clip-path: inset(0 0 0 0) !important;
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

.cases-blurb--natural {
  display: block;
}

.cases-blurb--natural .cases-blurb__line {
  display: inline;
}

.cases-blurb--natural .cases-blurb__line + .cases-blurb__line::before {
  content: ' ';
}

@media (max-width: 767.98px) {
  .cases-rail__list > li,
  .cases-rail__btn {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .cases-aside,
  .cases-aside__top {
    gap: 0;
  }

  .cases-media {
    margin-bottom: clamp(1.5rem, 7vw, 2.5rem);
  }

  .cases-title {
    margin-bottom: 1rem;
  }

  .cases-blurb {
    margin-bottom: clamp(2.25rem, 9vw, 3.5rem);
  }

  .cases-tags-motion--focus {
    margin-bottom: 0.75rem;
  }

  .cases-tags {
    gap: 0.15rem 0.35rem;
  }
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
