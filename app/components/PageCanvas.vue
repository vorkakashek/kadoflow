<script setup lang="ts">
import { canvasFrames, matchFramePath, type SiteNavFrame } from '~/utils/siteNav'
import { setChipBgOrigin } from '~/utils/chipHoverBg'
import { isNarrowViewport, isThumbNav } from '~/utils/mobileViewport'
import {
  abortTileHover,
  canUseTileHoverFx,
  disposeTileHover,
  enterTileHover,
  leaveTileHover,
  resizeTileHover,
  settleTileHover,
} from '~/utils/tileHoverDistort'
import {
  applyIrisClip,
  clearIrisClip,
  clipFromGeom,
  irisCoverFrom,
  irisGeomFromBox,
  IRIS_CLOSE_EASE,
  IRIS_CLOSE_S,
  IRIS_OPEN_EASE,
  IRIS_OPEN_S,
  type IrisGeom,
} from '~/utils/irisClip'
import { CHIP_FIT_EASE, CHIP_FIT_S } from '~/utils/chipFit'

const {
  open,
  busy,
  surfaceOn,
  navHopActive,
  skipHeroIntro,
  waitForHeroSwarm,
  requestHeroGlPrewarm,
  closeCanvas,
  revealFabLabel,
  restoreFabLabel,
  irisLive,
} = usePageCanvas()
const { suppressed: siteCursorOff } = useSiteCursor()
const route = useRoute()
const router = useRouter()

const rootEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const deskEl = ref<HTMLElement | null>(null)
const closeBtnEl = ref<HTMLButtonElement | null>(null)
const closeTrackEl = ref<HTMLElement | null>(null)
const closeDotsEl = ref<HTMLElement | null>(null)
const closeWordEl = ref<HTMLElement | null>(null)
const closeSizerMenuEl = ref<HTMLElement | null>(null)
const closeSizerBackEl = ref<HTMLElement | null>(null)
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
let sheetHoverGen = 0
let glHoverFailed = false
let tileHoverHold = false

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

function killIris() {
  irisTween?.kill()
  irisTween = null
  const resolve = irisResolve
  irisResolve = null
  resolve?.()
}

function stopTileHover() {
  if (tileHoverHold) return
  sheetHoverGen += 1
  abortTileHover()
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
  stopTileHover()
  const scroller = navScrollRoot()
  if (scroller && gsapMod) gsapMod.killTweensOf(scroller)
  if (gsapMod && closeDotsEl.value) gsapMod.killTweensOf(closeDotsEl.value)
  if (gsapMod && closeWordEl.value) gsapMod.killTweensOf(closeWordEl.value)
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
  return document.querySelector('.site-header .menu-btn') as HTMLElement | null
}

function irisButtonGeom(): IrisGeom {
  const root = rootEl.value
  const canvas = root?.getBoundingClientRect()
  const container = canvas
    ? {
        left: canvas.left,
        top: canvas.top,
        width: canvas.width,
        height: canvas.height,
      }
    : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
  const el = menuButtonEl()
  return irisGeomFromBox(el?.getBoundingClientRect() ?? null, container, {
    w: 96,
    h: 40,
    cx: container.width - 56,
    cy: isThumb.value ? container.height - 56 : 36,
  })
}

async function tweenIris(opts: {
  from: IrisGeom
  to: IrisGeom
  duration: number
  ease: string
  followMenu?: boolean
}) {
  const root = rootEl.value
  if (!root) return
  const g = await gsap()
  killIris()
  applyIrisClip(root, clipFromGeom(opts.from))
  root.style.willChange = 'clip-path'
  const proxy = { w: opts.from.w, h: opts.from.h }
  await new Promise<void>((resolve) => {
    irisResolve = resolve
    irisTween = g.to(proxy, {
      w: opts.to.w,
      h: opts.to.h,
      duration: opts.duration,
      ease: opts.ease,
      overwrite: true,
      onUpdate: () => {
        const live = opts.followMenu ? irisButtonGeom() : opts.from
        applyIrisClip(
          root,
          clipFromGeom({
            ...live,
            w: proxy.w,
            h: proxy.h,
          }),
        )
        if (opts.followMenu) syncNavChrome()
      },
      onComplete: () => {
        irisTween = null
        const done = irisResolve
        irisResolve = null
        done?.()
      },
    })
  })
}

function showCanvasSurface() {
  document.documentElement.classList.add('page-canvas-surface')
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
  const root = rootEl.value
  if (root) {
    // Hide before unclip — otherwise one frame of full overlay after the disc.
    root.style.display = 'none'
    clearIrisClip(root)
    resetEnterProps()
    clearBackSlot()
    root.classList.remove('page-canvas--surface', 'page-canvas--open')
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
  tileHoverHold = false
  abortTileHover()
}

function frameIsCurrent(frame: SiteNavFrame) {
  return frame.id === shownCurrentId.value
}

function frameShot(frame: SiteNavFrame, tone: 'color' | 'bw') {
  if (isThumb.value) {
    return tone === 'bw' ? frame.previewMBw : frame.previewM
  }
  return tone === 'bw' ? frame.previewBw : frame.preview
}

function setIrisLive(on: boolean) {
  document.documentElement.classList.toggle('page-canvas-iris', on)
  irisLive.value = on
}

function clearBackSlot() {
  const root = rootEl.value
  if (root) {
    root.style.removeProperty('--pc-inset-top')
    root.style.removeProperty('--pc-inset-right')
    root.style.removeProperty('--pc-inset-bottom')
    root.style.removeProperty('--pc-inset-left')
    root.style.removeProperty('--pc-close-h')
    root.style.removeProperty('--pc-lead-h')
  }
  const back = closeBtnEl.value
  if (!back) return
  back.style.top = ''
  back.style.right = ''
  back.style.bottom = ''
  back.style.left = ''
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
  if (!canUseTileHoverFx()) stopTileHover()
  resizeTileHover()
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
  stopGoFollow()
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
  if (reducedMotion.value) {
    g.set(circle, { scale: 1 })
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
  tl.to(circle, { scale: 1, duration: 0.3, ease: 'power2.out', force3D: true }, 0)
  tl.to(word, { opacity: 1, duration: 0.2, ease: 'power2.out' }, 0.22)
}

function hideGoCursor(instant = false) {
  if (goState === 'off' && !goFollow) return
  if (instant || reducedMotion.value || !gsapMod || !goCircleEl.value || !goWordEl.value) {
    snapGoOff()
    return
  }
  if (goState === 'out') return
  goState = 'out'
  goTl?.kill()
  const circle = goCircleEl.value
  const word = goWordEl.value
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

function onChipPointer(e: PointerEvent) {
  const el = e.currentTarget
  if (el instanceof HTMLElement) setChipBgOrigin(el, e)
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
  if (closeTrackEl.value) {
    gsapMod.set(closeTrackEl.value, { yPercent: 0 })
  }
  if (closeDotsEl.value) {
    gsapMod.set(closeDotsEl.value, { rotation: 0 })
  }
  const menuW = closeSizerMenuEl.value?.offsetWidth ?? 0
  if (closeWordEl.value && menuW) {
    gsapMod.set(closeWordEl.value, { width: menuW })
  }
}

function measureCloseWord(to: 'menu' | 'back') {
  const el = to === 'menu' ? closeSizerMenuEl.value : closeSizerBackEl.value
  return Math.ceil(el?.getBoundingClientRect().width ?? 0)
}

function swapCloseWord(to: 'menu' | 'back', instant = false) {
  const track = closeTrackEl.value
  const box = closeWordEl.value
  if (!gsapMod) return
  wordTween?.kill()
  wordTween = null
  const snap = instant || reducedMotion.value
  const yPercent = to === 'menu' ? 0 : -50
  const w = measureCloseWord(to)
  if (snap) {
    if (track) gsapMod.set(track, { yPercent })
    if (box && w) gsapMod.set(box, { width: w })
    return
  }
  const tl = gsapMod.timeline({
    onComplete: () => {
      wordTween = null
    },
  })
  wordTween = tl
  if (track) {
    tl.to(
      track,
      { yPercent, duration: CHIP_FIT_S, ease: CHIP_FIT_EASE, overwrite: true },
      0,
    )
  }
  if (box && w) {
    tl.to(
      box,
      { width: w, duration: CHIP_FIT_S, ease: CHIP_FIT_EASE, overwrite: true },
      0,
    )
  }
}

function spinCloseDots(up: boolean, instant = false) {
  const el = closeDotsEl.value
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
    ease: CHIP_FIT_EASE,
    overwrite: true,
    onComplete: () => {
      dotsTween = null
    },
  })
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
  if (reducedMotion.value || glHoverFailed || tileHoverHold || !canUseTileHoverFx()) return
  const sheet = e.currentTarget as HTMLElement
  const bw = sheet.querySelector('.pc-frame__shot--bw') as HTMLImageElement | null
  const color = sheet.querySelector('.pc-frame__shot--color') as HTMLImageElement | null
  if (!bw?.naturalWidth || !color?.naturalWidth) return
  const fromColor = !!sheet.closest('.pc-frame--current')
  const token = ++sheetHoverGen
  const run = (g: NonNullable<typeof gsapMod>) => {
    if (token !== sheetHoverGen || !open.value) return
    if (!sheet.matches(':hover')) return
    const ok = enterTileHover(g, sheet, fromColor ? color : bw, color)
    if (!ok) glHoverFailed = true
  }
  if (gsapMod) {
    run(gsapMod)
    return
  }
  void gsap().then((g) => run(g))
}

function onSheetMove(e: PointerEvent) {
  if (!goFollow) return
  setGoPos(e.clientX, e.clientY)
}

function onSheetLeave(e: PointerEvent) {
  if (tileHoverHold) return
  const sheet = e.currentTarget as HTMLElement
  const next = e.relatedTarget
  if (next instanceof Element && sheet.contains(next)) return
  // Appending the GL canvas retriggers leave with relatedTarget=null.
  if (sheet.matches(':hover')) return
  const toOtherSheet =
    next instanceof Element && !!next.closest('.pc-frame__sheet')
  if (!toOtherSheet) {
    sheetHoverGen += 1
    hideGoCursor()
  }
  leaveTileHover(sheet)
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

async function prepareThumbIrisChip() {
  if (!isThumb.value) return
  await revealFabLabel()
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

async function playOpen() {
  const root = rootEl.value
  const gen = ++motionGen
  killActiveMotion()
  busy.value = true

  try {
    await prepareThumbIrisChip()
    if (!isOpenRun(gen)) return
    await gsap()
    if (!isOpenRun(gen)) return
    showCanvasSurface()
    pinPageScroll()
    if (!isOpenRun(gen)) return
    setIrisLive(true)
    await nextTick()
    if (!isOpenRun(gen)) return
    void root?.offsetWidth
    swapCloseWord('menu', true)
    startNavChromeTrack()
    syncNavChrome()
    const start = irisButtonGeom()
    const cover = irisCoverFrom(start)
    if (root) {
      applyIrisClip(root, clipFromGeom(reducedMotion.value ? cover : start))
    }
    void ensureFrameCentered(shownCurrentId.value, 'instant', gen)

    if (root) {
      const g = await gsap()
      if (!isOpenRun(gen)) return
      g.set(root, { clearProps: 'opacity,visibility,pointerEvents' })
      if (closeTrackEl.value) g.set(closeTrackEl.value, { yPercent: 0 })
      if (closeDotsEl.value) g.set(closeDotsEl.value, { rotation: 0 })
    }

    const dotsReady = !isThumb.value && !!menuButtonEl()?.matches(':hover')

    if (reducedMotion.value) {
      syncNavChrome()
      if (root) clearIrisClip(root)
      setIrisLive(false)
      swapCloseWord('back', true)
      spinCloseDots(true, true)
      await playPlaqueEnter()
      return
    }

    if (dotsReady) spinCloseDots(true, true)
    else {
      await new Promise<void>((r) => {
        requestAnimationFrame(() => r())
      })
      if (!isOpenRun(gen)) return
      spinCloseDots(true)
    }

    await playPlaqueEnter()
    if (!isOpenRun(gen)) return

    await tweenIris({
      from: start,
      to: cover,
      duration: IRIS_OPEN_S,
      ease: IRIS_OPEN_EASE,
      followMenu: true,
    })
    if (!isOpenRun(gen)) return
    syncNavChrome()
    if (root) clearIrisClip(root)
    setIrisLive(false)
    swapCloseWord('back')
  } catch (err) {
    console.warn('[PageCanvas] playOpen failed', err)
    showCanvasSurface()
    if (root) clearIrisClip(root)
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

  try {
    if (reducedMotion.value) {
      swapCloseWord('menu', true)
      spinCloseDots(false, true)
      await unlockSession()
      hideCanvasSurface()
      return
    }

    await gsap()
    if (!isCloseRun(gen)) return
    swapCloseWord('menu')
    spinCloseDots(false)

    const root = rootEl.value
    setIrisLive(true)
    await nextTick()
    if (!isCloseRun(gen)) return
    syncNavChrome()
    const start = irisButtonGeom()
    const cover = irisCoverFrom(start)
    if (root) applyIrisClip(root, clipFromGeom(cover))

    await tweenIris({
      from: cover,
      to: start,
      duration: IRIS_CLOSE_S,
      ease: IRIS_CLOSE_EASE,
    })
    if (!isCloseRun(gen)) return
    hideCanvasSurface()
    await unlockSession()
  } catch (err) {
    console.warn('[PageCanvas] playClose failed', err)
    hideCanvasSurface()
    await unlockSession()
  } finally {
    if (isCloseRun(gen)) busy.value = false
  }
}

async function goToFrame(frame: SiteNavFrame) {
  if (!open.value) return

  tileHoverHold = true
  sheetHoverGen += 1
  const sheet = rootEl.value?.querySelector(
    `[data-frame-id="${frame.id}"] .pc-frame__sheet`,
  )
  settleTileHover(sheet instanceof HTMLElement ? sheet : null)
  hideGoCursor(true)
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

    if (frame.id === 'home') skipHeroIntro.value = true
    open.value = false
    swapCloseWord('menu')
    spinCloseDots(false)

    await router.push(frame.to)
    await waitForRoutePaint()
    if (gen !== motionGen) return
    if (frame.id === 'home') {
      await waitForHeroSwarm()
      if (gen !== motionGen) return
      await requestHeroGlPrewarm()
    }
    if (gen !== motionGen) return

    const root = rootEl.value
    setIrisLive(true)
    await nextTick()
    if (gen !== motionGen) return
    syncNavChrome()
    const start = irisButtonGeom()
    const cover = irisCoverFrom(start)
    if (root) applyIrisClip(root, clipFromGeom(cover))

    await tweenIris({
      from: cover,
      to: start,
      duration: IRIS_CLOSE_S,
      ease: IRIS_CLOSE_EASE,
    })
    if (gen !== motionGen) return
    hideCanvasSurface()
    await unlockSession({ restoreScroll: false })
    lastFocus?.focus({ preventScroll: true })
    lastFocus = null
  } catch (err) {
    console.warn('[PageCanvas] hop failed', err)
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
  if (!open.value) return
  e.preventDefault()
  e.stopPropagation()
  closeCanvas()
}

watch(open, async (isOpen, wasOpen) => {
  if (isOpen) {
    shownCurrentId.value = matchFramePath(route.path)
    busy.value = true
    const ae = document.activeElement
    lastFocus = ae instanceof HTMLElement ? ae : null
    await nextTick()
    await playOpen()
    if (open.value) closeBtnEl.value?.focus({ preventScroll: true })
  } else if (wasOpen) {
    if (navFromCanvas || navHopActive.value) return
    await playClose()
    if (!open.value) {
      hideCanvasSurface()
      lastFocus?.focus({ preventScroll: true })
      lastFocus = null
    }
  }
})

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
  killIris()
  disposeTileHover()
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
      <div class="page-canvas__veil" @click="closeCanvas" />

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
          <button
            ref="closeBtnEl"
            type="button"
            class="page-canvas__close chip-scale-host"
            :tabindex="open ? 0 : -1"
            aria-label="Закрыть меню"
            @pointerenter="onChipPointer"
            @pointerleave="onChipPointer"
            @click="closeCanvas"
          >
            <span class="chip-scale-bg" aria-hidden="true" />
            <span ref="closeWordEl" class="page-canvas__close-word">
              <span class="page-canvas__close-sizers" aria-hidden="true">
                <span ref="closeSizerMenuEl">меню</span>
                <span ref="closeSizerBackEl">закрыть</span>
              </span>
              <span class="page-canvas__close-window">
                <span ref="closeTrackEl" class="page-canvas__close-track">
                  <span class="page-canvas__close-line">меню</span>
                  <span class="page-canvas__close-line">закрыть</span>
                </span>
              </span>
            </span>
            <span ref="closeDotsEl" class="page-canvas__dots" aria-hidden="true">
              <span class="page-canvas__dot" />
              <span class="page-canvas__dot" />
            </span>
          </button>
        </div>
        <div class="page-canvas__chrome-foot">
          <button
            type="button"
            class="page-canvas__lang"
            :tabindex="open ? 0 : -1"
            aria-label="Switch language"
          >
            EN
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
          >
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
}

.page-canvas--open,
.page-canvas--surface.page-canvas--open {
  pointer-events: auto !important;
}

.page-canvas--surface:not(.page-canvas--open) {
  pointer-events: none;
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

.page-canvas__close {
  position: fixed;
  top: var(--pc-inset-top);
  right: var(--pc-inset-right);
  z-index: 3;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  gap: 8px;
  margin: 0;
  padding: 8px 18px;
  appearance: none;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  font-family: inherit;
  font-size: calc((var(--type-nav) + var(--type-lead)) * 0.5);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.25;
  cursor: pointer;
  color: var(--palette-ink);
  pointer-events: auto;
}

.page-canvas--thumb {
  --pc-inset-right: calc(2 * var(--layout-margin) + var(--safe-right, 0px));
  --pc-inset-bottom: calc(2 * var(--layout-margin) + var(--safe-bottom, 0px));
  --pc-inset-left: calc(2 * var(--layout-margin) + var(--safe-left, 0px));
}

.page-canvas--thumb .page-canvas__close {
  top: auto;
  right: var(--pc-inset-right);
  bottom: var(--pc-inset-bottom);
  padding: 10px 24px;
  background-color: color-mix(in srgb, var(--palette-sand) 72%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
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
  padding: 10px 0;
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
}

.page-canvas__close-word {
  position: relative;
  z-index: 1;
  display: block;
  flex: 0 0 auto;
  overflow: hidden;
  height: 1.25em;
  width: 2.75em;
  transform: translateY(-2px);
}

.page-canvas__close-sizers {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: none;
  white-space: nowrap;
}

.page-canvas__close-sizers span {
  display: block;
}

.page-canvas__close-window {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.page-canvas__close-track {
  display: flex;
  flex-direction: column;
}

.page-canvas__close-line {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 1.25em;
  white-space: nowrap;
}

.page-canvas__dots {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transform-origin: center center;
  will-change: transform;
}

.page-canvas__dot {
  display: block;
  width: 4px;
  height: 4px;
  border-radius: 9999px;
  background: currentColor;
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

  .page-canvas__stage {
    overflow: hidden;
    padding-top: calc(var(--pc-inset-top) + var(--pc-lead-h) + 0.5rem);
    padding-bottom: calc(var(--pc-inset-bottom) + var(--pc-close-h) + 0.75rem);
  }

  .page-canvas__desk {
    display: flex;
    gap: 1.5rem;
    height: 100%;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    touch-action: pan-x;
    align-items: center;
    padding-top: 0;
  }

  .pc-frame {
    flex: 0 0 min(70vw, calc(50svh * var(--pc-aspect, 0.5)));
  }

  .pc-frame__sheet {
    aspect-ratio: var(--pc-aspect, 9 / 19.5);
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
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 1rem;
  border: 0;
  border-radius: 10px;
  background: transparent;
  text-align: left;
  color: inherit;
  cursor: default;
  outline: none;
  font: inherit;
}

.pc-frame__sheet {
  position: relative;
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

  .pc-frame__sheet--gl .pc-frame__shot,
  .pc-frame__sheet--gl:hover .pc-frame__shot--color,
  .pc-frame--current .pc-frame__sheet--gl .pc-frame__shot--color {
    opacity: 0;
    transition: none;
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
