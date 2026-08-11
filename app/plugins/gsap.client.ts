import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * Client-only GSAP defaults for display-synced smoothness.
 * Ticker follows rAF (60 / 120 / 144 Hz). No provide() — gsap is not serializable.
 */
export default defineNuxtPlugin(() => {
  gsap.registerPlugin(ScrollTrigger)
  gsap.ticker.fps(0)
  gsap.ticker.lagSmoothing(0)
  gsap.config({ force3D: true, nullTargetWarn: false })
  // Avoid exit/morph scrub jumping when the mobile URL bar shows/hides.
  ScrollTrigger.config({ ignoreMobileResize: true })
  if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
    history.scrollRestoration = 'manual'
  }
})
