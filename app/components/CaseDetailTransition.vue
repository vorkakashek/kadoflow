<script setup lang="ts">
import gsap from 'gsap'
import { warmCaseDetailRoute } from '~/utils/caseDetailRouteWarmup'

const router = useRouter()
const {
  request,
  active,
  revealDetailContent,
  completeCaseDetailEntry,
  completeCaseDetailExit,
  completeDetailOpen,
  markHomeReturnMediaDocked,
  completeDetailReturn,
} = useCaseDetailTransition()
const rootEl = ref<HTMLElement | null>(null)
const backdropEl = ref<HTMLElement | null>(null)
const imageEl = ref<HTMLImageElement | null>(null)
const visible = ref(false)
const wash = ref('#0a0a0a')
const src = ref('')
const webpSrcset = ref('')
const avifSrcset = ref('')
const alt = ref('')

function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

function waitForTransitionDelay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

/** Keep a newly assigned transition src hidden until its raster can paint. */
async function waitForImageDecode(image: HTMLImageElement, rasterAlreadyPainted = false) {
  // Opening from a visible case card gives us its exact currentSrc. The
  // browser has already decoded and painted that raster, so another decode()
  // only inserts a perceptible pause between the click and the first tween.
  if (rasterAlreadyPainted && image.complete && image.naturalWidth > 0) return

  if (!image.complete) {
    await Promise.race([
      new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
      }),
      new Promise<void>((resolve) => window.setTimeout(resolve, 1200)),
    ])
  }
  if (typeof image.decode === 'function') {
    await image.decode().catch(() => undefined)
  }
}

/** Make the live destination raster safe to expose under the docking proxy. */
async function waitForTargetImagePaint(target: HTMLElement) {
  const image = target.matches('img')
    ? target as HTMLImageElement
    : target.querySelector<HTMLImageElement>('img')
  if (!image) return
  // A returned case can sit outside the initial catalog viewport, where its
  // lazy image would otherwise still be blank when the proxy disappears.
  image.loading = 'eager'
  await waitForImageDecode(image)
  await nextPaint()
}

async function returnThroughHistory(to: string) {
  router.back()
  const targetPath = to.split('#')[0] || '/'
  for (let frame = 0; frame < 18; frame += 1) {
    await nextPaint()
    if (router.currentRoute.value.path === targetPath) return
  }
}

async function findTarget(selector: string) {
  for (let frame = 0; frame < 12; frame += 1) {
    const target = document.querySelector<HTMLElement>(selector)
    const rect = target?.getBoundingClientRect()
    if (target && rect && rect.width > 2 && rect.height > 2) return target
    await nextPaint()
  }
  return null
}

/** Keep a hash destination pinned while the remounted home layout settles. */
function startRouteHashPin(to: string) {
  const hashAt = to.indexOf('#')
  if (hashAt < 0) return { ready: Promise.resolve(), stop: () => {} }
  const id = decodeURIComponent(to.slice(hashAt + 1))
  if (!id) return { ready: Promise.resolve(), stop: () => {} }

  let raf = 0
  let stopped = false
  let stableFrames = 0
  let tries = 0
  let resolveReady = () => {}
  let readyResolved = false
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  const finishReady = () => {
    if (readyResolved) return
    readyResolved = true
    resolveReady()
  }
  const step = () => {
    if (stopped) {
      finishReady()
      return
    }
    const target = document.getElementById(id)
    if (target) {
      const rect = target.getBoundingClientRect()
      if (Math.abs(rect.top) > 0.75) {
        window.scrollTo({
          top: Math.max(0, window.scrollY + rect.top),
          left: 0,
          behavior: 'auto',
        })
        stableFrames = 0
      } else {
        stableFrames += 1
        if (stableFrames >= 3) finishReady()
      }
    }
    tries += 1
    if (tries >= 72) finishReady()
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)

  return {
    ready,
    stop: () => {
      stopped = true
      if (raf) cancelAnimationFrame(raf)
      finishReady()
    },
  }
}

watch(request, async (next) => {
  if (!next || active.value) return
  const root = rootEl.value
  const backdrop = backdropEl.value
  const image = imageEl.value
  if (!root || !backdrop || !image) return

  // Start resolving the cold route before decoding and staging the transition
  // image. Scheduled warmups normally finish this earlier; this is the fallback
  // for an immediate click or direct programmatic open.
  const routeWarmup = next.direction === 'open'
    ? warmCaseDetailRoute(next.to)
    : Promise.resolve()

  active.value = true
  wash.value = next.wash
  const proxySrc = next.direction === 'open' ? next.proxySrc : undefined
  src.value = proxySrc ?? next.src
  // Keep the opening proxy on the exact candidate that is already visible in
  // the source card. The destination page loads its own full-size responsive
  // image underneath the transition.
  webpSrcset.value = proxySrc ? '' : (next.webpSrcset ?? '')
  avifSrcset.value = proxySrc ? '' : (next.avifSrcset ?? '')
  alt.value = next.alt
  await nextTick()
  await waitForImageDecode(image, !!proxySrc)

  const viewport = { width: window.innerWidth, height: window.innerHeight }
  gsap.set(root, { opacity: 1 })
  if (next.direction === 'open' && next.rect) {
    gsap.set(backdrop, { opacity: 0 })
    gsap.set(image, {
      ...next.rect,
      x: 0,
      y: 0,
      scale: 1,
      rotate: 0,
      opacity: 1,
      filter: 'none',
      clipPath: 'inset(0px)',
    })
  } else {
    gsap.set(backdrop, { opacity: 0 })
    gsap.set(image, {
      top: 0,
      left: 0,
      width: viewport.width,
      height: viewport.height,
      x: 0,
      y: 0,
      // A fractional paint uploads the fixed proxy before its cover tween.
      opacity: 0.001,
      filter: 'none',
      clipPath: 'inset(0px)',
      scale: 1.1,
      rotate: -2,
      transformOrigin: '50% 50%',
    })
  }
  // Reveal only after the new src and its exact first pose are already on the
  // hidden layer. Otherwise v-show can expose one stale/default image frame.
  visible.value = true
  await nextTick()
  // Promote and paint the fixed proxy before geometry starts moving. Reusing
  // a decoded raster avoids network work, but a new composited layer still
  // needs its own first upload.
  await nextPaint()

  const hashPinSession: { stop?: () => void } = {}
  try {
    if (next.direction === 'open' && next.rect) {
      // Mount the route under the moving proxy once the backdrop is opaque.
      // Detail enhancements stay phase-gated, so route work can overlap the
      // geometry tween without introducing a static fullscreen hold.
      const flight = gsap.timeline()
      flight.to(backdrop, { opacity: 1, duration: 0.18, ease: 'power1.out' }, 0)
      flight.to(
        image,
        {
          top: 0,
          left: 0,
          width: viewport.width,
          height: viewport.height,
          duration: 0.72,
          ease: 'power3.inOut',
        },
        0,
      )
      const routeTask = (async () => {
        await Promise.all([routeWarmup, waitForTransitionDelay(160)])
        await router.push(next.to)
        await nextPaint()
      })()

      // Keep the detail in its entry pose for the entire proxy handoff. If its
      // content is released here, most of the entrance plays behind the media.
      await Promise.all([routeTask, waitForTransitionDelay(500)])
      const reveal = gsap.to(root, {
        opacity: 0,
        duration: 0.54,
        ease: 'power2.out',
      })
      await Promise.all([flight, reveal])
      revealDetailContent()
      await nextPaint()
      return
    }

    // Fully cover the detail before swapping routes. A fixed early delay used
    // to mount the catalog while this wash was still translucent, exposing a
    // brief catalog frame through the transition layer.
    gsap.set(root, { opacity: 1 })
    const detail = document.querySelector<HTMLElement>('.case-detail__inner')
    const cover = gsap.timeline()
    if (detail) {
      cover.to(detail, { opacity: 0, duration: 0.34, ease: 'power2.inOut' }, 0)
    }
    cover.to(backdrop, { opacity: 1, duration: 0.30, ease: 'power2.inOut' }, 0)
    cover.to(image, {
      opacity: 1,
      scale: 1.04,
      rotate: -0.75,
      duration: 0.44,
      ease: 'power2.inOut',
    }, 0)

    await cover

    const targetTask = (async () => {
      if (next.historyBack) await returnThroughHistory(next.to)
      else await router.push(next.to)
      await nextPaint()
      const hashPin = startRouteHashPin(next.to)
      hashPinSession.stop = hashPin.stop
      await hashPin.ready
      const target = next.targetSelector ? await findTarget(next.targetSelector) : null
      if (target) await waitForTargetImagePaint(target)
      return target
    })()
    const targetEl = await targetTask

    if (targetEl) {
      const target = targetEl.getBoundingClientRect()
      const flight = gsap.timeline()
      flight.to(image, {
        top: target.top,
        left: target.left,
        width: target.width,
        height: target.height,
        x: 0,
        y: 0,
        scale: 1,
        rotate: 0,
        clipPath: 'inset(0px)',
        duration: 0.66,
        ease: 'power3.inOut',
        overwrite: 'auto',
      }, 0)
      // Keep the destination covered until the proxy is almost docked. An
      // earlier wash release exposed the already-mounted case photo beneath
      // the still-large proxy, which read as a second copy of the same image.
      flight.to(backdrop, { opacity: 0, duration: 0.16, ease: 'power1.out' }, 0.50)
      await flight
      markHomeReturnMediaDocked()

      // Finish docking before handing the frame back to the live surface.
      // A fractional opacity forces the browser to composite and paint the
      // destination under the still-indistinguishable proxy first, avoiding
      // a one-frame blank during the swap.
      gsap.set(image, { opacity: 0.999 })
      await nextPaint()
      await gsap.to(image, { opacity: 0, duration: 0.14, ease: 'power1.out' })
    } else {
      await gsap.to(image, {
        opacity: 0,
        scale: 1.02,
        rotate: 0,
        duration: 0.42,
        ease: 'power2.out',
      })
      await gsap.to(backdrop, { opacity: 0, duration: 0.18, ease: 'power1.out' })
    }
    gsap.set(root, { opacity: 0 })
  } finally {
    hashPinSession.stop?.()
    if (next.direction === 'close') {
      completeDetailReturn()
      completeCaseDetailExit()
    } else {
      completeDetailOpen()
      completeCaseDetailEntry()
    }
    visible.value = false
    request.value = null
    active.value = false
  }
})
</script>

<template>
  <div
    v-show="visible"
    ref="rootEl"
    class="case-detail-transition"
    aria-hidden="true"
  >
    <div
      ref="backdropEl"
      class="case-detail-transition__backdrop"
      :style="{ backgroundColor: wash }"
    />
    <picture>
      <source v-if="avifSrcset" type="image/avif" :srcset="avifSrcset" sizes="100vw">
      <source v-if="webpSrcset" type="image/webp" :srcset="webpSrcset" sizes="100vw">
      <img ref="imageEl" :src="src" :alt="alt" class="case-detail-transition__image">
    </picture>
  </div>
</template>

<style>
.case-detail-transition {
  position: fixed;
  inset: 0;
  z-index: 112;
  overflow: hidden;
  pointer-events: auto;
}

.case-detail-transition__backdrop {
  position: absolute;
  inset: 0;
}

.case-detail-transition picture {
  display: contents;
}

.case-detail-transition__image {
  position: fixed;
  display: block;
  object-fit: cover;
  object-position: center;
  will-change: top, left, width, height, transform, opacity;
}
</style>
