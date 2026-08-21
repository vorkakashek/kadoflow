<script setup lang="ts">
import gsap from 'gsap'

const router = useRouter()
const { request, active, detailContentVisible } = useCaseDetailTransition()
const rootEl = ref<HTMLElement | null>(null)
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
  const image = imageEl.value
  if (!root || !image) return

  active.value = true
  wash.value = next.wash
  src.value = next.src
  alt.value = next.alt
  visible.value = true
  await nextTick()

  const viewport = { width: window.innerWidth, height: window.innerHeight }
  gsap.set(root, { opacity: 0 })

  try {
    if (next.direction === 'open' && next.rect) {
      gsap.set(image, { ...next.rect, opacity: 1, filter: 'blur(0px)' })
      await Promise.all([
        gsap.to(root, { opacity: 1, duration: 0.18, ease: 'power1.out' }),
        gsap.to(image, {
          top: 0,
          left: 0,
          width: viewport.width,
          height: viewport.height,
          duration: 0.72,
          ease: 'power3.inOut',
        }),
      ])
      await router.push(next.to)
      await nextPaint()
      await gsap.to(image, {
        opacity: 0,
        filter: 'blur(20px)',
        duration: 0.46,
        ease: 'power2.out',
      })
      await gsap.to(root, { opacity: 0, duration: 0.18, ease: 'power1.out' })
      // Let the now-uncovered detail start its own staged content timeline.
      detailContentVisible.value = true
      return
    }

    // Return is staged like a physical cover: first make the detail image fully
    // opaque over the current page, then mount the destination underneath it.
    // Once the home page has painted, the cover can shrink and reveal a page
    // that already exists instead of fading the whole route in at the end.
    gsap.set(root, { opacity: 1 })
    root.style.backgroundColor = 'transparent'
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
    const detail = document.querySelector<HTMLElement>('.case-detail__inner')
    const cover = gsap.timeline()
    if (detail) {
      cover.to(detail, { opacity: 0, duration: 0.48, ease: 'power2.inOut' }, 0)
    }
    cover.to(image, {
      opacity: 1,
      filter: 'blur(0px)',
      scale: 1.06,
      rotate: -1.5,
      duration: 0.58,
      ease: 'power2.inOut',
    }, 0)
    await cover

    // The opaque image now owns the frame. Nuxt can mount and settle the home
    // route behind it without exposing an intermediate page state.
    if (next.historyBack) await returnThroughHistory(next.to)
    else await router.push(next.to)
    await nextPaint()
    await settleRouteHash(next.to)
    const target = next.targetSelector ? await findTarget(next.targetSelector) : null

    if (target) {
      const flight = gsap.timeline()
      flight.to(image, {
        top: target.top,
        left: target.left,
        width: target.width,
        height: target.height,
        scale: 1,
        rotate: 0,
        duration: 0.92,
        ease: 'power3.inOut',
      }, 0)
      await flight
      // Crossfade only the duplicate transition image. The page around it has
      // already been visible throughout the flight.
      await gsap.to(image, { opacity: 0, duration: 0.22, ease: 'power1.out' })
    } else {
      await gsap.to(image, {
        opacity: 0,
        filter: 'blur(12px)',
        scale: 1.02,
        rotate: 0,
        duration: 0.42,
        ease: 'power2.out',
      })
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
    :style="{ backgroundColor: wash }"
    aria-hidden="true"
  >
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

.case-detail-transition__image {
  position: fixed;
  display: block;
  object-fit: cover;
  object-position: center;
  will-change: top, left, width, height, transform, opacity, filter;
}
</style>
