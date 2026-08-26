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
const audienceFinalTextEl = ref<HTMLElement | null>(null)
const audienceMenuSecondaryEl = ref<HTMLElement | null>(null)
const audienceMotionSecondaryEl = ref<HTMLElement | null>(null)
const audienceDisclosureCopyEl = ref<HTMLElement | null>(null)
const nextProjectContentEl = ref<HTMLElement | null>(null)
const audienceNarrativeOpen = ref(false)
const audienceNarrativeHeight = ref('0px')
const nextItem = computed(() => {
  const currentIndex = homeCases.findIndex((caseItem) => caseItem.id === item.value?.id)
  return homeCases[(currentIndex + 1) % homeCases.length]
})
const projectDetail = computed(() => item.value ? projectCaseDetails[item.value.id] : undefined)

let mediaParallaxCtx: { revert: () => void } | null = null
let headerScrollCtx: { revert: () => void } | null = null
let detailRevealCtx: { revert: () => void } | null = null
let audienceTextFillCtx: { revert: () => void } | null = null
let nextProjectParallaxCtx: { revert: () => void } | null = null
let audienceTextResizeObserver: ResizeObserver | null = null
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

async function toggleAudienceNarrative() {
  audienceNarrativeOpen.value = !audienceNarrativeOpen.value
  await nextTick()
  if (audienceNarrativeOpen.value) {
    audienceNarrativeHeight.value = `${audienceDisclosureCopyEl.value?.scrollHeight ?? 0}px`
  }

  // Reduced motion removes the height transition, so no transitionend event
  // will be available to update the downstream scroll positions.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await refreshAudienceScrollPositions()
  }
}

async function refreshAudienceScrollPositions() {
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  requestAnimationFrame(() => ScrollTrigger.refresh())
}

function handleAudienceDisclosureTransition(event: TransitionEvent) {
  if (event.target !== event.currentTarget || event.propertyName !== 'height') return
  void refreshAudienceScrollPositions()
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

  const targets = Array.from(root.querySelectorAll<HTMLElement>([
    '.case-detail__hero h1',
    '.case-detail__meta',
    '.case-detail__media',
    '.audience-case > h2',
    '.audience-case__copy',
    '.audience-case__media-pair',
    '.audience-case__disclosure-area',
    '.audience-case__media-wide',
    '.audience-case__menu-lead',
    '.audience-case__menu-secondary',
    '.audience-case__media-mosaic',
    '.audience-case__media-full',
    '.audience-case__motion-secondary',
    '.audience-case__motion-pair',
    '.audience-case__lede',
    '.audience-case__admin-media',
    '.audience-case--final p',
    '.audience-case__closing-media',
    '.project-story > h2',
    '.project-story__copy',
    '.project-story__media',
    '.project-story__statement',
    '.case-disclosure',
    '.project-story--final p',
    '.project-story__closing-media',
  ].join(','))).filter((target) =>
    // The complete first screen is already staged by the detail entry
    // transition on every case. A second scroll reveal here makes the opening
    // media jump as its parallax begins.
    !target.closest('.case-detail__first-screen'),
  )
  if (!targets.length) return

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)

  detailRevealCtx?.revert()
  detailRevealCtx = gsap.context(() => {
    targets.forEach((target) => {
      // The shared media shader must not replace a target while GSAP owns its
      // opacity and 3D transform during the scroll reveal/leave corridor.
      target.dataset.caseReveal = ''
      gsap.fromTo(target,
        {
          autoAlpha: 0,
          yPercent: 9,
          scale: 0.94,
          rotationX: 7,
          transformOrigin: '50% 0%',
          transformPerspective: 1200,
        },
        {
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
        {
          autoAlpha: 1,
          yPercent: 0,
          scale: 1,
          rotationX: 0,
        },
        {
          autoAlpha: 0,
          yPercent: -9,
          scale: 0.94,
          rotationX: -7,
          transformOrigin: '50% 100%',
          transformPerspective: 1200,
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
    })
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
        'case-detail--schmidt': item.id === 'schmidt',
        'case-detail--entering': !detailContentVisible,
      }"
      :style="{ backgroundColor: item.wash }"
    >
      <CaseMediaWaveLayer />
      <div ref="detailContentEl" class="case-detail__inner">
      <div ref="firstScreenEl" class="case-detail__first-screen">
        <section ref="titleFrameEl" class="case-detail__hero">
          <h1 ref="titleMotionEl">
            <span>{{ item.title }},</span>
            <span class="case-detail__summary">{{ item.blurb.replace('\n', ' ') }}</span>
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
              'case-detail__media--video': item.id === 'baltika' && item.media.video,
            }"
          >
            <div ref="mediaParallaxEl" class="case-detail__media-parallax">
              <BaltikaScrollFilm
                v-if="item.id === 'baltika' && item.media.video"
                :webm="item.media.video.webm"
                :mp4="item.media.video.mp4"
                :mobile-webm="item.media.video.mobileWebm"
                :mobile-mp4="item.media.video.mobileMp4"
                :poster="item.media.video.poster"
                :alt="item.media.alt"
              />
              <picture v-else class="case-detail__picture">
                <source v-if="item.media.avifSrcset" type="image/avif" :srcset="item.media.avifSrcset" sizes="100vw">
                <source v-if="item.media.webpSrcset" type="image/webp" :srcset="item.media.webpSrcset" sizes="100vw">
                <img
                  :src="item.media.src"
                  :alt="item.media.alt"
                  :width="item.media.width"
                  :height="item.media.height"
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
            <h2>Вход в мир заведения,<br>а не просто его сайт.</h2>
            <div class="audience-case__copy audience-case__copy--split">
              <p>Audience задумывался как место со своим характером, ритуалами и кругом людей. Поэтому сайт не начинается с каталога или формы бронирования. Сначала он вводит гостя в атмосферу пространства — через образ, темп и ощущение камерности.</p>
              <p>Задача была собрать цифровой опыт, в котором бренд, интерьер, кухня и сервис не существуют отдельными разделами, а складываются в одну среду.</p>
            </div>
            <CaseHorizontalRail class="audience-case__media-pair audience-case__media-pair--scroll">
              <picture class="audience-case__wave-media audience-case__wave-media--portrait">
                <source
                  type="image/avif"
                  srcset="/home/cases/audience-intro-1-480.avif 480w, /home/cases/audience-intro-1-960.avif 960w, /home/cases/audience-intro-1-1248.avif 1248w"
                  sizes="(max-width: 767px) 94vw, 40vw"
                >
                <source
                  type="image/webp"
                  srcset="/home/cases/audience-intro-1-480.webp 480w, /home/cases/audience-intro-1-960.webp 960w, /home/cases/audience-intro-1-1248.webp 1248w"
                  sizes="(max-width: 767px) 94vw, 40vw"
                >
                <img
                  src="/home/cases/audience-intro-1-960.webp"
                  width="1248"
                  height="1888"
                  alt="Audience — экран сайта"
                  loading="lazy"
                  decoding="async"
                >
              </picture>
              <img
                class="audience-case__wave-media audience-case__wave-media--landscape"
                src="/home/cases/audience-img.webp"
                alt="Audience — детали цифрового опыта"
                loading="lazy"
              >
            </CaseHorizontalRail>
          </section>

          <section class="audience-case audience-case--disclosure">
            <div
              class="audience-case__disclosure-area"
              role="button"
              tabindex="0"
              :aria-expanded="audienceNarrativeOpen"
              aria-controls="audience-atmosphere-copy"
              @click="toggleAudienceNarrative"
              @keydown.enter="toggleAudienceNarrative"
              @keydown.space.prevent="toggleAudienceNarrative"
            >
              <span class="audience-case__disclosure-heading">Атмосфера как система<br>навигации.</span>
              <div
                id="audience-atmosphere-copy"
                ref="audienceDisclosureCopyEl"
                class="audience-case__disclosure-copy"
                :class="{ 'is-open': audienceNarrativeOpen }"
                :style="{ '--audience-disclosure-height': audienceNarrativeHeight }"
                @transitionend="handleAudienceDisclosureTransition"
                @transitioncancel="handleAudienceDisclosureTransition"
              >
                <p>Визуальная система не копирует восточную эстетику через декор. Она работает через глубину кадра, природные фактуры, контраст света и тени, свободное пространство и сдержанный темп взаимодействий. Каждый экран продолжает это ощущение без прямых цитат и лишнего декора.</p>
                <p>Атмосфера удерживает пользователя, пока он переходит между историей места, меню, интерьером и бронированием. Сайт работает на трёх языках: русском, английском и китайском.</p>
              </div>
              <span
                class="audience-case__disclosure-trigger"
                aria-hidden="true"
              >
                <span class="audience-case__pill">
                  <span class="audience-case__pill-label">{{ audienceNarrativeOpen ? 'свернуть' : 'читать' }}</span>
                  <PhPlusMinus :minus="audienceNarrativeOpen" :size="18" />
                </span>
              </span>
            </div>
            <img class="audience-case__media-wide" src="/home/cases/audience-img.webp" alt="Audience — атмосфера сайта" loading="lazy">
          </section>

          <section class="audience-case audience-case--menu">
            <h2>Как создать сложное меню<br>без ощущения каталога?</h2>
            <div class="audience-case__menu-lead">
              <img src="/home/cases/audience-img.webp" alt="Audience — меню" loading="lazy">
              <p>Внутри сайта меню разделено на самостоятельные сценарии: кухня, чаши, напитки, чайная церемония, алкоголь и коктейли.</p>
            </div>
            <p ref="audienceMenuSecondaryEl" class="audience-case__menu-secondary case-text-fill">У каждого направления — собственная структура, категории, карточки и контент.</p>
            <div class="audience-case__media-mosaic">
              <div class="audience-case__menu-media-pair audience-case__menu-media-pair--top">
                <img src="/home/cases/audience-img.webp" alt="Audience — раздел меню" loading="lazy">
                <div class="audience-case__menu-media-stack">
                  <img src="/home/cases/audience-img.webp" alt="Audience — категория меню" loading="lazy">
                  <p class="audience-case__statement audience-case__statement--menu">Главная UX-задача — сохранить широту выбора, но не превратить сайт в безличный прайс-лист.</p>
                </div>
              </div>
              <div class="audience-case__menu-media-pair audience-case__menu-media-pair--bottom">
                <div class="audience-case__menu-media-stack audience-case__menu-media-stack--bottom">
                  <img src="/home/cases/audience-img.webp" alt="Audience — карточка позиции" loading="lazy">
                  <p class="audience-case__statement audience-case__statement--menu">Контентная карта пространства и каталог остаются частями одного опыта.</p>
                </div>
                <img src="/home/cases/audience-img.webp" alt="Audience — детали меню" loading="lazy">
              </div>
            </div>
          </section>

          <section class="audience-case audience-case--motion">
            <h2>Движение, которое<br>не отпускает атмосферу.</h2>
            <img class="audience-case__media-full" src="/home/cases/audience-img.webp" alt="Audience — анимации на сайте" loading="lazy">
            <p ref="audienceMotionSecondaryEl" class="audience-case__motion-secondary case-text-fill">Анимации собирают маршрут в единое впечатление: помогают почувствовать темп пространства, связывают экраны и делают навигацию естественной — без лишней демонстративности.</p>
            <CaseHorizontalRail class="audience-case__motion-pair audience-case__motion-pair--scroll">
              <img src="/home/cases/audience-img.webp" alt="Audience — переход между разделами" loading="lazy">
              <img src="/home/cases/audience-img.webp" alt="Audience — анимация интерфейса" loading="lazy">
            </CaseHorizontalRail>
          </section>

          <section class="audience-case audience-case--live">
            <h2>Живой сайт,<br>а не разовый<br>запуск.</h2>
            <p class="audience-case__lede">Проект реализован как развиваемая контентная система. В ней можно обновлять меню, добавлять сезонные позиции, публиковать новости, менять изображения и поддерживать актуальность разделов без пересборки сайта вручную.</p>
            <CaseHorizontalRail class="audience-case__admin-media audience-case__admin-media--scroll">
              <img src="/home/cases/audience-img.webp" alt="Audience — контентная система" loading="lazy">
              <img src="/home/cases/audience-img.webp" alt="Audience — управление контентом" loading="lazy">
            </CaseHorizontalRail>
          </section>

          <section class="audience-case audience-case--final">
            <p ref="audienceFinalTextEl" class="case-text-fill">Audience — цифровая среда для пространства с сильным характером. Сайт соединяет атмосферу, большую контентную структуру и понятные сервисные сценарии — от первого впечатления до бронирования и регулярных обновлений команды.</p>
          </section>
        </template>

        <template v-else-if="projectDetail">
          <section
            v-for="section in projectDetail.sections"
            :key="section.id"
            class="project-story"
            :class="[`project-story--${section.layout}`, `project-story--${section.id}`]"
          >
            <CaseNarrativeDisclosure
              v-if="section.layout === 'disclosure'"
              :disclosure-id="`case-${section.id}`"
              :title="section.title"
              :paragraphs="section.paragraphs"
              @layout-change="refreshAudienceScrollPositions"
            />
            <template v-else>
              <h2 v-html="section.title" />
              <div class="project-story__copy">
                <p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p>
              </div>
            </template>

            <CaseHorizontalRail
              v-if="section.media.length > 1"
              class="project-story__media"
              :class="[`project-story__media--${section.media.length}`, 'project-story__media--scroll']"
            >
              <img
                v-for="media in section.media"
                :key="`${section.id}-${media.src}-${media.alt}`"
                :src="media.src"
                :alt="media.alt"
                :class="`project-story__image--${media.shape ?? 'wide'}`"
                loading="lazy"
                decoding="async"
              >
            </CaseHorizontalRail>
            <div
              v-else-if="section.media.length"
              class="project-story__media"
              :class="`project-story__media--${section.media.length}`"
            >
              <img
                v-for="media in section.media"
                :key="`${section.id}-${media.src}-${media.alt}`"
                :src="media.src"
                :alt="media.alt"
                :class="`project-story__image--${media.shape ?? 'wide'}`"
                loading="lazy"
                decoding="async"
              >
            </div>
            <p v-if="section.statement" class="project-story__statement case-text-fill">{{ section.statement }}</p>
          </section>

          <section class="project-story project-story--final">
            <p class="case-text-fill">{{ projectDetail.final }}</p>
          </section>
        </template>
      </div>

      <figure
        v-if="item.id === 'audience'"
        class="audience-case__closing-media"
      >
        <img
          src="/home/cases/audience-img.webp"
          alt="Audience — цифровая атмосфера проекта"
          loading="lazy"
          decoding="async"
        >
      </figure>
      <figure
        v-else-if="projectDetail"
        class="project-story__closing-media"
      >
        <img
          :src="projectDetail.closing.src"
          :alt="projectDetail.closing.alt"
          loading="lazy"
          decoding="async"
        >
      </figure>
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
  .case-detail--audience .case-detail__inner {
    /* The compact first screen otherwise ends before Audience can complete
       the same masked image travel used on desktop. Keep touch scrolling
       native and provide one stable viewport of runway after the frame. */
    padding-bottom: var(--app-screen);
  }

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
    font-size: var(--type-hero);
  }

  .case-detail__content {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
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
    margin-top: auto;
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

.project-story {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  row-gap: var(--space-5);
  margin-top: var(--space-section);
}

.project-story > h2 {
  grid-column: 1 / -1;
  max-width: 11ch;
  margin: 0;
  font-size: clamp(3rem, 8vw, 9rem);
  font-weight: 400;
  letter-spacing: -0.07em;
  line-height: 0.86;
}

.project-story p { margin: 0; }

.project-story__copy {
  display: grid;
  grid-column: 2 / -2;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--layout-gutter);
}

.project-story__copy p,
.project-story p.project-story__statement {
  font-size: var(--type-case-body);
  letter-spacing: -0.04em;
  line-height: 1.17;
}

.project-story__media {
  grid-column: 1 / -1;
}

.project-story__media:not(.project-story__media--scroll),
.project-story__media--scroll :deep(.case-horizontal-rail__content) {
  display: grid;
  gap: var(--layout-gutter);
  align-items: start;
}

.project-story__media img {
  display: block;
  width: 100%;
  min-height: 0;
  background: color-mix(in srgb, currentColor 8%, transparent);
  object-fit: cover;
}

.project-story__image--wide { aspect-ratio: 16 / 10; }
.project-story__image--portrait { aspect-ratio: 4 / 5; }
.project-story__image--square { aspect-ratio: 1; }

.project-story__media--2:not(.project-story__media--scroll),
.project-story__media--2.project-story__media--scroll :deep(.case-horizontal-rail__content) { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); }
.project-story__media--2 img:last-child { margin-top: var(--space-6); }
.project-story__media--3:not(.project-story__media--scroll),
.project-story__media--3.project-story__media--scroll :deep(.case-horizontal-rail__content) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.project-story__media--3 img:nth-child(2) { margin-top: var(--space-7); }
.project-story__media--3 img:nth-child(3) { margin-top: var(--space-5); }
.project-story__media--4:not(.project-story__media--scroll),
.project-story__media--4.project-story__media--scroll :deep(.case-horizontal-rail__content) { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.project-story__media--4 img:nth-child(even) { margin-top: var(--space-6); }

.case-detail--schmidt .project-story--gallery .project-story__media--4:not(.project-story__media--scroll),
.case-detail--schmidt .project-story--gallery .project-story__media--4.project-story__media--scroll :deep(.case-horizontal-rail__content) {
  gap: calc(var(--layout-gutter) * 0.5);
}

.case-detail--schmidt .project-story--gallery .project-story__media--4 img:nth-child(even) {
  margin-top: var(--space-4);
}

.project-story--intro > h2 { grid-column: 1 / span 8; }
.project-story--intro .project-story__copy { grid-column: 7 / -1; }

.project-story--feature > h2 {
  grid-column: 2 / -2;
  max-width: none;
  text-align: center;
}

.project-story--feature .project-story__copy {
  grid-column: 4 / -4;
  grid-template-columns: 1fr;
  text-align: center;
}

.project-story--feature .project-story__media img {
  aspect-ratio: 16 / 8;
}

.project-story--split > h2 { grid-column: 1 / span 7; }
.project-story--split .project-story__copy {
  grid-column: 8 / -1;
  grid-template-columns: 1fr;
  align-self: end;
}

.project-story--gallery > h2 { grid-column: 1 / span 9; }
.project-story--gallery .project-story__copy {
  grid-column: 8 / -1;
  grid-template-columns: 1fr;
}

.project-story--disclosure {
  row-gap: var(--space-6);
}

.project-story--disclosure > :deep(.case-disclosure) {
  grid-column: 1 / -1;
}

.project-story--disclosure .project-story__media {
  grid-column: 2 / -2;
}

.project-story--disclosure .project-story__media img {
  aspect-ratio: 16 / 8;
}

.project-story p.project-story__statement {
  grid-column: 3 / -3;
  margin-top: var(--space-6);
  margin-bottom: 0;
  font-size: clamp(1.75rem, 3.5vw, 4rem);
  letter-spacing: -0.01em;
  line-height: 1.04;
  text-align: center;
}

.project-story--final {
  min-height: 0;
  margin: var(--space-7) 0 var(--space-6);
  place-items: center;
  align-content: center;
}

.project-story--schmidt-horizontal .project-story__statement {
  margin-top: var(--space-5);
}

.project-story--schmidt-production .project-story__statement {
  margin-top: var(--space-4);
}

.project-story--keys-system .project-story__statement,
.project-story--keys-difference .project-story__statement {
  margin-top: var(--space-section);
}

.project-story--final p {
  grid-column: 2 / -2;
  max-width: 27ch;
  font-size: clamp(2.2rem, 5.4vw, 6.4rem);
  letter-spacing: -0.06em;
  line-height: 0.96;
  text-align: center;
}

.project-story__closing-media {
  width: 100%;
  height: min(82svh, 68rem);
  margin: 0;
  overflow: hidden;
}

.project-story__closing-media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
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
.audience-case__disclosure-copy,
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
  grid-column: 8 / -2;
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

.audience-case__disclosure-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding: 0;
  cursor: pointer;
}

.audience-case__disclosure-trigger {
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.audience-case__disclosure-heading {
  font-size: clamp(2.75rem, 6.5vw, 7.5rem);
  letter-spacing: -0.01em;
  line-height: 0.91;
}

.audience-case__pill {
  display: inline-flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  margin-top: var(--space-4);
  padding-bottom: 0.12rem;
  border: 1px solid color-mix(in srgb, currentColor 55%, transparent);
  border-radius: 999px;
  font-size: calc((var(--type-nav) + var(--type-lead)) * 0.5);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.25;
  overflow: hidden;
  transition: width 300ms cubic-bezier(0.22, 1, 0.36, 1), padding-left 300ms cubic-bezier(0.22, 1, 0.36, 1), margin-top 1s cubic-bezier(0.22, 1, 0.36, 1), background-color 300ms ease;
}

.audience-case__pill-label {
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  transform: translateX(0.35rem);
  transition: max-width 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease, transform 300ms ease;
  white-space: nowrap;
}

.audience-case__disclosure-area:hover .audience-case__pill,
.audience-case__disclosure-area:focus-visible .audience-case__pill {
  width: 7.6rem;
  background: color-mix(in srgb, currentColor 12%, transparent);
}

/* «читать» is shorter than «свернуть»: retain the same comfortable left
   breathing room without changing the pill's overall proportion. */
.audience-case__disclosure-area:not([aria-expanded='true']):hover .audience-case__pill,
.audience-case__disclosure-area:not([aria-expanded='true']):focus-visible .audience-case__pill {
  padding-left: 0.4rem;
}

.audience-case__disclosure-area[aria-expanded='true']:hover .audience-case__pill,
.audience-case__disclosure-area[aria-expanded='true']:focus-visible .audience-case__pill {
  /* «свернуть» длиннее «читать»: сохраняем тот же свободный край у текста и иконки. */
  width: 9.6rem;
}

.audience-case__disclosure-area:hover .audience-case__pill-label,
.audience-case__disclosure-area:focus-visible .audience-case__pill-label {
  max-width: 6rem;
  margin-right: 0.4rem;
  opacity: 1;
  transform: none;
}

.audience-case__disclosure-copy {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  row-gap: var(--space-4);
  width: 100%;
  height: 0;
  margin-top: 0;
  margin-inline: auto;
  font-size: var(--type-case-body-large);
  font-weight: 300;
  letter-spacing: -0.04em;
  line-height: 1.17;
  overflow: hidden;
  opacity: 0;
  text-align: left;
  will-change: height;
  transition: height 1s cubic-bezier(0.22, 1, 0.36, 1), margin-top 1s cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms ease;
}

.audience-case__disclosure-copy p:first-child { grid-column: 2 / span 4; }
.audience-case__disclosure-copy p:last-child { grid-column: 8 / span 4; }

.audience-case__disclosure-copy.is-open {
  height: var(--audience-disclosure-height);
  margin-top: var(--space-case-disclosure-open);
  opacity: 1;
}


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

.audience-case__menu-lead img {
  grid-column: 1 / span 6;
  aspect-ratio: 16 / 10;
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
  row-gap: var(--space-7);
  margin-top: 0;
}

.audience-case__menu-media-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--layout-gutter);
}

.audience-case__menu-media-pair--top img:first-child { aspect-ratio: 4 / 5; }
.audience-case__menu-media-stack {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  row-gap: var(--space-5);
  column-gap: 0;
  margin-top: 14%;
}

.audience-case__menu-media-stack img {
  grid-column: 1 / -1;
  aspect-ratio: 16 / 10;
}

.audience-case__menu-media-stack .audience-case__statement { grid-column: 2 / -2; }
.audience-case__menu-media-stack--bottom { margin-top: 8%; }
.audience-case__menu-media-stack--bottom img { aspect-ratio: 16 / 11; }
.audience-case__menu-media-pair--bottom > img { aspect-ratio: 4 / 5; margin-top: 26%; }

.audience-case__statement {
  max-width: 34ch;
  margin: var(--space-6) 0 0;
  font-size: clamp(1.125rem, 1.7vw, 1.6rem);
  letter-spacing: -0.01em;
  line-height: 1.28;
  text-align: left;
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
.audience-case__admin-media img:first-child { aspect-ratio: 16 / 10; }
.audience-case__admin-media img:last-child { aspect-ratio: 4 / 5; }
.audience-case__admin-media img:last-child { margin-top: var(--space-5); }

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
.project-story p.case-text-fill,
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

.project-story--final p.case-text-fill {
  grid-column: 2 / -2;
  font-size: clamp(2.2rem, 5.4vw, 6.4rem);
}

.audience-case--final p.case-text-fill {
  grid-column: 2 / -2;
  font-size: clamp(2.2rem, 5vw, 6.2rem);
}

.audience-case__closing-media {
  width: 100%;
  height: calc(75svh - 40px);
  min-height: calc(22rem - 40px);
  margin: 0;
  overflow: hidden;
}

.audience-case__closing-media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  .project-story > h2,
  .audience-case h2 {
    font-size: clamp(1.875rem, 8vw, 2.25rem);
  }

  .case-detail__next { height: 20svh; min-height: 20svh; margin-top: 0; flex-direction: column; align-items: flex-start; justify-content: flex-end; gap: var(--space-2); padding-block: var(--space-2); }
  .case-detail__next-content { flex-direction: column; align-items: flex-start; gap: var(--space-3); }
  .case-detail__next-name { max-width: 100%; font-size: clamp(3rem, 13vw, 5rem); }
  .project-story {
    grid-template-columns: 1fr;
    row-gap: var(--space-5);
    margin-top: var(--space-section);
  }
  .project-story > h2,
  .project-story__copy,
  .project-story--intro > h2,
  .project-story--intro .project-story__copy,
  .project-story--feature > h2,
  .project-story--feature .project-story__copy,
  .project-story--split > h2,
  .project-story--split .project-story__copy,
  .project-story--gallery > h2,
  .project-story--gallery .project-story__copy,
  .project-story--disclosure > :deep(.case-disclosure),
  .project-story--disclosure .project-story__media,
  .project-story__statement,
  .project-story--final p {
    grid-column: 1;
  }
  .project-story__copy { grid-template-columns: 1fr; }
  .project-story--feature > h2,
  .project-story--feature .project-story__copy { text-align: left; }
  .project-story__media { gap: var(--space-1); }
  .project-story__media--2 { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); }
  .project-story__media--3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .project-story__media--3 img:first-child { grid-column: 1 / -1; }
  .project-story__media--4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .project-story__media--2 img:last-child,
  .project-story__media--3 img:nth-child(2),
  .project-story__media--3 img:nth-child(3),
  .project-story__media--4 img:nth-child(even) { margin-top: var(--space-5); }
  .project-story--feature .project-story__media img,
  .project-story--disclosure .project-story__media img { aspect-ratio: 4 / 5; }
  .project-story p.project-story__statement { margin-top: var(--space-6); margin-bottom: 0; text-align: center; }
  .project-story--final { min-height: 0; margin: var(--space-7) 0 var(--space-6); }
  .project-story--schmidt-horizontal .project-story__statement { margin-top: var(--space-5); }
  .project-story--schmidt-production .project-story__statement { margin-top: var(--space-4); }
  .project-story--keys-system .project-story__statement,
  .project-story--keys-difference .project-story__statement { margin-top: var(--space-7); }
  .project-story__closing-media { height: 62svh; min-height: 22rem; }
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
  .audience-case__menu-lead,
  .audience-case__disclosure-copy { grid-template-columns: 1fr; }
  .audience-case--menu,
  .audience-case--motion { grid-template-columns: 1fr; }
  .audience-case--menu > h2,
  .audience-case__menu-lead,
  .audience-case__menu-secondary,
  .audience-case__media-mosaic,
  .audience-case__statement { grid-column: 1; }
  .audience-case p.audience-case__menu-secondary,
  .audience-case p.audience-case__motion-secondary { margin-top: var(--space-7); margin-bottom: var(--space-7); }
  .audience-case--motion > .audience-case__motion-secondary { grid-column: 1; }
  .audience-case__menu-lead img,
  .audience-case__menu-lead p { grid-column: 1; }
  .audience-case__disclosure-copy { width: 100%; }
  .audience-case__disclosure-copy p:first-child,
  .audience-case__disclosure-copy p:last-child { grid-column: 1; }
  .audience-case__copy--split p { grid-column: 1; }
  .audience-case__media-pair { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); }
  .audience-case__motion-pair,
  .audience-case__admin-media { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
  .audience-case__wave-media--portrait,
  .audience-case__motion-pair img:last-child,
  .audience-case__admin-media img:last-child { margin-top: var(--space-4); }
  .project-story__media--scroll :deep(.case-horizontal-rail__viewport),
  .audience-case__media-pair--scroll :deep(.case-horizontal-rail__viewport),
  .audience-case__motion-pair--scroll :deep(.case-horizontal-rail__viewport),
  .audience-case__admin-media--scroll :deep(.case-horizontal-rail__viewport) {
    display: block;
    width: 100vw;
    margin-inline: calc(50% - 50vw);
  }
  .project-story__media--scroll :deep(.case-horizontal-rail__content),
  .audience-case__media-pair--scroll :deep(.case-horizontal-rail__content),
  .audience-case__motion-pair--scroll :deep(.case-horizontal-rail__content),
  .audience-case__admin-media--scroll :deep(.case-horizontal-rail__content) {
    display: flex;
    width: max-content;
    gap: var(--space-1);
  }
  .project-story__media--scroll :deep(.case-horizontal-rail__content > img),
  .audience-case__media-pair--scroll :deep(.case-horizontal-rail__content > img),
  .audience-case__motion-pair--scroll :deep(.case-horizontal-rail__content > img),
  .audience-case__admin-media--scroll :deep(.case-horizontal-rail__content > img) {
    flex: 0 0 calc(100vw - var(--layout-margin));
    width: calc(100vw - var(--layout-margin));
    margin-top: 0;
  }
  .audience-case__wave-media {
    flex: 0 0 calc(100vw - var(--layout-margin));
    width: calc(100vw - var(--layout-margin));
    margin-top: 0;
  }
  .project-story__media--scroll :deep(.case-horizontal-rail__bar),
  .audience-case__media-pair--scroll :deep(.case-horizontal-rail__bar),
  .audience-case__motion-pair--scroll :deep(.case-horizontal-rail__bar),
  .audience-case__admin-media--scroll :deep(.case-horizontal-rail__bar) {
    width: 100vw;
    margin-inline: calc(50% - 50vw);
  }
  .audience-case__menu-media-pair { gap: var(--space-1); }
  .audience-case__menu-media-pair .audience-case__menu-media-stack { display: contents; }
  .audience-case__menu-media-pair--top > img:first-child { grid-column: 1; grid-row: 1; }
  .audience-case__menu-media-pair--top .audience-case__menu-media-stack img { grid-column: 2; grid-row: 1; margin-top: 14%; }
  .audience-case__menu-media-pair--bottom .audience-case__menu-media-stack img { grid-column: 1; grid-row: 1; margin-top: 8%; }
  .audience-case__menu-media-pair--bottom > img:last-child { grid-column: 2; grid-row: 1; }
  .audience-case__menu-media-pair .audience-case__statement--menu {
    grid-column: 1 / -1;
    grid-row: 2;
    width: 100%;
    max-width: none;
    margin: var(--space-3) 0 0;
  }
  .audience-case--motion .audience-case__lede { width: 100%; }
  .audience-case--live .audience-case__lede { width: 100%; }
  .audience-case--final {
    grid-template-columns: 1fr;
  }
  .audience-case--final p { grid-column: 1; }
  .project-story p.case-text-fill,
  .audience-case p.case-text-fill,
  .audience-case div.case-text-fill { grid-column: 1; }
  .audience-case__closing-media { min-height: calc(18rem - 40px); }
}

@media (prefers-reduced-motion: reduce) {
  h1,
  .case-detail__meta,
  .case-detail__media,
  .audience-case__pill,
  .audience-case__pill-label,
  .audience-case__disclosure-copy {
    transition: none;
  }

  .case-detail__media:not(.case-detail__media--audience) {
    margin-bottom: 0;
  }
}
</style>
