<script setup lang="ts">
/**
 * SPA page hop — same circular clip as the workspace menu.
 * Cover first (current page still showing), then swap the route under the sand,
 * wait for home swarm IBL if needed, then iris out.
 */
import gsap from 'gsap'
import {
  applyIrisClip,
  clearIrisClip,
  IRIS_CLOSE_EASE,
  IRIS_CLOSE_S,
  IRIS_OPEN_EASE,
  IRIS_OPEN_S,
  irisCoverFrom,
  irisGeomFromBox,
  viewportIrisBox,
  type IrisGeom,
} from '~/utils/irisClip'
import { preloadHomeSceneAssets } from '~/utils/preloadHomeMotion'
import { isThumbNav } from '~/utils/mobileViewport'
import { homeCases } from '~/utils/homeCases'

const {
  surfaceOn,
  waitForHeroSwarm,
  pageIrisLive,
  menuHomeIrisReveal,
  menuHomeIrisSnap,
  resolveMenuHomeIrisReveal,
  resolveMenuHomeIrisSnap,
} = usePageCanvas()
const rootEl = ref<HTMLElement | null>(null)
const live = ref(false)
const {
  active: caseDetailTransitionActive,
  closeCaseDetail,
} = useCaseDetailTransition()

let originEl: Element | null = null
let originGeom: IrisGeom | null = null
let pendingReveal = false
let tween: { kill: () => void } | null = null
let tweenResolve: (() => void) | null = null
let gen = 0
let popNav = false
let stopBefore: (() => void) | null = null
let stopAfter: (() => void) | null = null
let stopError: (() => void) | null = null

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function captureOrigin(e: Event) {
  const t = e.target
  if (!(t instanceof Element)) return
  const hit = t.closest('a[href]')
  originEl = hit
  if (!(hit instanceof HTMLAnchorElement)) return
  try {
    const url = new URL(hit.href, location.href)
    if (url.origin === location.origin && (url.pathname === '/' || url.pathname === '')) {
      preloadHomeSceneAssets()
    }
  } catch {
    /* ignore */
  }
}

function onPopState() {
  popNav = true
}

function shouldSkip(
  to: { path: string; fullPath: string },
  from: { path: string; fullPath: string; matched: { length: number } },
) {
  if (!from.matched.length) return true
  if (to.fullPath === from.fullPath) return true
  if (to.path === from.path) return true
  if (reducedMotion()) return true
  if (caseDetailTransitionActive.value) return true
  if (surfaceOn.value) return true
  if (document.documentElement.classList.contains('page-canvas-surface')) return true
  if (document.documentElement.classList.contains('preload-lock')) return true
  return false
}

function resolveOrigin(toPath: string): IrisGeom {
  const view = viewportIrisBox()
  if (popNav) {
    if (toPath === '/') {
      const logo = document.querySelector('.header-logo-link')
      if (logo) return irisGeomFromBox(logo.getBoundingClientRect(), view)
    }
    return irisGeomFromBox(null, view)
  }
  if (originEl?.isConnected) {
    return irisGeomFromBox(originEl.getBoundingClientRect(), view)
  }
  if (toPath === '/') {
    const logo = document.querySelector('.header-logo-link')
    if (logo) return irisGeomFromBox(logo.getBoundingClientRect(), view)
  }
  return irisGeomFromBox(null, view)
}

function setLock(on: boolean) {
  document.documentElement.classList.toggle('page-iris-lock', on)
}

function showLive() {
  live.value = true
  pageIrisLive.value = true
  setLock(true)
}

function hideLive() {
  live.value = false
  pageIrisLive.value = false
  setLock(false)
  const root = rootEl.value
  clearIrisClip(root)
  if (root) {
    root.style.opacity = ''
    root.style.willChange = ''
  }
  pendingReveal = false
}

function killTween() {
  tween?.kill()
  tween = null
  const done = tweenResolve
  tweenResolve = null
  done?.()
}

function menuHopIrisOrigin(fallback?: IrisGeom): IrisGeom {
  const view = viewportIrisBox()
  const el =
    document.querySelector('.menu-fab')
    ?? document.querySelector('.menu-btn--float')
  const thumb = isThumbNav()
  return irisGeomFromBox(el?.getBoundingClientRect() ?? null, view, fallback ?? {
    w: 96,
    h: 40,
    cx: view.width - 56,
    cy: thumb ? view.height - 56 : 36,
  })
}

async function tweenIris(
  from: IrisGeom,
  to: IrisGeom,
  duration: number,
  ease: string,
  onFrame?: (geom: IrisGeom) => void,
  liveOrigin?: () => IrisGeom,
) {
  const root = rootEl.value
  if (!root) return
  killTween()
  applyIrisClip(root, from)
  root.style.willChange = 'clip-path'
  const proxy = { w: from.w, h: from.h }
  await new Promise<void>((resolve) => {
    tweenResolve = resolve
    tween = gsap.to(proxy, {
      w: to.w,
      h: to.h,
      duration,
      ease,
      overwrite: true,
      onUpdate: () => {
        const anchor = liveOrigin?.() ?? from
        const geom = { ...anchor, w: proxy.w, h: proxy.h }
        applyIrisClip(root, geom)
        onFrame?.(geom)
      },
      onComplete: () => {
        tween = null
        const done = tweenResolve
        tweenResolve = null
        done?.()
      },
    })
  })
}

async function cover(start: IrisGeom, token: number) {
  const root = rootEl.value
  if (!root) return
  showLive()
  await nextTick()
  if (token !== gen) return
  void root.offsetWidth
  gsap.set(root, { opacity: 1 })
  const dest = irisCoverFrom(start)
  applyIrisClip(root, start)
  await tweenIris(start, dest, IRIS_OPEN_S, IRIS_OPEN_EASE)
  if (token !== gen) return
  applyIrisClip(root, dest)
  root.style.willChange = ''
}

async function reveal(token: number) {
  const root = rootEl.value
  if (!root) {
    hideLive()
    return
  }
  killTween()
  root.style.willChange = 'opacity'
  await new Promise<void>((resolve) => {
    tweenResolve = resolve
    tween = gsap.to(root, {
      opacity: 0,
      duration: IRIS_CLOSE_S,
      ease: 'power2.out',
      overwrite: true,
      onComplete: () => {
        tween = null
        const done = tweenResolve
        tweenResolve = null
        done?.()
      },
    })
  })
  if (token !== gen) return
  hideLive()
}

async function revealMenuHome(
  seed: IrisGeom,
  token: number,
  onFrame?: (geom: IrisGeom) => void,
) {
  const anchor = () => menuHopIrisOrigin(seed)
  const dest = irisCoverFrom(anchor())
  await tweenIris(
    dest,
    anchor(),
    IRIS_CLOSE_S,
    IRIS_CLOSE_EASE,
    onFrame,
    anchor,
  )
  if (token !== gen) return
  hideLive()
}

async function runMenuHomeSnap(req: NonNullable<typeof menuHomeIrisSnap.value>) {
  const root = rootEl.value
  if (!root) {
    resolveMenuHomeIrisSnap()
    return
  }
  try {
    showLive()
    await nextTick()
    void root.offsetWidth
    const anchor = menuHopIrisOrigin(req.geom)
    applyIrisClip(root, irisCoverFrom(anchor))
  } catch {
    hideLive()
  } finally {
    resolveMenuHomeIrisSnap()
  }
}

async function runMenuHomeReveal(req: NonNullable<typeof menuHomeIrisReveal.value>) {
  const root = rootEl.value
  if (!root) {
    resolveMenuHomeIrisReveal()
    return
  }
  const token = ++gen
  try {
    if (!live.value) {
      showLive()
      await nextTick()
      if (token !== gen) return
      const anchor = menuHopIrisOrigin(req.geom)
      applyIrisClip(root, irisCoverFrom(anchor))
    }
    await revealMenuHome(req.geom, token, req.onFrame)
    if (token !== gen) return
    req.handoff?.()
  } catch {
    hideLive()
  } finally {
    resolveMenuHomeIrisReveal()
  }
}

watch(menuHomeIrisSnap, (req) => {
  if (!req) return
  void runMenuHomeSnap(req)
})

watch(menuHomeIrisReveal, (req) => {
  if (!req) return
  void runMenuHomeReveal(req)
})

onMounted(() => {
  const router = useRouter()
  document.addEventListener('pointerdown', captureOrigin, true)
  document.addEventListener('click', captureOrigin, true)
  // Capture before Vue Router’s bubble-phase listener. This lets a browser
  // Back from a home-origin case use the same physical return flight as the
  // explicit header control, instead of opening the generic page iris.
  window.addEventListener('popstate', onPopState, true)

  stopBefore = router.beforeEach(async (to, from) => {
    const detailId = /^\/projects\/([^/]+)$/.exec(from.path)?.[1]
    const homeTopRequested =
      !popNav
      && originEl instanceof Element
      && originEl.matches('[data-home-top]')
    const isCaseReturn =
      !caseDetailTransitionActive.value
      && to.path === '/'
      && !!detailId
      && !homeTopRequested

    if (isCaseReturn) {
      const item = homeCases.find((caseItem) => caseItem.id === detailId)
      popNav = false
      if (item) {
        closeCaseDetail({
          src: item.media.src,
          webpSrcset: item.media.webpSrcset,
          avifSrcset: item.media.avifSrcset,
          alt: item.media.alt,
          wash: item.wash,
          historyBack: true,
        })
        return false
      }
    }

    if (shouldSkip(to, from)) return
    if (to.path === '/') preloadHomeSceneAssets()
    const token = ++gen
    originGeom = resolveOrigin(to.path)
    popNav = false
    pendingReveal = true
    try {
      await cover(originGeom, token)
    } catch {
      hideLive()
    }
  })

  stopAfter = router.afterEach(async (to) => {
    if (!pendingReveal) return
    const token = gen
    pendingReveal = false
    try {
      await nextTick()
      await new Promise<void>((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      })
      if (to.path === '/') await waitForHeroSwarm()
      if (token !== gen) return
      await reveal(token)
    } catch {
      hideLive()
    } finally {
      originEl = null
    }
  })

  stopError = router.onError(() => {
    hideLive()
  })
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', captureOrigin, true)
  document.removeEventListener('click', captureOrigin, true)
  window.removeEventListener('popstate', onPopState, true)
  stopBefore?.()
  stopAfter?.()
  stopError?.()
  killTween()
  hideLive()
})
</script>

<template>
  <div
    ref="rootEl"
    class="page-iris"
    :class="{ 'page-iris--live': live }"
    aria-hidden="true"
  />
</template>

<style scoped>
.page-iris {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 112;
  pointer-events: none;
  background: color-mix(in srgb, var(--palette-sand) 78%, var(--palette-ash));
}

.page-iris--live {
  display: block;
  pointer-events: auto;
}
</style>
