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

/** Cache the compact Hero environment while the iris covers the current page. */
export function preloadHomeSceneAssets() {
  void preloadHomeMotionBundles()
  if (typeof window === 'undefined') return
  const wide = window.innerWidth >= 1200
  const hdr = wide
    ? '/env/studio_small_09_512.hdr'
    : '/env/studio_small_03_256.hdr'
  const urls = [hdr]
  for (const url of urls) {
    void fetch(url, { credentials: 'same-origin' }).catch(() => undefined)
  }
}
