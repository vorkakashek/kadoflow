<script setup lang="ts">
defineProps<{ surfaceReady?: boolean }>()

const rootEl = ref<HTMLElement | null>(null)
const surfaceEl = ref<HTMLElement | null>(null)
const titleEl = ref<HTMLElement | null>(null)

defineExpose({ rootEl, surfaceEl, titleEl })

let mobileMedia: MediaQueryList | null = null
let reducedMotionMedia: MediaQueryList | null = null
let biographyMotionCtx: { revert: () => void } | null = null
let biographyMotionObservers: IntersectionObserver[] = []

function clearBiographyMotion() {
  biographyMotionObservers.forEach(observer => observer.disconnect())
  biographyMotionObservers = []
  biographyMotionCtx?.revert()
  biographyMotionCtx = null
}

async function setupBiographyMotion() {
  clearBiographyMotion()

  const root = rootEl.value
  if (!root) return

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)

  const isMobile = !!mobileMedia?.matches
  const reducedMotion = !!reducedMotionMedia?.matches
  const title = titleEl.value
  const baseTitleLines = Array.from(
    root.querySelectorAll<HTMLElement>('.home-about__title-copy:not(.home-about__title-copy--inverse) .home-about__title-line-text'),
  )
  const inverseTitleLines = Array.from(
    root.querySelectorAll<HTMLElement>('.home-about__title-copy--inverse .home-about__title-line-text'),
  )
  const titleLines = [...baseTitleLines, ...inverseTitleLines]
  const portrait = root.querySelector<HTMLElement>('.home-about__portrait')
  const portraitPicture = portrait?.querySelector<HTMLElement>('picture') ?? null
  const portraitImage = portrait?.querySelector<HTMLElement>('img') ?? null
  const metaLines = Array.from(
    root.querySelectorAll<HTMLElement>('.home-about__meta > span'),
  )
  const copy = root.querySelector<HTMLElement>('.home-about__copy')
  const copyTitle = copy?.querySelector<HTMLElement>('h3 > span') ?? null
  const paragraphs = Array.from(copy?.querySelectorAll<HTMLElement>('p') ?? [])
  const animatedElements = [
    ...titleLines,
    ...(portraitPicture ? [portraitPicture] : []),
    ...(portraitImage ? [portraitImage] : []),
    ...metaLines,
    ...(copyTitle ? [copyTitle] : []),
    ...paragraphs,
  ]

  if (reducedMotion) {
    gsap.set(animatedElements, { clearProps: 'all' })
    return
  }

  const observeTimeline = (
    trigger: HTMLElement,
    timeline: ReturnType<typeof gsap.timeline>,
  ) => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (entry.isIntersecting || entry.boundingClientRect.top < 0) timeline.play()
        else timeline.reverse()
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0 },
    )
    observer.observe(trigger)
    biographyMotionObservers.push(observer)
  }

  biographyMotionCtx = gsap.context(() => {
    if (title && titleLines.length) {
      gsap.set(titleLines, { yPercent: 115 })
      const titleReveal = gsap.timeline({
        paused: isMobile,
        scrollTrigger: isMobile
          ? undefined
          : {
              trigger: title,
              start: 'top 88%',
              toggleActions: 'play none none reverse',
            },
      })

      baseTitleLines.forEach((line, index) => {
        const pair = [line, inverseTitleLines[index]].filter(
          (element): element is HTMLElement => !!element,
        )
        titleReveal.to(pair, {
          yPercent: 0,
          duration: isMobile ? 0.76 : 1,
          ease: 'power4.out',
        }, index * (isMobile ? 0.08 : 0.12))
      })

      if (isMobile) observeTimeline(title, titleReveal)
    }

    if (portrait && portraitPicture && portraitImage) {
      gsap.set(portraitPicture, { clipPath: 'inset(100% 0 0 0)' })
      gsap.set(portraitImage, { scale: 1.075 })
      gsap.set(metaLines, { autoAlpha: 0, y: 18 })

      const portraitReveal = gsap.timeline({
        paused: isMobile,
        scrollTrigger: isMobile
          ? undefined
          : {
              trigger: portrait,
              start: 'top 88%',
              toggleActions: 'play none none reverse',
            },
      })
      portraitReveal
        .to(portraitPicture, {
          clipPath: 'inset(0% 0 0 0)',
          duration: isMobile ? 0.9 : 1.15,
          ease: 'power4.inOut',
        }, 0)
        .to(portraitImage, {
          scale: 1,
          duration: isMobile ? 1.05 : 1.3,
          ease: 'power3.out',
        }, 0.08)
        .to(metaLines, {
          autoAlpha: 1,
          y: 0,
          duration: 0.62,
          stagger: 0.08,
          ease: 'power3.out',
        }, isMobile ? 0.48 : 0.62)

      if (isMobile) observeTimeline(portrait, portraitReveal)
    }

    if (copy && copyTitle) {
      gsap.set(copyTitle, { yPercent: 115 })
      gsap.set(paragraphs, { autoAlpha: 0, y: isMobile ? 30 : 24 })

      const copyReveal = gsap.timeline({
        paused: isMobile,
        scrollTrigger: isMobile
          ? undefined
          : {
              trigger: copy,
              start: 'top 86%',
              toggleActions: 'play none none reverse',
            },
      })
      copyReveal
        .to(copyTitle, {
          yPercent: 0,
          duration: 0.78,
          ease: 'power4.out',
        }, 0)
        .to(paragraphs, {
          autoAlpha: 1,
          y: 0,
          duration: 0.76,
          stagger: 0.16,
          ease: 'power3.out',
        }, 0.18)

      if (isMobile) observeTimeline(copy, copyReveal)
    }
  }, root)
}

async function onMotionMediaChange() {
  await setupBiographyMotion()
}

onMounted(async () => {
  mobileMedia = window.matchMedia('(max-width: 767.98px)')
  reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
  mobileMedia.addEventListener('change', onMotionMediaChange)
  reducedMotionMedia.addEventListener('change', onMotionMediaChange)
  await setupBiographyMotion()
})

onUnmounted(() => {
  clearBiographyMotion()
  mobileMedia?.removeEventListener('change', onMotionMediaChange)
  reducedMotionMedia?.removeEventListener('change', onMotionMediaChange)
})
</script>

<template>
  <section
    ref="rootEl"
    class="home-about pointer-events-auto relative z-10 w-full"
    :class="{ 'is-surface-ready': surfaceReady }"
    aria-labelledby="home-about-title"
  >
    <div class="home-about__layout">
      <div class="home-about__stage">
        <div
          ref="surfaceEl"
          class="home-about__surface"
          :class="{ 'is-surface-ready': surfaceReady }"
          aria-hidden="true"
        />

        <h2
          id="home-about-title"
          ref="titleEl"
          class="home-about__title"
        >
          <span class="home-about__title-copy">
            <span class="home-about__title-line"><span class="home-about__title-line-text">Личный взгляд.</span></span>
            <span class="home-about__title-line"><span class="home-about__title-line-text">Цельный результат.</span></span>
          </span>
          <span
            class="home-about__title-copy home-about__title-copy--inverse"
            aria-hidden="true"
          >
            <span class="home-about__title-line"><span class="home-about__title-line-text">Личный взгляд.</span></span>
            <span class="home-about__title-line"><span class="home-about__title-line-text">Цельный результат.</span></span>
          </span>
        </h2>

        <figure class="home-about__portrait">
          <picture>
            <source
              type="image/avif"
              srcset="/home/me-640.avif 640w, /home/me-1024.avif 1024w"
              sizes="(max-width: 767px) 88vw, 34vw"
            >
            <source
              type="image/webp"
              srcset="/home/me-640.webp 640w, /home/me-1024.webp 1024w"
              sizes="(max-width: 767px) 88vw, 34vw"
            >
            <img
              src="/home/me.png"
              alt="Антон, основатель КАДОФЛОУ"
              width="1801"
              height="2048"
              loading="lazy"
              decoding="async"
            >
          </picture>
          <figcaption class="home-about__meta">
            <span>арт-дирекция&nbsp;&nbsp;·&nbsp;&nbsp;UX/UI&nbsp;&nbsp;·&nbsp;&nbsp;разработка&nbsp;&nbsp;·&nbsp;&nbsp;motion</span>
            <span>москва&nbsp;&nbsp;·&nbsp;&nbsp;работа по всему миру</span>
          </figcaption>
        </figure>
      </div>

      <div class="home-about__copy">
        <h3><span>Обо мне</span></h3>
        <p>
          Меня зовут Антон. Я дизайнер и разработчик, основатель КАДОФЛОУ.
          Лично веду ключевые этапы проекта: разбираюсь в задаче, формирую
          структуру и визуальное направление, проектирую взаимодействия и
          участвую в разработке до самого запуска.
        </p>
        <p>
          Я собираю сайты как цельные цифровые пространства — со своим
          характером, понятной логикой и движением, которое помогает содержанию,
          а не существует ради эффекта.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-about {
  padding: var(--space-section) var(--layout-margin-content)
    calc(var(--space-section) * 1.25);
}

.home-about__layout,
.home-about__stage {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
}

.home-about__layout {
  max-width: var(--layout-content-max);
  margin-inline: auto;
}

.home-about__stage {
  position: relative;
  isolation: isolate;
  grid-column: 1 / -1;
}

.home-about__surface {
  position: absolute;
  z-index: -1;
  top: 0;
  right: 0;
  left: 0;
  height: clamp(35rem, 39vw, 46rem);
  border-radius: var(--flow-surface-radius, 12px);
  background: var(--palette-ink);
}

.home-about__surface.is-surface-ready {
  background: transparent;
}

.home-about__surface[data-flow-surface-proxy-active] {
  background: var(--palette-ink);
}

.home-about__surface[data-flow-surface-proxy-active] + .home-about__title {
  color: var(--palette-sand);
}

.home-about__title {
  --about-title-clip: inset(0 100% 0 0);
  position: relative;
  z-index: 2;
  margin: clamp(5.5rem, 7vw, 8rem) 0 0;
  grid-column: 5 / span 7;
  color: var(--palette-ink);
  font-size: clamp(3.25rem, 5.15vw, 6.25rem);
  font-weight: 400;
  letter-spacing: -0.055em;
  line-height: 0.96;
}

.home-about__title-copy,
.home-about__title-copy > span {
  display: block;
}

.home-about__title-copy > span {
  overflow: hidden;
  white-space: nowrap;
}

.home-about__title-line-text {
  display: inline-block;
  will-change: transform;
}

.home-about__title-copy--inverse {
  position: absolute;
  inset: 0;
  color: var(--palette-sand);
  clip-path: var(--about-title-clip);
  opacity: var(--about-title-inverse-opacity, 1);
  pointer-events: none;
  will-change: clip-path;
}

.home-about:not(.is-surface-ready) .home-about__title {
  color: var(--palette-sand);
}

.home-about__portrait {
  position: relative;
  z-index: 2;
  margin: clamp(3rem, 5vw, 5.5rem) 0 0;
  grid-column: 3 / span 4;
}

.home-about__portrait picture,
.home-about__portrait img {
  display: block;
  width: 100%;
}

.home-about__portrait picture {
  will-change: clip-path;
}

.home-about__portrait img {
  height: auto;
  transform-origin: center center;
  will-change: transform;
}

.home-about__meta {
  display: flex;
  margin-top: 0.8rem;
  flex-direction: column;
  gap: 0.4rem;
  color: var(--palette-ink);
  font-size: clamp(0.75rem, 0.85vw, 0.95rem);
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.home-about__copy {
  display: flex;
  margin-top: clamp(3.5rem, 6vw, 6.5rem);
  grid-column: 5 / span 6;
  flex-direction: column;
  color: var(--palette-ink);
}

.home-about__copy h3 {
  overflow: hidden;
  margin: 0 0 clamp(1.75rem, 2.5vw, 2.75rem);
  font-size: var(--type-slogan);
  font-weight: 600;
  letter-spacing: -0.035em;
  line-height: 1;
}

.home-about__copy h3 > span {
  display: inline-block;
  will-change: transform;
}

.home-about__copy p {
  max-width: 58rem;
  margin: 0;
  font-size: var(--type-body);
  letter-spacing: -0.025em;
  line-height: 1.38;
}

.home-about__copy p + p {
  margin-top: 1.65em;
}

@media (max-width: 767.98px) {
  .home-about {
    padding-block: calc(var(--space-section) * 0.75) var(--space-section);
  }

  .home-about__layout,
  .home-about__stage {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .home-about__surface {
    right: calc(-1 * var(--layout-margin-content));
    left: calc(-1 * var(--layout-margin-content));
    height: clamp(25rem, 108vw, 32rem);
  }

  .home-about__title {
    margin-top: clamp(3.5rem, 17vw, 5rem);
    grid-column: 1 / -1;
    font-size: clamp(2rem, 9.4vw, 3.2rem);
    line-height: 0.94;
  }

  .home-about__portrait {
    width: 88%;
    max-width: 32rem;
    margin-top: clamp(2.75rem, 12vw, 4rem);
    grid-column: 1 / -1;
  }

  .home-about__meta {
    font-size: 0.72rem;
  }

  .home-about__copy {
    margin-top: clamp(3.5rem, 15vw, 5.5rem);
    grid-column: 1 / -1;
  }

  .home-about__copy h3 {
    font-size: calc(var(--type-slogan) * 0.8);
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-about__surface.is-surface-ready {
    background: var(--palette-ink);
  }

  .home-about__title {
    color: var(--palette-sand);
  }

  .home-about__title-copy--inverse {
    will-change: auto;
  }

  .home-about__title-line-text,
  .home-about__portrait picture,
  .home-about__portrait img,
  .home-about__copy h3 > span {
    will-change: auto;
  }
}
</style>
