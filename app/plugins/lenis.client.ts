import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const SMOOTH_SCROLL_ENABLED = '(prefers-reduced-motion: no-preference)'

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
  let lenis: Lenis | null = null
  let lockObserver: MutationObserver | null = null
  let tickerAttached = false

  const enabledQuery = window.matchMedia(SMOOTH_SCROLL_ENABLED)

  function removeTicker() {
    if (!tickerAttached) return
    tickerAttached = false
    gsap.ticker.remove(update)
  }

  function update(time: number) {
    if (!lenis) return
    lenis.raf(time * 1000)
    if (lenis.isScrolling === false) removeTicker()
  }

  function requestTicker() {
    if (!lenis || lenis.isStopped || tickerAttached || document.hidden) return

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
    removeTicker()
    lockObserver?.disconnect()
    lockObserver = null
    lenis?.destroy()
    lenis = null
  }

  function create() {
    if (lenis || !enabledQuery.matches) return

    gsap.registerPlugin(ScrollTrigger)
    lenis = new Lenis({
      autoRaf: false,
      smoothWheel: true,
      syncTouch: false,
      // A lower follow factor blends notched mouse-wheel deltas into one
      // continuous glide without changing the travel distance per wheel step.
      lerp: 0.065,
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
    create()
  }

  nuxtApp.hook('app:mounted', () => {
    create()
    enabledQuery.addEventListener('change', syncInputMode)
    document.addEventListener('visibilitychange', syncRunState)
  })

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      enabledQuery.removeEventListener('change', syncInputMode)
      document.removeEventListener('visibilitychange', syncRunState)
      destroy()
    })
  }
})
