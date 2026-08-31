<script setup lang="ts">
/**
 * Hero visuals — inside the Flow Surface clipped window.
 * No own clip-path: parent clip cuts stone + 3D + text together.
 * Stage is rest-sized and offset so frame morph clips over it (no layout squash).
 */
import { flowSurfaceMask, useFlowSurfaceMask } from '~/composables/useFlowSurfaceMask'
import { useBrandPreload } from '~/composables/useBrandPreload'
import { isCoarsePointer, isMobileChromeHeightOnlyResize, isNarrowViewport } from '~/utils/mobileViewport'

const { locale, t, tm } = useI18n()
const heroTitleLines = computed(() => {
  locale.value
  return tm('home.hero.titleLines') as string[]
})

/** Keep WebGL alive until morph opacity is nearly gone (both platforms). */
const SCENE_LIVE_OPACITY = 0.08
/** Morph-driven stage fade — keyed to min(h,v) arrive progress. */
const FADE_OUT_START = 0.3
const FADE_OUT_END = 0.7
/**
 * Mobile — copy (h1+desc+slogan) opacity corridor.
 * Y motion starts at morph 0% (separate from opacity).
 */
const FADE_OUT_START_MOBILE = 0.28
const FADE_OUT_END_MOBILE = 0.62
/**
 * Mobile — 3D opacity corridor (+0.40 vs previous scene/copy window).
 * Finish 10 percentage points earlier than the current surface morph.
 */
const SCENE_FADE_START_MOBILE = 0.7
const SCENE_FADE_END_MOBILE = 0.92
/**
 * Swarm/media bleed past the stage box (px).
 * Desktop: cover stacked roam+hover outward (~2× dent + bow).
 * Mobile: tight — shade fewer off-clip pixels (clip still hides the edge).
 */
const SCENE_BLEED_Y = 168
const SCENE_BLEED_X = 168
const SCENE_BLEED_Y_LITE = 56
const SCENE_BLEED_X_LITE = 56
/** Copy shift over locked vh — driven by the same linear morph as the surface box. */
const COPY_PARALLAX_VH = 0.55

const props = defineProps<{
  /** Hero-rest viewport origin — stage counters frame morph so copy doesn't slide. */
  restTop: number
  restLeft: number
  stageWidth: number
  stageHeight: number
  sectionEl?: HTMLElement | null
}>()

const mask = useFlowSurfaceMask()
const preload = useBrandPreload()
const heroIntroSettled = useState('home-hero-intro-settled', () => false)
/** Frame-local offset: keep stage glued to rest pose in the viewport. */
const stageLeft = computed(() => props.restLeft - mask.left)
const stageTop = computed(() => props.restTop - mask.top)
const focusEl = ref<HTMLElement | null>(null)
const mediaEl = ref<HTMLElement | null>(null)
const swarmCoverEl = ref<HTMLElement | null>(null)
const copyEl = ref<HTMLElement | null>(null)
const sloganEl = ref<HTMLElement | null>(null)
const titleEl = ref<HTMLElement | null>(null)
const descEl = ref<HTMLElement | null>(null)
const introPending = ref(true)

const mobileLite = ref(false)
/** Cursor knocks on the swarm — desktop width only (≥1200). */
const swarmInteractive = ref(false)
function syncSwarmInteractive() {
  if (typeof window === 'undefined') return
  swarmInteractive.value = window.innerWidth >= 1200
}
if (import.meta.client) {
  mobileLite.value = isNarrowViewport() || isCoarsePointer()
  syncSwarmInteractive()
}

const sceneBleedX = computed(() =>
  mobileLite.value ? SCENE_BLEED_X_LITE : SCENE_BLEED_X,
)
const sceneBleedY = computed(() =>
  mobileLite.value ? SCENE_BLEED_Y_LITE : SCENE_BLEED_Y,
)

const sceneLive = ref(true)
/** WebGL rAF — deferred on mobile until iris veil is done (revealT≈1). */
const swarmLoopReady = ref(false)
const { open: pageCanvasOpen, busy: pageCanvasBusy, skipHeroIntro, heroSwarmReady, surfaceOn, irisLive, pageIrisLive, navHopActive, heroGlPrewarm, heroGlRevealBusy, resolveHeroGlPrewarm } = usePageCanvas()
/** Keep the last GL frame visible while the menu covers the page. */
const swarmVisible = computed(
  () =>
    sceneLive.value &&
    preload.revealed.value &&
    swarmLoopReady.value,
)
/**
 * Android 90Hz: no preserveDrawingBuffer — stone cover hides empty GL through
 * iris holes and for a few frames after until WebGL presents under the lid.
 */
const glCoverHold = ref(false)
/** Menu hop — keep GL rendering under the lid from prewarm through iris out. */
const glCoverHopSession = ref(false)

/** Iris / menu session — cover on only for SPA hop while GL has no frame yet. */
const glCoverNeed = computed(() => {
  if (!sceneLive.value) return false
  return pageIrisLive.value
})

const glCoverLocked = computed(() => glCoverNeed.value || glCoverHold.value)

/**
 * Loop under the opaque menu; pause only while a cover is shown (iris / hold).
 * During glCoverHold the lid stays up but we render underneath before lifting.
 */
const swarmActive = computed(
  () => swarmVisible.value && (!glCoverLocked.value || glCoverHold.value),
)

function waitGlFrames(n: number) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(() => step(left - 1))
    }
    requestAnimationFrame(() => step(n - 1))
  })
}

function cancelGlCoverHold() {
  glCoverHold.value = false
}

function finishHeroRevealQuiet() {
  glCoverHold.value = false
  glCoverHopSession.value = false
}

watch(glCoverNeed, (need, wasNeed) => {
  if (need) {
    if (!glCoverHopSession.value && !pageIrisLive.value) cancelGlCoverHold()
    return
  }
  if (!wasNeed || !sceneLive.value) return
  // Never drop hold between need→handoff — one blank frame flashes the GL buffer.
  glCoverHold.value = true
  const hop = glCoverHopSession.value || navHopActive.value
  const frames = hop
    ? (mobileLite.value ? 12 : 8)
    : (mobileLite.value ? 6 : 4)
  void waitGlFrames(frames).then(() => {
    finishHeroRevealQuiet()
  })
})

/** Home below the fold — no GL iris guard; release menu gate immediately. */
watch(
  () =>
    heroGlRevealBusy.value
    && !surfaceOn.value
    && !pageCanvasOpen.value
    && !irisLive.value
    && !pageIrisLive.value,
  (settle) => {
    if (!settle || glCoverNeed.value || sceneLive.value) return
    finishHeroRevealQuiet()
  },
)

async function runHeroGlPrewarm() {
  if (!sceneLive.value) {
    resolveHeroGlPrewarm()
    return
  }
  glCoverHopSession.value = true
  glCoverHold.value = true
  await waitGlFrames(mobileLite.value ? 8 : 4)
  resolveHeroGlPrewarm()
  // Hold stays up through the iris reveal — cleared in glCoverNeed watch.
}

watch(heroGlPrewarm, () => {
  void runHeroGlPrewarm()
})
/** Copy (h1+desc+slogan) opacity — never unmount; eased by morph. */
const copyOpacity = ref(1)
/** 3D / media opacity — separate corridor on mobile. */
const sceneOpacity = ref(1)
/** Mobile text backing toggles as soon as the page leaves hero rest. */
const titleBlurOpacity = ref(1)
/** Text parallax Y (px). Negative = up. */
const copyY = ref(0)

let ctx: { revert: () => void } | null = null
let gsapRef: typeof import('gsap').default | null = null
let stRef: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let mediaFadeTween: { kill: () => void } | null = null
let parallaxRaf = 0
/** Locked vh for copy parallax — ignore mobile chrome show/hide (innerHeight jumps). */
let copyParallaxVh = 0
let copyParallaxWidth = 0

function setFrozen(on: boolean) {
  flowSurfaceMask.freezeSilhouette = on
}

function copyParallaxBaseVh() {
  if (typeof window === 'undefined') return 1
  const w = window.innerWidth
  const h = Math.max(1, window.innerHeight)
  if (!copyParallaxVh || w !== copyParallaxWidth) {
    copyParallaxVh = h
    copyParallaxWidth = w
  }
  return copyParallaxVh
}

function onCopyParallaxResize() {
  // Width / orientation change: re-lock. Chrome toolbar only: keep the same vh.
  if (!isMobileChromeHeightOnlyResize()) {
    copyParallaxVh = 0
    copyParallaxWidth = 0
  }
  syncSwarmInteractive()
  updateCopyParallax()
  updateTitleBlurVisibility()
}

function opacityInRange(m: number, start: number, end: number) {
  if (m <= start) return 1
  if (m >= end) return 0
  return 1 - (m - start) / (end - start)
}

function opacityForMorph(m: number) {
  const start = mobileLite.value ? FADE_OUT_START_MOBILE : FADE_OUT_START
  const end = mobileLite.value ? FADE_OUT_END_MOBILE : FADE_OUT_END
  return opacityInRange(m, start, end)
}

function sceneOpacityForMorph(m: number) {
  if (mobileLite.value) {
    return opacityInRange(m, SCENE_FADE_START_MOBILE, SCENE_FADE_END_MOBILE)
  }
  // Desktop: same corridor as copy (0.3→0.7). GL stays up for the whole fade.
  return opacityForMorph(m)
}

/**
 * Parallax from morph 0→1 (same progress the surface box uses).
 * Locked vh avoids chrome show/hide jumps; no pixel snap (that stair-stepped text+GL).
 */
function updateCopyParallax() {
  if (typeof window === 'undefined') return
  if (pageCanvasOpen.value) {
    copyY.value = 0
    return
  }
  const vh = copyParallaxBaseVh()
  if (mobileLite.value) {
    const t = Math.min(1, Math.max(0, mask.morph))
    copyY.value = -t * vh * COPY_PARALLAX_VH
    return
  }
  const el = props.sectionEl
  if (!el) {
    copyY.value = 0
    return
  }
  const sectionTop = el.getBoundingClientRect().top + window.scrollY
  const scrolled = Math.max(0, (window.scrollY || 0) - sectionTop)
  const range = Math.max(1, vh)
  const t = Math.min(1, scrolled / range)
  copyY.value = -t * vh * COPY_PARALLAX_VH
}

/** Not scrubbed: a tiny scroll starts one self-contained fade-out transition. */
function updateTitleBlurVisibility() {
  if (typeof window === 'undefined') return
  if (!mobileLite.value || pageCanvasOpen.value) {
    titleBlurOpacity.value = 1
    return
  }
  const sectionTop = props.sectionEl
    ? props.sectionEl.getBoundingClientRect().top + window.scrollY
    : 0
  titleBlurOpacity.value = window.scrollY > sectionTop + 2 ? 0 : 1
}

function onParallaxScroll() {
  if (parallaxRaf) return
  parallaxRaf = requestAnimationFrame(() => {
    parallaxRaf = 0
    updateCopyParallax()
    updateTitleBlurVisibility()
  })
}

watch(
  () => mask.morph,
  (m) => {
    // Page Canvas freezes the live page — don't dismiss/restore mid-flight.
    if (pageCanvasOpen.value) return
    const copyOp = opacityForMorph(m)
    const sceneOp = sceneOpacityForMorph(m)
    copyOpacity.value = copyOp
    sceneOpacity.value = sceneOp
    updateCopyParallax()
    // Freeze only mid-morph — at hero rest edges stay live + cursor dent.
    setFrozen(m > 0.02 && m < 0.98)

    // Morph-scrubbed both ways — keep GL alive while the fade is visible.
    // (Desktop used to kill at morph 0.3 → hard pop via hero-swarm--cold.)
    sceneLive.value = sceneOp > SCENE_LIVE_OPACITY
  },
  { immediate: true },
)

watch(
  () => props.sectionEl,
  () => {
    updateCopyParallax()
  },
)

async function ensureGsap() {
  if (gsapRef && stRef) return
  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)
  gsapRef = gsap
  stRef = ScrollTrigger
}

async function setupExitMotion(sectionEl: HTMLElement) {
  ctx?.revert()
  ctx = null

  const mobile = isNarrowViewport() || isCoarsePointer()
  mobileLite.value = mobile
  syncSwarmInteractive()
  // Mobile: no scroll exit blur — 3D fade is morph-driven.
  if (mobile) {
    void ensureGsap()
    return
  }

  await ensureGsap()
  const gsap = gsapRef!
  const ScrollTrigger = stRef!

  await nextTick()

  ctx = gsap.context(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    ScrollTrigger.config({ ignoreMobileResize: true })

    const nextBlock = sectionEl.nextElementSibling as HTMLElement | null
    const exitStart = () => {
      const h = sectionEl.offsetHeight
      const vh = window.innerHeight
      const pastRest = Math.max(0, h - vh) + Math.round(vh * 0.08)
      return `top+=${pastRest} top`
    }
    const exitSt = {
      trigger: sectionEl,
      start: exitStart,
      endTrigger: nextBlock ?? sectionEl,
      end: nextBlock ? 'top center' : 'bottom top',
      scrub: 0.4,
      invalidateOnRefresh: true,
    }

    if (copyEl.value) {
      gsap.fromTo(
        copyEl.value,
        { filter: 'blur(0px)' },
        {
          filter: 'blur(14px)',
          ease: 'none',
          scrollTrigger: {
            ...exitSt,
            scrub: 0.35,
            // Late blur only — opacity is driven by morph min(h,v), not this scrub.
            start: () => {
              const h = sectionEl.offsetHeight
              const vh = window.innerHeight
              const pastRest = Math.max(0, h - vh) + Math.round(vh * 0.72)
              return `top+=${pastRest} top`
            },
          },
        },
      )
    }

    // Opacity / WebGL lifetime: morph watch only (min h,v). No early scrub fades.
    if (mediaEl.value) {
      ScrollTrigger.create({
        ...exitSt,
        onEnterBack: () => {
          if (sceneOpacityForMorph(mask.morph) > 0.08) sceneLive.value = true
        },
      })
    }

    // Off the mount critical path — morph host also refreshes; don't stack sync.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          ScrollTrigger.refresh()
        } catch {
          /* ignore */
        }
      })
    })
  }, sectionEl)
}

watch(
  () => props.sectionEl,
  async (el) => {
    if (!el) {
      ctx?.revert()
      ctx = null
      return
    }
    await setupExitMotion(el)
  },
  { immediate: true },
)

let introTl: { kill: () => void } | null = null
let introGen = 0

const swarmMount = ref(false)
const swarmLit = ref(false)
let swarmIdleId: number | null = null
let swarmFallbackTimer = 0
let removeSwarmIntent: (() => void) | null = null
let stageUnmounted = false
let swarmIntentPending = false

function scheduleSwarmMount(fromNavigation: boolean) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    preload.markSceneReady()
    return
  }
  const mount = () => {
    if (swarmIdleId !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(swarmIdleId)
      swarmIdleId = null
    }
    if (swarmFallbackTimer) {
      window.clearTimeout(swarmFallbackTimer)
      swarmFallbackTimer = 0
    }
    removeSwarmIntent?.()
    removeSwarmIntent = null
    if (!stageUnmounted) swarmMount.value = true
  }
  if (fromNavigation) {
    requestAnimationFrame(mount)
    return
  }

  // The SSR/CSS Hero is a complete first frame, so the brand reveal no longer
  // waits for Three.js, shader compilation or PMREM. The live scene upgrades it
  // after the reveal, or immediately when the visitor expresses intent.
  preload.markSceneReady()

  const scheduleUpgrade = () => {
    const connection = (navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean }
    }).connection
    const constrained = Boolean(
      connection?.saveData
      || connection?.effectiveType === 'slow-2g'
      || connection?.effectiveType === '2g'
      || connection?.effectiveType === '3g',
    )
    const delay = constrained ? 9000 : mobileLite.value ? 6000 : 5000
    let stopIntroGate: (() => void) | null = null
    const onIntent = () => {
      if (!heroIntroSettled.value) {
        swarmIntentPending = true
        return
      }
      mount()
    }
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    if (finePointer) window.addEventListener('pointermove', onIntent, { once: true, passive: true })
    window.addEventListener('click', onIntent, { once: true, passive: true })
    window.addEventListener('keydown', onIntent, { once: true })
    removeSwarmIntent = () => {
      stopIntroGate?.()
      stopIntroGate = null
      if (finePointer) window.removeEventListener('pointermove', onIntent)
      window.removeEventListener('click', onIntent)
      window.removeEventListener('keydown', onIntent)
    }

    stopIntroGate = watch(
      heroIntroSettled,
      (settled) => {
        if (!settled || !swarmIntentPending) return
        swarmIntentPending = false
        requestAnimationFrame(() => {
          if (stageUnmounted || swarmMount.value) return
          if ('requestIdleCallback' in window) {
            swarmIdleId = window.requestIdleCallback(mount, { timeout: 500 })
          } else {
            window.setTimeout(mount, 80)
          }
        })
      },
    )

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (stageUnmounted || swarmMount.value) return
        swarmFallbackTimer = window.setTimeout(() => {
          swarmFallbackTimer = 0
          if ('requestIdleCallback' in window) {
            swarmIdleId = window.requestIdleCallback(mount, { timeout: 1500 })
          } else mount()
        }, delay)
      })
    })
  }

  if (preload.revealed.value) scheduleUpgrade()
  else {
    const stop = watch(
      () => preload.revealed.value,
      (revealed) => {
        if (!revealed) return
        stop()
        scheduleUpgrade()
      },
    )
  }
}
/** Intro may reveal the swarm; HDRI must be on first or balls look black. */
const coverMayLift = ref(false)
const swarmCoverUp = computed(
  () => swarmLit.value && coverMayLift.value && !glCoverLocked.value,
)

function onSwarmLit() {
  swarmLit.value = true
}

watch(
  [swarmLit, swarmVisible],
  () => {
    heroSwarmReady.value = swarmLit.value && swarmVisible.value
  },
  { immediate: true },
)

/** Mobile: once GL is lit and preload is done, show the swarm — don’t depend only on iris revealT. */
watch(
  [swarmLit, () => preload.revealed.value],
  ([lit, rev]) => {
    if (!lit || !rev || !mobileLite.value) return
    swarmLoopReady.value = true
    coverMayLift.value = true
  },
)

onMounted(() => {
  if (pageIrisLive.value) {
    glCoverHopSession.value = true
    glCoverHold.value = true
  } else if (heroGlRevealBusy.value) {
    glCoverHold.value = true
  }

  // Don't freeze at rest — living edges + hover need an unfrozen silhouette.
  setFrozen(false)
  updateCopyParallax()
  updateTitleBlurVisibility()
  syncSwarmInteractive()
  window.addEventListener('scroll', onParallaxScroll, { passive: true })
  window.addEventListener('resize', onCopyParallaxResize, { passive: true })

  const fromNav = skipHeroIntro.value
  if (fromNav) skipHeroIntro.value = false

  heroIntroSettled.value = fromNav
  introPending.value = !fromNav
  swarmLoopReady.value = fromNav
  scheduleSwarmMount(fromNav)

  watch(pageCanvasBusy, (on) => {
    if (on) introTl?.pause()
    else introTl?.resume()
  })

  watch(
    () => preload.revealed.value,
    async (on) => {
      if (!on) {
        if (fromNav) return
        swarmLoopReady.value = false
        introPending.value = true
        return
      }
      if (fromNav) {
        introPending.value = false
        swarmLoopReady.value = true
        coverMayLift.value = true
        if (mediaEl.value) {
          mediaEl.value.style.opacity = '1'
          mediaEl.value.style.visibility = 'visible'
        }
        return
      }
      const gen = ++introGen
      introTl?.kill()
      introTl = null

      // Sync hide before any await — media/copy stay invisible until the intro fade.
      if (mediaEl.value) {
        mediaEl.value.style.opacity = '0'
        mediaEl.value.style.visibility = 'hidden'
      }

      const { default: gsap } = await import('gsap')
      if (gen !== introGen) return

      const titleLines = titleEl.value
        ? Array.from(titleEl.value.querySelectorAll('.hero-title .block'))
        : []

      if (mediaEl.value) gsap.set(mediaEl.value, { autoAlpha: 0 })
      if (titleLines.length) gsap.set(titleLines, { autoAlpha: 0, y: 22 })
      else if (titleEl.value) gsap.set(titleEl.value, { autoAlpha: 0, y: 22 })
      if (descEl.value) gsap.set(descEl.value, { autoAlpha: 0, y: 14 })
      if (sloganEl.value) gsap.set(sloganEl.value, { autoAlpha: 0, y: 16 })
      if (titleEl.value) gsap.set(titleEl.value, { autoAlpha: 1 })

      // Drop CSS hide only after GSAP owns opacity — no one-frame flash.
      introPending.value = false
      await nextTick()
      if (gen !== introGen) return

      const mobile = mobileLite.value
      const tl = gsap.timeline({
        defaults: { ease: 'power3.out' },
        onComplete: () => {
          if (gen === introGen) heroIntroSettled.value = true
        },
      })
      introTl = tl

      const allowSwarmCoverLift = (at = 0) => {
        tl.call(() => {
          coverMayLift.value = true
        }, [], at)
      }

      if (mobile) {
        // Surface + copy under iris; WebGL only after veil (mid-mask GL froze once).
        if (mediaEl.value) {
          tl.to(mediaEl.value, { autoAlpha: 1, duration: 0.85 }, 0.28)
        }
        // `let` — immediate watch can fire before assignment (SPA return, revealT≈1).
        let stopRevealWatch: (() => void) | undefined
        const armSwarm = () => {
          if (gen !== introGen) return
          swarmLoopReady.value = true
          coverMayLift.value = true
          stopRevealWatch?.()
          stopRevealWatch = undefined
        }
        stopRevealWatch = watch(
          () => preload.revealT.value,
          (t) => {
            if (t < 0.97) return
            armSwarm()
          },
          { immediate: true },
        )
        // iOS: if iris progress never hits 0.97, don't leave an empty stone forever.
        window.setTimeout(armSwarm, 1600)
      } else {
        // Desktop: run GL under the stone lid first, then fade media + lift lid.
        swarmLoopReady.value = true
        if (mediaEl.value) {
          tl.to(mediaEl.value, { autoAlpha: 1, duration: 0.85 }, 0.28)
        }
        // Lid lifts after IBL is on — never show unlit black balls.
        allowSwarmCoverLift(0.42)
      }

      if (mobile) {
        if (sloganEl.value) {
          tl.to(sloganEl.value, { autoAlpha: 1, y: 0, duration: 0.75 }, 0.45)
        }
        if (titleLines.length) {
          tl.to(
            titleLines,
            { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.14 },
            0.85,
          )
        } else if (titleEl.value) {
          tl.to(titleEl.value, { autoAlpha: 1, y: 0, duration: 0.8 }, 0.85)
        }
        if (descEl.value) {
          tl.to(descEl.value, { autoAlpha: 1, y: 0, duration: 0.7 }, 1.25)
        }
      } else {
        if (titleLines.length) {
          tl.to(
            titleLines,
            { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.14 },
            0.5,
          )
        } else if (titleEl.value) {
          tl.to(titleEl.value, { autoAlpha: 1, y: 0, duration: 0.8 }, 0.5)
        }
        if (descEl.value) {
          tl.to(descEl.value, { autoAlpha: 1, y: 0, duration: 0.7 }, 0.95)
        }
        if (sloganEl.value) {
          tl.to(sloganEl.value, { autoAlpha: 1, y: 0, duration: 0.75 }, 1.4)
        }
      }
    },
    { immediate: true },
  )
})

onUnmounted(() => {
  stageUnmounted = true
  if (swarmIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(swarmIdleId)
  }
  if (swarmFallbackTimer) window.clearTimeout(swarmFallbackTimer)
  removeSwarmIntent?.()
  removeSwarmIntent = null
  introGen += 1
  introTl?.kill()
  introTl = null
  heroSwarmReady.value = false
  cancelGlCoverHold()
  glCoverHopSession.value = false
  finishHeroRevealQuiet()
  setFrozen(false)
  mediaFadeTween?.kill()
  ctx?.revert()
  if (parallaxRaf) cancelAnimationFrame(parallaxRaf)
  window.removeEventListener('scroll', onParallaxScroll)
  window.removeEventListener('resize', onCopyParallaxResize)
})
</script>

<template>
  <div
    class="hero-stage pointer-events-none absolute overflow-visible"
    :style="{
      top: `${stageTop}px`,
      left: `${stageLeft}px`,
      width: `${Math.max(1, props.stageWidth)}px`,
      height: `${Math.max(1, props.stageHeight)}px`,
    }"
  >
    <div
      ref="focusEl"
      class="hero-focus relative size-full min-h-0"
    >
      <div
        class="absolute"
        :style="{
          top: `-${sceneBleedY}px`,
          left: `-${sceneBleedX}px`,
          width: `calc(100% + ${sceneBleedX * 2}px)`,
          height: `calc(100% + ${sceneBleedY * 2}px)`,
          opacity: sceneOpacity,
        }"
      >
        <div
          ref="mediaEl"
          class="absolute inset-0"
          :class="[
            swarmInteractive ? 'pointer-events-auto' : 'pointer-events-none',
            introPending ? 'hero-intro-hide' : '',
          ]"
        >
        <ClientOnly>
          <LazyHeroSwarmCanvas
            v-if="swarmMount"
            class="size-full"
            :class="{ 'hero-swarm--cold': !swarmVisible }"
            :active="swarmActive"
            :overlay-inset-x="sceneBleedX"
            :overlay-inset-y="sceneBleedY"
            @lit="onSwarmLit"
          />
        </ClientOnly>
        <!-- Neutral stone cover; lifted only after WebGL reports a stable frame. -->
        <div
          ref="swarmCoverEl"
          class="hero-swarm-cover"
          :class="{
            'hero-swarm-cover--up': swarmCoverUp,
            'hero-swarm-cover--lock': glCoverLocked,
          }"
          aria-hidden="true"
        />
        </div>
      </div>

      <div
        ref="copyEl"
        class="pointer-events-none absolute inset-0 z-10 flex min-h-0 flex-col will-change-transform"
        :class="{ 'hero-intro-hide': introPending }"
        :style="{
          opacity: copyOpacity,
          transform: `translate3d(0, ${copyY}px, 0)`,
        }"
      >
        <div
          class="hero-copy mx-auto grid h-full w-full min-h-0"
          :style="{
            maxWidth: 'var(--layout-content-max)',
            gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
            columnGap: 'var(--layout-gutter)',
          }"
        >
          <div
            class="col-span-12 flex min-h-0 flex-col justify-between md:col-span-10 md:col-start-2"
          >
            <div
              ref="titleEl"
              class="hero-title-block flex flex-col order-2 md:order-1"
              :style="{ '--hero-title-blur-opacity': titleBlurOpacity }"
            >
              <h1 class="hero-title text-ink">
                <span v-for="line in heroTitleLines" :key="line" class="block">{{ line }}</span>
              </h1>
              <p ref="descEl" class="hero-desc text-ash md:max-w-[36ch]">
                {{ t('home.hero.description') }}
              </p>
            </div>

            <p
              ref="sloganEl"
              class="hero-slogan text-ink order-1 md:order-2"
            >
              {{ t('home.hero.slogan') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Only motion controls sit above the copy backing; the WebGL canvas stays below it. -->
      <div
        id="hero-motion-controls"
        class="pointer-events-none absolute z-20"
        :style="{
          top: `-${sceneBleedY}px`,
          left: `-${sceneBleedX}px`,
          width: `calc(100% + ${sceneBleedX * 2}px)`,
          height: `calc(100% + ${sceneBleedY * 2}px)`,
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.hero-intro-hide {
  opacity: 0 !important;
  visibility: hidden !important;
}

.hero-swarm-cover {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: var(--palette-stone);
  pointer-events: none;
  transition: opacity 0.5s var(--motion-ease, ease), visibility 0.5s;
}

.hero-swarm-cover--up {
  opacity: 0;
  visibility: hidden;
}

.hero-swarm-cover--lock {
  opacity: 1;
  visibility: visible;
  transition: none;
}

.hero-copy {
  /* Mobile: same inset on sides and above the title. */
  padding-inline: var(--layout-margin-content);
  padding-top: var(--layout-margin-content);
  padding-bottom: calc(4 * var(--space-block));
}

@media (min-width: 768px) {
  .hero-copy {
    padding-inline: 0;
    padding-top: calc(var(--space-block) * 1.5);
    padding-bottom: var(--space-block);
  }
}

.hero-title {
  font-size: var(--type-hero);
  font-weight: 600;
  font-synthesis: none;
  letter-spacing: -0.02em;
  line-height: 1.05;
}

.hero-title-block {
  position: relative;
  gap: 16px;
}

.hero-slogan {
  font-size: calc(var(--type-slogan) * 0.72);
  font-weight: 400;
  font-synthesis: none;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.hero-desc {
  font-size: var(--type-slogan);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

/* Mobile: pull type down so 17 Pro–class widths don’t pack the stack. */
@media (max-width: 767px) {
  .hero-slogan {
    /* Was 0.62 — +25%, centered under the logo. */
    font-size: calc(var(--type-slogan) * 0.775);
    text-align: center;
  }

  .hero-title {
    font-size: calc(var(--type-hero) * 0.84);
    line-height: 1.08;
  }

  .hero-desc {
    font-size: calc(var(--type-slogan) * 0.9);
    color: color-mix(in srgb, var(--palette-ink) 68%, var(--palette-ash));
  }

  .hero-title-block {
    gap: 12px;
    isolation: isolate;
    transform: translate3d(0, calc(2 * var(--space-block)), 0);
  }

  /* Local text legibility layer: opaque at the bottom, fading upward. */
  .hero-title-block::before {
    position: absolute;
    z-index: -1;
    inset: -40px -24px calc(-2 * var(--space-block));
    content: '';
    pointer-events: none;
    opacity: var(--hero-title-blur-opacity, 1);
    transition: opacity 0.32s var(--motion-ease, ease);
    background: linear-gradient(
      to top,
      color-mix(in srgb, var(--palette-stone) 44%, transparent),
      transparent 78%
    );
    mask-image: linear-gradient(to top, #000 0%, #000 46%, transparent 100%);
    -webkit-mask-image: linear-gradient(to top, #000 0%, #000 46%, transparent 100%);
  }

  @supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .hero-title-block::before {
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
  }
}

@media (min-width: 768px) {
  .hero-title-block {
    gap: 40px;
  }
}
</style>
