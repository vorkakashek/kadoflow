<script setup lang="ts">
import { canvasFrames, matchFramePath, type SiteNavFrame } from '~/utils/siteNav'
import {
  getPageShell,
  PAGE_SHELL_DOCK_SELECTOR,
} from '~/composables/usePageCanvas'
import {
  flowSurfaceMask,
  syncFlowSurfacePaintScrollComp,
} from '~/composables/useFlowSurfaceMask'
import { usePageCanvasPreviews } from '~/composables/usePageCanvasPreviews'

const { open, busy, surfaceOn, dockTo, closeCanvas } = usePageCanvas()
const { clearAllPreviews } = usePageCanvasPreviews()
const route = useRoute()
const router = useRouter()

const rootEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const deskEl = ref<HTMLElement | null>(null)
const closeBtnEl = ref<HTMLButtonElement | null>(null)
let lastFocus: HTMLElement | null = null
let savedScrollY = 0
/** True while goToFrame owns the close — must block playClose for the whole hop. */
let navFromCanvas = false
/** Stays true until after open=false has flushed, so the watch cannot race playClose. */
let navHopActive = false

const currentId = computed(() => matchFramePath(route.path))
const reducedMotion = ref(false)
const isNarrow = ref(false)

const OPEN_S = 0.72
const CLOSE_S = 0.58

/** Desk / tile mouse parallax (desktop only, after open settle). */
const PAR_DESK_PX = 16
const PAR_TILE_PX = 10
const PAR_LERP = 0.1

let gsapMod: typeof import('gsap').default | null = null
let stMod: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let parActive = false
let parRaf = 0
let parTargetX = 0
let parTargetY = 0
let parCurX = 0
let parCurY = 0
/** ScrollTriggers disabled for the canvas session (disable(false) = keep pose). */
let pausedTriggers: InstanceType<
  typeof import('gsap/ScrollTrigger').ScrollTrigger
>[] = []
/** Route path when STs were paused — never enable() after a navigation away. */
let pausedOnPath: string | null = null
/** Bumps to abort in-flight open/close/nav so the user can interrupt anytime. */
let motionGen = 0
let activeTl: { kill: () => void } | null = null

function killActiveMotion() {
  activeTl?.kill()
  activeTl = null
  rootEl.value?.classList.remove('page-canvas--zooming', 'page-canvas--flight-solo')
  const scroller = navScrollRoot()
  if (scroller && gsapMod) gsapMod.killTweensOf(scroller)
}

function isOpenRun(gen: number) {
  return gen === motionGen && open.value
}

function isCloseRun(gen: number) {
  return gen === motionGen && !open.value
}

/** Resolve on complete or kill — GSAP rejects killed thenables. */
async function awaitTween(tl: {
  then: (
    onfulfilled?: (() => void) | null,
    onrejected?: (() => void) | null,
  ) => Promise<unknown>
}) {
  try {
    await tl
  } catch {
    /* killed / interrupted */
  }
  if (activeTl === tl) activeTl = null
}

function showCanvasSurface(opts: { blankFrames?: boolean } = {}) {
  const root = rootEl.value
  if (root) {
    // Drop leftover GSAP hide from a prior close/hop — CSS --surface takes over.
    root.style.opacity = ''
    root.style.visibility = ''
    root.style.pointerEvents = ''
    // Only blank on open — on close we need the list visible for scroll-to-active.
    if (opts.blankFrames) {
      root.querySelectorAll('.pc-frame').forEach((node) => {
        ;(node as HTMLElement).style.opacity = '0'
      })
      const veil = root.querySelector('.page-canvas__veil') as HTMLElement | null
      if (veil) veil.style.opacity = '0'
    }
  }
  surfaceOn.value = true
}

function hideCanvasSurface() {
  surfaceOn.value = false
  // Do NOT clear tile shots here — only after close/nav animation fully ends.
  const root = rootEl.value
  if (!root) return
  root.style.opacity = ''
  root.style.visibility = ''
  // goToFrame sets inline pointer-events:none — must clear or cards die on reopen.
  root.style.pointerEvents = ''
}

function resetCanvasRootInline() {
  const root = rootEl.value
  if (!root) return
  root.style.opacity = ''
  root.style.visibility = ''
  root.style.pointerEvents = ''
  if (gsapMod) {
    gsapMod.set(root, { clearProps: 'opacity,visibility,pointerEvents' })
  }
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

/**
 * Freeze scroll-driven morph/parallax while the menu is open.
 * overflow:hidden alone often resets scrollY→0 and ST jumps the miniature to hero.
 */
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

  // Never enable() triggers from a page that already navigated away — that
  // hard-freezes the tab (and looks like the "dev server died").
  if (pausedOnPath && pausedOnPath !== route.fullPath) {
    discardPausedScrollDriven()
    return
  }

  // Re-enable only instances that still exist. After router.push the home page
  // unmounts and kills its triggers — enable() on those zombies freezes the tab.
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

/** Drop paused ST refs without enable — use when the page is about to unmount. */
function discardPausedScrollDriven() {
  pausedTriggers = []
  pausedOnPath = null
}

function setLivePageFrozen(frozen: boolean) {
  if (frozen) {
    flowSurfaceMask.freezeSilhouette = true
    return
  }
  // Restore morph-corridor freeze — don't leave edges dead after closing the menu.
  const m = flowSurfaceMask.morph
  flowSurfaceMask.freezeSilhouette = m > 0.02 && m < 0.98
}

function syncFrameAspect() {
  const root = rootEl.value
  if (!root || typeof window === 'undefined') return
  const vw = Math.max(1, window.innerWidth)
  const vh = Math.max(1, window.innerHeight)
  root.style.setProperty('--pc-aspect', String(vw / vh))
}

function frameIsCurrent(frame: SiteNavFrame) {
  return frame.id === currentId.value
}

/**
 * Lock page scroll without jumping content to y=0 (which remorphs Flow Surface).
 * Body is pinned with top:-savedScrollY; window scroll is restored on unlock.
 */
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

function slotFor(id: string) {
  return rootEl.value?.querySelector(
    `.pc-frame[data-frame-id="${id}"] .pc-frame__slot`,
  ) as HTMLElement | null
}

function sheetFor(id: string) {
  return rootEl.value?.querySelector(
    `.pc-frame[data-frame-id="${id}"] .pc-frame__sheet`,
  ) as HTMLElement | null
}

function frameButton(id: string) {
  return rootEl.value?.querySelector(
    `.pc-frame[data-frame-id="${id}"]`,
  ) as HTMLElement | null
}

/** Desk (mobile x) or stage (desktop y) — the nav list scroller. */
function navScrollRoot() {
  return isNarrow.value ? deskEl.value : stageEl.value
}

/** Put any plaque in the middle of the nav scroller. */
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

async function ensureActiveFrameCentered(
  behavior: ScrollBehavior,
  gen?: number,
) {
  await ensureFrameCentered(currentId.value, behavior, gen)
}

function dockTransform(slot: DOMRect) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  // Contain: page fits in plaque (letterbox = sand, never motif).
  const scale = Math.min(slot.width / vw, slot.height / vh)
  return {
    scale,
    x: slot.left + (slot.width - vw * scale) / 2,
    y: slot.top + (slot.height - vh * scale) / 2,
    vw,
    vh,
  }
}

/** Layout size → contain scale for the live miniature. */
function containDockScale(boxW: number, boxH: number, vw: number, vh: number) {
  return Math.min(boxW / Math.max(1, vw), boxH / Math.max(1, vh))
}

type DockPose = { x: number; y: number; scale: number }

/**
 * Where a final on-screen rect sits while the live page is still fullscreen
 * (inverse of shell dock: screen = dock.xy + local * dock.scale, origin 0 0).
 */
function zoomedInRect(final: DOMRect, dock: DockPose) {
  const s = Math.max(dock.scale, 1e-6)
  return {
    left: (final.left - dock.x) / s,
    top: (final.top - dock.y) / s,
    width: final.width / s,
    height: final.height / s,
  }
}

/** GSAP from-vars: element at desk pose → appears at camera-zoomed-in pose. */
function cameraFromVars(el: Element, dock: DockPose) {
  const final = el.getBoundingClientRect()
  const start = zoomedInRect(final, dock)
  return {
    x: start.left - final.left,
    y: start.top - final.top,
    scale: 1 / Math.max(dock.scale, 1e-6),
    transformOrigin: '0 0',
  }
}

function setZooming(on: boolean) {
  rootEl.value?.classList.toggle('page-canvas--zooming', on)
}

function canUseTileParallax() {
  if (reducedMotion.value || isNarrow.value) return false
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: fine)').matches
}

function paintTileParallax() {
  const desk = deskEl.value
  const root = rootEl.value
  if (!desk || !root) return
  const dx = -parCurX * PAR_DESK_PX
  const dy = -parCurY * PAR_DESK_PX
  desk.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`
  const frames = root.querySelectorAll('.pc-frame')
  frames.forEach((node, i) => {
    const el = node as HTMLElement
    // Slight depth variety — current tile a touch calmer so the live mini feels stable.
    const depth = el.classList.contains('pc-frame--current')
      ? 0.45
      : 0.65 + (i % 3) * 0.18
    const fx = -parCurX * PAR_TILE_PX * depth
    const fy = -parCurY * PAR_TILE_PX * depth
    el.style.transform = `translate3d(${fx.toFixed(2)}px, ${fy.toFixed(2)}px, 0)`
  })
}

function tickTileParallax() {
  parRaf = 0
  if (!parActive) return
  parCurX += (parTargetX - parCurX) * PAR_LERP
  parCurY += (parTargetY - parCurY) * PAR_LERP
  paintTileParallax()
  if (
    Math.abs(parTargetX - parCurX) > 0.0015
    || Math.abs(parTargetY - parCurY) > 0.0015
  ) {
    parRaf = requestAnimationFrame(tickTileParallax)
  }
}

function onTileParallaxMove(e: PointerEvent) {
  if (!parActive || e.pointerType !== 'mouse') return
  parTargetX = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1
  parTargetY = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1
  if (!parRaf) parRaf = requestAnimationFrame(tickTileParallax)
}

function startTileParallax() {
  stopTileParallax()
  if (!canUseTileParallax()) return
  parActive = true
  parTargetX = 0
  parTargetY = 0
  parCurX = 0
  parCurY = 0
  rootEl.value?.classList.add('page-canvas--parallax')
  window.addEventListener('pointermove', onTileParallaxMove, { passive: true })
}

function stopTileParallax() {
  parActive = false
  if (parRaf) {
    cancelAnimationFrame(parRaf)
    parRaf = 0
  }
  window.removeEventListener('pointermove', onTileParallaxMove)
  rootEl.value?.classList.remove('page-canvas--parallax')
  const desk = deskEl.value
  if (desk) desk.style.transform = ''
  rootEl.value?.querySelectorAll('.pc-frame').forEach((node) => {
    ;(node as HTMLElement).style.transform = ''
  })
  parTargetX = 0
  parTargetY = 0
  parCurX = 0
  parCurY = 0
}

/** Mark current tile as holding the live shell (hide motif only then). */
function setFrameDocked(on: boolean) {
  const root = rootEl.value
  if (!root) return
  root.querySelectorAll('.pc-frame--docked').forEach((node) => {
    node.classList.remove('pc-frame--docked')
  })
  if (!on) return
  const tile = root.querySelector(
    `.pc-frame[data-frame-id="${currentId.value}"]`,
  )
  tile?.classList.add('pc-frame--docked')
}

/** Wait until the destination route has committed a paint (avoids cover→stub flash). */
async function waitForRoutePaint() {
  await nextTick()
  await new Promise<void>((r) => {
    requestAnimationFrame(() => requestAnimationFrame(() => r()))
  })
}

/** Pin shell/paint to visual viewport px — avoids iOS 100vh overflow past the tile. */
function applyFlightViewport(shell: HTMLElement, paint: HTMLElement, vw: number, vh: number) {
  shell.style.width = `${vw}px`
  shell.style.height = `${vh}px`
  paint.style.width = `${vw}px`
  paint.style.minHeight = `${vh}px`
  paint.style.height = 'auto'
}

function onDockedShellClick(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  if (!open.value) return
  closeCanvas()
}

function bindDockedShellClick(on: boolean) {
  const shells = Array.from(
    document.querySelectorAll('.page-shell:not(.pc-shell-settle-cover)'),
  ) as HTMLElement[]
  for (const shell of shells) {
    if (on) shell.addEventListener('click', onDockedShellClick)
    else shell.removeEventListener('click', onDockedShellClick)
  }
}

/** Fixed fullscreen shell for the outzoom flight. */
function beginFlight() {
  const parts = getPageShell()
  if (!parts) return null
  const { shell, paint } = parts
  // Do NOT re-read window.scrollY here — after body position:fixed it is 0.
  // savedScrollY is captured in armCanvasSession before lock.
  dockTo.value = null
  shell.classList.remove('is-canvas-docked')
  shell.classList.add('is-canvas-flying')
  const vw = window.innerWidth
  const vh = window.innerHeight
  applyFlightViewport(shell, paint, vw, vh)
  paint.style.transform = `translate3d(0, ${-savedScrollY}px, 0)`
  paint.style.removeProperty('--pc-dock-scale')
  paint.style.removeProperty('--pc-dock-scroll')
  paint.style.removeProperty('--pc-dock-w')
  paint.style.removeProperty('--pc-dock-h')
  // Paint translate changes fixed-surface CB — shift frame into paint space.
  syncFlowSurfacePaintScrollComp(savedScrollY)
  bindDockedShellClick(true)
  return parts
}

function applyDockPaint(
  paint: HTMLElement,
  scale: number,
  scrollPx: number,
  vw: number,
  vh: number,
  /** Plaque box — never pass a still-flying fullscreen shell (ox/oy go wrong). */
  box: { width: number; height: number },
) {
  const boxW = Math.max(1, box.width)
  const boxH = Math.max(1, box.height)
  paint.style.setProperty('--pc-dock-scale', String(scale))
  paint.style.setProperty('--pc-dock-scroll', `${scrollPx}px`)
  paint.style.setProperty('--pc-dock-w', `${vw}px`)
  paint.style.setProperty('--pc-dock-h', `${vh}px`)
  paint.style.width = `${vw}px`
  paint.style.height = 'auto'
  paint.style.minHeight = `${vh}px`
  paint.style.transformOrigin = '0 0'
  // Center contain-fit in the plaque (same letterbox as flight dockTransform).
  const ox = (boxW - vw * scale) / 2
  const oy = (boxH - vh * scale) / 2
  paint.style.left = `${ox}px`
  paint.style.top = `${oy}px`
  /**
   * Same model as flight: translate scroll first, then scale (CSS applies right→left).
   * `translate scale` was wrong — unscaled -scrollY after scale shoved the view
   * out of the tile (empty plaque after settle, while GSAP flight still looked fine).
   */
  paint.style.transform = `scale(${scale}) translate3d(0, ${scrollPx}px, 0)`
  syncFlowSurfacePaintScrollComp(-scrollPx)
}

/** Drop GSAP flight matrix — leftover scale shrinks the docked mini into a corner. */
function clearShellFlightTransform(
  g: typeof import('gsap').default,
  shell: HTMLElement,
  opts: { hidden?: boolean } = {},
) {
  g.killTweensOf(shell)
  // While a stub cover is zooming, keep the real page invisible — otherwise the
  // live shell pops in at fullscreen and looks like “stub swapped to screenshot”.
  g.set(shell, {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    autoAlpha: opts.hidden ? 0 : 1,
  })
  g.set(shell, {
    clearProps: opts.hidden
      ? 'transform,x,y,scale,rotation,borderRadius'
      : 'transform,x,y,scale,rotation,borderRadius,opacity,visibility',
  })
  shell.style.transform = ''
  shell.style.translate = ''
  shell.style.scale = ''
  shell.style.top = ''
  shell.style.left = ''
  shell.style.width = ''
  shell.style.height = ''
  shell.style.borderRadius = ''
  if (opts.hidden) {
    shell.style.opacity = '0'
    shell.style.visibility = 'hidden'
  } else {
    shell.style.opacity = ''
    shell.style.visibility = ''
  }
}

/** Stray covers from interrupted nav — remove every time. */
function removeNavCovers(except?: HTMLElement | null) {
  document.querySelectorAll('.pc-frame__cover').forEach((node) => {
    if (except && node === except) return
    node.remove()
  })
}

/**
 * Nuclear reset of every page-shell — leftover flight scale is what makes the
 * next page look like a floating plaque on a sand underlay (esp. repeat hops).
 */
async function scrubPageShell(
  opts: { keepCover?: HTMLElement | null; hideShell?: boolean } = {},
) {
  removeSettleCovers()
  removeNavCovers(opts.keepCover ?? null)
  dockTo.value = null
  setFrameDocked(false)
  await nextTick()
  const g = await gsap()
  const shells = Array.from(
    document.querySelectorAll('.page-shell:not(.pc-shell-settle-cover)'),
  ) as HTMLElement[]
  for (const shell of shells) {
    clearShellFlightTransform(g, shell, { hidden: opts.hideShell })
    shell.classList.remove('is-canvas-docked', 'is-canvas-flying')
    // Don't wipe opacity/visibility if we intentionally hide under a cover.
    if (!opts.hideShell) {
      shell.style.cssText = ''
      shell.style.pointerEvents = ''
    } else {
      shell.style.pointerEvents = 'none'
    }
  }
  document
    .querySelectorAll('.page-shell:not(.pc-shell-settle-cover) .page-shell__paint')
    .forEach((node) => {
    const el = node as HTMLElement
    g.killTweensOf(el)
    el.style.cssText = ''
  })
  syncFlowSurfacePaintScrollComp(0)
}

/** Stamp <canvas> pixels onto a clone (WebGL/2d). Best-effort — may be blank. */
function stampCanvasPixels(fromRoot: HTMLElement, toRoot: HTMLElement) {
  const src = fromRoot.querySelectorAll('canvas')
  const dst = toRoot.querySelectorAll('canvas')
  for (let i = 0; i < src.length && i < dst.length; i++) {
    const a = src[i] as HTMLCanvasElement
    const b = dst[i] as HTMLCanvasElement
    try {
      b.width = a.width
      b.height = a.height
      const ctx = b.getContext('2d')
      ctx?.drawImage(a, 0, 0)
    } catch {
      /* tainted / webgl without preserveDrawingBuffer */
    }
  }
}

function removeSettleCovers() {
  document.querySelectorAll('.pc-shell-settle-cover').forEach((n) => n.remove())
}

/**
 * Pin a fixed clone of the flying shell so Teleport can move the real node
 * without a 1-frame hole (the open-menu screenshot blink).
 */
function pinFlightSettleCover(shell: HTMLElement) {
  removeSettleCovers()
  const cover = shell.cloneNode(true) as HTMLElement
  cover.classList.add('pc-shell-settle-cover', 'is-canvas-flying')
  cover.classList.remove('is-canvas-docked')
  cover.removeAttribute('id')
  cover.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'))
  cover.setAttribute('aria-hidden', 'true')
  // Keep GSAP inline transform / size from the live flyer.
  cover.style.cssText = shell.style.cssText
  cover.style.zIndex = '220'
  cover.style.pointerEvents = 'none'
  cover.style.margin = '0'
  cover.style.opacity = '1'
  cover.style.visibility = 'visible'
  document.body.appendChild(cover)
  stampCanvasPixels(shell, cover)
  return cover
}

/** After outzoom: Teleport shell into the frame slot (scrolls with the desk). */
async function settleIntoSlot(
  slot: HTMLElement,
  flightDock?: { scale: number; x: number; y: number },
) {
  const parts = getPageShell()
  if (!parts) return
  const g = await gsap()
  const vw = Math.max(1, window.innerWidth)
  const vh = Math.max(1, window.innerHeight)
  const scrollPx = -savedScrollY
  const { shell } = parts

  const slotBox = {
    width: Math.max(1, slot.clientWidth),
    height: Math.max(1, slot.clientHeight),
  }
  // Prefer the flight-end scale so handoff matches the zoom pose.
  const scale0 =
    flightDock?.scale ?? containDockScale(slotBox.width, slotBox.height, vw, vh)

  const frame = slot.closest('.pc-frame') as HTMLElement | null
  if (frame) g.set(frame, { autoAlpha: 1 })

  // Cover stays on screen while Teleport moves the real shell.
  // Opacity only — visibility:hidden can drop the WebGL buffer (home blink).
  const cover = pinFlightSettleCover(shell)
  g.set(shell, { opacity: 0 })
  shell.style.visibility = 'visible'

  dockTo.value = PAGE_SHELL_DOCK_SELECTOR
  await nextTick()

  const after = getPageShell()
  if (!after) {
    cover.remove()
    return
  }
  const live = after.shell
  const livePaint = after.paint

  g.killTweensOf(live)
  // Drop flying FIRST — while flying, shell is 100vw and ox/oy letterbox wrong.
  setFrameDocked(true)
  live.classList.remove('is-canvas-flying')
  g.set(live, {
    x: 0,
    y: 0,
    scale: 1,
    clearProps: 'transform,x,y,scale,rotation,borderRadius',
  })
  live.style.transform = ''
  live.style.translate = ''
  live.style.scale = ''
  live.style.top = ''
  live.style.left = ''
  live.style.width = ''
  live.style.height = ''
  live.style.borderRadius = ''
  live.style.visibility = 'visible'
  live.style.opacity = '0'

  // Paint against the plaque box (not a fullscreen flyer).
  applyDockPaint(livePaint, scale0, scrollPx, vw, vh, slotBox)

  // Layout settle under cover, then letterbox against the real plaque box.
  // Keep flight scale — swapping scale here is what read as “хряк криво”.
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  )
  const box2 = {
    width: Math.max(1, live.clientWidth || slot.clientWidth),
    height: Math.max(1, live.clientHeight || slot.clientHeight),
  }
  applyDockPaint(livePaint, scale0, scrollPx, vw, vh, box2)

  // Let WebGL ResizeObserver setSize+render under the cover before we drop it.
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  )

  live.style.opacity = ''
  g.set(live, { opacity: 1, clearProps: 'opacity' })
  // One frame with both stacked → drop cover without a hole.
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  cover.remove()

  bindDockedShellClick(true)
}

/** Before zoom-in / navigate: lift shell back to fixed flight matching on-screen rect. */
async function liftFromSlot() {
  const parts = getPageShell()
  if (!parts) return null
  const g = await gsap()
  const { shell } = parts

  if (!dockTo.value) return parts

  const rect = shell.getBoundingClientRect()
  const vw = Math.max(1, window.innerWidth)
  const vh = Math.max(1, window.innerHeight)
  const scale = containDockScale(rect.width, rect.height, vw, vh)
  const x = rect.left + (rect.width - vw * scale) / 2
  const y = rect.top + (rect.height - vh * scale) / 2

  setFrameDocked(false)
  const cover = pinFlightSettleCover(shell)
  // Opacity only — keep WebGL buffer alive under the cover.
  g.set(shell, { opacity: 0 })
  shell.style.visibility = 'visible'

  dockTo.value = null
  await nextTick()

  const after = getPageShell()
  if (!after) {
    cover.remove()
    return null
  }
  const live = after.shell
  const livePaint = after.paint

  live.classList.remove('is-canvas-docked')
  live.classList.add('is-canvas-flying')
  livePaint.style.removeProperty('--pc-dock-scale')
  livePaint.style.removeProperty('--pc-dock-scroll')
  livePaint.style.removeProperty('--pc-dock-w')
  livePaint.style.removeProperty('--pc-dock-h')
  livePaint.style.left = ''
  livePaint.style.top = ''
  applyFlightViewport(live, livePaint, vw, vh)
  livePaint.style.transform = `translate3d(0, ${-savedScrollY}px, 0)`
  syncFlowSurfacePaintScrollComp(savedScrollY)
  g.set(live, {
    x,
    y,
    scale,
    borderRadius: 4,
    transformOrigin: '0 0',
    opacity: 1,
  })
  live.style.visibility = 'visible'
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  )
  cover.remove()

  bindDockedShellClick(true)
  return { shell: live, paint: livePaint }
}

async function unfreezeShell(
  opts: {
    resumeScrollDriven?: boolean
    keepCover?: HTMLElement | null
    hideShell?: boolean
  } = {},
) {
  const resume = opts.resumeScrollDriven !== false
  stopTileParallax()
  bindDockedShellClick(false)
  await scrubPageShell({
    keepCover: opts.keepCover ?? null,
    hideShell: opts.hideShell,
  })

  if (document.documentElement.classList.contains('page-canvas-lock')) {
    lockScroll(false)
  } else {
    // Belts: clear body pin leftovers even if class was dropped.
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
  if (resume) {
    await pauseScrollDriven(false)
  } else {
    discardPausedScrollDriven()
  }
  setLivePageFrozen(false)
  setZooming(false)
  rootEl.value?.querySelectorAll('.pc-frame--flight').forEach((node) => {
    node.classList.remove('pc-frame--flight')
  })
}

/** Pin scroll + freeze ST once per canvas session (safe to call if already locked). */
async function armCanvasSession() {
  setLivePageFrozen(true)
  if (document.documentElement.classList.contains('page-canvas-lock')) return
  // Capture before lock — body position:fixed makes window.scrollY read as 0.
  savedScrollY = window.scrollY
  await pauseScrollDriven(true)
  lockScroll(true)
}

async function playOpen() {
  const root = rootEl.value
  if (!root) return
  const gen = ++motionGen
  killActiveMotion()
  busy.value = true
  stopTileParallax()
  // Show before any await — reopen must never depend on a later GSAP autoAlpha.
  showCanvasSurface({ blankFrames: true })

  try {
    // Leftover flight from a broken close: scrub DOM without re-enabling ST
    // (re-enable would remorph Flow Surface / Kado fill at scrollY=0).
    const strayFlight = document.querySelector(
      '.page-shell.is-canvas-flying:not(.pc-shell-settle-cover)',
    )
    if (strayFlight) {
      await unfreezeShell({ resumeScrollDriven: false })
      if (!isOpenRun(gen)) return
    }

    await armCanvasSession()
    if (!isOpenRun(gen)) return

    // Lock → flight in the same stretch: avoid a painted frame of the
    // unlocked/scrolled page before the outzoom target exists.
    const earlySlot = slotFor(currentId.value)
    const parts = beginFlight()

    const g = await gsap()
    if (!isOpenRun(gen)) return

    const chromeTop = root.querySelector('.page-canvas__chrome-top')
    const chromeFoot = root.querySelector('.page-canvas__chrome-foot')
    const chromeBits = [chromeTop, chromeFoot].filter(Boolean)

    g.set(root, { clearProps: 'opacity,visibility,pointerEvents' })
    g.set(root.querySelectorAll('.pc-frame'), { autoAlpha: 0 })
    g.set(root.querySelectorAll('.pc-frame__meta'), { autoAlpha: 0 })
    g.set(chromeBits, { autoAlpha: 0, y: 0 })
    g.set(root.querySelector('.page-canvas__veil'), { autoAlpha: 0 })

    await nextTick()
    if (!isOpenRun(gen)) return

    // Always re-center on open — never reopen at the previous list scroll.
    await ensureActiveFrameCentered('instant')
    if (!isOpenRun(gen)) return

    syncFrameAspect()
    const currentSlot = slotFor(currentId.value) ?? earlySlot
    if (!parts || !currentSlot) {
      g.set(root.querySelectorAll('.pc-frame'), { autoAlpha: 1 })
      g.set(root.querySelectorAll('.pc-frame__meta'), { autoAlpha: 1 })
      g.set(chromeBits, { autoAlpha: 1, y: 0 })
      g.set(root.querySelector('.page-canvas__veil'), { autoAlpha: 1 })
      if (currentSlot) await settleIntoSlot(currentSlot)
      if (!isOpenRun(gen)) return
      startTileParallax()
      return
    }

    const { shell } = parts
    // Remeasure after center — flight target must match settle scale.
    const slotRect = currentSlot.getBoundingClientRect()
    const dock = dockTransform(slotRect)
    const currentFrame = root.querySelector(
      '.pc-frame--current',
    ) as HTMLElement | null
    const others = Array.from(
      root.querySelectorAll('.pc-frame:not(.pc-frame--current)'),
    ) as HTMLElement[]
    const allMeta = root.querySelectorAll('.pc-frame__meta')
    const veil = root.querySelector('.page-canvas__veil')

    g.set(shell, { x: 0, y: 0, scale: 1, transformOrigin: '0 0' })
    g.set(allMeta, { autoAlpha: 0 })
    // Flight backdrop only — no neighbor plaques / stubs behind the screenshot.
    g.set(veil, { autoAlpha: 1 })
    g.set(others, { autoAlpha: 0, x: 0, y: 0, scale: 1, clearProps: 'transform' })
    if (currentFrame) g.set(currentFrame, { autoAlpha: 0 })

    if (reducedMotion.value) {
      g.set([others, allMeta, veil, currentFrame].filter(Boolean), {
        autoAlpha: 1,
      })
      g.set(chromeBits, { autoAlpha: 1, y: 0 })
      await settleIntoSlot(currentSlot, dock)
      if (!isOpenRun(gen)) return
      startTileParallax()
      return
    }

    setZooming(true)
    root.classList.add('page-canvas--flight-solo')
    if (currentFrame) currentFrame.classList.add('pc-frame--flight')

    const tl = g.timeline({
      onComplete: () => setZooming(false),
    })
    activeTl = tl
    // Only the live page flies — desk stays hidden until settle.
    tl.to(
      shell,
      {
        x: dock.x,
        y: dock.y,
        scale: dock.scale,
        borderRadius: 4,
        duration: OPEN_S,
        ease: 'power2.inOut',
      },
      0,
    )
    await awaitTween(tl)
    if (!isOpenRun(gen)) return

    // Re-read slot after flight — pass exact flight scale into settle.
    const endRect = currentSlot.getBoundingClientRect()
    const endDock = dockTransform(endRect)
    await settleIntoSlot(currentSlot, endDock)
    currentFrame?.classList.remove('pc-frame--flight')
    root.classList.remove('page-canvas--flight-solo')
    if (currentFrame) g.set(currentFrame, { autoAlpha: 1 })
    if (!isOpenRun(gen)) return

    const ui = g.timeline()
    activeTl = ui
    if (chromeTop) {
      ui.fromTo(
        chromeTop,
        { autoAlpha: 0, y: -18 },
        { autoAlpha: 1, y: 0, duration: 0.42, ease: 'power3.out' },
        0,
      )
    }
    if (chromeFoot) {
      ui.fromTo(
        chromeFoot,
        { autoAlpha: 0, y: 16 },
        { autoAlpha: 1, y: 0, duration: 0.42, ease: 'power3.out' },
        0.05,
      )
    }
    ui.to(
      others,
      {
        autoAlpha: 1,
        duration: 0.38,
        stagger: 0.03,
        ease: 'power2.out',
      },
      0.06,
    )
    ui.fromTo(
      allMeta,
      { autoAlpha: 0, y: 10 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.4,
        stagger: 0.035,
        ease: 'power2.out',
        clearProps: 'transform',
      },
      0.08,
    )
    await awaitTween(ui)
    if (!isOpenRun(gen)) return

    startTileParallax()
  } catch (err) {
    console.warn('[PageCanvas] playOpen failed', err)
    rootEl.value?.classList.remove('page-canvas--flight-solo')
  } finally {
    if (isOpenRun(gen)) busy.value = false
  }
}

async function playClose() {
  const root = rootEl.value
  const gen = ++motionGen
  killActiveMotion()
  stopTileParallax()
  busy.value = true
  // Keep the nav list painted — do NOT blank frames (that caused the white flash).
  showCanvasSurface()

  try {
    if (!root) {
      await unfreezeShell({ resumeScrollDriven: false })
      return
    }

    const g = await gsap()
    if (!isCloseRun(gen)) return

    // 1) Scroll active plaque into center while everything is still visible.
    await ensureActiveFrameCentered('smooth', gen)
    if (!isCloseRun(gen)) return
    await nextTick()

    const chromeTop = root.querySelector('.page-canvas__chrome-top')
    const chromeFoot = root.querySelector('.page-canvas__chrome-foot')
    const allMeta = root.querySelectorAll('.pc-frame__meta')
    const currentFrame = root.querySelector(
      '.pc-frame--current',
    ) as HTMLElement | null
    const veil = root.querySelector('.page-canvas__veil')
    const others = Array.from(
      root.querySelectorAll('.pc-frame:not(.pc-frame--current)'),
    ) as HTMLElement[]

    // 2) Hide chrome + neighbors — zoom-in is screenshot on sand only.
    g.set([chromeTop, chromeFoot, allMeta, ...others].filter(Boolean), {
      autoAlpha: 0,
      clearProps: 'transform',
    })
    if (veil) g.set(veil, { autoAlpha: 1 })
    root.classList.add('page-canvas--flight-solo')

    if (currentFrame) currentFrame.classList.add('pc-frame--flight')

    const wasDocked = !!dockTo.value
    const parts = wasDocked ? await liftFromSlot() : getPageShell()
    if (!isCloseRun(gen)) return

    // Empty dock hole under the flying shell — hide after lift.
    if (currentFrame) g.set(currentFrame, { autoAlpha: 0 })

    const currentSlot = slotFor(currentId.value)

    if (reducedMotion.value || !parts || !currentSlot) {
      setZooming(false)
      root.classList.remove('page-canvas--flight-solo')
      g.set(others, { clearProps: 'transform' })
      await unfreezeShell({
        resumeScrollDriven: !pausedOnPath || pausedOnPath === route.fullPath,
      })
      return
    }

    const { shell } = parts
    if (!shell.classList.contains('is-canvas-flying')) {
      shell.classList.add('is-canvas-flying')
    }
    const dur = wasDocked ? CLOSE_S : Math.min(CLOSE_S, 0.36)

    setZooming(true)
    const tl = g.timeline({
      onComplete: () => setZooming(false),
    })
    activeTl = tl
    tl.to(
      shell,
      {
        x: 0,
        y: 0,
        scale: 1,
        borderRadius: 0,
        duration: dur,
        ease: 'power2.inOut',
      },
      0,
    )
    tl.to(veil, { autoAlpha: 0, duration: dur * 0.45, ease: 'power1.in' }, dur * 0.55)
    await awaitTween(tl)
    if (!isCloseRun(gen)) return

    root.classList.remove('page-canvas--flight-solo')
    g.set(others, { clearProps: 'transform' })
    await unfreezeShell({
      resumeScrollDriven: !pausedOnPath || pausedOnPath === route.fullPath,
    })
  } catch (err) {
    console.warn('[PageCanvas] playClose failed', err)
    rootEl.value?.classList.remove('page-canvas--flight-solo')
    try {
      await unfreezeShell({ resumeScrollDriven: false })
    } catch {
      /* ignore */
    }
  } finally {
    if (isCloseRun(gen)) {
      rootEl.value?.classList.remove('page-canvas--flight-solo')
      const stray = document.querySelector(
        '.page-shell.is-canvas-flying:not(.pc-shell-settle-cover)',
      )
      if (
        stray ||
        document.documentElement.classList.contains('page-canvas-lock')
      ) {
        try {
          await unfreezeShell({ resumeScrollDriven: false })
        } catch {
          /* ignore */
        }
      }
      hideCanvasSurface()
      // Drop tile shots only after the close zoom has fully finished.
      clearAllPreviews()
      busy.value = false
    }
  }
}

async function goToFrame(frame: SiteNavFrame) {
  if (frameIsCurrent(frame)) {
    closeCanvas()
    return
  }
  if (!open.value) return

  const gen = ++motionGen
  killActiveMotion()
  busy.value = true
  stopTileParallax()
  // Block playClose for the entire hop — including after open flips false.
  navFromCanvas = true
  navHopActive = true
  const root = rootEl.value
  const sheet = sheetFor(frame.id)
  let cover: HTMLElement | null = null
  let hopDone = false

  try {
    const g = await gsap()

    await ensureFrameCentered(frame.id, 'smooth', gen)
    if (gen !== motionGen) return

    if (!root || !sheet || reducedMotion.value) {
      discardPausedScrollDriven()
      await unfreezeShell({ resumeScrollDriven: false })
      hideCanvasSurface()
      open.value = false
      await router.push(frame.to)
      await waitForRoutePaint()
      try {
        ;(await ensureScrollTrigger()).refresh()
      } catch {
        /* ignore */
      }
      hopDone = true
      return
    }

    // 1) Cover = exact nav plaque (sheet + motif). NO full-page overlay yet —
    //    that overlay used viewport padding and looked empty at tile size,
    //    so the stub appeared to vanish on click.
    const liveSheet = sheetFor(frame.id) ?? sheet
    const sourceBtn = frameButton(frame.id)
    const rect = liveSheet.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) {
      discardPausedScrollDriven()
      await unfreezeShell({ resumeScrollDriven: false })
      hideCanvasSurface()
      open.value = false
      await router.push(frame.to)
      await waitForRoutePaint()
      hopDone = true
      return
    }

    removeNavCovers()

    cover = document.createElement('div')
    cover.className = `pc-frame pc-frame--${frame.motif} pc-frame__cover pc-frame__cover--stub`
    cover.setAttribute('aria-hidden', 'true')

    const sheetClone = liveSheet.cloneNode(true) as HTMLElement
    sheetClone.querySelector('.pc-frame__slot')?.replaceChildren()
    let motifEl = sheetClone.querySelector('.pc-frame__motif') as HTMLElement | null
    if (!motifEl) {
      motifEl = document.createElement('div')
      motifEl.className = 'pc-frame__motif'
      sheetClone.appendChild(motifEl)
    }
    motifEl.style.opacity = '1'
    motifEl.style.visibility = 'visible'
    // Flatten sheet to fill the fixed cover (no aspect-ratio gap).
    Object.assign(sheetClone.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      margin: '0',
      aspectRatio: 'unset',
      borderRadius: '4px',
      transform: 'none',
    })
    cover.appendChild(sheetClone)

    Object.assign(cover.style, {
      position: 'fixed',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      zIndex: '200',
      transform: 'none',
      pointerEvents: 'none',
      background: 'var(--palette-stone)',
      overflow: 'hidden',
      borderRadius: '4px',
      display: 'block',
      opacity: '1',
      visibility: 'visible',
      boxSizing: 'border-box',
    })
    document.body.appendChild(cover)

    // Hide only the source plaque under the cover — keep menu visible one frame
    // so the handoff never flashes empty sand.
    if (sourceBtn) g.set(sourceBtn, { autoAlpha: 0 })
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    if (gen !== motionGen) return

    // 2) Drop canvas + live shell under the cover (no playClose / live zoom).
    discardPausedScrollDriven()
    g.killTweensOf([root, getPageShell()?.shell].filter(Boolean))
    g.set(root, { autoAlpha: 0, pointerEvents: 'none' })
    const shellNow = getPageShell()?.shell
    if (shellNow) g.set(shellNow, { autoAlpha: 0 })
    await unfreezeShell({
      resumeScrollDriven: false,
      keepCover: cover,
      hideShell: true,
    })
    await scrubPageShell({ keepCover: cover, hideShell: true })
    const shellHidden = getPageShell()?.shell
    if (shellHidden) {
      shellHidden.style.opacity = '0'
      shellHidden.style.visibility = 'hidden'
      shellHidden.style.pointerEvents = 'none'
    }

    // 3) Stub plaque zooms to fullscreen.
    await g.to(cover, {
      top: 0,
      left: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      borderRadius: 0,
      duration: 0.62,
      ease: 'power2.inOut',
    })
    if (gen !== motionGen) return

    // 4) Mount real page UNDER the still-opaque stub. Close the menu while
    //    covered — never fade the stub onto the desk, then hide the desk.
    await router.push(frame.to)
    await waitForRoutePaint()
    await scrubPageShell({ keepCover: cover, hideShell: true })
    try {
      ;(await ensureScrollTrigger()).refresh()
    } catch {
      /* ignore */
    }
    if (gen !== motionGen) return

    hideCanvasSurface()
    open.value = false
    clearAllPreviews()
    await nextTick()

    const shell = getPageShell()?.shell
    if (shell) {
      g.set(shell, { autoAlpha: 1, clearProps: 'opacity,visibility' })
      shell.style.opacity = ''
      shell.style.visibility = ''
      shell.style.pointerEvents = ''
    }

    // 5) Stub → page only.
    await g.to(cover, {
      autoAlpha: 0,
      duration: 0.42,
      ease: 'power1.out',
    })

    lastFocus?.focus({ preventScroll: true })
    lastFocus = null
    hopDone = true
    await nextTick()
  } finally {
    cover?.remove()
    await scrubPageShell()
    resetCanvasRootInline()
    // Aborted hop with menu still open: restore interactive surface.
    if (!hopDone && open.value) {
      showCanvasSurface()
      const btn = frameButton(frame.id)
      if (btn && gsapMod) gsapMod.set(btn, { clearProps: 'opacity,visibility' })
      else if (btn) {
        btn.style.opacity = ''
        btn.style.visibility = ''
      }
    }
    await nextTick()
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
    // Arm busy before any await — Home WebGL keys off busy to avoid a 1-tick pause flash.
    busy.value = true
    const ae = document.activeElement
    lastFocus = ae instanceof HTMLElement ? ae : null
    await nextTick()
    await playOpen()
    if (open.value) closeBtnEl.value?.focus({ preventScroll: true })
  } else if (wasOpen) {
    // Canvas tile hop closes open without the live-page zoom-in.
    if (navFromCanvas || navHopActive) return
    await playClose()
    if (!open.value) {
      if (
        document.querySelector(
          '.page-shell.is-canvas-flying:not(.pc-shell-settle-cover)',
        ) ||
        document.documentElement.classList.contains('page-canvas-lock')
      ) {
        await unfreezeShell({ resumeScrollDriven: false })
      }
      hideCanvasSurface()
      clearAllPreviews()
      lastFocus?.focus({ preventScroll: true })
      lastFocus = null
    }
  }
})

watch(
  () => route.fullPath,
  () => {
    // Any SPA nav (logo, header links, …) must drop paused STs from the leaving
    // page — resume/enable on zombies freezes the tab.
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

  onUnmounted(() => {
    narrowMq.removeEventListener('change', syncNarrow)
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', syncFrameAspect)
  stopTileParallax()
  void pauseScrollDriven(false)
  bindDockedShellClick(false)
  dockTo.value = null
  setZooming(false)
  hideCanvasSurface()
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
      :aria-hidden="open ? 'false' : 'true'"
      role="dialog"
      aria-modal="true"
      aria-label="Навигация по сайту"
    >
      <div class="page-canvas__veil" @click="closeCanvas" />

      <div class="page-canvas__chrome">
        <div class="page-canvas__chrome-top">
          <p class="page-canvas__eyebrow">Kadoflow · workspace</p>
          <button
            ref="closeBtnEl"
            type="button"
            class="page-canvas__close"
            :tabindex="open ? 0 : -1"
            @click="closeCanvas"
          >
            закрыть
          </button>
        </div>
        <div class="page-canvas__chrome-foot">
          <a
            class="page-canvas__mail"
            href="mailto:hello@kadoflow.com"
            :tabindex="open ? 0 : -1"
          >hello@kadoflow.com</a>
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

      <div ref="stageEl" class="page-canvas__stage">
        <div ref="deskEl" class="page-canvas__desk" role="list">
          <button
            v-for="frame in canvasFrames"
            :key="frame.id"
            type="button"
            class="pc-frame"
            :class="[
              `pc-frame--${frame.motif}`,
              {
                'pc-frame--current': frameIsCurrent(frame),
                'pc-frame--live': frameIsCurrent(frame),
              },
            ]"
            :data-frame-id="frame.id"
            role="listitem"
            :tabindex="open ? 0 : -1"
            :aria-current="frameIsCurrent(frame) ? 'page' : undefined"
            @click="goToFrame(frame)"
          >
            <div class="pc-frame__sheet" aria-hidden="true">
              <!-- Live page Teleports into this slot (current frame only). -->
              <div
                class="pc-frame__slot"
                :id="frameIsCurrent(frame) ? 'pc-live-dock' : undefined"
              />
              <!-- Live = current only. Everyone else is a stub until the next open. -->
              <div
                v-if="!frameIsCurrent(frame)"
                class="pc-frame__motif"
              />
            </div>
            <div class="pc-frame__meta">
              <span class="pc-frame__index">{{ frame.index }}</span>
              <div class="pc-frame__title-row">
                <span class="pc-frame__label">{{ frame.label }}</span>
                <span v-if="frameIsCurrent(frame)" class="pc-frame__here">Вы здесь</span>
              </div>
              <span class="pc-frame__blurb">{{ frame.blurb }}</span>
              <span
                v-if="!frameIsCurrent(frame)"
                class="pc-frame__hint"
              >Открыть</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page-canvas {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: block;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  color: var(--palette-ink);
  background: transparent;
}

/* Session surface — independent of `open` so close zoom stays visible after toggle.
   !important beats leftover GSAP inline opacity/visibility from prior sessions. */
.page-canvas--surface {
  visibility: visible !important;
  opacity: 1 !important;
}

.page-canvas--open,
.page-canvas--surface.page-canvas--open {
  pointer-events: auto !important;
}

/* During close zoom (`surface` without `open`) ignore hits — shell handles interrupt. */
.page-canvas--surface:not(.page-canvas--open) {
  pointer-events: none;
}

/* During camera zoom neighbors sit outside the desk clip — let them paint. */
.page-canvas--zooming .page-canvas__stage,
.page-canvas--zooming .page-canvas__desk {
  overflow: visible !important;
}

.page-canvas--zooming .pc-frame:not(.pc-frame--current) {
  will-change: transform;
}

.page-canvas--parallax .page-canvas__desk,
.page-canvas--parallax .pc-frame {
  will-change: transform;
}

.page-canvas__veil {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: color-mix(in srgb, var(--palette-sand) 92%, var(--palette-stone));
}

/* Open/close flight: solid sand only behind the live page — no desk peeking. */
.page-canvas--flight-solo .page-canvas__veil {
  background: var(--palette-sand);
  opacity: 1 !important;
  visibility: visible !important;
}

.page-canvas--flight-solo .page-canvas__desk {
  visibility: hidden;
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
  will-change: transform, opacity;
}

.page-canvas__chrome-top {
  top: 0;
  padding: calc(var(--layout-margin) + var(--safe-top)) var(--layout-margin) 0;
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
  padding: 0;
  cursor: pointer;
  appearance: none;
}

.page-canvas__mail:hover,
.page-canvas__mail:focus-visible,
.page-canvas__lang:hover,
.page-canvas__lang:focus-visible {
  text-decoration: underline;
  text-underline-offset: 0.18em;
}

.page-canvas__lang {
  text-align: right;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.page-canvas__close {
  appearance: none;
  border: 0;
  background: color-mix(in srgb, var(--palette-sand) 70%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 9999px;
  padding: 0.55rem 1.1rem;
  font: inherit;
  font-size: var(--type-nav);
  cursor: pointer;
  color: var(--palette-ink);
  pointer-events: auto;
  transition: background-color var(--motion-base) var(--motion-ease);
}

.page-canvas__close:hover,
.page-canvas__close:focus-visible {
  background: color-mix(in srgb, var(--palette-stone) 78%, var(--palette-sand));
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
  /* Leave room for fixed chrome top + foot. */
  padding-top: calc(var(--layout-margin) + var(--safe-top) + 2.75rem);
  padding-bottom: calc(var(--layout-margin) + var(--safe-bottom) + 2.5rem);
}

.page-canvas__stage::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.page-canvas__desk {
  box-sizing: border-box;
  min-height: 100%;
  padding: 0 var(--layout-margin);
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.page-canvas__desk::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

@media (max-width: 767.98px) {
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
    /* Width so sheet height stays ~half viewport with device aspect. */
    flex: 0 0 min(70vw, calc(50svh * var(--pc-aspect, 0.5)));
  }

  .pc-frame__sheet {
    aspect-ratio: var(--pc-aspect, 9 / 19.5);
  }
}

@media (min-width: 768px) {
  .page-canvas__desk {
    display: grid;
    /* Same tape width as the old 2-up layout; one plaque per row fills it. */
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(1.5rem, 3vh, 2.75rem);
    align-content: start;
    max-width: min(78rem, var(--layout-content-max));
    margin-inline: auto;
    padding-top: clamp(0.35rem, 1.5vh, 1.25rem);
    padding-bottom: 1.25rem;
  }

  .pc-frame {
    width: 100%;
    max-width: none;
    justify-self: stretch;
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
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  outline: none;
  font: inherit;
}

.pc-frame__sheet {
  position: relative;
  aspect-ratio: var(--pc-aspect, 16 / 9);
  border-radius: 4px;
  overflow: hidden;
  background: var(--palette-stone);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--palette-ink) 6%, transparent);
  transition: transform var(--motion-base) var(--motion-ease);
}

.pc-frame__slot {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}

/* Current tile: sand plaque only — never the decorative stub under the live page. */
.pc-frame--live .pc-frame__sheet {
  background: var(--palette-sand);
  box-shadow: none;
  outline: 1.5px solid color-mix(in srgb, var(--palette-ink) 55%, transparent);
  outline-offset: 3px;
}

.pc-frame--live .pc-frame__motif {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

/* Belt: while shell is flying/docked, stub stays dead even if --live flickers. */
.pc-frame--docked .pc-frame__motif,
.pc-frame--flight .pc-frame__motif {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

/* During zoom the flying shell is the only pixels — no sand/outline peeking under it. */
.pc-frame--flight .pc-frame__sheet {
  background: transparent !important;
  box-shadow: none !important;
  outline: none !important;
}

.pc-frame:hover .pc-frame__sheet,
.pc-frame:focus-visible .pc-frame__sheet {
  /* No sheet lift — fights the docked page and reads as cursor jitter. */
  transform: none;
}

.pc-frame--live:hover .pc-frame__sheet,
.pc-frame--live:focus-visible .pc-frame__sheet {
  transform: none;
}

.pc-frame:focus-visible .pc-frame__sheet {
  outline: 2px solid var(--palette-ink);
  outline-offset: 3px;
}

.pc-frame__motif {
  position: absolute;
  inset: 10%;
  z-index: 1;
  border-radius: 3px;
  background:
    linear-gradient(
      160deg,
      color-mix(in srgb, var(--palette-milk) 80%, transparent),
      color-mix(in srgb, var(--palette-sand) 55%, transparent)
    );
  transform-origin: 50% 50%;
  transition:
    transform 0.55s var(--motion-ease),
    filter 0.45s var(--motion-ease);
}

.pc-frame__motif::before,
.pc-frame__motif::after {
  transition:
    transform 0.55s var(--motion-ease),
    opacity 0.4s var(--motion-ease),
    background-position 0.7s var(--motion-ease);
}

.pc-frame--home .pc-frame__motif::before {
  content: '';
  position: absolute;
  left: 8%;
  right: 28%;
  top: 14%;
  height: 18%;
  border-radius: 2px;
  background: color-mix(in srgb, var(--palette-ink) 12%, transparent);
  transform-origin: 0 50%;
}

.pc-frame--home .pc-frame__motif::after {
  content: '';
  position: absolute;
  right: 10%;
  bottom: 12%;
  width: 42%;
  height: 48%;
  border-radius: 2px;
  background: color-mix(in srgb, var(--palette-ink) 8%, var(--palette-stone));
  transform-origin: 100% 100%;
}

.pc-frame--projects .pc-frame__motif {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6%;
  padding: 6%;
  inset: 8%;
  background: transparent;
}

.pc-frame--projects .pc-frame__motif::before,
.pc-frame--projects .pc-frame__motif::after {
  content: '';
  border-radius: 2px;
  background: color-mix(in srgb, var(--palette-milk) 70%, var(--palette-stone));
  transform-origin: 50% 50%;
}

.pc-frame--services .pc-frame__motif::before {
  content: '';
  position: absolute;
  inset: 18% 14%;
  border-radius: 2px;
  background: repeating-linear-gradient(
    180deg,
    color-mix(in srgb, var(--palette-ink) 10%, transparent) 0 10%,
    transparent 10% 22%
  );
  background-size: 100% 100%;
  transform-origin: 50% 0;
}

.pc-frame--about .pc-frame__motif::before {
  content: '';
  position: absolute;
  left: 14%;
  top: 18%;
  width: 36%;
  aspect-ratio: 1;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--palette-ink) 14%, transparent);
  transform-origin: 50% 50%;
}

.pc-frame--about .pc-frame__motif::after {
  content: '';
  position: absolute;
  left: 14%;
  right: 14%;
  bottom: 18%;
  height: 28%;
  border-radius: 2px;
  background: color-mix(in srgb, var(--palette-ink) 8%, transparent);
  transform-origin: 0 50%;
}

.pc-frame--contact .pc-frame__motif::before {
  content: '';
  position: absolute;
  left: 12%;
  right: 12%;
  top: 22%;
  height: 46%;
  border-radius: 2px;
  border: 1.5px solid color-mix(in srgb, var(--palette-ink) 18%, transparent);
  transform-origin: 50% 50%;
  box-sizing: border-box;
}

/* Motif hover — animate the stub pieces, not the sheet (live dock stays calm). */
@media (hover: hover) and (pointer: fine) {
  .pc-frame:not(.pc-frame--live):hover .pc-frame__motif,
  .pc-frame:not(.pc-frame--live):focus-visible .pc-frame__motif {
    transform: scale(1.035);
    filter: contrast(1.04) saturate(1.06);
  }

  .pc-frame--home:not(.pc-frame--live):hover .pc-frame__motif::before,
  .pc-frame--home:not(.pc-frame--live):focus-visible .pc-frame__motif::before {
    transform: translate3d(5%, 0, 0) scaleX(1.06);
  }

  .pc-frame--home:not(.pc-frame--live):hover .pc-frame__motif::after,
  .pc-frame--home:not(.pc-frame--live):focus-visible .pc-frame__motif::after {
    transform: translate3d(-4%, -5%, 0) scale(1.04);
  }

  .pc-frame--projects:not(.pc-frame--live):hover .pc-frame__motif::before,
  .pc-frame--projects:not(.pc-frame--live):focus-visible .pc-frame__motif::before {
    transform: translate3d(0, -7%, 0) scale(1.03);
  }

  .pc-frame--projects:not(.pc-frame--live):hover .pc-frame__motif::after,
  .pc-frame--projects:not(.pc-frame--live):focus-visible .pc-frame__motif::after {
    transform: translate3d(0, 7%, 0) scale(1.03);
    transition-delay: 0.05s;
  }

  .pc-frame--services:not(.pc-frame--live):hover .pc-frame__motif::before,
  .pc-frame--services:not(.pc-frame--live):focus-visible .pc-frame__motif::before {
    transform: translate3d(0, 4%, 0) scaleY(1.08);
    background-position: 0 18%;
  }

  .pc-frame--about:not(.pc-frame--live):hover .pc-frame__motif::before,
  .pc-frame--about:not(.pc-frame--live):focus-visible .pc-frame__motif::before {
    transform: translate3d(8%, -6%, 0) scale(1.08);
  }

  .pc-frame--about:not(.pc-frame--live):hover .pc-frame__motif::after,
  .pc-frame--about:not(.pc-frame--live):focus-visible .pc-frame__motif::after {
    transform: scaleX(1.08);
  }

  .pc-frame--contact:not(.pc-frame--live):hover .pc-frame__motif::before,
  .pc-frame--contact:not(.pc-frame--live):focus-visible .pc-frame__motif::before {
    transform: scale(1.06);
    opacity: 0.92;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pc-frame__motif,
  .pc-frame__motif::before,
  .pc-frame__motif::after,
  .pc-frame__sheet,
  .pc-frame__hint {
    transition: none !important;
  }

  .pc-frame:not(.pc-frame--live):hover .pc-frame__motif,
  .pc-frame:not(.pc-frame--live):focus-visible .pc-frame__motif,
  .pc-frame:not(.pc-frame--live):hover .pc-frame__motif::before,
  .pc-frame:not(.pc-frame--live):focus-visible .pc-frame__motif::before,
  .pc-frame:not(.pc-frame--live):hover .pc-frame__motif::after,
  .pc-frame:not(.pc-frame--live):focus-visible .pc-frame__motif::after {
    transform: none !important;
    filter: none !important;
    background-position: 0 0 !important;
  }
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
  justify-content: flex-start;
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
  /* +50% air between title and description (meta gap 0.15 → effective 0.225). */
  margin-top: 0.075rem;
  font-size: var(--type-nav);
  color: var(--palette-ash);
  line-height: 1.3;
}

.pc-frame__hint {
  margin-top: 0.2rem;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--palette-ink);
  opacity: 0;
  transition: opacity var(--motion-base) var(--motion-ease);
}

@media (hover: hover) and (pointer: fine) {
  .pc-frame:hover .pc-frame__hint,
  .pc-frame:focus-visible .pc-frame__hint {
    opacity: 0.7;
  }
}
</style>

<style>
/* Cover clone lives on body (not scoped). */
/* Cover = stub plaque that zooms into a fake page, then fades to the real route. */
.pc-frame__cover {
  border-radius: 4px;
  overflow: hidden;
  background: var(--palette-stone);
  color: var(--palette-ink);
}

.pc-frame__cover .pc-frame__sheet {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  border-radius: inherit;
  aspect-ratio: unset;
  transform: none !important;
}

.pc-frame__cover .pc-frame__motif {
  opacity: 1 !important;
  visibility: visible !important;
}

.pc-frame__cover .pc-frame__meta {
  display: none;
}

/* Added only after the plaque has zoomed to fullscreen. */
.pc-frame__cover-page {
  position: absolute;
  inset: 0;
  z-index: 3;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: clamp(1.25rem, 6vw, 4rem) clamp(1rem, 5vw, 3rem);
  padding-top: clamp(4rem, 14vh, 7rem);
  background: var(--palette-sand);
  pointer-events: none;
}

.pc-frame__cover-index {
  margin: 0 0 0.35rem;
  font-size: clamp(0.75rem, 2vw, 1rem);
  letter-spacing: 0.06em;
  color: var(--palette-ash);
}

.pc-frame__cover-label {
  margin: 0 0 0.75rem;
  font-size: clamp(1.6rem, 5.5vw, 3rem);
  font-weight: 600;
  line-height: 1.15;
}

.pc-frame__cover-blurb {
  margin: 0 0 1rem;
  max-width: 36rem;
  font-size: clamp(0.95rem, 2.2vw, 1.15rem);
  line-height: 1.45;
  color: var(--palette-ink);
}

.pc-frame__cover-note {
  margin: 0;
  max-width: 32rem;
  font-size: clamp(0.8rem, 1.8vw, 0.95rem);
  line-height: 1.45;
  color: var(--palette-ash);
}
</style>
