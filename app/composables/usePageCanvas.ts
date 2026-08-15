/**
 * Page Canvas / workspace menu — shared open state.
 */
let heroGlPrewarmResolvers: Array<() => void> = []

export function usePageCanvas() {
  const open = useState('page-canvas-open', () => false)
  /** True while a motion run is in flight — block reopen until close/hop ends. */
  const busy = useState('page-canvas-busy', () => false)
  /**
   * Canvas layer is painted for the menu session (including the iris clip).
   * Live page hides after the iris finishes; header stays under the overlay.
   */
  const surfaceOn = useState('page-canvas-surface', () => false)
  /** Menu tile hop — route swap + iris reveal (not plain close). */
  const navHopActive = useState('page-canvas-nav-hop', () => false)
  /**
   * Bumped before menu iris reveal onto home — HomeHeroStage renders GL under
   * the stone lid while the overlay still covers the page.
   */
  const heroGlPrewarm = useState('hero-gl-prewarm', () => 0)
  /**
   * Thumb FAB word «меню». Scroll-down hides it; open/close always restores it.
   * Compact (dots-only) is never the rest state after a menu session.
   */
  const fabLabelOn = useState('fab-menu-label', () => true)
  /**
   * Next home mount should skip the hero entrance (SPA hop, including Page Canvas).
   * Direct / refresh visits still play the intro.
   */
  const skipHeroIntro = useState('skip-hero-intro', () => false)
  /** Home swarm has IBL + a looping frame — safe to reveal after an in-app hop. */
  const heroSwarmReady = useState('hero-swarm-ready', () => false)
  /** Menu / hop iris is exposing the live page (close shrink, not open grow). */
  const irisLive = useState('page-canvas-iris-live', () => false)
  /** SPA page hop overlay — iris reveal onto home. */
  const pageIrisLive = useState('page-iris-live', () => false)

  /** Block line-fill rebuild while the menu overlay owns scroll (no layout reflow). */
  function canvasMotionPaused() {
    return (
      typeof document !== 'undefined'
      && document.documentElement.classList.contains('page-canvas-lock')
    )
  }

  function openCanvas() {
    if (open.value || busy.value) return
    open.value = true
  }

  function closeCanvas() {
    if (!open.value) return
    open.value = false
  }

  function toggleCanvas() {
    if (busy.value && !open.value) return
    open.value = !open.value
  }

  function restoreFabLabel() {
    fabLabelOn.value = true
  }

  let fabFit:
    | ((on: boolean, instant?: boolean) => Promise<void>)
    | null = null

  function registerFabFit(
    fn: ((on: boolean, instant?: boolean) => Promise<void>) | null,
  ) {
    fabFit = fn
  }

  /** Expand the thumb chip to «меню». Waits until the width tween finishes. */
  async function revealFabLabel() {
    const already = fabLabelOn.value
    fabLabelOn.value = true
    if (fabFit) await fabFit(true, already)
  }

  async function waitForHeroSwarm(maxMs = 1800) {
    const deadline = performance.now() + maxMs
    while (!heroSwarmReady.value && performance.now() < deadline) {
      await new Promise<void>((r) => {
        requestAnimationFrame(() => r())
      })
    }
    await new Promise<void>((r) => {
      requestAnimationFrame(() => r())
    })
    await new Promise<void>((r) => {
      requestAnimationFrame(() => r())
    })
  }

  function requestHeroGlPrewarm() {
    return new Promise<void>((resolve) => {
      heroGlPrewarmResolvers.push(resolve)
      heroGlPrewarm.value += 1
    })
  }

  function resolveHeroGlPrewarm() {
    const pending = heroGlPrewarmResolvers.splice(0)
    for (const resolve of pending) resolve()
  }

  return {
    open,
    busy,
    surfaceOn,
    navHopActive,
    heroGlPrewarm,
    skipHeroIntro,
    heroSwarmReady,
    irisLive,
    pageIrisLive,
    canvasMotionPaused,
    fabLabelOn,
    waitForHeroSwarm,
    requestHeroGlPrewarm,
    resolveHeroGlPrewarm,
    revealFabLabel,
    restoreFabLabel,
    registerFabFit,
    openCanvas,
    closeCanvas,
    toggleCanvas,
  }
}
