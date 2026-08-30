<script setup lang="ts">
import { PhArrowUpRight } from '@phosphor-icons/vue'
import { homeCases } from '~/utils/homeCases'
import { projectCaseDetails } from '~/utils/projectCaseDetails'
import { onNavWaveEnter, onNavWaveLeave } from '~/utils/navWaveHover'

const route = useRoute()
const item = computed(() =>
  homeCases.find((caseItem) => caseItem.id === route.params.id),
)
const {
  request: detailTransitionRequest,
  active: detailTransitionActive,
  detailContentVisible,
} = useCaseDetailTransition()
const brandPreload = useBrandPreload()
const firstScreenEl = ref<HTMLElement | null>(null)
const titleFrameEl = ref<HTMLElement | null>(null)
const titleMotionEl = ref<HTMLElement | null>(null)
const metaFrameEl = ref<HTMLElement | null>(null)
const mediaEnterEl = ref<HTMLElement | null>(null)
const mediaParallaxEl = ref<HTMLElement | null>(null)
const detailContentEl = ref<HTMLElement | null>(null)
const nextProjectContentEl = ref<HTMLElement | null>(null)
const audienceDisclosureParagraphs = [
  'Визуальная система не копирует восточную эстетику через декор. Она строится на глубине кадра, природных фактурах, контрасте света и тени, свободном пространстве и сдержанном темпе взаимодействий. Эти принципы последовательно применены во всех разделах сайта.',
  'Навигация связывает сведения о концепции, интерьере, меню и сервисе. Одна и та же структура поддерживает три языковые версии: русскую, английскую и китайскую.',
]
const nextItem = computed(() => {
  const currentIndex = homeCases.findIndex((caseItem) => caseItem.id === item.value?.id)
  return homeCases[(currentIndex + 1) % homeCases.length]
})
const projectDetail = computed(() => item.value ? projectCaseDetails[item.value.id] : undefined)
const headerMedia = computed(() => projectDetail.value?.headerMedia ?? item.value?.media)
const audienceClosingMedia = {
  src: '/home/cases/audience/audience-end-960.webp',
  alt: 'Audience — цифровая атмосфера проекта',
  width: 2080,
  height: 1234,
  webpSrcset: '/home/cases/audience/audience-end-480.webp 480w, /home/cases/audience/audience-end-960.webp 960w, /home/cases/audience/audience-end-1440.webp 1440w, /home/cases/audience/audience-end-1920.webp 1920w',
  avifSrcset: '/home/cases/audience/audience-end-480.avif 480w, /home/cases/audience/audience-end-960.avif 960w, /home/cases/audience/audience-end-1440.avif 1440w, /home/cases/audience/audience-end-1920.avif 1920w',
  sizes: '100vw',
}

let mediaParallaxCtx: { revert: () => void } | null = null
let headerScrollCtx: { revert: () => void } | null = null
let detailRevealCtx: { revert: () => void } | null = null
let audienceTextFillCtx: { revert: () => void } | null = null
let nextProjectParallaxCtx: { revert: () => void } | null = null
let audienceTextResizeObserver: ResizeObserver | null = null
let caseMediaPreloadObserver: IntersectionObserver | null = null
let audienceTextRebuildTimer = 0
const audienceTextFillLayouts = new WeakMap<HTMLElement, string>()
let directRevealFrame = 0
let stopDirectRevealWatch: (() => void) | null = null

// A direct request has no fullscreen cover to stage the page underneath. Start
// it from the same hidden pose and release it after the hydrated DOM has painted.
const isDirectEntry = !detailTransitionRequest.value && !detailTransitionActive.value
if (isDirectEntry) detailContentVisible.value = false

function releaseDirectEntry() {
  directRevealFrame = requestAnimationFrame(() => {
    directRevealFrame = requestAnimationFrame(() => {
      detailContentVisible.value = true
    })
  })
}

function setupCaseMediaPreload() {
  const root = detailContentEl.value?.parentElement
  if (!root || !('IntersectionObserver' in window)) return

  caseMediaPreloadObserver?.disconnect()
  const preloadDistance = Math.max(2400, Math.round(window.innerHeight * 4))
  caseMediaPreloadObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !(entry.target instanceof HTMLImageElement)) continue
      const image = entry.target
      observer.unobserve(image)
      // Start transfer well before the reveal corridor without competing with
      // the opening screen. decode() keeps raster preparation asynchronous.
      image.loading = 'eager'
      image.decoding = 'async'
      void image.decode().catch(() => {
        // The native image fallback remains visible if decode is interrupted.
      })
    }
  }, { rootMargin: `${preloadDistance}px 0px ${preloadDistance}px 0px` })

  for (const image of root.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')) {
    caseMediaPreloadObserver.observe(image)
  }
}

async function refreshAudienceScrollPositions() {
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  requestAnimationFrame(() => ScrollTrigger.refresh())
}

async function setupMediaParallax() {
  const media = mediaParallaxEl.value
  if (!media || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const audience = item.value?.id === 'audience'
  const mediaFrame = mediaEnterEl.value ?? media
  const openingStory = audience
    ? null
    : detailContentEl.value?.querySelector<HTMLElement>(
        '.case-detail__first-screen + .project-story',
      ) ?? null

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)

  mediaParallaxCtx?.revert()
  mediaParallaxCtx = gsap.context(() => {
    const scrollTrigger = {
      trigger: mediaFrame,
      start: audience
        ? 'top bottom'
        : () => `top top+=${Math.round(media.offsetHeight * 0.3)}px`,
      end: 'bottom top',
      scrub: 0.65,
      invalidateOnRefresh: true,
    }

    gsap.fromTo(
      media,
      { yPercent: 0 },
      {
        // Audience uses a shorter crop window. Its oversized image travels
        // upward inside that window until the frame's lower edge clears the
        // top of the viewport; other cases retain their existing page drift.
        yPercent: audience ? -55 : 30,
        ease: 'none',
        scrollTrigger,
      },
    )

    if (openingStory) {
      // The media's bottom runway is reserved in layout for its final 30%
      // downward drift. At the start of that drift the runway is still empty,
      // so lift the opening story by the unused amount and release it in sync
      // with the media. This keeps the perceived gap stable throughout.
      gsap.fromTo(
        openingStory,
        { y: () => -(Number.parseFloat(getComputedStyle(mediaFrame).marginBottom) || 0) },
        { y: 0, ease: 'none', scrollTrigger },
      )
    }
  }, mediaFrame)
}

async function setupHeaderScroll() {
  const scope = firstScreenEl.value
  const titleFrame = titleFrameEl.value
  const title = titleMotionEl.value
  const meta = metaFrameEl.value
  const media = mediaEnterEl.value
  if (
    !scope
    || !titleFrame
    || !title
    || !meta
    || !media
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) return

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)

  headerScrollCtx?.revert()
  headerScrollCtx = gsap.context(() => {
    const mediaTravel = () => Math.min(window.innerHeight * 0.16, media.offsetHeight * 0.22)
    const syncMediaTravel = () => {
      gsap.set(scope, { '--case-header-travel': `${mediaTravel()}px` })
    }
    syncMediaTravel()

    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: titleFrame,
        start: 'top top',
        end: 'bottom top',
        scrub: 0.7,
        invalidateOnRefresh: true,
        onRefreshInit: syncMediaTravel,
      },
    })

    timeline
      .fromTo(title, { y: 0 }, {
        y: () => titleFrame.clientHeight - mediaTravel() - title.offsetTop + 2,
        ease: 'none',
      }, 0)
      .fromTo(titleFrame, { clipPath: 'inset(0 0 0px 0)' }, {
        clipPath: () => `inset(0 0 ${mediaTravel()}px 0)`,
        ease: 'none',
      }, 0)
      .fromTo(scope, { '--case-header-shift': '0px' }, {
        '--case-header-shift': () => `${-mediaTravel()}px`,
        ease: 'none',
      }, 0)
  }, scope)
}

async function setupDetailReveals() {
  // The closing Audience media sits outside the constrained inner container so
  // it can remain genuinely edge-to-edge. Use the main case element as the
  // reveal scope so full-bleed sections participate in the same motion system.
  const root = detailContentEl.value?.parentElement
  if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const textTargets = Array.from(root.querySelectorAll<HTMLElement>([
    '.case-detail__hero h1',
    '.case-detail__meta',
    '.audience-case > h2',
    '.audience-case__copy > p',
    '.audience-case__menu-lead > p',
    '.audience-case__menu-secondary',
    '.audience-case__motion-secondary',
    '.audience-case__statement',
    '.audience-case__lede',
    '.audience-case--final p',
    '.project-story > h2',
    '.project-story__copy > p',
    '.project-story__statement',
    '.case-disclosure',
    '.project-story--final p',
  ].join(','))).filter((target) =>
    // The complete first screen is already staged by the detail entry
    // transition on every case. A second scroll reveal here makes the opening
    // media jump as its parallax begins.
    !target.closest('.case-detail__first-screen'),
  )
  const mediaTargets = Array.from(root.querySelectorAll<HTMLElement>([
    '.case-detail__media',
    '.audience-case__media-pair .audience-case__wave-media',
    '.audience-case__media-wide',
    '.audience-case__menu-lead-media',
    '.audience-case__mosaic-media',
    '.audience-case__media-full',
    '.audience-case__motion-pair > img',
    '.audience-case__motion-pair .case-autoplay-video',
    '.audience-case__admin-media .audience-case__responsive-picture',
    '.audience-case__closing-media',
    '.project-story__media img',
    '.project-story__media .case-autoplay-video',
    '.project-story__closing-media',
  ].join(','))).filter((target) =>
    !target.closest('.case-detail__first-screen'),
  )
  if (!textTargets.length && !mediaTargets.length) return

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)

  detailRevealCtx?.revert()
  detailRevealCtx = gsap.context(() => {
    const addReveal = (target: HTMLElement, media: boolean) => {
      // The shared media shader must not replace a target while GSAP owns its
      // opacity or transform during the scroll reveal/leave corridor.
      target.dataset.caseReveal = ''
      const enterY = media ? 4 : 7
      const leaveY = media ? -4 : -7
      gsap.fromTo(target,
        media ? {
          autoAlpha: 0,
          yPercent: enterY,
        } : {
          autoAlpha: 0,
          yPercent: enterY,
          scale: 0.975,
          rotationX: 3,
          transformOrigin: '50% 0%',
          transformPerspective: 1000,
        },
        media ? {
          autoAlpha: 1,
          yPercent: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: target,
            start: 'top 96%',
            end: 'top 84%',
            scrub: 0.65,
            invalidateOnRefresh: true,
          },
        } : {
          autoAlpha: 1,
          yPercent: 0,
          scale: 1,
          rotationX: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: target,
            start: 'top 96%',
            end: 'top 84%',
            scrub: 0.65,
            invalidateOnRefresh: true,
          },
        },
      )

      gsap.fromTo(target,
        media ? {
          autoAlpha: 1,
          yPercent: 0,
        } : {
          autoAlpha: 1,
          yPercent: 0,
          scale: 1,
          rotationX: 0,
        },
        media ? {
          autoAlpha: 0,
          yPercent: leaveY,
          ease: 'none',
          immediateRender: false,
          scrollTrigger: {
            trigger: target,
            start: 'bottom 25%',
            end: 'bottom top',
            scrub: 0.65,
            invalidateOnRefresh: true,
          },
        } : {
          autoAlpha: 0,
          yPercent: leaveY,
          scale: 0.975,
          rotationX: -3,
          transformOrigin: '50% 100%',
          transformPerspective: 1000,
          ease: 'none',
          immediateRender: false,
          scrollTrigger: {
            trigger: target,
            start: 'bottom 25%',
            end: 'bottom top',
            scrub: 0.65,
            invalidateOnRefresh: true,
          },
        },
      )
    }

    textTargets.forEach(target => addReveal(target, false))
    mediaTargets.forEach(target => addReveal(target, true))
  }, root)
}

async function setupAudienceTextFill() {
  const hosts = Array.from(
    detailContentEl.value?.querySelectorAll<HTMLElement>('.case-text-fill') ?? [],
  )
  if (!hosts.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  // Line boxes depend on the final font metrics. Measuring before the webfont
  // settles can bake fallback-font wraps into the generated rows.
  await document.fonts.ready
  audienceTextFillCtx?.revert()
  const hostInks = hosts.map((host) => {
    const paragraphs = host.matches('p')
      ? [host as HTMLParagraphElement]
      : Array.from(host.querySelectorAll('p'))
    const inks: HTMLElement[] = []
    for (const paragraph of paragraphs) {
      const text = paragraph.dataset.fillText ?? paragraph.textContent?.trim() ?? ''
      if (!text) continue
      paragraph.dataset.fillText = text
      paragraph.textContent = ''
      const measure = document.createElement('span')
      measure.className = 'audience-fill__measure'
      paragraph.append(measure)
      const words: HTMLSpanElement[] = []
      for (const part of text.split(/\s+/)) {
        const word = document.createElement('span')
        word.textContent = part
        measure.append(word, document.createTextNode(' '))
        words.push(word)
      }

      const lines: string[] = []
      let lineTop = Number.NaN
      let line = ''
      for (const word of words) {
        if (!Number.isNaN(lineTop) && Math.abs(word.offsetTop - lineTop) > 1) {
          lines.push(line.trim())
          line = ''
        }
        lineTop = word.offsetTop
        line += `${word.textContent ?? ''} `
      }
      if (line.trim()) lines.push(line.trim())

      paragraph.textContent = ''
      for (const lineText of lines) {
        const row = document.createElement('span')
        row.className = 'audience-fill__line'
        const ash = document.createElement('span')
        ash.className = 'audience-fill__ash'
        ash.textContent = lineText
        const ink = document.createElement('span')
        ink.className = 'audience-fill__ink'
        ink.textContent = lineText
        ink.setAttribute('aria-hidden', 'true')
        row.append(ash, ink)
        paragraph.append(row)
        inks.push(ink)
      }
    }
    return { host, inks }
  }).filter(({ inks }) => inks.length)
  if (!hostInks.length) return

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)
  audienceTextFillCtx = gsap.context(() => {
    hostInks.forEach(({ host, inks }) => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: host,
          start: 'top 82%',
          end: 'bottom 45%',
          scrub: 0.7,
        },
      })
      inks.forEach((ink, index) => {
        // One complete row per timeline segment: the next line remains ash
        // until the previous one has finished filling.
        tl.fromTo(ink, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1, ease: 'none' }, index)
      })
    })
  }, detailContentEl.value ?? hosts[0])

  const layoutSignature = (host: HTMLElement) => {
    const styles = getComputedStyle(host)
    return [
      host.clientWidth,
      styles.fontFamily,
      styles.fontSize,
      styles.fontWeight,
      styles.letterSpacing,
      styles.lineHeight,
    ].join('|')
  }

  audienceTextResizeObserver ??= new ResizeObserver((entries) => {
    const layoutChanged = entries.some((entry) => {
      const host = entry.target as HTMLElement
      return audienceTextFillLayouts.get(host) !== layoutSignature(host)
    })
    if (!layoutChanged) return
    if (audienceTextRebuildTimer) window.clearTimeout(audienceTextRebuildTimer)
    audienceTextRebuildTimer = window.setTimeout(() => {
      audienceTextRebuildTimer = 0
      void setupAudienceTextFill()
    }, 140)
  })
  audienceTextResizeObserver.disconnect()
  hosts.forEach((host) => {
    audienceTextFillLayouts.set(host, layoutSignature(host))
    audienceTextResizeObserver?.observe(host)
  })

  requestAnimationFrame(() => ScrollTrigger.refresh())
}

async function setupNextProjectParallax() {
  const content = nextProjectContentEl.value
  const block = content?.parentElement
  if (!block || !content || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)
  nextProjectParallaxCtx?.revert()
  nextProjectParallaxCtx = gsap.context(() => {
    gsap.fromTo(content, { yPercent: -26 }, {
      yPercent: 4,
      ease: 'none',
      scrollTrigger: {
        trigger: block,
        start: 'top bottom',
        end: 'bottom bottom',
        scrub: 0.75,
      },
    })
  }, block)
}

onMounted(() => {
  // Direct entries have not visited the home route yet. Warm its component
  // while the user reads the case so the return transition can mount it under
  // the fullscreen cover without a route-chunk pause.
  void preloadRouteComponents('/')
  void nextTick(() => {
    setupCaseMediaPreload()
    void setupDetailReveals()
    void setupHeaderScroll()
    void setupMediaParallax()
    void setupAudienceTextFill()
    void setupNextProjectParallax()
  })

  if (isDirectEntry) {
    if (brandPreload.revealed.value) releaseDirectEntry()
    else {
      stopDirectRevealWatch = watch(
        () => brandPreload.revealed.value,
        (revealed) => {
          if (!revealed) return
          stopDirectRevealWatch?.()
          stopDirectRevealWatch = null
          releaseDirectEntry()
        },
      )
    }
  }
})

onBeforeUnmount(() => {
  if (directRevealFrame) cancelAnimationFrame(directRevealFrame)
  stopDirectRevealWatch?.()
  stopDirectRevealWatch = null
  mediaParallaxCtx?.revert()
  mediaParallaxCtx = null
  headerScrollCtx?.revert()
  headerScrollCtx = null
  detailRevealCtx?.revert()
  detailRevealCtx = null
  audienceTextFillCtx?.revert()
  audienceTextFillCtx = null
  nextProjectParallaxCtx?.revert()
  nextProjectParallaxCtx = null
  audienceTextResizeObserver?.disconnect()
  audienceTextResizeObserver = null
  caseMediaPreloadObserver?.disconnect()
  caseMediaPreloadObserver = null
  if (audienceTextRebuildTimer) window.clearTimeout(audienceTextRebuildTimer)
  audienceTextRebuildTimer = 0
})

if (!item.value) {
  throw createError({ statusCode: 404, statusMessage: 'Кейс не найден' })
}

useHead(() => ({
  title: `${item.value?.title ?? 'Кейс'} — Kadoflow`,
}))
</script>

<template>
  <div
    v-if="item"
    class="case-detail-shell"
  >
    <main
      class="case-detail"
      :class="{
        'case-detail--inverse': item.inverse,
        'case-detail--audience': item.id === 'audience',
        'case-detail--baltika': item.id === 'baltika',
        'case-detail--entering': !detailContentVisible,
      }"
      :style="{ backgroundColor: item.wash }"
    >
      <CaseMediaWaveLayer />
      <CaseScrollTop />
      <div ref="detailContentEl" class="case-detail__inner">
      <div ref="firstScreenEl" class="case-detail__first-screen">
        <section ref="titleFrameEl" class="case-detail__hero">
          <h1 ref="titleMotionEl">
            <span>{{ item.title }},</span>
            <span class="case-detail__summary">{{ (projectDetail?.summary ?? item.blurb).replaceAll('\n', ' ') }}</span>
          </h1>
        </section>

        <section class="case-detail__content">
          <div
            ref="metaFrameEl"
            class="case-detail__meta"
            :class="{ 'case-detail__meta--five-up': item.id === 'schmidt' }"
          >
            <div class="case-detail__meta-motion">
              <div>
                <p class="case-detail__eyebrow">клиент</p>
                <p class="case-detail__tags">{{ item.client }}</p>
              </div>
              <div>
                <p class="case-detail__eyebrow">год</p>
                <p class="case-detail__tags">{{ item.year }}</p>
              </div>
              <div>
                <p class="case-detail__eyebrow">участие</p>
                <p class="case-detail__tags case-detail__role-tags">
                  <span v-for="tag in item.roleTags" :key="tag">{{ tag }}</span>
                </p>
              </div>
              <div v-if="item.collaboration">
                <p class="case-detail__eyebrow">в коллаборации</p>
                <p class="case-detail__tags">{{ item.collaboration }}</p>
              </div>
              <div v-if="item.projectUrl">
                <p class="case-detail__eyebrow">ссылки</p>
                <a
                  class="case-detail__project-link"
                  :href="item.projectUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  @mouseenter="onNavWaveEnter"
                  @mouseleave="onNavWaveLeave"
                  @focus="onNavWaveEnter"
                  @blur="onNavWaveLeave"
                >
                  <span class="case-detail__project-label">
                    {{ item.projectLabel ?? item.projectUrl }}
                    <TextLinkWave />
                  </span>
                  <PhArrowUpRight :size="16" />
                </a>
              </div>
            </div>
          </div>
          <div
            ref="mediaEnterEl"
            class="case-detail__media"
            :class="{
              'case-detail__media--audience': item.id === 'audience',
              'case-detail__media--video': item.id === 'baltika' && !projectDetail?.headerMedia && item.media.video,
            }"
          >
            <div ref="mediaParallaxEl" class="case-detail__media-parallax">
              <BaltikaScrollFilm
                v-if="item.id === 'baltika' && !projectDetail?.headerMedia && item.media.video"
                :webm="item.media.video.webm"
                :mp4="item.media.video.mp4"
                :mobile-webm="item.media.video.mobileWebm"
                :mobile-mp4="item.media.video.mobileMp4"
                :poster="item.media.video.poster"
                :alt="item.media.alt"
              />
              <picture v-else class="case-detail__picture">
                <source v-if="headerMedia?.avifSrcset" type="image/avif" :srcset="headerMedia.avifSrcset" sizes="100vw">
                <source v-if="headerMedia?.webpSrcset" type="image/webp" :srcset="headerMedia.webpSrcset" sizes="100vw">
                <img
                  :src="headerMedia?.src"
                  :alt="headerMedia?.alt"
                  :width="headerMedia?.width"
                  :height="headerMedia?.height"
                  class="case-detail__image"
                  loading="eager"
                  fetchpriority="high"
                  decoding="async"
                >
              </picture>
            </div>
          </div>
        </section>
      </div>

        <template v-if="item.id === 'audience'">
          <section class="audience-case audience-case--intro">
            <h2>Цифровая система пространства,<br>а не набор отдельных страниц.</h2>
            <div class="audience-case__copy audience-case__copy--split">
              <p>В проекте Audience мы перевели характер интерьера и визуального языка в структуру сайта. В кейсе показаны решения по композиции, навигации и управлению контентом.</p>
              <p>Задача была связать сведения о концепции, интерьере, кухне и сервисе в одной последовательной цифровой системе.</p>
            </div>
            <CaseHorizontalRail class="audience-case__media-pair audience-case__media-pair--scroll">
              <picture class="audience-case__wave-media audience-case__wave-media--portrait">
                <source
                  type="image/avif"
                  srcset="/home/cases/audience/audience-intro-1-480.avif 480w, /home/cases/audience/audience-intro-1-960.avif 960w, /home/cases/audience/audience-intro-1-1248.avif 1248w"
                  sizes="(max-width: 767px) 94vw, 40vw"
                >
                <source
                  type="image/webp"
                  srcset="/home/cases/audience/audience-intro-1-480.webp 480w, /home/cases/audience/audience-intro-1-960.webp 960w, /home/cases/audience/audience-intro-1-1248.webp 1248w"
                  sizes="(max-width: 767px) 94vw, 40vw"
                >
                <img
                  src="/home/cases/audience/audience-intro-1-960.webp"
                  width="1248"
                  height="1888"
                  alt="Audience — экран сайта"
                  loading="lazy"
                  decoding="async"
                >
              </picture>
              <picture class="audience-case__wave-media audience-case__wave-media--landscape">
                <source
                  type="image/avif"
                  srcset="/home/cases/audience/audience-intro-2-480.avif 480w, /home/cases/audience/audience-intro-2-960.avif 960w, /home/cases/audience/audience-intro-2-1440.avif 1440w, /home/cases/audience/audience-intro-2-1840.avif 1840w"
                  sizes="(max-width: 767px) 94vw, 58vw"
                >
                <source
                  type="image/webp"
                  srcset="/home/cases/audience/audience-intro-2-480.webp 480w, /home/cases/audience/audience-intro-2-960.webp 960w, /home/cases/audience/audience-intro-2-1440.webp 1440w, /home/cases/audience/audience-intro-2-1840.webp 1840w"
                  sizes="(max-width: 767px) 94vw, 58vw"
                >
                <img
                  src="/home/cases/audience/case-detail-3.png"
                  width="1840"
                  height="1380"
                  alt="Audience — детали цифрового опыта"
                  loading="lazy"
                  decoding="async"
                >
              </picture>
            </CaseHorizontalRail>
          </section>

          <section class="audience-case audience-case--disclosure">
            <CaseNarrativeDisclosure
              disclosure-id="audience-atmosphere-copy"
              title="Визуальный язык как часть<br>навигации."
              :paragraphs="audienceDisclosureParagraphs"
              @layout-change="refreshAudienceScrollPositions"
            />
            <picture>
              <source
                type="image/avif"
                srcset="/home/cases/audience/audience-atmosphere-480.avif 480w, /home/cases/audience/audience-atmosphere-960.avif 960w, /home/cases/audience/audience-atmosphere-1440.avif 1440w, /home/cases/audience/audience-atmosphere-1920.avif 1920w, /home/cases/audience/audience-atmosphere-2760.avif 2760w"
                sizes="100vw"
              >
              <source
                type="image/webp"
                srcset="/home/cases/audience/audience-atmosphere-480.webp 480w, /home/cases/audience/audience-atmosphere-960.webp 960w, /home/cases/audience/audience-atmosphere-1440.webp 1440w, /home/cases/audience/audience-atmosphere-1920.webp 1920w, /home/cases/audience/audience-atmosphere-2760.webp 2760w"
                sizes="100vw"
              >
              <img
                class="audience-case__media-wide"
                src="/home/cases/audience/case-detail-4.png"
                width="3680"
                height="2760"
                alt="Audience — атмосфера сайта"
                loading="lazy"
                decoding="async"
              >
            </picture>
          </section>

          <section class="audience-case audience-case--menu">
            <h2>Как организовать сложную<br>контентную структуру?</h2>
            <div class="audience-case__menu-lead">
              <picture class="audience-case__menu-lead-media">
                <source
                  type="image/avif"
                  srcset="/home/cases/audience/audience-menu-lead-480.avif 480w, /home/cases/audience/audience-menu-lead-960.avif 960w, /home/cases/audience/audience-menu-lead-1440.avif 1440w, /home/cases/audience/audience-menu-lead-1920.avif 1920w"
                  sizes="(max-width: 767px) 100vw, 50vw"
                >
                <source
                  type="image/webp"
                  srcset="/home/cases/audience/audience-menu-lead-480.webp 480w, /home/cases/audience/audience-menu-lead-960.webp 960w, /home/cases/audience/audience-menu-lead-1440.webp 1440w, /home/cases/audience/audience-menu-lead-1920.webp 1920w"
                  sizes="(max-width: 767px) 100vw, 50vw"
                >
                <img
                  src="/home/cases/audience/case-detail-5.png"
                  width="3840"
                  height="2160"
                  alt="Audience — меню"
                  loading="lazy"
                  decoding="async"
                >
              </picture>
              <p>Разделы кухни, напитков и чайной церемонии получили собственную структуру категорий, карточек и материалов.</p>
            </div>
            <p class="audience-case__menu-secondary case-text-fill">У каждого направления — собственная структура, категории, карточки и контент.</p>
            <div class="audience-case__media-mosaic">
              <div class="audience-case__menu-media-pair audience-case__menu-media-pair--top">
                <picture class="audience-case__responsive-picture audience-case__responsive-picture--menu-primary audience-case__mosaic-media">
                  <source type="image/avif" srcset="/home/cases/audience/audience-menu-primary-480.avif 480w, /home/cases/audience/audience-menu-primary-960.avif 960w, /home/cases/audience/audience-menu-primary-1488.avif 1488w" sizes="(max-width: 767px) 100vw, 50vw">
                  <source type="image/webp" srcset="/home/cases/audience/audience-menu-primary-480.webp 480w, /home/cases/audience/audience-menu-primary-960.webp 960w, /home/cases/audience/audience-menu-primary-1488.webp 1488w" sizes="(max-width: 767px) 100vw, 50vw">
                  <img class="audience-case__menu-image--primary" src="/home/cases/audience/audience-menu-primary-960.webp" width="1488" height="2159" alt="Audience — раздел меню" loading="lazy" decoding="async">
                </picture>
                <div class="audience-case__menu-media-stack">
                  <picture class="audience-case__mosaic-picture">
                    <source type="image/avif" srcset="/home/cases/audience/audience-img-480.avif 480w, /home/cases/audience/audience-img-960.avif 960w, /home/cases/audience/audience-img-1440.avif 1440w, /home/cases/audience/audience-img-1856.avif 1856w" sizes="50vw">
                    <source type="image/webp" srcset="/home/cases/audience/audience-img-480.webp 480w, /home/cases/audience/audience-img-960.webp 960w, /home/cases/audience/audience-img-1440.webp 1440w, /home/cases/audience/audience-img-1856.webp 1856w" sizes="50vw">
                    <img class="audience-case__mosaic-media" src="/home/cases/audience/audience-img-960.webp" width="1856" height="2304" alt="Audience — категория меню" loading="lazy" decoding="async">
                  </picture>
                  <p class="audience-case__statement audience-case__statement--menu">Главная UX-задача — сохранить объём материалов и при этом сделать структуру понятной.</p>
                </div>
              </div>
              <div class="audience-case__menu-media-pair audience-case__menu-media-pair--bottom">
                <div class="audience-case__menu-media-stack audience-case__menu-media-stack--bottom">
                  <picture class="audience-case__mosaic-picture">
                    <source type="image/avif" srcset="/home/cases/audience/audience-img-480.avif 480w, /home/cases/audience/audience-img-960.avif 960w, /home/cases/audience/audience-img-1440.avif 1440w, /home/cases/audience/audience-img-1856.avif 1856w" sizes="50vw">
                    <source type="image/webp" srcset="/home/cases/audience/audience-img-480.webp 480w, /home/cases/audience/audience-img-960.webp 960w, /home/cases/audience/audience-img-1440.webp 1440w, /home/cases/audience/audience-img-1856.webp 1856w" sizes="50vw">
                    <img class="audience-case__mosaic-media" src="/home/cases/audience/audience-img-960.webp" width="1856" height="2304" alt="Audience — карточка позиции" loading="lazy" decoding="async">
                  </picture>
                  <p class="audience-case__statement audience-case__statement--menu">Информационная архитектура и система категорий работают по единым правилам.</p>
                </div>
                <picture class="audience-case__responsive-picture audience-case__responsive-picture--menu-details audience-case__mosaic-media">
                  <source type="image/avif" srcset="/home/cases/audience/audience-menu-details-480.avif 480w, /home/cases/audience/audience-menu-details-960.avif 960w, /home/cases/audience/audience-menu-details-1488.avif 1488w" sizes="(max-width: 767px) 100vw, 50vw">
                  <source type="image/webp" srcset="/home/cases/audience/audience-menu-details-480.webp 480w, /home/cases/audience/audience-menu-details-960.webp 960w, /home/cases/audience/audience-menu-details-1488.webp 1488w" sizes="(max-width: 767px) 100vw, 50vw">
                  <img class="audience-case__menu-image--details" src="/home/cases/audience/audience-menu-details-960.webp" width="1488" height="2159" alt="Audience — детали меню" loading="lazy" decoding="async">
                </picture>
              </div>
            </div>
          </section>

          <section class="audience-case audience-case--motion">
            <h2>Движение как часть<br>навигации.</h2>
            <p class="audience-case__motion-secondary case-text-fill">Анимации связывают экраны, обозначают переходы между разделами и поддерживают порядок чтения без лишней демонстративности.</p>
            <CaseAutoplayVideo
              class="audience-case__media-full"
              src="/home/cases/audience/audience-vid-1.mp4"
              mobile-src="/home/cases/audience/audience-vid-1-mobile.mp4"
              poster="/home/cases/audience/audience-vid-1-poster.webp"
              mobile-poster="/home/cases/audience/audience-vid-1-mobile-poster.webp"
              alt="Audience — анимации на сайте"
            />
          </section>

          <section class="audience-case audience-case--live">
            <h2>Живой сайт,<br>а не разовый<br>запуск.</h2>
            <p class="audience-case__lede">Проект реализован как развиваемая контентная система. В ней можно обновлять меню, добавлять сезонные позиции, публиковать новости, менять изображения и поддерживать актуальность разделов без пересборки сайта вручную.</p>
            <CaseHorizontalRail class="audience-case__admin-media audience-case__admin-media--scroll">
              <picture class="audience-case__responsive-picture audience-case__responsive-picture--admin-small">
                <source type="image/avif" srcset="/home/cases/audience/audience-admin-small-480.avif 480w, /home/cases/audience/audience-admin-small-960.avif 960w, /home/cases/audience/audience-admin-small-1020.avif 1020w" sizes="(max-width: 767px) 100vw, 36vw">
                <source type="image/webp" srcset="/home/cases/audience/audience-admin-small-480.webp 480w, /home/cases/audience/audience-admin-small-960.webp 960w, /home/cases/audience/audience-admin-small-1020.webp 1020w" sizes="(max-width: 767px) 100vw, 36vw">
                <img class="audience-case__admin-image--small" src="/home/cases/audience/audience-admin-small-960.webp" width="1020" height="691" alt="Audience — контентная система" loading="lazy" decoding="async">
              </picture>
              <picture class="audience-case__responsive-picture audience-case__responsive-picture--admin-large">
                <source type="image/avif" srcset="/home/cases/audience/audience-admin-large-480.avif 480w, /home/cases/audience/audience-admin-large-960.avif 960w, /home/cases/audience/audience-admin-large-1440.avif 1440w" sizes="(max-width: 767px) 100vw, 64vw">
                <source type="image/webp" srcset="/home/cases/audience/audience-admin-large-480.webp 480w, /home/cases/audience/audience-admin-large-960.webp 960w, /home/cases/audience/audience-admin-large-1440.webp 1440w" sizes="(max-width: 767px) 100vw, 64vw">
                <img class="audience-case__admin-image--large" src="/home/cases/audience/audience-admin-large-960.webp" width="1440" height="1984" alt="Audience — управление контентом" loading="lazy" decoding="async">
              </picture>
            </CaseHorizontalRail>
          </section>

          <section class="audience-case audience-case--final">
            <p class="case-text-fill">Для Audience мы разработали структуру, визуальную систему, интерфейс, анимацию и инструменты управления контентом. Кейс показывает выполненные дизайнерские и технические решения и не содержит предложения приобрести или использовать представленную заказчиком продукцию.</p>
          </section>
        </template>

        <template v-else-if="projectDetail">
          <CaseStorySection
            v-for="section in projectDetail.sections"
            :key="section.id"
            :section="section"
            @layout-change="refreshAudienceScrollPositions"
          />

          <CaseFinalStatement :text="projectDetail.final" />
        </template>
      </div>

      <CaseClosingMedia
        v-if="item.id === 'audience'"
        :media="audienceClosingMedia"
        variant="audience"
      />
      <CaseClosingMedia
        v-else-if="projectDetail"
        :media="projectDetail.closing"
      />
    </main>

    <NuxtLink
      v-if="nextItem"
      :to="homeCaseDetailPath(nextItem)"
      class="case-detail__next"
      :class="{ 'case-detail__next--inverse': nextItem.inverse }"
      :style="{ backgroundColor: nextItem.wash }"
    >
      <span ref="nextProjectContentEl" class="case-detail__next-content">
        <span class="case-detail__next-name">{{ nextItem.title }}</span>
        <span class="case-detail__next-link">Следующий кейс <PhArrowRight :size="28" /></span>
      </span>
    </NuxtLink>
  </div>
</template>

<style scoped>
.case-detail {
  position: relative;
  z-index: 1;
  min-height: var(--app-screen);
  color: var(--palette-ink, #0a0a0a);
  /* The native Baltika film and the fixed wave canvas both use multiply.
     Keep their blend backdrop inside this page so swapping to the canvas on
     pointer entry cannot pick up a darker surface from the app shell. */
  isolation: isolate;
}

.case-detail--inverse {
  color: var(--palette-milk, #f5f1e8);
}

.case-detail__inner {
  width: min(var(--layout-content-max), calc(100% - 2 * var(--layout-margin-content)));
  margin: 0 auto;
  padding-bottom: var(--space-section);
}

.case-detail__first-screen {
  --case-header-travel: 0px;
  --case-header-shift: 0px;
}

.case-detail__hero {
  position: relative;
  display: grid;
  /* Keep the opening mark compact so the case itself starts in the first view. */
  box-sizing: border-box;
  min-height: 60svh;
  align-content: center;
  row-gap: var(--space-3);
  place-items: start;
  padding-block: calc(var(--layout-surface-top) + var(--space-3)) var(--space-3);
  overflow: hidden;
  text-align: left;
  will-change: clip-path;
}

.case-detail__content {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  margin: 0 auto;
  padding-top: var(--space-4);
}

.case-detail__meta {
  border-top: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  overflow: hidden;
  translate: 0 var(--case-header-shift);
  will-change: translate;
}

.case-detail__meta-motion {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-3);
}

@media (min-width: 768px) {
  .case-detail__hero {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    min-height: calc(60svh + var(--space-4));
    column-gap: var(--layout-gutter);
  }

  .case-detail__hero h1 {
    grid-column: 2 / -2;
  }

  .case-detail__content {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    column-gap: var(--layout-gutter);
    padding-top: 0;
  }

  .case-detail__meta {
    grid-column: 2 / -2;
  }

  .case-detail__meta-motion {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--layout-gutter);
  }

  .case-detail__meta--five-up .case-detail__meta-motion {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .case-detail__media {
    grid-column: 1 / -1;
  }

  .case-detail--baltika .case-detail__media {
    grid-column: 4 / span 6;
  }

}

.case-detail__eyebrow,
.case-detail__tags {
  margin: 0;
  font-size: var(--type-nav);
  letter-spacing: -0.02em;
}

.case-detail__project-link {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--space-1) / 2);
  margin-top: var(--space-1);
  color: inherit;
  font-size: var(--type-nav);
  font-weight: 500;
  text-decoration: none;
}

.case-detail__project-link > svg {
  transform: translateY(-2px);
}

.case-detail__project-label {
  position: relative;
  display: inline-block;
  padding-bottom: 0.36em;
}

.case-detail__eyebrow {
  opacity: 0.6;
}

.case-detail__tags {
  margin-top: var(--space-1);
  font-weight: 500;
}

.case-detail__role-tags {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  line-height: 1.1;
}

.case-detail__role-tags span {
  font-weight: 500;
  white-space: nowrap;
}

h1 {
  width: 100%;
  margin: 0;
  font-size: clamp(3rem, 8vw, 8rem);
  font-weight: 400;
  letter-spacing: -0.05em;
  line-height: 0.95;
  transition: opacity 2.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.case-detail__summary {
  display: block;
}

@media (max-width: 767.98px) {
  .case-detail--audience .case-detail__media--audience {
    aspect-ratio: 4 / 5;
  }

  .case-detail__first-screen {
    box-sizing: border-box;
    display: flex;
    min-height: var(--app-screen);
    flex-direction: column;
    padding-bottom: var(--space-3);
  }

  .case-detail__hero {
    min-height: 0;
    row-gap: var(--space-2);
    padding-block: calc(var(--layout-surface-top) + var(--space-2)) var(--space-5);
  }

  h1 {
    font-size: calc(var(--type-hero) * 1.2);
  }

  .case-detail__content {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: calc(var(--space-4) * 0.5);
    padding-top: 0;
  }

  .case-detail__meta {
    padding-top: 0;
  }

  .case-detail__meta-motion {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--layout-gutter);
    row-gap: var(--space-1);
    padding-top: var(--space-2);
  }

  .case-detail__tags {
    margin-top: 0;
  }

  .case-detail__media {
    margin-top: 0;
    margin-bottom: 0;
  }

  .case-detail__image {
    aspect-ratio: auto;
  }
}

.case-detail__media {
  margin-top: var(--space-4);
  /* The frame moves upward with the metadata. Remove that exact travel from
     the reserved runway so the following story block keeps a deliberate gap. */
  margin-bottom: calc(var(--space-case-media-runway) - var(--case-header-travel));
  translate: 0 var(--case-header-shift);
  will-change: translate;
}

.case-detail__media--video {
  /* Baltika’s square film needs its full 30% travel below the block. */
  margin-bottom: calc(var(--space-case-video-runway) - var(--case-header-travel));
}

.case-detail__media-parallax {
  will-change: transform;
}

.case-detail__picture {
  display: contents;
}

.case-detail__image {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.case-detail--baltika .case-detail__image {
  aspect-ratio: 9 / 16;
}

.case-detail__media--audience .case-detail__image {
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  object-fit: cover;
}

/* Audience keeps its full portrait image behind the shortened frame. The
   frame is another 25% lower than the previous 4:3 crop; the inner element
   preserves the full raster height for the longer parallax travel. */
.case-detail__media--audience {
  aspect-ratio: 16 / 9;
  margin-bottom: calc(var(--space-case-audience-runway) - var(--case-header-travel));
  overflow: hidden;
}

.case-detail__media--audience .case-detail__media-parallax {
  height: 222.222%;
}

.case-detail__meta,
.case-detail__media {
  transition:
    opacity 1.6s cubic-bezier(0.22, 1, 0.36, 1),
    transform 1.6s cubic-bezier(0.22, 1, 0.36, 1);
}

.case-detail--entering h1,
.case-detail--entering .case-detail__meta,
.case-detail--entering .case-detail__media {
  opacity: 0;
}

.case-detail--entering .case-detail__meta,
.case-detail--entering .case-detail__media {
  transform: translateY(2rem);
}

.case-detail:not(.case-detail--entering) .case-detail__meta {
  transition-delay: 0.2s;
}

.case-detail:not(.case-detail--entering) .case-detail__media {
  transition-delay: 0.48s;
}

.case-detail__next {
  position: relative;
  z-index: 1;
  display: flex;
  box-sizing: border-box;
  height: 20svh;
  min-height: 20svh;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: 0;
  padding: var(--space-4) var(--layout-margin-content);
  color: var(--palette-ink, #0a0a0a);
  text-decoration: none;
  overflow: hidden;
}

.case-detail__next--inverse { color: var(--palette-milk, #f5f1e8); }

.case-detail__next-content {
  display: flex;
  width: 100%;
  align-items: flex-end;
  justify-content: space-between;
  will-change: transform;
}

.case-detail__next-name {
  max-width: 68%;
  color: color-mix(in srgb, currentColor 30%, transparent);
  font-size: clamp(3rem, 8vw, 9rem);
  font-weight: 400;
  letter-spacing: -0.07em;
  line-height: 0.78;
}

.case-detail__next-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding-bottom: 0.35rem;
  font-size: var(--type-nav);
}

.case-detail__next-link svg {
  transition: transform 260ms ease;
}

.case-detail__next:hover .case-detail__next-link svg,
.case-detail__next:focus-visible .case-detail__next-link svg {
  transform: translateX(0.4rem);
}

.audience-case {
  margin-top: var(--space-section);
}

.audience-case--intro {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  margin-top: var(--space-6);
}

.audience-case h2 {
  max-width: none;
  margin: 0 auto;
  font-size: clamp(2.75rem, 6.5vw, 7.5rem);
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 0.91;
  text-align: center;
}

.audience-case p { margin: 0; }

.audience-case img {
  display: block;
  width: 100%;
  object-fit: cover;
}

.audience-case__copy {
  display: grid;
  gap: var(--layout-gutter);
  margin: var(--space-5) auto 0;
  font-size: clamp(1.125rem, 1.7vw, 1.6rem);
  letter-spacing: -0.01em;
  line-height: 1.28;
}

.audience-case__copy,
.audience-case__statement,
.audience-case__lede {
  color: color-mix(in srgb, var(--palette-milk, #f5f1e8) 78%, #0a0501);
}

.audience-case--intro h2 {
  grid-column: 2 / span 5;
  grid-row: 1;
  max-width: none;
  margin: 0;
  font-size: clamp(2.75rem, 4.2vw, 6rem);
  text-align: left;
  white-space: nowrap;
}

.audience-case__copy--split {
  grid-column: 6 / -2;
  grid-row: 2;
  grid-template-columns: 1fr;
  row-gap: var(--space-4);
  margin-top: var(--space-4);
  margin-inline: 0;
  font-size: var(--type-case-body-large);
  font-weight: 300;
  letter-spacing: -0.01em;
  line-height: 1.28;
}

.audience-case__copy--split p { grid-column: 1; }

.audience-case--intro .audience-case__media-pair { grid-column: 1 / -1; }

.audience-case__media-pair,
.audience-case__motion-pair,
.audience-case__admin-media {
  margin-top: var(--space-6);
}

.audience-case__media-pair:not(.audience-case__media-pair--scroll),
.audience-case__motion-pair:not(.audience-case__motion-pair--scroll),
.audience-case__admin-media:not(.audience-case__admin-media--scroll),
.audience-case__media-pair--scroll :deep(.case-horizontal-rail__content),
.audience-case__motion-pair--scroll :deep(.case-horizontal-rail__content),
.audience-case__admin-media--scroll :deep(.case-horizontal-rail__content) {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 7fr);
  align-items: start;
  gap: var(--layout-gutter);
}

.audience-case__wave-media--portrait {
  aspect-ratio: 4 / 5;
  margin-top: var(--space-6);
}

.audience-case picture.audience-case__wave-media {
  display: block;
  overflow: hidden;
}

.audience-case picture.audience-case__wave-media > img { height: 100%; }

.audience-case__wave-media--landscape { aspect-ratio: 16 / 10; }

.audience-case--disclosure { text-align: center; }


.audience-case__media-wide {
  aspect-ratio: 16 / 8;
  margin-top: var(--space-6);
}

.audience-case__menu-lead {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-items: end;
  column-gap: var(--layout-gutter);
  margin-top: var(--space-6);
}

.audience-case--menu {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
}

.audience-case--menu > h2,
.audience-case__menu-lead,
.audience-case__media-mosaic,
.audience-case__statement { grid-column: 1 / -1; }

.audience-case__menu-lead-media {
  display: block;
  grid-column: 1 / span 6;
  aspect-ratio: 16 / 10;
  overflow: hidden;
}

.audience-case__menu-lead-media img {
  height: 100%;
}

.audience-case__menu-lead p {
  grid-column: 8 / span 4;
  font-size: clamp(1.25rem, 2.1vw, 2rem);
  letter-spacing: -0.01em;
  line-height: 1.18;
}

.audience-case p.audience-case__menu-secondary,
.audience-case p.audience-case__motion-secondary {
  grid-column: 3 / -3;
  box-sizing: border-box;
  max-width: none;
  margin: 0;
  margin-top: var(--space-section);
  margin-bottom: var(--space-section);
  font-size: clamp(1.75rem, 3.5vw, 4rem);
  letter-spacing: -0.01em;
  line-height: 1.04;
  text-align: center;
}

.audience-case p.audience-case__motion-secondary {
  margin-top: var(--space-5);
  margin-bottom: var(--space-5);
}

.audience-case--motion {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
}

.audience-case--motion > h2,
.audience-case--motion > .audience-case__media-full,
.audience-case--motion > .audience-case__motion-pair { grid-column: 1 / -1; }

.audience-case--motion > .audience-case__motion-secondary { grid-column: 4 / -4; }

.audience-case__media-mosaic {
  display: grid;
  row-gap: calc(var(--space-7) / 4);
  margin-top: 0;
}

.audience-case__responsive-picture {
  display: block;
  min-width: 0;
  overflow: hidden;
}

.audience-case__responsive-picture > img {
  display: block;
  width: 100%;
  height: 100%;
}

.audience-case__menu-media-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--layout-gutter);
}

.audience-case__responsive-picture--menu-primary { aspect-ratio: 4 / 5; }
.audience-case__menu-media-stack {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  row-gap: var(--space-4);
  column-gap: 0;
  margin-top: 100%;
}

.audience-case__mosaic-picture {
  grid-column: 1 / -1;
  aspect-ratio: 16 / 10;
  overflow: hidden;
}

.audience-case__mosaic-picture img {
  height: 100%;
}

.audience-case__menu-media-stack .audience-case__statement { grid-column: 2 / -2; }
.audience-case__menu-media-stack--bottom { margin-top: 8%; }
.audience-case__menu-media-stack--bottom .audience-case__mosaic-picture { aspect-ratio: 16 / 11; }
.audience-case__responsive-picture--menu-details {
  aspect-ratio: 4 / 5;
  margin-top: 16%;
}

.audience-case__statement {
  max-width: 34ch;
  margin: var(--space-6) 0 0;
  font-size: clamp(1.125rem, 1.7vw, 1.6rem);
  letter-spacing: -0.01em;
  line-height: 1.28;
  text-align: left;
  opacity: 0.7;
}

.audience-case__statement--menu {
  max-width: none;
  margin: 0;
}

.audience-case__lede {
  max-width: 28ch;
  margin: var(--space-5) auto 0;
  font-size: clamp(1.25rem, 2.1vw, 2rem);
  letter-spacing: -0.01em;
  line-height: 1.18;
  text-align: center;
}

.audience-case--motion .audience-case__lede {
  width: calc(50% - (var(--layout-gutter) / 2));
  max-width: none;
  margin: var(--space-4) auto 0;
  text-align: center;
}

.audience-case--live .audience-case__lede {
  width: calc(50% - (var(--layout-gutter) / 2));
  max-width: none;
  margin: var(--space-4) auto 0;
  text-align: center;
}

.audience-case__media-full { aspect-ratio: 16 / 8; margin-top: var(--space-6); }
.audience-case__motion-pair:not(.audience-case__motion-pair--scroll),
.audience-case__motion-pair--scroll :deep(.case-horizontal-rail__content) { grid-template-columns: minmax(0, 7fr) minmax(0, 4fr); }
.audience-case__motion-pair img:first-child { aspect-ratio: 16 / 10; }
.audience-case__motion-pair img:last-child { aspect-ratio: 4 / 5; }
.audience-case__motion-pair img:last-child { margin-top: var(--space-5); }
.audience-case__responsive-picture--admin-small { aspect-ratio: 16 / 10; }
.audience-case__responsive-picture--admin-large {
  aspect-ratio: 4 / 5;
  margin-top: var(--space-5);
}

.audience-case--final {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  margin: var(--space-7) 0 var(--space-6);
  font-size: clamp(2.2rem, 5vw, 6.2rem);
  letter-spacing: -0.02em;
  line-height: 0.98;
  text-align: center;
}

.audience-case--final p {
  grid-column: 3 / -3;
  margin: 0;
}

/* Every scroll-fill passage shares one reading measure and type scale. */
.audience-case p.case-text-fill,
.audience-case div.case-text-fill {
  grid-column: 4 / -4;
  width: auto;
  max-width: none;
  font-size: clamp(1.75rem, 3.5vw, 4rem);
  font-weight: 300;
  letter-spacing: -0.01em;
  line-height: 1.04;
  text-align: center;
}

.audience-case--final p.case-text-fill {
  grid-column: 2 / -2;
  font-size: clamp(2.2rem, 5vw, 6.2rem);
}

@media (min-width: 768px) and (max-width: 1279.98px) {
  .case-detail__hero h1 {
    font-size: clamp(2.4rem, 6.4vw, 6.4rem);
  }
}

@media (max-width: 1279.98px) {
  .audience-case__copy--split {
    grid-column: 1 / span 6;
  }

  .audience-case--motion > .audience-case__motion-secondary,
  .audience-case--final p.case-text-fill {
    grid-column: 2 / -2;
  }
}

:deep(.audience-fill__line) {
  position: relative;
  display: inline-block;
}

:deep(.audience-fill__line) {
  display: block;
  white-space: nowrap;
}

:deep(.audience-fill__ash) {
  color: color-mix(in srgb, currentColor 30%, transparent);
}

:deep(.audience-fill__ink) {
  position: absolute;
  /* The final display type uses a tight line-height. Extend the clipped ink
     layer downward for descenders such as «у» and «р», while keeping its text
     baseline aligned with the ash layer. */
  inset: 0;
  height: calc(100% + 0.2em);
  color: currentColor;
  will-change: clip-path;
}

@media (max-width: 767.98px) {
  .audience-case h2 {
    font-size: clamp(1.875rem, 8vw, 2.25rem);
  }

  .case-detail__next { height: 20svh; min-height: 20svh; margin-top: 0; flex-direction: column; align-items: flex-start; justify-content: flex-end; gap: var(--space-2); padding-block: var(--space-2); }
  .case-detail__next-content { flex-direction: column; align-items: flex-start; gap: var(--space-3); }
  .case-detail__next-name { max-width: 100%; font-size: clamp(3rem, 13vw, 5rem); }
  .audience-case { margin-top: var(--space-section); }
  .audience-case--intro {
    grid-template-columns: 1fr;
    margin-top: var(--space-6);
  }
  .audience-case--intro h2,
  .audience-case__copy--split,
  .audience-case--intro .audience-case__media-pair { grid-column: 1; }
  .audience-case__copy--split { margin-top: var(--space-4); }
  .audience-case--intro h2 { white-space: normal; }
  .audience-case__copy--split,
  .audience-case__menu-lead { grid-template-columns: 1fr; }
  .audience-case--menu,
  .audience-case--motion { grid-template-columns: 1fr; }
  .audience-case--menu > h2,
  .audience-case__menu-lead,
  .audience-case__menu-secondary,
  .audience-case__media-mosaic,
  .audience-case__statement { grid-column: 1; }
  .audience-case p.audience-case__menu-secondary { margin-top: var(--space-7); margin-bottom: var(--space-7); }
  .audience-case p.audience-case__motion-secondary { margin-top: var(--space-5); margin-bottom: calc(var(--space-5) * 0.5); }
  .audience-case--motion > .audience-case__motion-secondary { grid-column: 1; }
  .audience-case__menu-lead-media,
  .audience-case__menu-lead p { grid-column: 1; }
  .audience-case__copy--split p { grid-column: 1; }
  .audience-case__media-pair { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); }
  .audience-case__motion-pair,
  .audience-case__admin-media { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
  .audience-case__wave-media--portrait,
  .audience-case__motion-pair img:last-child,
  .audience-case__responsive-picture--admin-large { margin-top: var(--space-4); }
  .audience-case__media-pair--scroll :deep(.case-horizontal-rail__viewport),
  .audience-case__motion-pair--scroll :deep(.case-horizontal-rail__viewport),
  .audience-case__admin-media--scroll :deep(.case-horizontal-rail__viewport) {
    display: block;
    width: 100vw;
    margin-inline: calc(50% - 50vw);
  }
  .audience-case__media-pair--scroll :deep(.case-horizontal-rail__content),
  .audience-case__motion-pair--scroll :deep(.case-horizontal-rail__content),
  .audience-case__admin-media--scroll :deep(.case-horizontal-rail__content) {
    --case-rail-mobile-media-height: min(62svh, 72vw);
    display: flex;
    width: max-content;
    align-items: flex-start;
    gap: var(--space-1);
  }
  .audience-case__media-pair--scroll :deep(.case-horizontal-rail__content > picture),
  .audience-case__motion-pair--scroll :deep(.case-horizontal-rail__content > img),
  .audience-case__admin-media--scroll :deep(.case-horizontal-rail__content > .audience-case__responsive-picture) {
    flex: 0 0 auto;
    width: auto;
    height: var(--case-rail-mobile-media-height);
    margin-top: 0;
  }
  .audience-case__media-pair--scroll :deep(.case-horizontal-rail__content > picture > img),
  .audience-case__motion-pair--scroll :deep(.case-horizontal-rail__content > img),
  .audience-case__admin-media--scroll :deep(.case-horizontal-rail__content > .audience-case__responsive-picture > img) {
    width: auto;
    max-width: none;
    height: 100%;
    margin-top: 0;
    object-fit: contain;
  }
  .audience-case__media-pair--scroll :deep(.case-horizontal-rail__bar),
  .audience-case__motion-pair--scroll :deep(.case-horizontal-rail__bar),
  .audience-case__admin-media--scroll :deep(.case-horizontal-rail__bar) {
    width: 80vw;
    margin-inline: calc(50% - 40vw);
  }
  .audience-case__menu-media-pair { gap: var(--space-1); }
  .audience-case__menu-media-pair .audience-case__menu-media-stack { display: contents; }
  .audience-case__menu-media-pair--top .audience-case__responsive-picture--menu-primary { grid-column: 1; grid-row: 1; }
  .audience-case__menu-media-pair--top .audience-case__menu-media-stack .audience-case__mosaic-picture { grid-column: 2; grid-row: 1; margin-top: 100%; }
  .audience-case__menu-media-pair--bottom .audience-case__menu-media-stack .audience-case__mosaic-picture { grid-column: 1; grid-row: 1; margin-top: 8%; }
  .audience-case__menu-media-pair--bottom .audience-case__responsive-picture--menu-details { grid-column: 2; grid-row: 1; }
  .audience-case__menu-media-pair .audience-case__statement--menu {
    grid-column: 1 / -1;
    grid-row: 2;
    width: 80%;
    max-width: var(--layout-span-8);
    margin: var(--space-2) 0 0;
  }
  .audience-case__copy--split {
    margin-top: var(--space-6);
  }
  .audience-case__menu-lead {
    margin-top: calc(var(--space-6) * 0.5);
  }
  .audience-case--motion + .audience-case {
    margin-top: calc(var(--space-section) * 0.5);
  }
  .audience-case--motion .audience-case__lede { width: 100%; }
  .audience-case--live .audience-case__lede {
    width: 100%;
    margin-inline: 0;
    text-align: left;
  }
  .audience-case--final {
    grid-template-columns: 1fr;
  }
  .audience-case--final p { grid-column: 1; }
  .audience-case p.case-text-fill,
  .audience-case div.case-text-fill { grid-column: 1; }
  .audience-case__copy p,
  .audience-case__menu-lead p,
  .audience-case__statement,
  .audience-case__lede {
    font-size: var(--type-case-body);
  }
  .audience-case--final p.case-text-fill {
    font-size: clamp(1.875rem, 4.5vw, 5.4rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  h1,
  .case-detail__meta,
  .case-detail__media {
    transition: none;
  }

  .case-detail__media:not(.case-detail__media--audience) {
    margin-bottom: 0;
  }
}
</style>
