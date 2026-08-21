<script setup lang="ts">
/**
 * Home cases — one viewport stage + left rail switcher.
 * Grid: full 12-column editorial stage with a compact navigation rail.
 * Desktop: figure is a pose slot; the case photo fills the Flow Surface.
 * Mobile: the figure remains the layout target; Flow Surface morphs into it.
 */
import {
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
const bgTrackEl = ref<HTMLElement | null>(null)

const stageEl = ref<HTMLElement | null>(null)
const railEl = ref<HTMLElement | null>(null)
const railListEl = ref<HTMLElement | null>(null)
const blurbEl = ref<HTMLElement | null>(null)
const gestureHintEl = ref<HTMLElement | null>(null)
/** Avoid SSR Teleport into the page-local colour host. */
const mountBgPortal = ref(false)
const mobileCases = ref(false)
const caseGestureHintSeen = useCookie<boolean>('kadoflow-case-gesture-hint-v2', {
  default: () => false,
  maxAge: 60 * 60 * 24 * 7,
  path: '/',
  sameSite: 'lax',
})
const showCaseGestureHint = computed(
  () => mobileCases.value && !caseGestureHintSeen.value,
)

const activeId = useState('home-active-case-id', () => homeCases[0]?.id ?? 'audience')
const switching = ref(false)
const caseSurfaceDocked = useState('home-case-surface-docked', () => false)
const caseSurfaceMedia = useState<{
  src: string
  alt: string
  wash: string
  video?: {
    webm: string
    mp4: string
    mobileWebm?: string
    mobileMp4?: string
    poster: string
  }
} | null>(
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

function openCaseDetailFromMedia(item: HomeCase) {
  const media = mediaEl.value
  if (!media) return
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

function onCaseDetailLink(item: HomeCase, e: MouseEvent) {
  e.preventDefault()
  openCaseDetailFromMedia(item)
}

let caseSwipeStart: { x: number; y: number; pointerId: number } | null = null
/** Prevent the synthetic link click that follows a completed horizontal swipe. */
let suppressCaseLinkClick = false
let suppressCaseLinkClickTimer = 0
const CASE_SWIPE_MIN_PX = 44

let caseGestureStart: { x: number; y: number; pointerId: number } | null = null
const CASE_GESTURE_TAP_MAX_PX = 12

function dismissCaseGestureHint() {
  caseGestureHintSeen.value = true
}

function openActiveCaseFromGesture() {
  const item = activeCase.value
  if (!item) return
  dismissCaseGestureHint()
  openCaseDetailFromMedia(item)
}

function onCaseGesturePointerDown(e: PointerEvent) {
  if (!e.isPrimary) return
  caseGestureStart = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
  if (e.currentTarget instanceof HTMLElement) {
    e.currentTarget.setPointerCapture(e.pointerId)
  }
}

function onCaseGesturePointerCancel() {
  caseGestureStart = null
}

function onCaseGesturePointerUp(e: PointerEvent) {
  const start = caseGestureStart
  caseGestureStart = null
  if (!start || start.pointerId !== e.pointerId) return

  const dx = e.clientX - start.x
  const dy = e.clientY - start.y
  const horizontalSwipe =
    Math.abs(dx) >= CASE_SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)
  const tap =
    Math.abs(dx) <= CASE_GESTURE_TAP_MAX_PX
    && Math.abs(dy) <= CASE_GESTURE_TAP_MAX_PX

  if (horizontalSwipe) {
    e.preventDefault()
    dismissCaseGestureHint()
    selectAdjacentCase(dx < 0 ? 1 : -1)
    return
  }

  if (tap) {
    e.preventDefault()
    openActiveCaseFromGesture()
  }
}

function onCaseStagePointerDown(e: PointerEvent) {
  if (!mobileCases.value || !e.isPrimary) return
  // Links remain normal tap targets. We still capture their pointer sequence so
  // a horizontal drag across either the title or the image can switch cases.
  if (e.target instanceof Element && e.target.closest('button')) return
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
  // Browsers dispatch a click after pointerup, including when the gesture began
  // on a link. Suppress that one click so the swipe does not open the case.
  e.preventDefault()
  suppressCaseLinkClick = true
  if (suppressCaseLinkClickTimer) window.clearTimeout(suppressCaseLinkClickTimer)
  suppressCaseLinkClickTimer = window.setTimeout(() => {
    suppressCaseLinkClick = false
    suppressCaseLinkClickTimer = 0
  }, 0)
  selectAdjacentCase(dx < 0 ? 1 : -1)
}

function onCaseStageClickCapture(e: MouseEvent) {
  if (!suppressCaseLinkClick) return
  suppressCaseLinkClick = false
  if (suppressCaseLinkClickTimer) window.clearTimeout(suppressCaseLinkClickTimer)
  suppressCaseLinkClickTimer = 0
  e.preventDefault()
  e.stopPropagation()
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
    wash: item.wash,
    video: item.media.video,
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
let enterCtx: { revert: () => void } | null = null
let enterTl: { kill: () => void } | null = null
let switchTl: { kill: () => void } | null = null
let bgPortalRo: ResizeObserver | null = null
let blurbRo: ResizeObserver | null = null

async function ensureGsap() {
  if (!gsapMod) gsapMod = (await import('gsap')).default
  if (!stMod) {
    const mod = await import('gsap/ScrollTrigger')
    stMod = mod.ScrollTrigger
    gsapMod.registerPlugin(stMod)
  }
  return gsapMod
}

/** Keep the colour plate under FlowSurface aligned to the cases section. */
function syncColorPlate() {
  const section = rootEl.value
  const plate = bgTrackEl.value
  if (!section || !plate) return
  const host = plate.offsetParent as HTMLElement | null
  if (!host) return
  const sectionBox = section.getBoundingClientRect()
  const hostBox = host.getBoundingClientRect()
  plate.style.top = `${sectionBox.top - hostBox.top}px`
  plate.style.height = `${sectionBox.height}px`
}

/** Copy blocks only — the media is owned by FlowSurface. */
type StageCopyParts = {
  blurb: HTMLElement | null
  all: HTMLElement[]
}

function stageCopyParts(): StageCopyParts {
  const stage = stageEl.value
  if (!stage) {
    return {
      blurb: null,
      all: [],
    }
  }
  const blurb = stage.querySelector<HTMLElement>('.cases-blurb')
  const all = [blurb].filter(
    (el): el is HTMLElement => !!el,
  )
  return { blurb, all }
}

function railAnimTargets(): HTMLElement[] {
  const rail = railEl.value
  if (!rail) return []
  return Array.from(rail.querySelectorAll<HTMLElement>('.cases-rail__list > li'))
}

const COPY_IN = {
  blurbY: 20,
  dur: 0.75,
} as const

const COPY_OUT = {
  blurbY: 16,
  dur: 0.35,
} as const

function setCopyHidden(
  gsap: typeof import('gsap').default,
  parts: StageCopyParts,
) {
  if (parts.blurb) {
    gsap.set(parts.blurb, {
      opacity: 0,
      x: 0,
      y: COPY_IN.blurbY,
      clearProps: 'visibility',
    })
  }
}

/** Description rises in after each media morph. */
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
  if (parts.blurb) {
    tl.to(
      parts.blurb,
      { opacity: 1, y: 0, duration: COPY_IN.dur, ease: 'power3.out' },
      at + 0.1,
    )
  }
}

/** Reverse of the description entrance. */
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
// The home route remounts after a case-detail return while `activeId` is kept
// in Nuxt state. Start from that persisted selection; otherwise returning from
// any non-Audience case makes the first Audience click look like a no-op.
let targetCaseId = activeId.value
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
    onComplete: () => {
      gsap.set(el, { clearProps: 'height' })
      heightTl = null
    },
  })
}

async function selectCase(item: HomeCase) {
  if (targetCaseId === item.id) return
  targetCaseId = item.id

  const gsap = await ensureGsap()

  if (prefersReduce()) {
    activeId.value = item.id
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

  // Animate old copy out before the next figure changes its dimensions.
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
  // Animate new copy in.
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
  syncColorPlate()
  const first = activeCase.value
  if (first) {
    publishSurfaceMedia(first)
  }
  await setupEnterMotion()
  scrollActiveCaseLinkIntoView('auto')
  window.addEventListener('resize', syncColorPlate, { passive: true })
  window.addEventListener('resize', refreshMobileCases, { passive: true })

  if (rootEl.value && typeof ResizeObserver !== 'undefined') {
    bgPortalRo = new ResizeObserver(syncColorPlate)
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
  if (suppressCaseLinkClickTimer) {
    window.clearTimeout(suppressCaseLinkClickTimer)
    suppressCaseLinkClickTimer = 0
  }
  switchTl?.kill()
  switchTl = null
  heightTl?.kill()
  heightTl = null
  enterTl?.kill()
  enterTl = null
  enterCtx?.revert()
  enterCtx = null
  bgPortalRo?.disconnect()
  bgPortalRo = null
  blurbRo?.disconnect()
  blurbRo = null
  window.removeEventListener('resize', syncColorPlate)
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
    <Teleport v-if="mountBgPortal" to="#home-cases-bg-host">
      <div
        ref="bgTrackEl"
        class="cases-colour-plate"
        :style="{ backgroundColor: activeCase?.wash }"
        aria-hidden="true"
      />
    </Teleport>

    <Transition name="cases-gesture-hint">
      <div
        v-if="showCaseGestureHint"
        ref="gestureHintEl"
        class="cases-gesture-hint"
        role="button"
        tabindex="0"
        aria-label="Свайпайте для перелистывания. Тапните, чтобы изучить кейс."
        @pointerdown="onCaseGesturePointerDown"
        @pointerup="onCaseGesturePointerUp"
        @pointercancel="onCaseGesturePointerCancel"
        @keydown.enter.prevent="openActiveCaseFromGesture"
        @keydown.space.prevent="openActiveCaseFromGesture"
      >
        <div class="cases-gesture-hint__content">
          <svg
            class="cases-gesture-hint__icon"
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 256 256"
            fill="none"
            aria-hidden="true"
          >
            <line x1="172" y1="56" x2="244" y2="56" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="24" />
            <polyline points="204 24 172 56 204 88" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="24" />
            <path class="cases-gesture-hint__hand" d="M60,216,34.68,174a20,20,0,0,1,34.64-20L88,184V76a20,20,0,0,1,40,0v56a20,20,0,0,1,40,0v16a20,20,0,0,1,40,0v36c0,13.84-1.75,25-4,32" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="24" />
          </svg>
          <p class="cases-gesture-hint__copy">
            <span>Свайпайте для перелистывания.</span>
            <span>Тапните, чтобы изучить кейс.</span>
          </p>
        </div>
      </div>
    </Transition>

    <div
      class="cases-inner relative z-[1] mx-auto grid w-full"
      :style="{
        maxWidth: 'var(--layout-content-max)',
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
        columnGap: 'var(--layout-gutter)',
      }"
    >
      <nav
        ref="railEl"
        class="cases-rail col-span-12 md:col-span-2 md:col-start-1 md:row-start-1"
        aria-label="Кейсы"
      >
        <ul
          ref="railListEl"
          class="cases-rail__list"
          data-lenis-prevent-horizontal
        >
          <li
            v-for="item in homeCases"
            :key="item.id"
          >
            <button
              type="button"
              class="cases-rail__btn"
              :class="{
                'cases-rail__btn--active': item.id === activeId,
              }"
              :aria-pressed="item.id === activeId"
              :aria-busy="switching"
              @click="onRailBtnClick(item)"
            >
              <span class="cases-rail__label">{{ item.label }}</span>
            </button>
          </li>
        </ul>
      </nav>

      <div
        v-if="activeCase"
        ref="stageEl"
        class="cases-stage col-span-12 md:col-span-12 md:col-start-1 md:row-start-1"
        @pointerdown="onCaseStagePointerDown"
        @pointerup="onCaseStagePointerUp"
        @pointercancel="onCaseStagePointerCancel"
        @click.capture="onCaseStageClickCapture"
      >
        <div class="cases-stage__visual">
          <figure
            ref="mediaEl"
            class="cases-media"
            :data-case-media="activeCase.media.src"
            :class="[
              `cases-media--${activeCase.media.orientation ?? 'portrait'}`,
              { 'cases-media--video': !!activeCase.media.video },
            ]"
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
  padding-inline: var(--layout-margin-content);
}

@media (min-width: 768px) {
  .cases-inner {
    padding-top: 120px;
    padding-bottom: 120px;
    padding-inline: 0;
  }
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
  display: inline-flex;
  align-items: center;
  width: auto;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: calc(var(--type-nav) * 1.5);
  letter-spacing: -0.02em;
  line-height: 1.2;
  cursor: pointer;
  opacity: 0.5;
  transition:
    color 0.35s var(--motion-ease, ease),
    opacity 0.35s var(--motion-ease, ease);
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
  opacity: 1;
}

.cases-gesture-hint {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: rgb(10 10 10 / 72%);
  color: #fff;
  cursor: pointer;
  touch-action: pan-y;
}

.cases-gesture-hint__content {
  position: sticky;
  top: 0;
  display: flex;
  min-height: var(--app-screen);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: var(--layout-margin-content);
  text-align: center;
}

.cases-gesture-hint__icon {
  display: block;
  flex: 0 0 auto;
  overflow: visible;
}

.cases-gesture-hint__hand {
  transform-box: fill-box;
  transform-origin: center;
  animation: cases-gesture-hand-swipe 1.65s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

.cases-gesture-hint__copy {
  display: flex;
  max-width: 21rem;
  flex-direction: column;
  gap: 0.2rem;
  margin: 0;
  font-size: var(--type-nav);
  letter-spacing: -0.02em;
  line-height: 1.4;
}

.cases-gesture-hint-enter-active,
.cases-gesture-hint-leave-active {
  transition: opacity 0.32s var(--motion-ease, ease);
}

.cases-gesture-hint-enter-from,
.cases-gesture-hint-leave-to {
  opacity: 0;
}

@keyframes cases-gesture-hand-swipe {
  0%,
  18% {
    transform: translate3d(7px, 0, 0) rotate(1.5deg);
  }
  58%,
  72% {
    transform: translate3d(-7px, 0, 0) rotate(-1.5deg);
  }
  100% {
    transform: translate3d(7px, 0, 0) rotate(1.5deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cases-rail__btn--flash .chip-scale-bg,
  .cases-rail__btn--flash .cases-rail__label,
  .cases-gesture-hint__hand {
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

  /* Audience: the title sits in the lower-right fifth of the mockup and
     deliberately crosses 20% of its width, instead of taking a separate row. */
  .home-cases[data-case-id='audience'] .cases-stage__visual {
    position: relative;
    display: block;
  }

  .home-cases[data-case-id='audience'] .cases-stage {
    grid-template-rows: minmax(0, 1fr) auto;
    row-gap: clamp(2rem, 4vw, 3.5rem);
  }

  .home-cases[data-case-id='audience'] .cases-title {
    position: absolute;
    z-index: 3;
    bottom: 20%;
    left: calc(var(--layout-span-4) * 0.8);
    white-space: nowrap;
  }

  /* Audience metadata has its own lower line after the visual and blurb. */
  .home-cases[data-case-id='audience'] .cases-aside,
  .home-cases[data-case-id='audience'] .cases-aside__top {
    display: contents;
  }

  .home-cases[data-case-id='audience'] .cases-tags-motion--focus {
    grid-column: 1 / span 4;
    grid-row: 2;
    justify-self: start;
  }

  .home-cases[data-case-id='audience'] .cases-tags-motion--focus .cases-tags {
    justify-content: flex-start;
    text-align: left;
  }

  .home-cases[data-case-id='audience'] .cases-tags-motion--role {
    grid-column: 6 / -1;
    grid-row: 2;
    justify-self: end;
  }

  .home-cases[data-case-id='audience'] .cases-blurb {
    grid-column: 6 / -1;
    grid-row: 1;
    align-self: end;
    width: 100%;
  }

  /* Keys Store uses the right side as one reading column. The tag rows keep
     the same right alignment as Audience, with deliberate space between each
     editorial block rather than overlapping the product frame. */
  .home-cases[data-case-id='keys-store'] .cases-stage {
    align-items: start;
  }

  .home-cases[data-case-id='keys-store'] .cases-stage__visual,
  .home-cases[data-case-id='keys-store'] .cases-aside,
  .home-cases[data-case-id='keys-store'] .cases-aside__top {
    display: contents;
  }

  .home-cases[data-case-id='keys-store'] .cases-tags-motion--focus {
    grid-column: 6 / -1;
    grid-row: 1;
    margin-bottom: clamp(1.5rem, 3vw, 2.5rem);
  }

  .home-cases[data-case-id='keys-store'] .cases-media {
    grid-column: 2 / span 5;
    grid-row: 2;
    align-self: start;
  }

  .home-cases[data-case-id='keys-store'] .cases-title {
    grid-column: 1 / span 4;
    grid-row: 3;
    width: 100%;
    margin-top: clamp(1.5rem, 3vw, 2.5rem);
    justify-self: start;
    text-align: left;
  }

  .home-cases[data-case-id='keys-store'] .cases-blurb {
    grid-column: 7 / -1;
    grid-row: 1;
    width: 100%;
    margin-top: clamp(4rem, 8vw, 7rem);
    justify-self: start;
    text-align: left;
  }

  .home-cases[data-case-id='keys-store'] .cases-tags-motion--role {
    grid-column: 6 / -1;
    grid-row: 5;
    margin-top: clamp(2.5rem, 5vw, 5rem);
  }

  /* Baltika Brew: product at the centre, with the text balanced against the
     upper and lower fifths of its square frame. */
  .home-cases[data-case-id='baltika'] .cases-stage {
    --baltika-media-size: calc(
      (var(--layout-span-5) - 4 * var(--layout-gutter)) * 0.8
      + 3 * var(--layout-gutter)
    );
    min-height: max(var(--cases-stage-h), var(--layout-span-5));
    grid-template-rows: var(--layout-span-5) auto;
    align-items: stretch;
  }

  .home-cases[data-case-id='baltika'] .cases-stage__visual,
  .home-cases[data-case-id='baltika'] .cases-aside,
  .home-cases[data-case-id='baltika'] .cases-aside__top {
    display: contents;
  }

  .home-cases[data-case-id='baltika'] .cases-media {
    grid-column: 3 / span 5;
    grid-row: 1;
    align-self: start;
    justify-self: center;
    width: var(--baltika-media-size);
  }

  .home-cases[data-case-id='baltika'] .cases-title {
    grid-column: 1 / span 2;
    grid-row: 1;
    align-self: start;
    margin-top: calc(var(--baltika-media-size) * 0.2);
  }

  .home-cases[data-case-id='baltika'] .cases-blurb {
    grid-column: 8 / -1;
    grid-row: 1;
    align-self: end;
    margin-bottom: calc(
      var(--layout-span-5) * 0.2 + var(--layout-gutter) * 0.65
    );
  }

  .home-cases[data-case-id='baltika'] .cases-tags-motion--focus {
    grid-column: 8 / -1;
    grid-row: 1;
    align-self: start;
    justify-self: end;
    width: min(18rem, 100vw);
  }

  .home-cases[data-case-id='baltika'] .cases-tags-motion--role {
    grid-column: 8 / -1;
    grid-row: 2;
    justify-self: end;
    width: min(18rem, 100vw);
    margin-top: clamp(2.5rem, 5vw, 5rem);
  }

  /* SCHMIDT: an expanded image plane, with the headline and the supporting
     copy set as two independent reading columns above it. */
  .home-cases[data-case-id='schmidt'] .cases-stage__visual,
  .home-cases[data-case-id='schmidt'] .cases-aside,
  .home-cases[data-case-id='schmidt'] .cases-aside__top {
    display: contents;
  }

  .home-cases[data-case-id='schmidt'] .cases-title {
    grid-column: 1 / span 3;
    grid-row: 1;
    align-self: start;
  }

  .home-cases[data-case-id='schmidt'] .cases-media {
    grid-column: 1 / span 6;
    grid-row: 2;
    align-self: start;
    margin-top: clamp(1.5rem, 3vw, 2.5rem);
  }

  .home-cases[data-case-id='schmidt'] .cases-tags-motion--focus {
    grid-column: 6 / -1;
    grid-row: 1;
    align-self: start;
  }

  .home-cases[data-case-id='schmidt'] .cases-blurb {
    grid-column: 6 / -1;
    grid-row: 1;
    align-self: start;
    margin-top: clamp(4rem, 8vw, 7rem);
  }

  .home-cases[data-case-id='schmidt'] .cases-tags-motion--role {
    grid-column: 6 / -1;
    grid-row: 2;
    align-self: end;
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

/* Baltika's motion asset is square. Give its measured surface a square pose,
   so the video can span the full width without sacrificing its top or bottom. */
.cases-media--video {
  aspect-ratio: 1;
}

.cases-media--video .cases-media__img {
  height: 100%;
  object-fit: cover;
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
  font-weight: 300;
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

/* Editorial case poses. Navigation and media share one 12-column field. */
@media (min-width: 768px) {
  .cases-inner {
    min-height: calc(100svh + var(--layout-surface-top));
    min-height: calc(100dvh + var(--layout-surface-top));
    box-sizing: border-box;
    align-items: center;
  }

  .cases-rail {
    position: sticky;
    top: 50svh;
    z-index: 2;
    height: auto;
    align-self: start;
    transform: translateY(-50%);
    pointer-events: auto;
  }

  .cases-stage {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    grid-template-rows: auto auto;
    min-height: 0;
    align-self: center;
  }

  .home-cases[data-case-id] .cases-stage {
    grid-template-rows: auto auto;
    row-gap: 0;
    min-height: 0;
  }

  .cases-stage__visual,
  .cases-aside {
    display: contents;
  }

  .home-cases[data-case-id='audience'] .cases-stage__visual {
    display: contents;
  }

  .cases-media {
    grid-row: 1;
    align-self: start;
    margin: 0;
  }

  .cases-blurb {
    grid-row: 1;
    z-index: 1;
    width: 100%;
    margin: 0;
  }

  .home-cases[data-case-id='audience'] .cases-media { grid-column: 7 / span 5; }
  .home-cases[data-case-id='audience'] .cases-blurb {
    grid-column: 9 / span 3;
    align-self: end;
    margin-bottom: calc(var(--space-block) * 0.68);
  }

  .home-cases[data-case-id='keys-store'] .cases-media {
    grid-column: 4 / span 7;
    grid-row: 1;
    margin-top: 0;
  }
  .home-cases[data-case-id='keys-store'] .cases-blurb {
    grid-column: 5 / span 3;
    grid-row: 2;
    align-self: start;
    margin-top: clamp(2rem, 2.1vw, 2.5rem);
  }

  .home-cases[data-case-id='baltika'] .cases-media {
    grid-column: 8 / span 5;
    justify-self: end;
  }
  .home-cases[data-case-id='baltika'] .cases-blurb {
    grid-column: 4 / span 3;
    align-self: end;
    margin-bottom: 0;
  }

  .home-cases[data-case-id='schmidt'] .cases-media {
    grid-column: 4 / span 8;
    grid-row: 1;
    margin-top: 0;
  }
  .home-cases[data-case-id='schmidt'] .cases-blurb {
    grid-column: 8 / span 3;
    grid-row: 2;
    align-self: start;
    margin-top: clamp(2rem, 2.1vw, 2.5rem);
  }
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

<!-- Colour is below FlowSurface; only the colour itself transitions. -->
<style>
.cases-colour-plate {
  position: absolute;
  left: 0;
  width: 100%;
  transition: background-color 0.72s cubic-bezier(0.65, 0.045, 0.355, 1);
  pointer-events: none;
}
</style>
