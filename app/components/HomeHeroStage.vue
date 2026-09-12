<script setup lang="ts">
/**
 * Hero visuals — inside the Flow Surface clipped window.
 * No own clip-path: parent clip cuts stone + 3D + slogan together.
 * Stage is rest-sized and offset so frame morph clips over it (no layout squash).
 */
import { flowSurfaceMask, useFlowSurfaceMask } from '~/composables/useFlowSurfaceMask'
import { useBrandPreload } from '~/composables/useBrandPreload'
import { preloadHomeSceneAssets, preloadThreeBundle } from '~/utils/preloadHomeMotion'
import { isCoarsePointer, isMobileChromeHeightOnlyResize, isNarrowViewport } from '~/utils/mobileViewport'

const { t } = useI18n()

/** Keep WebGL alive until morph opacity is nearly gone (both platforms). */
const SCENE_LIVE_OPACITY = 0.08
/** Morph-driven stage fade — keyed to min(h,v) arrive progress. */
const FADE_OUT_START = 0.3
const FADE_OUT_END = 0.7
/**
 * Mobile — slogan opacity corridor.
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
/**
 * The slogan rises more slowly than the page (px per scrolled px). Its initial
 * offset keeps the whole line below the scene, so the Flow Surface clip reveals
 * it through the lower edge instead of fading it in around the centre.
 */
const SLOGAN_SCROLL_RATE = 0.36
const SLOGAN_EDGE_OFFSET_VH = 0.16

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
const sloganY = ref(10_000)
const titleEl = computed(() =>
  props.sectionEl?.querySelector<HTMLElement>('[data-hero-title-block]') ?? null,
)
const descEls = computed(() =>
  props.sectionEl
    ? Array.from(props.sectionEl.querySelectorAll<HTMLElement>('[data-hero-description-line]'))
    : [],
)
const introPending = useState<boolean>('home-hero-intro-pending', () => true)

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
const {
  open: pageCanvasOpen,
  busy: pageCanvasBusy,
  skipHeroIntro,
  heroSwarmReady,
  surfaceOn,
  irisLive,
  pageIrisLive,
  pageIrisHomeReveal,
  navHopActive,
  heroGlPrewarm,
  heroGlRevealBusy,
  resolveHeroGlPrewarm,
} = usePageCanvas()
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

/**
 * Protect the WebGL buffer only while an iris is revealing Home. While leaving
 * Home the live scene stays visible inside the growing iris instead of being
 * replaced by the stone lid on pointer-down.
 */
const glCoverNeed = computed(() => {
  if (!sceneLive.value) return false
  return pageIrisHomeReveal.value
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
/** Slogan opacity — never unmount; eased by morph. */
const copyOpacity = ref(1)
/** 3D / media opacity — separate corridor on mobile. */
const sceneOpacity = ref(1)
let ctx: { revert: () => void } | null = null
let gsapRef: typeof import('gsap').default | null = null
let stRef: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let mediaFadeTween: { kill: () => void } | null = null
let parallaxRaf = 0
/** Locked vh for slogan parallax — ignore mobile chrome show/hide (innerHeight jumps). */
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
  updateSloganMotion()
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
 * One scroll-driven trajectory: start beyond the scene's lower edge, then rise
 * at a fraction of the scroll speed. The Flow Surface remains the reveal mask.
 */
function updateSloganMotion() {
  if (typeof window === 'undefined' || pageCanvasOpen.value) return
  const vh = copyParallaxBaseVh()
  const sectionTop = props.sectionEl
    ? props.sectionEl.getBoundingClientRect().top + window.scrollY
    : 0
  const scrolled = Math.max(0, window.scrollY - sectionTop)
  const startY = props.stageHeight * 0.5 + vh * SLOGAN_EDGE_OFFSET_VH

  sloganY.value = startY - scrolled * SLOGAN_SCROLL_RATE
}

function onParallaxScroll() {
  if (parallaxRaf) return
  parallaxRaf = requestAnimationFrame(() => {
    parallaxRaf = 0
    updateSloganMotion()
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
    updateSloganMotion()
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
    updateSloganMotion()
  },
)

watch(
  () => props.stageHeight,
  () => updateSloganMotion(),
)

watch(pageCanvasOpen, (open) => {
  if (!open) {
    updateSloganMotion()
  }
})

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
const heroWebglPrebootRequested = useState<boolean>(
  'home-hero-webgl-preboot-requested',
  () => false,
)
const heroWebglBooted = useState<boolean>('home-hero-webgl-booted', () => false)
const heroWebglLit = useState<boolean>('home-hero-webgl-lit', () => false)
let swarmIdleId: number | null = null
let swarmFallbackTimer = 0
let removeSwarmIntent: (() => void) | null = null
let removeSwarmPreboot: (() => void) | null = null
let stageUnmounted = false
let swarmIntentPending = false
let mobileSwarmDeferred = false
let requestSwarmMount: (() => void) | null = null

function scheduleSwarmMount(fromNavigation: boolean) {
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
  requestSwarmMount = mount
  if (fromNavigation) {
    requestAnimationFrame(mount)
    return
  }

  // The SSR/CSS Hero is a complete first frame, so the brand reveal no longer
  // waits for Three.js, shader compilation or PMREM. The live scene upgrades it
  // after the reveal, or immediately when the visitor expresses intent.
  preload.markSceneReady()

  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean }
  }).connection
  // `effectiveType` is a rolling estimate and often reports 3g transiently on
  // capable phones. It must not insert a five-second hole between copy and 3D.
  // Keep the strong defer only for explicit Save-Data and genuinely slow links.
  const constrained = Boolean(
    connection?.saveData
    || connection?.effectiveType === 'slow-2g'
    || connection?.effectiveType === '2g',
  )
  mobileSwarmDeferred = mobileLite.value && constrained
  // A warm desktop reload can create its WebGL context while the preloader is
  // motionless at 99%. The preloader raises this flag only after its orbit has
  // settled, so the measured context-creation task cannot hitch either motion.
  const startPreboot = () => {
    removeSwarmPreboot?.()
    removeSwarmPreboot = null
    if (stageUnmounted || swarmMount.value) return
    void preloadThreeBundle()
    requestAnimationFrame(mount)
  }
  if (!mobileLite.value) {
    if (heroWebglPrebootRequested.value) startPreboot()
    else {
      removeSwarmPreboot = watch(
        heroWebglPrebootRequested,
        (requested) => {
          if (requested) startPreboot()
        },
      )
    }
  }

  if (mobileLite.value && !mobileSwarmDeferred) {
    // Fetch/parse the motion graph and current mobile HDR while the compact
    // brand screen is still covering the page. Do not mount WebGL here:
    // Android can discard a canvas below visibility:hidden. The intro timeline
    // mounts it as soon as the media layer becomes paintable.
    const warmMobileScene = () => {
      swarmIdleId = null
      if (!stageUnmounted) preloadHomeSceneAssets('mobile')
    }
    if ('requestIdleCallback' in window) {
      swarmIdleId = window.requestIdleCallback(warmMobileScene, { timeout: 320 })
    } else {
      swarmFallbackTimer = globalThis.setTimeout(() => {
        swarmFallbackTimer = 0
        warmMobileScene()
      }, 120)
    }
    return
  }

  const scheduleUpgrade = () => {
    // Warm the large Three module in a quiet slot, then mount automatically
    // shortly after the primary title/description entrance. Interaction stays
    // gated separately until the scene has faded in.
    if (!constrained) {
      const warmThree = () => {
        if (!stageUnmounted) void preloadThreeBundle()
      }
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(warmThree, { timeout: 450 })
      } else {
        window.setTimeout(warmThree, 120)
      }
    }
    const delay = constrained ? 5000 : 1100
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
            swarmIdleId = window.requestIdleCallback(mount, { timeout: 350 })
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
  heroWebglLit.value = true
}

function onSwarmBooted() {
  heroWebglBooted.value = true
}

watch(
  [swarmLit, swarmVisible],
  () => {
    heroSwarmReady.value = swarmLit.value && swarmVisible.value
  },
  { immediate: true },
)

/** Mobile: lift the lid only when both the copy entrance and HDR-lit scene are ready. */
watch(
  [swarmLit, () => preload.revealed.value, heroIntroSettled],
  ([lit, rev, introSettled]) => {
    if (!lit || !rev || !introSettled || !mobileLite.value) return
    coverMayLift.value = true
  },
)

onMounted(() => {
  if (pageIrisHomeReveal.value) {
    glCoverHopSession.value = true
    glCoverHold.value = true
  } else if (heroGlRevealBusy.value) {
    glCoverHold.value = true
  }

  // Don't freeze at rest — living edges + hover need an unfrozen silhouette.
  setFrozen(false)
  updateSloganMotion()
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

      // Sync hide before any await — media stays invisible until the intro fade.
      if (mediaEl.value) {
        mediaEl.value.style.opacity = '0'
        mediaEl.value.style.visibility = 'hidden'
      }

      const { default: gsap } = await import('gsap')
      if (gen !== introGen) return

      const titleChars = titleEl.value
        ? Array.from(titleEl.value.querySelectorAll('.home-hero__title-char'))
        : []

      if (mediaEl.value) gsap.set(mediaEl.value, { autoAlpha: 0 })
      if (titleChars.length) gsap.set(titleChars, { yPercent: 115 })
      else if (titleEl.value) gsap.set(titleEl.value, { yPercent: 115 })
      if (descEls.value.length) gsap.set(descEls.value, { yPercent: 115 })

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
        // The Surface grows from its lower edge after the compact preloader.
        // Reveal lower copy first, then the slogan as the top edge arrives.
        if (mediaEl.value) {
          tl.to(mediaEl.value, { autoAlpha: 1, duration: 0.65 }, 0)
        }
        if (!mobileSwarmDeferred) {
          // Resources were warmed under the brand screen. Mount only after the
          // media layer is visible, then let HDR/PMREM and shader compilation run
          // under the opaque stone lid while the copy finishes its entrance.
          tl.call(() => requestSwarmMount?.(), [], 0.08)
        }
        // Start the gather under the opaque lid during the slogan entrance.
        // At reveal time the nearest silhouettes are already crossing the frame,
        // instead of beginning 2.25 ring radii away on a blank visible canvas.
        tl.call(() => {
          if (gen === introGen) swarmLoopReady.value = true
        }, [], 0.58)
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
        if (titleChars.length) {
          tl.to(
            titleChars,
            { yPercent: 0, duration: 1.1, stagger: 0.055, ease: 'power4.out' },
            0.12,
          )
        } else if (titleEl.value) {
          tl.to(titleEl.value, { yPercent: 0, duration: 1.1, ease: 'power4.out' }, 0.12)
        }
        if (descEls.value.length) {
          tl.to(
            descEls.value,
            { yPercent: 0, duration: 1.1, stagger: 0.18, ease: 'power4.out' },
            0.34,
          )
        }
      } else {
        if (titleChars.length) {
          tl.to(
            titleChars,
            { yPercent: 0, duration: 1.1, stagger: 0.055, ease: 'power4.out' },
            0.5,
          )
        } else if (titleEl.value) {
          tl.to(titleEl.value, { yPercent: 0, duration: 1.1, ease: 'power4.out' }, 0.5)
        }
        if (descEls.value.length) {
          tl.to(
            descEls.value,
            { yPercent: 0, duration: 1.1, stagger: 0.18, ease: 'power4.out' },
            0.95,
          )
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
  removeSwarmPreboot?.()
  removeSwarmPreboot = null
  requestSwarmMount = null
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
            @booted="onSwarmBooted"
            @lit="onSwarmLit"
          />
        </ClientOnly>
        <!-- Neutral Surface-colour lid stays up until the first live GL frame. -->
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
            class="col-span-12 flex min-h-0 flex-col items-center justify-center md:col-span-10 md:col-start-2"
          >
            <p
              ref="sloganEl"
              class="hero-slogan text-milk"
              :style="{
                transform: `translate3d(0, ${sloganY}px, 0)`,
              }"
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
  overflow: hidden;
  background: var(--hero-scene-forest);
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

.hero-slogan {
  font-size: var(--type-slogan);
  font-weight: 400;
  font-synthesis: none;
  letter-spacing: -0.02em;
  line-height: 1.2;
  text-align: center;
  will-change: transform;
}

/* Mobile: keep the slogan slightly more emphatic in the portrait scene. */
@media (max-width: 767px) {
  .hero-slogan {
    font-size: calc(var(--type-slogan) * 1.05);
    text-align: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-slogan {
    transform: none !important;
  }
}
</style>
