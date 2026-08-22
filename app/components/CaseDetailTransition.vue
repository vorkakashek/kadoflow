<script setup lang="ts">
import gsap from 'gsap'

const router = useRouter()
const { request, active, detailContentVisible } = useCaseDetailTransition()
const rootEl = ref<HTMLElement | null>(null)
const backdropEl = ref<HTMLElement | null>(null)
const imageEl = ref<HTMLImageElement | null>(null)
const visible = ref(false)
const wash = ref('#0a0a0a')
const src = ref('')
const alt = ref('')

function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

/** Keep a newly assigned transition src hidden until its raster can paint. */
async function waitForImageDecode(image: HTMLImageElement) {
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
    if (rect && rect.width > 2 && rect.height > 2) return rect
    await nextPaint()
  }
  return null
}

/** Let route watchers finish, then restore the hash position under the cover. */
async function settleRouteHash(to: string) {
  const hashAt = to.indexOf('#')
  if (hashAt < 0) return
  const id = decodeURIComponent(to.slice(hashAt + 1))
  if (!id) return

  for (let frame = 0; frame < 4; frame += 1) {
    const target = document.getElementById(id)
    if (!target) {
      await nextPaint()
      continue
    }
    target.scrollIntoView({ block: 'start', behavior: 'auto' })
    await nextPaint()
    if (Math.abs(target.getBoundingClientRect().top) < 1) return
  }
}

watch(request, async (next) => {
  if (!next || active.value) return
  const root = rootEl.value
  const backdrop = backdropEl.value
  const image = imageEl.value
  if (!root || !backdrop || !image) return

  active.value = true
  wash.value = next.wash
  src.value = next.src
  alt.value = next.alt
  await nextTick()
  await waitForImageDecode(image)

  const viewport = { width: window.innerWidth, height: window.innerHeight }
  gsap.set(root, { opacity: 1 })
  if (next.direction === 'open' && next.rect) {
    gsap.set(backdrop, { opacity: 0 })
    gsap.set(image, { ...next.rect, opacity: 1, filter: 'blur(0px)' })
  } else {
    gsap.set(backdrop, { opacity: 0 })
    gsap.set(image, {
      top: 0,
      left: 0,
      width: viewport.width,
      height: viewport.height,
      opacity: 0,
      filter: 'blur(28px)',
      scale: 1.16,
      rotate: -3.5,
      transformOrigin: '50% 50%',
    })
  }
  // Reveal only after the new src and its exact first pose are already on the
  // hidden layer. Otherwise v-show can expose one stale/default image frame.
  visible.value = true
  await nextTick()

  try {
    if (next.direction === 'open' && next.rect) {
      // Start mounting the detail under the wash immediately. The image keeps
      // moving while the route resolves, instead of stopping at fullscreen
      // before its blur-out begins.
      const navigation = router.push(next.to)
      const flight = gsap.timeline()
      flight.to(backdrop, { opacity: 1, duration: 0.18, ease: 'power1.out' }, 0)
      flight.to(
        image,
        {
          top: 0,
          left: 0,
          width: viewport.width,
          height: viewport.height,
          duration: 0.76,
          ease: 'power3.inOut',
        },
        0,
      )
      flight.to(
        image,
        {
          opacity: 0,
          filter: 'blur(20px)',
          duration: 0.36,
          ease: 'power2.out',
        },
        0.44,
      )
      await flight
      await navigation
      await nextPaint()
      await gsap.to(root, { opacity: 0, duration: 0.18, ease: 'power1.out' })
      // Let the now-uncovered detail start its own staged content timeline.
      detailContentVisible.value = true
      return
    }

    // First let the case media smoothly take over the whole viewport. Only
    // then mount the destination under the fully opaque transition layer, so
    // neither route can flash through while the image is resolving.
    gsap.set(root, { opacity: 1 })
    const detail = document.querySelector<HTMLElement>('.case-detail__inner')
    const cover = gsap.timeline()
    if (detail) {
      cover.to(detail, { opacity: 0, duration: 0.52, ease: 'power2.inOut' }, 0)
    }
    cover.to(backdrop, { opacity: 1, duration: 0.42, ease: 'power2.inOut' }, 0)
    cover.to(image, {
      opacity: 1,
      filter: 'blur(0px)',
      scale: 1.06,
      rotate: -1.5,
      duration: 0.58,
      ease: 'power2.inOut',
    }, 0)

    await cover

    const targetTask = (async () => {
      if (next.historyBack) await returnThroughHistory(next.to)
      else await router.push(next.to)
      await nextPaint()
      await settleRouteHash(next.to)
      return next.targetSelector ? findTarget(next.targetSelector) : null
    })()
    const target = await targetTask

    if (target) {
      const flight = gsap.timeline()
      flight.to(image, {
        top: target.top,
        left: target.left,
        width: target.width,
        height: target.height,
        scale: 1,
        rotate: 0,
        filter: 'blur(0px)',
        duration: 0.84,
        ease: 'power3.inOut',
        overwrite: 'auto',
      }, 0)
      // The wash prevents the route below from bleeding through while the
      // image is still soft. Release it before the flight completes so the
      // destination reveals as part of the same motion.
      flight.to(backdrop, { opacity: 0, duration: 0.38, ease: 'power1.out' }, 0.16)
      flight.to(image, { opacity: 0, duration: 0.18, ease: 'power1.out' }, 0.66)
      await flight
    } else {
      await cover
      await gsap.to(image, {
        opacity: 0,
        filter: 'blur(12px)',
        scale: 1.02,
        rotate: 0,
        duration: 0.42,
        ease: 'power2.out',
      })
      await gsap.to(backdrop, { opacity: 0, duration: 0.18, ease: 'power1.out' })
    }
    gsap.set(root, { opacity: 0 })
  } finally {
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
    <img ref="imageEl" :src="src" :alt="alt" class="case-detail-transition__image">
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

.case-detail-transition__image {
  position: fixed;
  display: block;
  object-fit: cover;
  object-position: center;
  will-change: top, left, width, height, transform, opacity, filter;
}
</style>
