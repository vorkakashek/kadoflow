const SMOOTH_SCROLL_ENABLED =
  '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)'

// Lenis completes `lerp` scrolling by rounding to the final pixel. Staying too
// far below its normal follow factor leaves a visible stepped tail before that
// final frame, especially with notched mouse wheels.
const WHEEL_LERP = 0.1

const SCROLL_LOCKS = [
  'preload-lock',
  'page-canvas-lock',
  'page-iris-lock',
] as const

/**
 * Smooth stepped wheel input on desktop. Touch scrolling stays fully native so
 * the page remains locked 1:1 to the user's finger on mobile.
 *
 * Lenis shares GSAP's ticker with ScrollTrigger and joins it only while a
 * smooth scroll is active. That keeps idle pages from running another
 * permanent animation loop.
 */
export default defineNuxtPlugin((nuxtApp) => {
  let lenis: import('lenis').default | null = null
  let gsap: typeof import('gsap').default | null = null
  let ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
  let lockObserver: MutationObserver | null = null
  let tickerAttached = false
  let createGeneration = 0
  let idleId: number | null = null
  let runtimePromise: Promise<[
    typeof import('lenis'),
    typeof import('gsap'),
    typeof import('gsap/ScrollTrigger'),
  ]> | null = null

  const enabledQuery = window.matchMedia(SMOOTH_SCROLL_ENABLED)

  function removeTicker() {
    if (!tickerAttached) return
    tickerAttached = false
    gsap?.ticker.remove(update)
  }

  function update(time: number) {
    if (!lenis) return
    lenis.raf(time * 1000)
    if (lenis.isScrolling === false) removeTicker()
  }

  function requestTicker() {
    if (!lenis || !gsap || lenis.isStopped || tickerAttached || document.hidden) return

    // Lenis advances from the time passed to `raf()`. When the idle ticker has
    // been detached, its previous timestamp may be seconds old; without this
    // reset the first wheel notch is advanced as one huge frame and jumps.
    lenis.time = gsap.ticker.time * 1000
    tickerAttached = true
    // Measure/apply scroll before GSAP's animation callbacks for this frame.
    gsap.ticker.add(update, false, true)
  }

  function pageIsLocked() {
    return SCROLL_LOCKS.some((className) =>
      document.documentElement.classList.contains(className),
    )
  }

  function syncRunState() {
    if (!lenis) return
    if (document.hidden || pageIsLocked()) {
      lenis.stop()
      removeTicker()
    } else {
      lenis.start()
    }
  }

  function destroy() {
    createGeneration += 1
    removeTicker()
    lockObserver?.disconnect()
    lockObserver = null
    lenis?.destroy()
    lenis = null
  }

  function loadRuntime() {
    runtimePromise ??= Promise.all([
      import('lenis'),
      import('gsap'),
      import('gsap/ScrollTrigger'),
    ])
    return runtimePromise
  }

  async function create() {
    if (lenis || !enabledQuery.matches) return
    const generation = ++createGeneration
    const [lenisModule, gsapModule, scrollTriggerModule] = await loadRuntime()
    if (generation !== createGeneration || !enabledQuery.matches || lenis) return

    const Lenis = lenisModule.default
    gsap = gsapModule.default
    ScrollTrigger = scrollTriggerModule.ScrollTrigger
    gsap.registerPlugin(ScrollTrigger)
    gsap.ticker.fps(0)
    gsap.ticker.lagSmoothing(0)
    gsap.config({ force3D: true, nullTargetWarn: false })
    ScrollTrigger.config({ ignoreMobileResize: true })
    lenis = new Lenis({
      autoRaf: false,
      smoothWheel: true,
      syncTouch: false,
      // Keep individual wheel notches blended, but let the final pixels settle
      // promptly instead of exposing a long, stepped inertial tail.
      lerp: WHEEL_LERP,
      wheelMultiplier: 1,
      stopInertiaOnNavigate: true,
      respectReducedMotion: true,
    })

    lenis.on('virtual-scroll', ({ event }) => {
      // Touch events are observed by Lenis even with syncTouch disabled. Do not
      // attach its animation ticker for them: native scrolling needs no Lenis RAF.
      if (event.type.includes('wheel')) requestTicker()
    })
    lenis.on('scroll', ScrollTrigger.update)

    lockObserver = new MutationObserver(syncRunState)
    lockObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    syncRunState()
  }

  function syncInputMode() {
    destroy()
    if (enabledQuery.matches) void create()
  }

  nuxtApp.hook('app:mounted', () => {
    const activate = () => void create()
    if (enabledQuery.matches) {
      // Fetch and evaluate the small smooth-scroll runtime immediately after
      // the first paint. If the user wheels before the idle constructor runs,
      // that gesture no longer pays for three cold dynamic imports.
      requestAnimationFrame(() => void loadRuntime())
      // Hydration and the first visual response keep priority. A short timeout
      // still makes wheel smoothing ready before normal desktop interaction.
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(activate, { timeout: 1200 })
      } else {
        window.setTimeout(activate, 350)
      }
      window.addEventListener('wheel', activate, { once: true, passive: true })
    }
    enabledQuery.addEventListener('change', syncInputMode)
    document.addEventListener('visibilitychange', syncRunState)
  })

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      if (idleId !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      enabledQuery.removeEventListener('change', syncInputMode)
      document.removeEventListener('visibilitychange', syncRunState)
      destroy()
    })
  }
})
