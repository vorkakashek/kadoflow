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

async function findTarget(selector: string) {
  for (let frame = 0; frame < 12; frame += 1) {
    const target = document.querySelector<HTMLElement>(selector)
    const rect = target?.getBoundingClientRect()
    if (rect && rect.width > 2 && rect.height > 2) return rect
    await nextPaint()
  }
  return null
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

    // Return: the detail fades under a full-screen case image, then the image
    // docks into its remembered card on Home or in the projects catalogue.
    // Keep the layer transparent while the detail copy fades out under the
    // incoming image. Once the image covers the page, restore the wash before
    // routing so the destination never flashes through.
    gsap.set(root, { opacity: 1 })
    root.style.backgroundColor = 'transparent'
    gsap.set(image, { top: 0, left: 0, width: viewport.width, height: viewport.height, opacity: 0, filter: 'blur(0px)' })
    const detail = document.querySelector<HTMLElement>('.case-detail__inner')
    await Promise.all([
      gsap.to(image, { opacity: 1, duration: 0.55, ease: 'power1.inOut' }),
      detail ? gsap.to(detail, { opacity: 0, duration: 0.55, ease: 'power1.inOut' }) : Promise.resolve(),
    ])
    root.style.backgroundColor = wash.value
    await router.push(next.to)
    await nextPaint()
    const target = next.targetSelector ? await findTarget(next.targetSelector) : null
    if (target) {
      await gsap.to(image, {
        top: target.top,
        left: target.left,
        width: target.width,
        height: target.height,
        duration: 0.72,
        ease: 'power3.inOut',
      })
    }
    await gsap.to(root, { opacity: 0, duration: 0.2, ease: 'power1.out' })
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
  will-change: top, left, width, height, opacity, filter;
}
</style>
