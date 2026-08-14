<script setup lang="ts">
import { canvasFrames, matchFramePath, type SiteNavFrame } from '~/utils/siteNav'
import { flowSurfaceMask } from '~/composables/useFlowSurfaceMask'
import { setChipBgOrigin } from '~/utils/chipHoverBg'
import {
  abortTileClickFx,
  canUseTileClickFx,
  disposeTileClickFx,
  playTileClickFx,
} from '~/utils/tileClickDistort'

const { open, busy, surfaceOn, skipHeroIntro, heroSwarmReady, closeCanvas } = usePageCanvas()
const route = useRoute()
const router = useRouter()

const rootEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const deskEl = ref<HTMLElement | null>(null)
const closeBtnEl = ref<HTMLButtonElement | null>(null)
const closeTrackEl = ref<HTMLElement | null>(null)

let lastFocus: HTMLElement | null = null
let savedScrollY = 0
let navFromCanvas = false
let navHopActive = false

const currentId = computed(() => matchFramePath(route.path))
const reducedMotion = ref(false)
const isNarrow = ref(false)
const goOn = ref(false)
const goX = ref(0)
const goY = ref(0)

const NAV_DRAW_S = 0.44
const NAV_FLAT_S = 0.224
const NAV_LEAVE_AMP_S = 0.144
const NAV_LEAVE_WIPE_S = 0.24
const NAV_LEAVE_WIPE_DELAY = 0.048
const NAV_WAVE_AMP = 3.4
const NAV_WAVE_VB_W = 64
const IRIS_OPEN_S = 0.62
const IRIS_CLOSE_S = 0.55
const IRIS_OPEN_EASE = 'power3.in'
const WORD_SWAP_S = 0.36
const PLAQUE_IMG_S = 0.52
const PLAQUE_TXT_S = 0.44
const PLAQUE_STAGGER = 0.055

let gsapMod: typeof import('gsap').default | null = null
let stMod: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let pausedTriggers: InstanceType<
  typeof import('gsap/ScrollTrigger').ScrollTrigger
>[] = []
let pausedOnPath: string | null = null
let motionGen = 0
let mailWaveTl: { kill: () => void } | null = null
let mailWaveAmp = 0
let irisTween: { kill: () => void } | null = null
let irisResolve: (() => void) | null = null
let enterTl: { kill: () => void } | null = null
let wordTween: { kill: () => void } | null = null

function killIris() {
  irisTween?.kill()
  irisTween = null
  const resolve = irisResolve
  irisResolve = null
  resolve?.()
}

function killActiveMotion() {
  hideGoCursor()
  killIris()
  enterTl?.kill()
  enterTl = null
  wordTween?.kill()
  wordTween = null
  abortTileClickFx()
  const scroller = navScrollRoot()
  if (scroller && gsapMod) gsapMod.killTweensOf(scroller)
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

async function ensureScrollTrigger() {
  if (stMod) return stMod
  const g = await gsap()
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  g.registerPlugin(ScrollTrigger)
  stMod = ScrollTrigger
  return ScrollTrigger
}

function setIrisLive(on: boolean) {
  document.documentElement.classList.toggle('page-canvas-iris', on)
}

type IrisClip = { t: number; r: number; b: number; l: number; rad: number }
type IrisGeom = {
  cx: number
  cy: number
  w: number
  h: number
  vw: number
  vh: number
}

function applyIrisClip(root: HTMLElement, c: IrisClip) {
  const rad = Math.max(0, c.rad)
  const v = `inset(${c.t}px ${c.r}px ${c.b}px ${c.l}px round ${rad}px)`
  root.style.clipPath = v
  root.style.setProperty('-webkit-clip-path', v)
}

function clipFromGeom(g: IrisGeom): IrisClip {
  const w = Math.max(0, g.w)
  const h = Math.max(0, g.h)
  const x = g.cx - w / 2
  const y = g.cy - h / 2
  return {
    t: y,
    r: g.vw - (x + w),
    b: g.vh - (y + h),
    l: x,
    rad: Math.min(w, h) / 2,
  }
}

function clearIrisClip(root: HTMLElement | null) {
  if (!root) return
  root.style.clipPath = ''
  root.style.removeProperty('-webkit-clip-path')
  root.style.willChange = ''
}

function menuButtonEl() {
  if (typeof window === 'undefined') return null
  if (isNarrow.value) {
    return document.querySelector('.menu-fab') as HTMLElement | null
  }
  return document.querySelector('.site-header .menu-btn') as HTMLElement | null
}

function irisButtonGeom(): IrisGeom {
  const root = rootEl.value
  const canvas = root?.getBoundingClientRect()
  const vw = canvas?.width ?? window.innerWidth
  const vh = canvas?.height ?? window.innerHeight
  const el = menuButtonEl()
  if (!el || !canvas) {
    const w = 96
    const h = 40
    const cx = vw - 56
    const cy = isNarrow.value ? vh - 56 : 36
    return { cx, cy, w, h, vw, vh }
  }
  const box = el.getBoundingClientRect()
  return {
    cx: box.left - canvas.left + box.width / 2,
    cy: box.top - canvas.top + box.height / 2,
    w: box.width,
    h: box.height,
    vw,
    vh,
  }
}

function irisCoverFrom(start: IrisGeom): IrisGeom {
  const cover =
    2 *
      Math.hypot(
        Math.max(start.cx, start.vw - start.cx),
        Math.max(start.cy, start.vh - start.cy),
      ) +
    12
  return { ...start, w: cover, h: cover }
}

async function tweenIris(opts: {
  from: IrisGeom
  to: IrisGeom
  duration: number
  ease: string
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
        applyIrisClip(
          root,
          clipFromGeom({
            ...opts.from,
            w: proxy.w,
            h: proxy.h,
          }),
        )
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
    root.style.opacity = ''
    root.style.visibility = ''
    root.style.pointerEvents = ''
  }
  surfaceOn.value = true
}

function hideCanvasSurface() {
  surfaceOn.value = false
  setIrisLive(false)
  document.documentElement.classList.remove(
    'page-canvas-surface',
    'page-canvas-iris',
  )
  hideGoCursor()
  const root = rootEl.value
  if (!root) return
  clearIrisClip(root)
  resetEnterProps()
  clearBackSlot()
  root.classList.remove('page-canvas--surface', 'page-canvas--open')
  root.style.opacity = ''
  root.style.visibility = ''
  root.style.pointerEvents = ''
}

function frameIsCurrent(frame: SiteNavFrame) {
  return frame.id === currentId.value
}

function setLivePageFrozen(frozen: boolean) {
  if (frozen) {
    flowSurfaceMask.freezeSilhouette = true
    return
  }
  const m = flowSurfaceMask.morph
  flowSurfaceMask.freezeSilhouette = m > 0.02 && m < 0.98
}

function clearBackSlot() {
  const back = closeBtnEl.value
  if (!back) return
  back.style.top = ''
  back.style.right = ''
  back.style.bottom = ''
  back.style.left = ''
}

function syncBackToMenu() {
  const menu = menuButtonEl()
  const back = closeBtnEl.value
  if (!back || !menu) return
  const box = menu.getBoundingClientRect()
  back.style.top = `${box.top}px`
  back.style.right = `${Math.max(0, window.innerWidth - box.right)}px`
  back.style.bottom = 'auto'
  back.style.left = 'auto'
}

function syncFrameAspect() {
  const root = rootEl.value
  if (!root || typeof window === 'undefined') return
  const vw = Math.max(1, window.innerWidth)
  const vh = Math.max(1, window.innerHeight)
  root.style.setProperty('--pc-aspect', String(vw / vh))
  if (surfaceOn.value) syncBackToMenu()
}

function lockScroll(lock: boolean) {
  const html = document.documentElement
  const body = document.body
  if (lock) {
    html.classList.add('page-canvas-lock')
    body.style.position = 'fixed'
    body.style.top = `-${savedScrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
  } else {
    body.style.position = ''
    body.style.top = ''
    body.style.left = ''
    body.style.right = ''
    body.style.width = ''
    html.classList.remove('page-canvas-lock')
    window.scrollTo(0, savedScrollY)
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

async function pauseScrollDriven(paused: boolean) {
  const ScrollTrigger = await ensureScrollTrigger()
  if (paused) {
    pausedOnPath = route.fullPath
    pausedTriggers = ScrollTrigger.getAll().slice()
    for (const t of pausedTriggers) {
      try {
        t.disable(false)
      } catch {
        /* already dead */
      }
    }
    return
  }
  if (pausedOnPath && pausedOnPath !== route.fullPath) {
    discardPausedScrollDriven()
    return
  }
  const alive = new Set(ScrollTrigger.getAll())
  for (const t of pausedTriggers) {
    if (!alive.has(t)) continue
    try {
      t.enable()
    } catch {
      /* killed while menu open */
    }
  }
  pausedTriggers = []
  pausedOnPath = null
  try {
    ScrollTrigger.refresh()
  } catch {
    /* ignore */
  }
}

function discardPausedScrollDriven() {
  pausedTriggers = []
  pausedOnPath = null
}

function canUseGoCursor() {
  if (isNarrow.value) return false
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: fine)').matches
}

function hideGoCursor() {
  goOn.value = false
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
}

function swapCloseWord(to: 'menu' | 'back', instant = false) {
  const track = closeTrackEl.value
  if (!track || !gsapMod) return
  wordTween?.kill()
  wordTween = null
  const yPercent = to === 'menu' ? 0 : -50
  if (instant || reducedMotion.value) {
    gsapMod.set(track, { yPercent })
    return
  }
  wordTween = gsapMod.to(track, {
    yPercent,
    duration: WORD_SWAP_S,
    ease: 'power2.inOut',
    overwrite: true,
    onComplete: () => {
      wordTween = null
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

async function playSheetClickFx(frameId: string) {
  if (reducedMotion.value || !canUseTileClickFx()) return
  const sheet = frameButton(frameId)?.querySelector(
    '.pc-frame__sheet',
  ) as HTMLElement | null
  if (!sheet) return
  const img =
    (sheet.querySelector('.pc-frame__shot--color') as HTMLImageElement | null) ||
    (sheet.querySelector('.pc-frame__shot') as HTMLImageElement | null)
  if (!img || !img.naturalWidth) return
  const g = await gsap()
  await playTileClickFx(g, sheet, img)
}

function onSheetEnter(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return
  if (canUseGoCursor()) {
    goOn.value = true
    goX.value = e.clientX
    goY.value = e.clientY
  }
}

function onSheetMove(e: PointerEvent) {
  if (!goOn.value) return
  goX.value = e.clientX
  goY.value = e.clientY
}

function onSheetLeave(e: PointerEvent) {
  const next = e.relatedTarget
  if (next instanceof Element && next.closest('.pc-frame__sheet')) return
  hideGoCursor()
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
  await new Promise<void>((r) => {
    requestAnimationFrame(() => requestAnimationFrame(() => r()))
  })
}

async function waitForHeroWarm() {
  if (heroSwarmReady.value) return
  const deadline = performance.now() + 520
  while (!heroSwarmReady.value && performance.now() < deadline) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
  }
}

async function freezeLiveMotion() {
  setLivePageFrozen(true)
  await pauseScrollDriven(true)
}

function pinPageScroll() {
  if (document.documentElement.classList.contains('page-canvas-lock')) return
  savedScrollY = window.scrollY
  lockScroll(true)
}

async function unlockSession(opts: { resumeScrollDriven?: boolean } = {}) {
  const resume = opts.resumeScrollDriven !== false
  if (document.documentElement.classList.contains('page-canvas-lock')) {
    lockScroll(false)
  } else {
    const body = document.body
    if (body.style.position === 'fixed') {
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      body.style.width = ''
      window.scrollTo(0, savedScrollY)
    }
  }
  if (resume) await pauseScrollDriven(false)
  else discardPausedScrollDriven()
  setLivePageFrozen(false)
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
    pinPageScroll()
    if (!isOpenRun(gen)) return
    showCanvasSurface()
    setIrisLive(true)
    await nextTick()
    if (!isOpenRun(gen)) return
    syncBackToMenu()
    const start = irisButtonGeom()
    const cover = irisCoverFrom(start)
    if (root) {
      applyIrisClip(root, clipFromGeom(reducedMotion.value ? cover : start))
    }
    void freezeLiveMotion()
    void ensureFrameCentered(currentId.value, 'instant', gen)

    if (root) {
      const g = await gsap()
      if (!isOpenRun(gen)) return
      g.set(root, { clearProps: 'opacity,visibility,pointerEvents' })
      if (closeTrackEl.value) g.set(closeTrackEl.value, { yPercent: 0 })
    }

    if (reducedMotion.value) {
      if (root) clearIrisClip(root)
      setIrisLive(false)
      swapCloseWord('back', true)
      await playPlaqueEnter()
      return
    }

    await playPlaqueEnter()
    if (!isOpenRun(gen)) return

    await tweenIris({
      from: start,
      to: cover,
      duration: IRIS_OPEN_S,
      ease: IRIS_OPEN_EASE,
    })
    if (!isOpenRun(gen)) return
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
  } finally {
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
      await unlockSession({
        resumeScrollDriven: !pausedOnPath || pausedOnPath === route.fullPath,
      })
      hideCanvasSurface()
      return
    }

    await gsap()
    if (!isCloseRun(gen)) return
    swapCloseWord('menu')

    const root = rootEl.value
    setIrisLive(true)
    await nextTick()
    if (!isCloseRun(gen)) return
    const start = irisButtonGeom()
    const cover = irisCoverFrom(start)
    if (root) applyIrisClip(root, clipFromGeom(cover))

    await tweenIris({
      from: cover,
      to: start,
      duration: IRIS_CLOSE_S,
      ease: 'power2.in',
    })
    if (!isCloseRun(gen)) return
    hideCanvasSurface()
    await unlockSession({
      resumeScrollDriven: !pausedOnPath || pausedOnPath === route.fullPath,
    })
  } catch (err) {
    console.warn('[PageCanvas] playClose failed', err)
    hideCanvasSurface()
    await unlockSession({ resumeScrollDriven: false })
  } finally {
    if (isCloseRun(gen)) busy.value = false
  }
}

async function goToFrame(frame: SiteNavFrame) {
  if (!open.value) return

  hideGoCursor()
  const closingCurrent = frameIsCurrent(frame)
  const gen = ++motionGen
  busy.value = true

  try {
    await playSheetClickFx(frame.id)
    if (gen !== motionGen || !open.value) return

    if (closingCurrent) {
      busy.value = false
      closeCanvas()
      return
    }

    navFromCanvas = true
    navHopActive = true

    if (reducedMotion.value) {
      if (frame.id === 'home') skipHeroIntro.value = true
      discardPausedScrollDriven()
      await unlockSession({ resumeScrollDriven: false })
      hideCanvasSurface()
      open.value = false
      await router.push(frame.to)
      await waitForRoutePaint()
      return
    }

    if (frame.id === 'home') skipHeroIntro.value = true
    open.value = false
    swapCloseWord('menu')

    await router.push(frame.to)
    await waitForRoutePaint()
    if (gen !== motionGen) return
    if (frame.id === 'home') await waitForHeroWarm()
    if (gen !== motionGen) return

    const root = rootEl.value
    setIrisLive(true)
    await nextTick()
    if (gen !== motionGen) return
    const start = irisButtonGeom()
    const cover = irisCoverFrom(start)
    if (root) applyIrisClip(root, clipFromGeom(cover))

    await tweenIris({
      from: cover,
      to: start,
      duration: IRIS_CLOSE_S,
      ease: 'power2.in',
    })
    if (gen !== motionGen) return
    hideCanvasSurface()
    discardPausedScrollDriven()
    await unlockSession({ resumeScrollDriven: false })
    lastFocus?.focus({ preventScroll: true })
    lastFocus = null
  } catch (err) {
    console.warn('[PageCanvas] hop failed', err)
    hideCanvasSurface()
    await unlockSession({ resumeScrollDriven: false })
  } finally {
    navFromCanvas = false
    navHopActive = false
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
    busy.value = true
    const ae = document.activeElement
    lastFocus = ae instanceof HTMLElement ? ae : null
    await nextTick()
    await playOpen()
    if (open.value) closeBtnEl.value?.focus({ preventScroll: true })
  } else if (wasOpen) {
    if (navFromCanvas || navHopActive) return
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
    if (pausedOnPath && pausedOnPath !== route.fullPath) {
      discardPausedScrollDriven()
    }
    if (open.value && !navFromCanvas && !navHopActive) closeCanvas()
  },
)

onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const narrowMq = window.matchMedia('(max-width: 767.98px)')
  const syncNarrow = () => {
    isNarrow.value = narrowMq.matches
  }
  syncNarrow()
  narrowMq.addEventListener('change', syncNarrow)
  syncFrameAspect()
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('resize', syncFrameAspect, { passive: true })
  for (const frame of canvasFrames) {
    const color = new Image()
    color.src = frame.preview
    const bw = new Image()
    bw.src = frame.previewBw
  }
  void gsap()
  void ensureScrollTrigger()

  onUnmounted(() => {
    narrowMq.removeEventListener('change', syncNarrow)
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', syncFrameAspect)
  void pauseScrollDriven(false)
  hideCanvasSurface()
  mailWaveTl?.kill()
  killIris()
  disposeTileClickFx()
  if (document.documentElement.classList.contains('page-canvas-lock')) {
    lockScroll(false)
  }
  setLivePageFrozen(false)
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
      }"
      :inert="!open"
      role="dialog"
      aria-modal="true"
      aria-label="Навигация по сайту"
    >
      <div class="page-canvas__veil" @click="closeCanvas" />

      <div class="page-canvas__chrome">
        <div class="page-canvas__chrome-top">
          <p class="page-canvas__eyebrow">Kadoflow · workspace</p>
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
          <span class="page-canvas__close-word">
            <span class="page-canvas__close-sizer" aria-hidden="true">закрыть</span>
            <span class="page-canvas__close-window">
              <span ref="closeTrackEl" class="page-canvas__close-track">
                <span class="page-canvas__close-line">меню</span>
                <span class="page-canvas__close-line">закрыть</span>
              </span>
            </span>
          </span>
          <span class="page-canvas__dots" aria-hidden="true">
            <span class="page-canvas__dot" />
            <span class="page-canvas__dot" />
          </span>
        </button>
        <div class="page-canvas__chrome-foot">
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
              <img
                class="pc-frame__shot pc-frame__shot--bw"
                :src="frame.previewBw"
                :data-color="frame.preview"
                alt=""
                draggable="false"
                @error="onShotError"
              >
              <img
                class="pc-frame__shot pc-frame__shot--color"
                :src="frame.preview"
                alt=""
                draggable="false"
              >
              <div class="pc-frame__motif" />
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
    <div
      class="pc-go"
      :class="{ 'pc-go--on': goOn }"
      :style="{ transform: `translate3d(${goX}px, ${goY}px, 0) translate(-50%, -50%)` }"
      aria-hidden="true"
    >
      <span class="pc-go__chip">перейти</span>
    </div>
  </Teleport>
</template>

<style scoped>
.page-canvas {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: block;
  overflow: hidden;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  color: var(--palette-ink);
  background: transparent;
}

.page-canvas--surface {
  visibility: visible !important;
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
  padding: var(--layout-header-inset) var(--layout-margin) 0;
  min-height: calc(2 * var(--layout-header-inset) + var(--layout-header-content));
  box-sizing: border-box;
}

.page-canvas__chrome-foot {
  bottom: 0;
  padding: 0 var(--layout-margin) calc(var(--layout-margin) + var(--safe-bottom));
}

.page-canvas__eyebrow {
  margin: 0;
  font-size: var(--type-nav);
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
  position: absolute;
  top: var(--layout-header-inset);
  right: var(--layout-margin);
  z-index: 3;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
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

.page-canvas__close-word {
  position: relative;
  z-index: 1;
  display: inline-block;
  overflow: hidden;
  transform: translateY(-2px);
}

.page-canvas__close-sizer {
  display: block;
  height: 1.25em;
  visibility: hidden;
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
  padding-top: calc(var(--layout-margin) + var(--safe-top) + 2.75rem);
  padding-bottom: calc(var(--layout-margin) + var(--safe-bottom) + 2.5rem);
}

.page-canvas__stage::-webkit-scrollbar {
  display: none;
}

.page-canvas__desk {
  box-sizing: border-box;
  min-height: 100%;
  padding: 0 var(--layout-margin);
  scrollbar-width: none;
}

.page-canvas__desk::-webkit-scrollbar {
  display: none;
}

@media (max-width: 767.98px) {
  .page-canvas__chrome-top {
    padding: calc(var(--layout-margin) + var(--safe-top)) var(--layout-margin) 0;
    min-height: 0;
  }

  .page-canvas__chrome-foot {
    justify-content: flex-start;
    gap: 1.25rem;
    padding-bottom: calc(
      2 * var(--layout-margin) + var(--safe-bottom) + 3.25rem
    );
  }

  .page-canvas__close {
    top: auto;
    right: calc(2 * var(--layout-margin) + var(--safe-right));
    bottom: calc(2 * var(--layout-margin) + var(--safe-bottom));
    padding: 10px 24px;
    background-color: color-mix(in srgb, var(--palette-sand) 72%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .page-canvas__stage {
    overflow: hidden;
    padding-top: calc(var(--layout-margin) + var(--safe-top) + 2.5rem);
    padding-bottom: calc(var(--layout-margin) + var(--safe-bottom) + 2.75rem);
  }

  .page-canvas__desk {
    display: flex;
    gap: 1rem;
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
    gap: clamp(1.25rem, 2.4vh, 2.25rem);
    align-content: start;
    width: 100%;
    max-width: calc(
      var(--layout-content) - var(--layout-column) - var(--layout-gutter)
    );
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
    max-width: var(--layout-span-10);
  }
}

.pc-frame {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0;
  border: 0;
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
  overflow: hidden;
  background: var(--palette-stone);
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

.pc-frame--current .pc-frame__sheet {
  outline: 1.5px solid color-mix(in srgb, var(--palette-ink) 55%, transparent);
  outline-offset: 3px;
}

.pc-frame:focus-visible .pc-frame__sheet {
  outline: 2px solid var(--palette-ink);
  outline-offset: 3px;
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
  margin: 0;
  transform-origin: 0 0;
  mix-blend-mode: difference;
}

.pc-go__chip {
  display: block;
  padding: 0.42rem 0.95rem;
  border: 1px solid #fff;
  border-radius: 4px;
  background: transparent;
  color: #fff;
  font-size: var(--type-nav);
  letter-spacing: 0.02em;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  transform: scale(0.86);
  transition:
    opacity 0.2s var(--motion-ease, ease),
    transform 0.22s var(--motion-ease, ease);
}

.pc-go--on .pc-go__chip {
  opacity: 1;
  transform: scale(1);
}

@media (prefers-reduced-motion: reduce) {
  .pc-go__chip {
    transform: none;
    transition: opacity 0.01s linear;
  }
}
</style>
