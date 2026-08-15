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
  clipFromGeom,
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

const { surfaceOn, waitForHeroSwarm, pageIrisLive } = usePageCanvas()
const rootEl = ref<HTMLElement | null>(null)
const live = ref(false)

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
  clearIrisClip(rootEl.value)
  pendingReveal = false
}

function killTween() {
  tween?.kill()
  tween = null
  const done = tweenResolve
  tweenResolve = null
  done?.()
}

async function tweenIris(
  from: IrisGeom,
  to: IrisGeom,
  duration: number,
  ease: string,
) {
  const root = rootEl.value
  if (!root) return
  killTween()
  applyIrisClip(root, clipFromGeom(from))
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
        applyIrisClip(
          root,
          clipFromGeom({
            ...from,
            w: proxy.w,
            h: proxy.h,
          }),
        )
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
  const dest = irisCoverFrom(start)
  applyIrisClip(root, clipFromGeom(start))
  await tweenIris(start, dest, IRIS_OPEN_S, IRIS_OPEN_EASE)
  if (token !== gen) return
  applyIrisClip(root, clipFromGeom(dest))
}

async function reveal(start: IrisGeom, token: number) {
  const dest = irisCoverFrom(start)
  await tweenIris(dest, start, IRIS_CLOSE_S, IRIS_CLOSE_EASE)
  if (token !== gen) return
  hideLive()
}

onMounted(() => {
  const router = useRouter()
  document.addEventListener('pointerdown', captureOrigin, true)
  document.addEventListener('click', captureOrigin, true)
  window.addEventListener('popstate', onPopState)

  stopBefore = router.beforeEach(async (to, from) => {
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
      originGeom = resolveOrigin(to.path)
      await reveal(originGeom, token)
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
  window.removeEventListener('popstate', onPopState)
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
  z-index: 105;
  pointer-events: none;
  background: color-mix(in srgb, var(--palette-sand) 78%, var(--palette-ash));
}

.page-iris--live {
  display: block;
  pointer-events: auto;
}
</style>
