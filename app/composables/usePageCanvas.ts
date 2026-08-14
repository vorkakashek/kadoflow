/**
 * Page Canvas / workspace menu — shared open state.
 */
export function usePageCanvas() {
  const open = useState('page-canvas-open', () => false)
  /** True while a motion run is in flight — block reopen until close/hop ends. */
  const busy = useState('page-canvas-busy', () => false)
  /**
   * Canvas layer is painted for the menu session (including the iris clip).
   * Live page hides after the iris finishes; header stays under the overlay.
   */
  const surfaceOn = useState('page-canvas-surface', () => false)
  /**
   * Next home mount should skip the hero entrance (SPA hop, including Page Canvas).
   * Direct / refresh visits still play the intro.
   */
  const skipHeroIntro = useState('skip-hero-intro', () => false)
  /** Home swarm has IBL + a looping frame — safe to reveal after an in-app hop. */
  const heroSwarmReady = useState('hero-swarm-ready', () => false)

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

  return {
    open,
    busy,
    surfaceOn,
    skipHeroIntro,
    heroSwarmReady,
    openCanvas,
    closeCanvas,
    toggleCanvas,
  }
}
