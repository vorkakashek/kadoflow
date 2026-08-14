/**
 * Warm GSAP / Three module graph before SPA return to `/`,
 * so logo→home doesn't pay cold dynamic-import on the critical path.
 */
let gsapWarm: Promise<void> | null = null
let threeWarm: Promise<void> | null = null

export function preloadGsapBundle() {
  if (!import.meta.client) return Promise.resolve()
  if (!gsapWarm) {
    gsapWarm = Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
    ]).then(() => undefined)
  }
  return gsapWarm
}

export function preloadThreeBundle() {
  if (!import.meta.client) return Promise.resolve()
  if (!threeWarm) {
    threeWarm = import('three').then(() => undefined)
  }
  return threeWarm
}

export function preloadHomeMotionBundles() {
  return Promise.all([preloadGsapBundle(), preloadThreeBundle()]).then(
    () => undefined,
  )
}
