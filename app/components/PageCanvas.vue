<script setup lang="ts">
import { canvasFrames, matchFramePath, type SiteNavFrame } from '~/utils/siteNav'
import { isNarrowViewport, isThumbNav } from '~/utils/mobileViewport'
import { preloadHomeSceneAssets } from '~/utils/preloadHomeMotion'
import {
  applyIrisClip,
  clearIrisClip,
  irisCoverFrom,
  irisGeomFromBox,
  viewportIrisBox,
  IRIS_CLOSE_EASE,
  IRIS_CLOSE_S,
  IRIS_OPEN_EASE,
  IRIS_OPEN_S,
  type IrisGeom,
} from '~/utils/irisClip'
import { CHIP_FIT_EASE, CHIP_FIT_S } from '~/utils/chipFit'
import { setChipBgOrigin } from '~/utils/chipHoverBg'

const {
  open,
  busy,
  surfaceOn,
  navHopActive,
  heroGlRevealBusy,
  skipHeroIntro,
  waitForHeroSwarm,
  requestHeroGlPrewarm,
  closeCanvas,
  restoreFabLabel,
  fabLabelOn,
  irisLive,
  pageIrisLive,
} = usePageCanvas()
const { suppressed: siteCursorOff } = useSiteCursor()
const route = useRoute()
const router = useRouter()

const rootEl = ref<HTMLElement | null>(null)
const maskEl = ref<HTMLElement | null>(null)
const navEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const deskEl = ref<HTMLElement | null>(null)
const goEl = ref<HTMLElement | null>(null)
const goCircleEl = ref<HTMLElement | null>(null)
const goWordEl = ref<HTMLElement | null>(null)

let lastFocus: HTMLElement | null = null
let savedScrollY = 0
let navFromCanvas = false

const shownCurrentId = ref(matchFramePath(route.path))
const reducedMotion = ref(false)
const isNarrow = ref(false)
const isThumb = ref(false)
if (import.meta.client) {
  isNarrow.value = isNarrowViewport()
  isThumb.value = isThumbNav()
}

const NAV_DRAW_S = 0.44
const NAV_FLAT_S = 0.224
const NAV_LEAVE_AMP_S = 0.144
const NAV_LEAVE_WIPE_S = 0.24
const NAV_LEAVE_WIPE_DELAY = 0.048
const NAV_WAVE_AMP = 3.4
const NAV_WAVE_VB_W = 64
const PLAQUE_IMG_S = 0.52
const PLAQUE_TXT_S = 0.44
const PLAQUE_STAGGER = 0.055

let gsapMod: typeof import('gsap').default | null = null
let motionGen = 0
let mailWaveTl: { kill: () => void } | null = null
let mailWaveAmp = 0
let irisTween: { kill: () => void } | null = null
let irisResolve: (() => void) | null = null
let enterTl: { kill: () => void } | null = null
let wordTween: { kill: () => void } | null = null
let dotsTween: { kill: () => void } | null = null
let goTl: { kill: () => void } | null = null
let goFollow = false
let goState: 'off' | 'in' | 'on' | 'out' = 'off'
let goPressed = false
let goPressAt = 0
let goReleaseTimer = 0
const GO_PRESS_SCALE = 0.84
const GO_PRESS_MS = 160

function killIris() {
  irisTween?.kill()
  irisTween = null
  const resolve = irisResolve
  irisResolve = null
  resolve?.()
  const clipRoot = irisClipEl()
  if (clipRoot) clipRoot.style.willChange = ''
}

function killActiveMotion() {
  hideGoCursor(true)
  killIris()
  enterTl?.kill()
  enterTl = null
  wordTween?.kill()
  wordTween = null
  dotsTween?.kill()
  dotsTween = null
  const scroller = navScrollRoot()
  if (scroller && gsapMod) gsapMod.killTweensOf(scroller)
  const chip = menuChip()
  const btn = menuButtonEl()
  if (gsapMod && chip?.dots) gsapMod.killTweensOf(chip.dots)
  if (gsapMod && chip?.word) gsapMod.killTweensOf(chip.word)
  if (gsapMod && chip?.track) gsapMod.killTweensOf(chip.track)
  if (gsapMod && btn) gsapMod.killTweensOf(btn)
}

function onShotError(e: Event) {
  const img = e.target as HTMLImageElement
  const color = img.getAttribute('data-color')
  if (color && img.src !== color) img.src = color
}

async function gsap() {
  if (!gsapMod) gsapMod = (await import('gsap')).default
  return gsapMod
}

function menuButtonEl() {
  if (typeof window === 'undefined') return null
  if (isThumb.value) {
    return document.querySelector('.menu-fab') as HTMLElement | null
  }
  return document.querySelector('.menu-btn--float') as HTMLElement | null
}

function menuChip() {
  const btn = menuButtonEl()
  if (!btn) return null
  return {
    word: btn.querySelector('.menu-chip-word') as HTMLElement | null,
    track: btn.querySelector('.menu-chip-track') as HTMLElement | null,
    dots: btn.querySelector('.menu-dots') as HTMLElement | null,
    sizerMenu: btn.querySelector('.menu-sizer-menu') as HTMLElement | null,
    sizerBack: btn.querySelector('.menu-sizer-back') as HTMLElement | null,
  }
}

function irisFallback(container: { width: number; height: number }) {
  return {
    w: 96,
    h: 40,
    cx: container.width - 56,
    cy: isThumb.value ? container.height - 56 : 36,
  }
}

function irisButtonGeom(): IrisGeom {
  const root = rootEl.value
  const canvas = root?.getBoundingClientRect()
  const laidOut = !!canvas && canvas.width > 1 && canvas.height > 1
  const container = laidOut
    ? {
        left: canvas.left,
        top: canvas.top,
        width: canvas.width,
        height: canvas.height,
      }
    : viewportIrisBox()
  const el = menuButtonEl()
  return irisGeomFromBox(
    el?.getBoundingClientRect() ?? null,
    container,
    irisFallback(container),
  )
}

/** Chip rect at tap — viewport coords match the fullscreen canvas (`inset: 0`). */
function captureMenuPill(): IrisGeom {
  const view = viewportIrisBox()
  const el = menuButtonEl()
  return irisGeomFromBox(
    el?.getBoundingClientRect() ?? null,
    view,
    irisFallback(view),
  )
}

function irisClipEl() {
  return rootEl.value
}

/** GL / scroll guard for menu→home hop — no PageIris visual layer on top. */
function setPageIrisGuard(on: boolean) {
  pageIrisLive.value = on
  document.documentElement.classList.toggle('page-iris-lock', on)
}

async function tweenIris(opts: {
  dir: 'open' | 'close'
  pill: IrisGeom
  followMenu?: boolean
}) {
  const clipRoot = irisClipEl()
  if (!clipRoot) return
  const g = gsapMod ?? (await gsap())
  killIris()
  const seed = opts.pill
  const cover = irisCoverFrom(seed).w
  const proxy = { t: opts.dir === 'open' ? 0 : 1 }

  const paint = () => {
    const origin = opts.dir === 'open' || !opts.followMenu ? seed : irisButtonGeom()
    const r0 = Math.min(origin.w, origin.h) / 2
    applyIrisClip(clipRoot, {
      ...origin,
      w: origin.w + (cover - origin.w) * proxy.t,
      h: origin.h + (cover - origin.h) * proxy.t,
      r: r0 + (cover / 2 - r0) * proxy.t,
    })
  }

  paint()
  clipRoot.style.willChange = 'clip-path'
  await new Promise<void>((resolve) => {
    irisResolve = resolve
    irisTween = g.to(proxy, {
      t: opts.dir === 'open' ? 1 : 0,
      duration: opts.dir === 'open' ? IRIS_OPEN_S : IRIS_CLOSE_S,
      ease: opts.dir === 'open' ? IRIS_OPEN_EASE : IRIS_CLOSE_EASE,
      overwrite: true,
      onUpdate: () => {
        paint()
        if (opts.followMenu) syncNavChrome()
      },
      onComplete: () => {
        irisTween = null
        clipRoot.style.willChange = ''
        const done = irisResolve
        irisResolve = null
        done?.()
      },
    })
  })
}

function showCanvasSurface() {
  document.documentElement.classList.add('page-canvas-surface')
  resetNavVisibility()
  const root = rootEl.value
  if (root) {
    root.style.display = ''
    root.style.opacity = ''
    root.style.visibility = ''
    root.style.pointerEvents = ''
  }
  surfaceOn.value = true
}

function hideCanvasSurface() {
  stopNavChromeTrack()
  restoreFabLabel()
  resetNavVisibility()
  const root = rootEl.value
  const clipRoot = irisClipEl()
  if (root) {
    // Hide before unclip — otherwise one frame of full overlay after the disc.
    root.style.display = 'none'
    if (clipRoot) clearIrisClip(clipRoot)
    resetEnterProps()
    clearBackSlot()
    root.classList.remove('page-canvas--surface', 'page-canvas--open', 'page-canvas--iris')
    root.style.opacity = ''
    root.style.visibility = ''
    root.style.pointerEvents = ''
  }
  surfaceOn.value = false
  setIrisLive(false)
  document.documentElement.classList.remove(
    'page-canvas-surface',
    'page-canvas-iris',
  )
  hideGoCursor(true)
}

function frameIsCurrent(frame: SiteNavFrame) {
  return frame.id === shownCurrentId.value
}

function frameShot(frame: SiteNavFrame, tone: 'color' | 'bw') {
  return tone === 'bw' ? frame.previewBw : frame.preview
}

function setIrisLive(on: boolean) {
  document.documentElement.classList.toggle('page-canvas-iris', on)
  rootEl.value?.classList.toggle('page-canvas--iris', on)
  irisLive.value = on
}

function clearBackSlot() {
  const root = rootEl.value
  if (!root) return
  root.style.removeProperty('--pc-inset-top')
  root.style.removeProperty('--pc-inset-right')
  root.style.removeProperty('--pc-inset-bottom')
  root.style.removeProperty('--pc-inset-left')
  root.style.removeProperty('--pc-close-h')
  root.style.removeProperty('--pc-lead-h')
}

function setNavInset(
  root: HTMLElement,
  name:
    | '--pc-inset-top'
    | '--pc-inset-right'
    | '--pc-inset-bottom'
    | '--pc-inset-left'
    | '--pc-close-h'
    | '--pc-lead-h',
  px: number,
) {
  root.style.setProperty(name, `${Math.max(0, Math.round(px))}px`)
}

function syncNavChrome() {
  const root = rootEl.value
  if (!root || typeof window === 'undefined') return

  const vw = window.innerWidth
  const vh = window.innerHeight
  const menu = menuButtonEl()
  const logo = document.querySelector('.header-logo-link') as HTMLElement | null

  if (menu) {
    const box = menu.getBoundingClientRect()
    const right = vw - box.right
    setNavInset(root, '--pc-inset-right', right)
    setNavInset(root, '--pc-close-h', box.height)
    if (isThumb.value) {
      setNavInset(root, '--pc-inset-bottom', vh - box.bottom)
      setNavInset(root, '--pc-inset-left', right)
    } else {
      setNavInset(root, '--pc-inset-top', box.top)
    }
  }

  if (logo) {
    const box = logo.getBoundingClientRect()
    if (isThumb.value) setNavInset(root, '--pc-inset-top', box.top)
    else setNavInset(root, '--pc-inset-left', box.left)
  } else if (menu && !isThumb.value) {
    setNavInset(root, '--pc-inset-left', menu.getBoundingClientRect().left)
  }

  if (isThumb.value) {
    const lead = root.querySelector('.page-canvas__chrome-lead') as HTMLElement | null
    if (lead) setNavInset(root, '--pc-lead-h', lead.getBoundingClientRect().height)
  }
}

function syncFrameAspect() {
  const root = rootEl.value
  if (!root || typeof window === 'undefined') return
  const vw = Math.max(1, window.innerWidth)
  const vh = Math.max(1, window.innerHeight)
  root.style.setProperty('--pc-aspect', String(vw / vh))
  if (surfaceOn.value) syncNavChrome()
}

let navChromeRaf = 0
function startNavChromeTrack() {
  stopNavChromeTrack()
  const step = () => {
    syncNavChrome()
    navChromeRaf = requestAnimationFrame(step)
  }
  navChromeRaf = requestAnimationFrame(step)
}
function stopNavChromeTrack() {
  if (!navChromeRaf) return
  cancelAnimationFrame(navChromeRaf)
  navChromeRaf = 0
}

function lockScroll(lock: boolean, restoreY = savedScrollY) {
  const html = document.documentElement
  const body = document.body
  if (lock) {
    html.classList.add('page-canvas-lock')
    return
  }
  html.classList.remove('page-canvas-lock')
  // Legacy: older sessions may still have body fixed from a prior build.
  if (body.style.position === 'fixed') {
    body.style.position = ''
    body.style.top = ''
    body.style.left = ''
    body.style.right = ''
    body.style.width = ''
    window.scrollTo(0, restoreY)
    return
  }
  if (Math.abs(window.scrollY - restoreY) > 2) {
    window.scrollTo(0, restoreY)
  }
}

function frameButton(id: string) {
  return rootEl.value?.querySelector(
    `.pc-frame[data-frame-id="${id}"]`,
  ) as HTMLElement | null
}

function navScrollRoot() {
  return isNarrow.value ? deskEl.value : stageEl.value
}

function frameScrollTargets(frameId: string) {
  const frame = frameButton(frameId)
  const scroller = navScrollRoot()
  if (!frame || !scroller) return null

  if (isNarrow.value) {
    return {
      scroller,
      left: Math.max(
        0,
        frame.offsetLeft - (scroller.clientWidth - frame.offsetWidth) / 2,
      ),
      top: scroller.scrollTop,
    }
  }

  const frameRect = frame.getBoundingClientRect()
  const box = scroller.getBoundingClientRect()
  const delta =
    frameRect.top + frameRect.height / 2 - (box.top + box.height / 2)
  return {
    scroller,
    left: scroller.scrollLeft,
    top: Math.max(0, scroller.scrollTop + delta),
  }
}

async function ensureFrameCentered(
  frameId: string,
  behavior: ScrollBehavior,
  gen?: number,
) {
  const targets = frameScrollTargets(frameId)
  if (!targets) return
  const { scroller, left, top } = targets
  const dx = Math.abs(left - scroller.scrollLeft)
  const dy = Math.abs(top - scroller.scrollTop)
  const minDelta = isNarrow.value
    ? Math.max(10, scroller.clientWidth * 0.03)
    : Math.max(10, scroller.clientHeight * 0.03)
  if (dx < minDelta && dy < minDelta) return

  const smooth = behavior === 'smooth' && !reducedMotion.value
  if (!smooth) {
    scroller.scrollLeft = left
    scroller.scrollTop = top
    await nextTick()
    return
  }

  const dist = Math.hypot(dx, dy)
  const durMs = Math.min(850, Math.max(420, dist * 0.55))
  const startLeft = scroller.scrollLeft
  const startTop = scroller.scrollTop
  const t0 = performance.now()

  await new Promise<void>((resolve) => {
    let raf = 0
    const step = (now: number) => {
      if (gen != null && gen !== motionGen) {
        cancelAnimationFrame(raf)
        resolve()
        return
      }
      const u = Math.min(1, (now - t0) / durMs)
      const e = u * u * (3 - 2 * u)
      scroller.scrollLeft = startLeft + (left - startLeft) * e
      scroller.scrollTop = startTop + (top - startTop) * e
      if (u < 1) raf = requestAnimationFrame(step)
      else resolve()
    }
    raf = requestAnimationFrame(step)
  })
}

function canUseGoCursor() {
  if (isNarrow.value) return false
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: fine)').matches
}

function setGoPos(x: number, y: number) {
  const el = goEl.value
  if (!el) return
  el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
}

function onGoWindowMove(e: PointerEvent) {
  if (!goFollow) return
  setGoPos(e.clientX, e.clientY)
}

function startGoFollow() {
  if (goFollow) return
  goFollow = true
  siteCursorOff.value = true
  window.addEventListener('pointermove', onGoWindowMove, { passive: true })
}

function stopGoFollow() {
  goFollow = false
  siteCursorOff.value = false
  window.removeEventListener('pointermove', onGoWindowMove)
}

function snapGoOff() {
  goTl?.kill()
  goTl = null
  goState = 'off'
  goPressed = false
  if (goReleaseTimer) {
    window.clearTimeout(goReleaseTimer)
    goReleaseTimer = 0
  }
  stopGoFollow()
  clearGoPressListeners()
  if (!gsapMod) return
  if (goCircleEl.value) gsapMod.set(goCircleEl.value, { scale: 0 })
  if (goWordEl.value) gsapMod.set(goWordEl.value, { opacity: 0 })
}

function showGoCursor(x: number, y: number) {
  if (!canUseGoCursor()) return
  setGoPos(x, y)
  startGoFollow()
  if (goState === 'in' || goState === 'on') return
  goState = 'in'
  void playGoIn()
}

async function playGoIn() {
  const g = await gsap()
  const circle = goCircleEl.value
  const word = goWordEl.value
  if (goState !== 'in' || !circle || !word) return
  goTl?.kill()
  g.killTweensOf(circle)
  const land = goPressed ? GO_PRESS_SCALE : 1
  if (reducedMotion.value) {
    g.set(circle, { scale: land })
    g.set(word, { opacity: 1 })
    goState = 'on'
    goTl = null
    return
  }
  const tl = g.timeline({
    onComplete: () => {
      if (goState === 'in') goState = 'on'
      goTl = null
    },
  })
  goTl = tl
  tl.to(circle, { scale: land, duration: 0.3, ease: 'power2.out', force3D: true }, 0)
  tl.to(word, { opacity: 1, duration: 0.2, ease: 'power2.out' }, 0.22)
}

function hideGoCursor(instant = false) {
  if (goState === 'off' && !goFollow) return
  /* Leave animation already running — don't snap it on plaque click / close. */
  if (goState === 'out') return
  if (instant || reducedMotion.value || !gsapMod || !goCircleEl.value || !goWordEl.value) {
    snapGoOff()
    return
  }
  goState = 'out'
  goPressed = false
  if (goReleaseTimer) {
    window.clearTimeout(goReleaseTimer)
    goReleaseTimer = 0
  }
  clearGoPressListeners()
  goTl?.kill()
  const circle = goCircleEl.value
  const word = goWordEl.value
  gsapMod.killTweensOf(circle)
  const tl = gsapMod.timeline({
    onComplete: () => {
      if (goState !== 'out') return
      goState = 'off'
      stopGoFollow()
      goTl = null
    },
  })
  goTl = tl
  tl.to(word, { opacity: 0, duration: 0.14, ease: 'power1.out' }, 0)
  tl.to(
    circle,
    { scale: 0, duration: 0.24, ease: 'power2.in', force3D: true },
    0.14,
  )
}

function clearGoPressListeners() {
  window.removeEventListener('pointerup', onGoPressUp)
  window.removeEventListener('pointercancel', onGoPressUp)
}

function pressGoCursor() {
  if (goState !== 'in' && goState !== 'on') return
  goPressed = true
  goPressAt = performance.now()
  if (goReleaseTimer) {
    window.clearTimeout(goReleaseTimer)
    goReleaseTimer = 0
  }
  const circle = goCircleEl.value
  if (!gsapMod || !circle) return
  gsapMod.to(circle, {
    scale: GO_PRESS_SCALE,
    duration: GO_PRESS_MS / 1000,
    ease: 'power2.out',
    overwrite: 'auto',
    force3D: true,
  })
}

function releaseGoCursor() {
  if (!goPressed && !goReleaseTimer) return
  const wait = Math.max(0, GO_PRESS_MS - (performance.now() - goPressAt))
  const run = () => {
    goReleaseTimer = 0
    goPressed = false
    if (goState !== 'in' && goState !== 'on') return
    const circle = goCircleEl.value
    if (!gsapMod || !circle) return
    gsapMod.to(circle, {
      scale: 1,
      duration: 0.18,
      ease: 'power2.out',
      overwrite: 'auto',
      force3D: true,
    })
  }
  if (goReleaseTimer) window.clearTimeout(goReleaseTimer)
  if (wait > 0) goReleaseTimer = window.setTimeout(run, wait)
  else run()
}

function onGoPressDown(e: PointerEvent) {
  if (e.button !== 0) return
  const frame = e.currentTarget
  if (frame instanceof HTMLElement) {
    const bg = frame.querySelector('.pc-frame__hover-bg')
    if (bg instanceof HTMLElement) setChipBgOrigin(bg, e)
  }
  if (e.pointerType === 'touch') return
  if (!canUseGoCursor()) return
  clearGoPressListeners()
  pressGoCursor()
  window.addEventListener('pointerup', onGoPressUp)
  window.addEventListener('pointercancel', onGoPressUp)
}

function onGoPressUp() {
  clearGoPressListeners()
  releaseGoCursor()
}

function onFramePointer(e: PointerEvent) {
  const frame = e.currentTarget
  if (!(frame instanceof HTMLElement)) return
  const bg = frame.querySelector('.pc-frame__hover-bg')
  if (bg instanceof HTMLElement) setChipBgOrigin(bg, e)
}

function plaqueSheets() {
  return rootEl.value?.querySelectorAll('.pc-frame__sheet') ?? []
}

function plaqueMetas() {
  return rootEl.value?.querySelectorAll('.pc-frame__meta') ?? []
}

function resetEnterProps() {
  if (!gsapMod) return
  const sheets = plaqueSheets()
  const metas = plaqueMetas()
  if (sheets.length) {
    gsapMod.set(sheets, { clearProps: 'opacity,visibility,transform' })
  }
  if (metas.length) {
    gsapMod.set(metas, { clearProps: 'opacity,visibility,transform' })
  }
  const chip = menuChip()
  if (chip?.track) gsapMod.set(chip.track, { yPercent: 0 })
  if (chip?.dots) gsapMod.set(chip.dots, { clearProps: 'transform' })
  const menuW = chip?.sizerMenu?.scrollWidth ?? 0
  if (chip?.word && menuW) gsapMod.set(chip.word, { width: menuW })
}

function measureCloseWord(to: 'menu' | 'back') {
  const chip = menuChip()
  const el = to === 'menu' ? chip?.sizerMenu : chip?.sizerBack
  return Math.ceil(el?.scrollWidth ?? 0)
}

function swapCloseWord(to: 'menu' | 'back', instant = false) {
  const chip = menuChip()
  const track = chip?.track
  const box = chip?.word
  const btn = menuButtonEl()
  const fab = btn?.classList.contains('menu-fab') ? btn : null
  if (!gsapMod) return
  wordTween?.kill()
  wordTween = null
  const snap = instant || reducedMotion.value
  const yPercent = to === 'menu' ? 0 : -50
  const w = measureCloseWord(to)
  const fabPad = 24
  if (snap) {
    if (track) gsapMod.set(track, { yPercent })
    if (box && w) gsapMod.set(box, { width: w })
    if (fab) gsapMod.set(fab, { paddingLeft: fabPad, paddingRight: fabPad, gap: 8 })
    return
  }
  const expanding = to === 'back'
  const ease = expanding ? 'power3.out' : CHIP_FIT_EASE
  const tl = gsapMod.timeline({
    onComplete: () => {
      wordTween = null
    },
  })
  wordTween = tl
  if (box && w) {
    tl.to(
      box,
      { width: w, duration: CHIP_FIT_S, ease, overwrite: true },
      0,
    )
  }
  if (track) {
    tl.to(
      track,
      {
        yPercent,
        duration: CHIP_FIT_S * (expanding ? 0.62 : 0.72),
        ease: expanding ? 'power3.out' : CHIP_FIT_EASE,
        overwrite: true,
      },
      0,
    )
  }
  if (fab) {
    tl.to(
      fab,
      {
        paddingLeft: fabPad,
        paddingRight: fabPad,
        gap: 8,
        duration: CHIP_FIT_S,
        ease,
        overwrite: true,
      },
      0,
    )
  }
}

function spinCloseDots(up: boolean, instant = false) {
  const el = menuChip()?.dots
  if (!el || !gsapMod) return
  dotsTween?.kill()
  dotsTween = null
  const rotation = up ? 90 : 0
  if (instant || reducedMotion.value) {
    gsapMod.set(el, { rotation })
    return
  }
  dotsTween = gsapMod.to(el, {
    rotation,
    duration: CHIP_FIT_S,
    ease: up ? 'power3.out' : CHIP_FIT_EASE,
    overwrite: true,
    onComplete: () => {
      dotsTween = null
    },
  })
}

function resetNavVisibility() {
  const nav = navEl.value
  if (nav && gsapMod) gsapMod.set(nav, { clearProps: 'opacity,visibility' })
}

async function playPlaqueEnter() {
  const g = await gsap()
  const sheets = plaqueSheets()
  const metas = plaqueMetas()
  enterTl?.kill()
  if (!sheets.length) return
  g.set(sheets, { autoAlpha: 0, y: 28, scale: 0.97 })
  if (metas.length) g.set(metas, { autoAlpha: 0, y: 16 })
  if (reducedMotion.value) {
    g.set(sheets, { autoAlpha: 1, y: 0, scale: 1 })
    if (metas.length) g.set(metas, { autoAlpha: 1, y: 0 })
    return
  }
  const tl = g.timeline()
  enterTl = tl
  tl.to(
    sheets,
    {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: PLAQUE_IMG_S,
      stagger: PLAQUE_STAGGER,
      ease: 'power3.out',
    },
    0.18,
  )
  if (metas.length) {
    tl.to(
      metas,
      {
        autoAlpha: 1,
        y: 0,
        duration: PLAQUE_TXT_S,
        stagger: PLAQUE_STAGGER,
        ease: 'power3.out',
      },
      0.32,
    )
  }
}

function onSheetEnter(e: PointerEvent) {
  if (e.pointerType === 'touch') return
  if (!open.value) return
  if (canUseGoCursor()) showGoCursor(e.clientX, e.clientY)
}

function onSheetMove(e: PointerEvent) {
  if (!goFollow) return
  setGoPos(e.clientX, e.clientY)
}

function onSheetLeave(e: PointerEvent) {
  const sheet = e.currentTarget as HTMLElement
  const next = e.relatedTarget
  if (next instanceof Element && sheet.contains(next)) return
  const toOtherSheet =
    next instanceof Element && !!next.closest('.pc-frame__sheet')
  if (!toOtherSheet) hideGoCursor()
}

function mailWavePath(amp: number) {
  const a = Math.max(0, amp)
  return `M1 4 Q 12 ${4 - a} 23 4 Q 34 ${4 + a} 45 4 Q 54 ${4 - a * 0.65} 63 4`
}

function mailWaveParts() {
  const root = rootEl.value
  if (!root) return null
  const path = root.querySelector('.page-canvas__mail-wave-path') as SVGPathElement | null
  const reveal = root.querySelector('.page-canvas__mail-reveal') as SVGRectElement | null
  if (!path || !reveal) return null
  return { path, reveal }
}

async function onMailEnter() {
  const parts = mailWaveParts()
  if (!parts) return
  const { path, reveal } = parts
  if (reducedMotion.value) {
    mailWaveAmp = 0
    path.setAttribute('d', mailWavePath(0))
    reveal.setAttribute('x', '0')
    reveal.setAttribute('width', String(NAV_WAVE_VB_W))
    return
  }
  const g = await gsap()
  mailWaveTl?.kill()
  const morph = { amp: NAV_WAVE_AMP }
  mailWaveAmp = NAV_WAVE_AMP
  path.setAttribute('d', mailWavePath(NAV_WAVE_AMP))
  g.set(reveal, { attr: { x: 0, width: 0 } })
  const tl = g.timeline()
  mailWaveTl = tl
  tl.to(reveal, {
    attr: { width: NAV_WAVE_VB_W },
    duration: NAV_DRAW_S,
    ease: 'none',
  })
  tl.to(morph, {
    amp: 0,
    duration: NAV_FLAT_S,
    ease: 'power2.out',
    onUpdate: () => {
      mailWaveAmp = morph.amp
      path.setAttribute('d', mailWavePath(morph.amp))
    },
  })
}

async function onMailLeave() {
  const parts = mailWaveParts()
  if (!parts) return
  const { path, reveal } = parts
  const g = await gsap()
  mailWaveTl?.kill()
  const fromAmp = mailWaveAmp
  const morph = { amp: fromAmp }
  const ampNeed = Math.max(0, NAV_WAVE_AMP - fromAmp) / NAV_WAVE_AMP
  const ampDur = NAV_LEAVE_AMP_S * ampNeed
  const wipeAt = ampDur > 0 ? NAV_LEAVE_WIPE_DELAY : 0
  const tl = g.timeline()
  mailWaveTl = tl
  if (ampDur > 0) {
    tl.to(
      morph,
      {
        amp: NAV_WAVE_AMP,
        duration: ampDur,
        ease: 'power1.out',
        onUpdate: () => {
          mailWaveAmp = morph.amp
          path.setAttribute('d', mailWavePath(morph.amp))
        },
      },
      0,
    )
  } else {
    mailWaveAmp = NAV_WAVE_AMP
    path.setAttribute('d', mailWavePath(NAV_WAVE_AMP))
  }
  tl.to(
    reveal,
    {
      attr: { x: NAV_WAVE_VB_W, width: 0 },
      duration: NAV_LEAVE_WIPE_S,
      ease: 'power1.in',
      onComplete: () => {
        mailWaveAmp = 0
        path.setAttribute('d', mailWavePath(0))
      },
    },
    wipeAt,
  )
}

async function waitForRoutePaint() {
  await nextTick()
  await waitFrames(2)
}

/** Home hero shell (stone lid) before iris exposes the GL stack. */
async function waitForHomeHeroShell(maxMs = 2400) {
  await nextTick()
  await waitFrames(2)
  const deadline = performance.now() + maxMs
  while (performance.now() < deadline) {
    if (document.querySelector('.hero-swarm-cover')) {
      await waitFrames(2)
      return
    }
    await waitFrames(1)
  }
}

/** Let a hidden WebGL canvas present at least one real frame before the iris hole shows it. */
function waitFrames(n: number) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(() => step(left - 1))
    }
    requestAnimationFrame(() => step(n - 1))
  })
}

function pinPageScroll() {
  if (document.documentElement.classList.contains('page-canvas-lock')) return
  savedScrollY = window.scrollY
  lockScroll(true)
}

/** Full iris cover immediately — hides the overlay before route / gsap work hits the main thread. */
async function snapIrisCover() {
  setIrisLive(true)
  syncNavChrome()
  const start = irisButtonGeom()
  const cover = irisCoverFrom(start)
  const clipRoot = irisClipEl()
  if (clipRoot) applyIrisClip(clipRoot, cover)
  return { start, cover }
}

async function unlockSession(
  opts: { restoreScroll?: boolean } = {},
) {
  const restoreY = opts.restoreScroll === false ? 0 : savedScrollY
  if (opts.restoreScroll === false) savedScrollY = 0
  if (document.documentElement.classList.contains('page-canvas-lock')) {
    lockScroll(false, restoreY)
  } else {
    const body = document.body
    if (body.style.position === 'fixed') {
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      body.style.width = ''
      window.scrollTo(0, restoreY)
    }
  }
  restoreFabLabel()
}

function isOpenRun(gen: number) {
  return gen === motionGen && open.value
}

function isCloseRun(gen: number) {
  return gen === motionGen && !open.value
}

function isHomeRoute() {
  const p = route.path
  return p === '/' || p === ''
}

function finishMenuCloseQuiet() {
  setPageIrisGuard(false)
  heroGlRevealBusy.value = false
  busy.value = false
}

async function playOpen() {
  const root = rootEl.value
  const gen = ++motionGen
  killActiveMotion()
  busy.value = true
  fabLabelOn.value = true
  const tapPill = captureMenuPill()

  try {
    if (!gsapMod) await gsap()
    const g = gsapMod
    if (!g || !isOpenRun(gen)) return

    const dotsReady = !isThumb.value && !!menuButtonEl()?.matches(':hover')
    if (reducedMotion.value) {
      swapCloseWord('back', true)
      spinCloseDots(true, true)
    } else {
      swapCloseWord('back')
      if (dotsReady) spinCloseDots(true, true)
      else spinCloseDots(true)
    }

    showCanvasSurface()
    pinPageScroll()
    if (!isOpenRun(gen)) return
    setIrisLive(true)
    void root?.offsetWidth
    startNavChromeTrack()
    syncNavChrome()
    if (root) {
      g.set(root, { clearProps: 'opacity,visibility,pointerEvents' })
    }
    const clipRoot = irisClipEl()
    if (clipRoot) {
      applyIrisClip(clipRoot, reducedMotion.value ? irisCoverFrom(tapPill) : tapPill)
    }

    void ensureFrameCentered(shownCurrentId.value, 'instant', gen)

    if (reducedMotion.value) {
      syncNavChrome()
      if (clipRoot) clearIrisClip(clipRoot)
      setIrisLive(false)
      await playPlaqueEnter()
      return
    }

    void playPlaqueEnter()
    await tweenIris({ dir: 'open', pill: tapPill })
    if (!isOpenRun(gen)) return
    syncNavChrome()
    const clipRootDone = irisClipEl()
    if (clipRootDone) clearIrisClip(clipRootDone)
    setIrisLive(false)
  } catch (err) {
    console.warn('[PageCanvas] playOpen failed', err)
    showCanvasSurface()
    const clipRootErr = irisClipEl()
    if (clipRootErr) clearIrisClip(clipRootErr)
    setIrisLive(false)
    resetEnterProps()
    swapCloseWord('back', true)
    spinCloseDots(true, true)
  } finally {
    stopNavChromeTrack()
    if (isOpenRun(gen)) busy.value = false
  }
}

async function playClose() {
  const gen = ++motionGen
  killActiveMotion()
  busy.value = true
  showCanvasSurface()
  const homeClose = isHomeRoute()
  if (homeClose) heroGlRevealBusy.value = true

  try {
    if (reducedMotion.value) {
      swapCloseWord('menu', true)
      spinCloseDots(false, true)
      await unlockSession()
      hideCanvasSurface()
      if (!homeClose) finishMenuCloseQuiet()
      return
    }

    if (!gsapMod) await gsap()
    if (!isCloseRun(gen)) return
    const pill = captureMenuPill()
    swapCloseWord('menu')
    spinCloseDots(false)
    await snapIrisCover()
    if (!isCloseRun(gen)) return

    if (homeClose) await waitFrames(2)
    if (!isCloseRun(gen)) return

    await tweenIris({ dir: 'close', pill, followMenu: true })
    if (!isCloseRun(gen)) return
    hideCanvasSurface()
    await unlockSession()
  } catch (err) {
    console.warn('[PageCanvas] playClose failed', err)
    hideCanvasSurface()
    await unlockSession()
    finishMenuCloseQuiet()
  } finally {
    if (isCloseRun(gen)) {
      heroGlRevealBusy.value = false
      busy.value = false
    }
  }
}

async function goToFrame(frame: SiteNavFrame) {
  if (!open.value) return

  hideGoCursor()

  if (frameIsCurrent(frame)) {
    closeCanvas()
    return
  }

  const gen = ++motionGen
  busy.value = true

  try {
    navFromCanvas = true
    navHopActive.value = true

    if (reducedMotion.value) {
      if (frame.id === 'home') skipHeroIntro.value = true
      await unlockSession({ restoreScroll: false })
      hideCanvasSurface()
      open.value = false
      await router.push(frame.to)
      await waitForRoutePaint()
      return
    }

    if (frame.id === 'home') {
      skipHeroIntro.value = true
      heroGlRevealBusy.value = true
      preloadHomeSceneAssets()
      setPageIrisGuard(true)
      const { start } = await snapIrisCover()
      if (gen !== motionGen) return
      open.value = false

      await router.push(frame.to)
      await waitForHomeHeroShell()
      if (gen !== motionGen) return
      await waitForHeroSwarm()
      if (gen !== motionGen) return
      await requestHeroGlPrewarm()
      if (gen !== motionGen) return
      setPageIrisGuard(false)
      await waitFrames(isThumb.value ? 14 : 10)
      if (gen !== motionGen) return

      swapCloseWord('menu')
      spinCloseDots(false)
      await tweenIris({ dir: 'close', pill: start, followMenu: true })
      if (gen !== motionGen) return
      hideCanvasSurface()
      await unlockSession({ restoreScroll: false })
      heroGlRevealBusy.value = false
    } else {
      open.value = false
      await gsap()
      if (gen !== motionGen) return
      swapCloseWord('menu')
      spinCloseDots(false)
      const { start } = await snapIrisCover()
      if (gen !== motionGen) return

      await router.push(frame.to)
      await waitForRoutePaint()
      if (gen !== motionGen) return

      await tweenIris({ dir: 'close', pill: start, followMenu: true })
      if (gen !== motionGen) return
      hideCanvasSurface()
      await unlockSession({ restoreScroll: false })
    }
    if (gen !== motionGen) return
    lastFocus?.focus({ preventScroll: true })
    lastFocus = null
  } catch (err) {
    console.warn('[PageCanvas] hop failed', err)
    finishMenuCloseQuiet()
    hideCanvasSurface()
    await unlockSession({ restoreScroll: false })
  } finally {
    navFromCanvas = false
    navHopActive.value = false
    if (gen === motionGen) busy.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (!open.value || busy.value) return
  e.preventDefault()
  e.stopPropagation()
  closeCanvas()
}

watch(open, async (isOpen, wasOpen) => {
  if (isOpen) {
    shownCurrentId.value = matchFramePath(route.path)
    const ae = document.activeElement
    lastFocus = ae instanceof HTMLElement ? ae : null
    await playOpen()
    if (open.value) menuButtonEl()?.focus({ preventScroll: true })
  } else if (wasOpen) {
    if (navFromCanvas || navHopActive.value) return
    await playClose()
    if (!open.value) {
      hideCanvasSurface()
      lastFocus?.focus({ preventScroll: true })
      lastFocus = null
    }
  }
}, { flush: 'sync' })

watch(
  () => route.fullPath,
  () => {
    if (open.value && !navFromCanvas && !navHopActive.value) closeCanvas()
  },
)

onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const syncChromeMode = () => {
    isNarrow.value = isNarrowViewport()
    isThumb.value = isThumbNav()
  }
  syncChromeMode()
  window.addEventListener('resize', syncChromeMode, { passive: true })
  syncFrameAspect()
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('resize', syncFrameAspect, { passive: true })
  for (const frame of canvasFrames) {
    for (const src of [
      frame.preview,
      frame.previewBw,
      frame.previewM,
      frame.previewMBw,
    ]) {
      const img = new Image()
      img.src = src
    }
  }
  void gsap()

  onUnmounted(() => {
    window.removeEventListener('resize', syncChromeMode)
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', syncFrameAspect)
  hideCanvasSurface()
  mailWaveTl?.kill()
  goTl?.kill()
  stopGoFollow()
  if (goReleaseTimer) {
    window.clearTimeout(goReleaseTimer)
    goReleaseTimer = 0
  }
  clearGoPressListeners()
  killIris()
  stopNavChromeTrack()
  if (document.documentElement.classList.contains('page-canvas-lock')) {
    lockScroll(false)
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="rootEl"
      class="page-canvas"
      :class="{
        'page-canvas--open': open,
        'page-canvas--surface': surfaceOn,
        'page-canvas--thumb': isThumb,
      }"
      :inert="!open"
      role="dialog"
      aria-modal="true"
      aria-label="Навигация по сайту"
    >
      <div ref="maskEl" class="page-canvas__mask">
        <div class="page-canvas__veil" @click="closeCanvas" />
      </div>

      <div ref="navEl" class="page-canvas__nav">
      <div class="page-canvas__chrome">
        <div class="page-canvas__chrome-top">
          <div class="page-canvas__chrome-lead">
            <p class="page-canvas__eyebrow">Kadoflow · workspace</p>
            <a
              class="page-canvas__mail"
              href="mailto:hello@kadoflow.com"
              :tabindex="open ? 0 : -1"
              @pointerenter="onMailEnter"
              @pointerleave="onMailLeave"
              @focusin="onMailEnter"
              @focusout="onMailLeave"
            >
              <span class="page-canvas__mail-text">
                <span>hello@kadoflow.com</span>
                <svg
                  class="page-canvas__mail-wave"
                  viewBox="0 0 64 8"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <clipPath id="pc-mail-wave-clip" clipPathUnits="userSpaceOnUse">
                      <rect
                        class="page-canvas__mail-reveal"
                        x="0"
                        y="0"
                        width="0"
                        height="8"
                      />
                    </clipPath>
                  </defs>
                  <path
                    class="page-canvas__mail-wave-path"
                    clip-path="url(#pc-mail-wave-clip)"
                    d="M1 4 Q 12 0.8 23 4 Q 34 7.2 45 4 Q 54 1.8 63 4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.35"
                    stroke-linecap="butt"
                  />
                </svg>
              </span>
            </a>
          </div>
        </div>
        <div class="page-canvas__chrome-foot">
          <button
            type="button"
            class="page-canvas__lang"
            :tabindex="open ? 0 : -1"
            aria-label="Switch language"
          >
            {{ isThumb ? 'en' : 'EN' }}
          </button>
        </div>
      </div>

      <div ref="stageEl" class="page-canvas__stage" data-pc-scroller>
        <div ref="deskEl" class="page-canvas__desk" role="list" data-pc-scroller-x>
          <button
            v-for="frame in canvasFrames"
            :key="frame.id"
            type="button"
            class="pc-frame"
            :class="[
              `pc-frame--${frame.motif}`,
              { 'pc-frame--current': frameIsCurrent(frame) },
            ]"
            :data-frame-id="frame.id"
            role="listitem"
            :tabindex="open ? 0 : -1"
            :aria-current="frameIsCurrent(frame) ? 'page' : undefined"
            @click="goToFrame(frame)"
            @pointerenter="onFramePointer"
            @pointerdown="onGoPressDown"
          >
            <span class="pc-frame__hover-bg" aria-hidden="true" />
            <div
              class="pc-frame__sheet"
              aria-hidden="true"
              @pointerenter="onSheetEnter"
              @pointermove="onSheetMove"
              @pointerleave="onSheetLeave"
            >
              <div class="pc-frame__paint">
                <img
                  class="pc-frame__shot pc-frame__shot--bw"
                  :src="frameShot(frame, 'bw')"
                  :data-color="frameShot(frame, 'color')"
                  alt=""
                  draggable="false"
                  @error="onShotError"
                >
                <img
                  class="pc-frame__shot pc-frame__shot--color"
                  :src="frameShot(frame, 'color')"
                  alt=""
                  draggable="false"
                >
                <div class="pc-frame__motif" />
              </div>
            </div>
            <div class="pc-frame__meta">
              <span class="pc-frame__index">{{ frame.index }}</span>
              <div class="pc-frame__title-row">
                <span class="pc-frame__label">{{ frame.label }}</span>
                <span v-if="frameIsCurrent(frame)" class="pc-frame__here">Вы здесь</span>
              </div>
              <span class="pc-frame__blurb">{{ frame.blurb }}</span>
            </div>
          </button>
        </div>
      </div>
      </div>
    </div>
    <div ref="goEl" class="pc-go" aria-hidden="true">
      <span ref="goCircleEl" class="pc-go__circle">
        <span ref="goWordEl" class="pc-go__word">сюда</span>
      </span>
    </div>
  </Teleport>
</template>

<style scoped>
.page-canvas {
  --pc-inset-top: var(--layout-header-inset);
  --pc-inset-right: var(--layout-margin);
  --pc-inset-bottom: calc(var(--layout-margin) + var(--safe-bottom));
  --pc-inset-left: var(--layout-margin);
  --pc-close-h: 2.5rem;
  --pc-lead-h: 2.5rem;
  position: fixed;
  inset: 0;
  z-index: 110;
  display: none;
  overflow: hidden;
  pointer-events: none;
  color: var(--palette-ink);
  background: transparent;
}

.page-canvas--surface {
  display: block;
  visibility: visible;
  opacity: 1;
  /* Stable containing block for fixed chrome + clip-path. Don't toggle
     on iris start/end — layer promotion fights the WebGL compositor. */
  transform: translateZ(0);
}

.page-canvas--open,
.page-canvas--surface.page-canvas--open {
  pointer-events: auto !important;
}

.page-canvas--surface:not(.page-canvas--open) {
  pointer-events: none;
}

.page-canvas__mask {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.page-canvas__nav {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.page-canvas__veil {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: color-mix(in srgb, var(--palette-sand) 78%, var(--palette-ash));
}

@media (max-width: 767.98px) {
  .page-canvas {
    --pc-inset-top: calc(var(--layout-margin) + var(--safe-top));
    --pc-inset-right: calc(2 * var(--layout-margin) + var(--safe-right));
    --pc-inset-bottom: calc(2 * var(--layout-margin) + var(--safe-bottom));
    --pc-inset-left: calc(2 * var(--layout-margin) + var(--safe-left));
  }
  .page-canvas__veil {
    pointer-events: none;
  }
}

.page-canvas__chrome {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.page-canvas__chrome-top,
.page-canvas__chrome-foot {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  pointer-events: none;
}

.page-canvas__chrome-top {
  top: 0;
  align-items: flex-start;
  padding: var(--pc-inset-top) var(--pc-inset-right) 0 var(--pc-inset-left);
  min-height: 0;
  box-sizing: border-box;
}

.page-canvas__chrome-lead {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.12rem;
  min-width: 0;
  pointer-events: none;
}

.page-canvas__chrome-foot {
  bottom: 0;
  justify-content: flex-end;
  padding: 0 var(--pc-inset-right) var(--pc-inset-bottom) var(--pc-inset-left);
}

.page-canvas__eyebrow {
  margin: 0;
  font-size: calc(var(--type-nav) * 0.8);
  letter-spacing: 0.04em;
  color: var(--palette-ash);
  pointer-events: none;
}

.page-canvas__mail,
.page-canvas__lang {
  pointer-events: auto;
  font: inherit;
  font-size: var(--type-nav);
  letter-spacing: 0.04em;
  color: var(--palette-ink);
  text-decoration: none;
  background: none;
  border: 0;
  cursor: pointer;
  appearance: none;
}

.page-canvas__mail {
  padding: 0;
  pointer-events: auto;
}

.page-canvas:not(.page-canvas--thumb) .page-canvas__mail {
  position: fixed;
  left: var(--pc-inset-left);
  bottom: var(--pc-inset-bottom);
  z-index: 3;
}

.page-canvas__mail-text {
  position: relative;
  display: inline-block;
  padding-bottom: 0.28em;
}

.page-canvas__mail-wave {
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

.page-canvas__mail-wave-path {
  fill: none;
}

.page-canvas__lang {
  padding: 0.55rem 1.1rem;
  border-radius: 9999px;
  background: transparent;
  transition: background 0.22s ease, backdrop-filter 0.22s ease;
}

.page-canvas__lang:hover,
.page-canvas__lang:focus-visible {
  background: color-mix(in srgb, var(--palette-sand) 70%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.page-canvas--thumb {
  --pc-inset-right: calc(2 * var(--layout-margin) + var(--safe-right, 0px));
  --pc-inset-bottom: calc(2 * var(--layout-margin) + var(--safe-bottom, 0px));
  --pc-inset-left: calc(2 * var(--layout-margin) + var(--safe-left, 0px));
}

.page-canvas--thumb .page-canvas__chrome-foot {
  justify-content: flex-start;
  align-items: flex-end;
  min-height: calc(var(--pc-inset-bottom) + var(--pc-close-h));
  padding-bottom: var(--pc-inset-bottom);
  box-sizing: border-box;
}

.page-canvas--thumb .page-canvas__lang {
  box-sizing: border-box;
  height: var(--pc-close-h);
  display: inline-flex;
  align-items: center;
  padding: 10px 1.1rem;
  font-size: calc((var(--type-nav) + var(--type-lead)) * 0.5);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.page-canvas--thumb .page-canvas__mail {
  font-size: calc((var(--type-nav) + var(--type-lead)) * 0.5);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.page-canvas--thumb .page-canvas__eyebrow {
  padding-bottom: 0;
}

.page-canvas--thumb .page-canvas__stage {
  padding-top: calc(var(--pc-inset-top) + var(--pc-lead-h) + 0.5rem);
  padding-bottom: calc(var(--pc-inset-bottom) + var(--pc-close-h) + 0.75rem);
  overflow-x: hidden;
  overflow-y: auto;
}

.page-canvas--thumb .page-canvas__desk {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem 0.55rem;
  height: auto;
  min-height: 0;
  width: 100%;
  max-width: none;
  margin-inline: 0;
  overflow: visible;
  align-content: start;
  padding-top: 0;
}

.page-canvas--thumb .pc-frame {
  --pc-frame-pad: 0.45rem;
  width: 100%;
  max-width: none;
  padding: var(--pc-frame-pad);
  gap: 0.4rem;
}

.page-canvas--thumb .pc-frame__sheet {
  aspect-ratio: 16 / 9;
}

.page-canvas--thumb .pc-frame__blurb {
  display: none;
}

.page-canvas--thumb .pc-frame__label {
  font-size: calc(var(--type-lead) * 0.88);
}

.page-canvas--thumb .pc-frame__here {
  padding: 0.12em 0.55em;
  font-size: 0.55rem;
}

@media (orientation: landscape) {
  .page-canvas--thumb .page-canvas__desk {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.page-canvas__stage {
  position: absolute;
  inset: 0;
  z-index: 1;
  min-height: 0;
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
  -webkit-overflow-scrolling: touch;
  padding-top: calc(var(--pc-inset-top) + var(--pc-close-h));
  padding-right: var(--pc-inset-right);
  padding-bottom: calc(var(--pc-inset-bottom) + 2.5rem);
  padding-left: var(--pc-inset-left);
}

.page-canvas__stage::-webkit-scrollbar {
  display: none;
}

.page-canvas__desk {
  box-sizing: border-box;
  min-height: 100%;
  padding: 0;
  scrollbar-width: none;
}

.page-canvas__desk::-webkit-scrollbar {
  display: none;
}

@media (max-width: 767.98px) {
  .page-canvas {
    --pc-inset-top: calc(var(--layout-margin) + var(--safe-top));
    --pc-inset-right: calc(2 * var(--layout-margin) + var(--safe-right));
    --pc-inset-bottom: calc(2 * var(--layout-margin) + var(--safe-bottom));
    --pc-inset-left: calc(2 * var(--layout-margin) + var(--safe-left));
  }

  .page-canvas__chrome-top {
    padding: var(--pc-inset-top) var(--pc-inset-right) 0 var(--pc-inset-left);
    min-height: 0;
  }
}

@media (min-width: 768px) {
  .page-canvas__desk {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(2rem, 4.2vh, 3.75rem);
    align-content: start;
    width: 100%;
    max-width: var(--layout-span-9);
    margin-inline: auto;
    padding-inline: 0;
    padding-top: clamp(0.35rem, 1.5vh, 1.25rem);
    padding-bottom: 1.25rem;
  }

  .pc-frame {
    width: 100%;
    max-width: none;
    justify-self: stretch;
  }
}

@media (min-width: 1400px) {
  .page-canvas__desk {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    max-width: var(--layout-span-8);
  }
}

.pc-frame {
  --pc-frame-pad: 1rem;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: var(--pc-frame-pad);
  overflow: hidden;
  border: 0;
  border-radius: 10px;
  background: transparent;
  text-align: left;
  color: inherit;
  cursor: default;
  outline: none;
  font: inherit;
}

.pc-frame__hover-bg {
  position: absolute;
  z-index: 0;
  /* Screenshot-sized rectangle — grows from the pointer like header chips. */
  top: var(--pc-frame-pad);
  left: var(--pc-frame-pad);
  width: calc(100% - 2 * var(--pc-frame-pad));
  aspect-ratio: var(--pc-aspect, 16 / 9);
  border-radius: 4px;
  pointer-events: none;
  background: color-mix(
    in srgb,
    var(--palette-ink) 6.5%,
    color-mix(in srgb, var(--palette-sand) 86%, var(--palette-ash))
  );
  transform: scale(0);
  transform-origin: var(--chip-bg-x, 50%) var(--chip-bg-y, 50%);
  transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (hover: hover) and (pointer: fine) {
  .pc-frame:hover .pc-frame__hover-bg {
    /* Past 1 so the plate shows in the frame padding, like the current tile. */
    transform: scale(1.12);
  }
}

.pc-frame:focus-visible .pc-frame__hover-bg {
  transform: scale(1.12);
}

.pc-frame[data-chip-press] .pc-frame__hover-bg {
  transform: scale(1.2);
}

.pc-frame--current .pc-frame__hover-bg {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .pc-frame__hover-bg {
    transform: none;
    opacity: 0;
    transition: opacity 0.01s linear;
  }

  .pc-frame:hover .pc-frame__hover-bg,
  .pc-frame:focus-visible .pc-frame__hover-bg,
  .pc-frame[data-chip-press] .pc-frame__hover-bg {
    transform: none;
    opacity: 1;
  }

  .pc-frame--current .pc-frame__hover-bg {
    opacity: 0;
  }
}

.pc-frame__sheet {
  position: relative;
  z-index: 1;
  aspect-ratio: var(--pc-aspect, 16 / 9);
  border-radius: 4px;
  background: var(--palette-stone);
}

.pc-frame__paint {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  border-radius: inherit;
}

@media (pointer: fine) {
  .pc-frame__sheet {
    cursor: none;
  }
}

.pc-frame__shot {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  pointer-events: none;
}

.pc-frame__shot--color {
  z-index: 2;
  opacity: 0;
  transition: opacity 0.38s var(--motion-ease, ease);
}

.pc-frame--current .pc-frame__shot--color {
  opacity: 1;
}

@media (hover: hover) and (pointer: fine) {
  .pc-frame__sheet:hover .pc-frame__shot--color,
  .pc-frame:focus-visible .pc-frame__shot--color {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pc-frame__shot--color {
    transition: none;
  }
}

.pc-frame--current {
  background: color-mix(
    in srgb,
    var(--palette-ink) 12%,
    color-mix(in srgb, var(--palette-sand) 78%, var(--palette-ash))
  );
}

.pc-frame--current .pc-frame__sheet {
  box-shadow: 0 0 0 2px var(--palette-ink);
}

.pc-frame:focus-visible .pc-frame__sheet {
  box-shadow: 0 0 0 2px var(--palette-ink);
}

.pc-frame__motif {
  position: absolute;
  inset: 10%;
  z-index: 0;
  border-radius: 3px;
  background:
    linear-gradient(
      160deg,
      color-mix(in srgb, var(--palette-milk) 80%, transparent),
      color-mix(in srgb, var(--palette-sand) 55%, transparent)
    );
}

.pc-frame__meta {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 0.15rem;
  padding-inline: 0.1rem;
}

.pc-frame__index {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: var(--palette-ash);
}

.pc-frame__title-row {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.pc-frame__label {
  font-size: var(--type-lead);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.pc-frame__here {
  flex: 0 0 auto;
  margin-top: 0.15em;
  padding: 0.18em 0.9em;
  border-radius: 4px;
  background: var(--palette-ink);
  color: var(--palette-milk);
  font-size: 0.62rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  line-height: 1.2;
  white-space: nowrap;
}

.pc-frame__blurb {
  margin-top: 0.075rem;
  font-size: var(--type-nav);
  color: var(--palette-ash);
  line-height: 1.3;
}
</style>

<style>
.pc-go {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 111;
  pointer-events: none;
  width: 4.75rem;
  height: 4.75rem;
  margin: 0;
  will-change: transform;
}

.pc-go__circle {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 50%;
  background: var(--palette-ink);
  color: var(--palette-milk);
  transform: scale(0);
  transform-origin: 50% 50%;
  will-change: transform;
}

.pc-go__word {
  font-family: var(--font-sans);
  font-size: calc(var(--type-nav) * 0.8);
  letter-spacing: 0.02em;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  will-change: opacity;
}

@media (prefers-reduced-motion: reduce) {
  .pc-go__circle,
  .pc-go__word {
    will-change: auto;
  }
}
</style>
