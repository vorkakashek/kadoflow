/**
 * Page Canvas / workspace menu — shared open state + page-shell docking.
 */
export function usePageCanvas() {
  const open = useState('page-canvas-open', () => false)
  /** True while a motion run is in flight — for UI hints only; open/close always interrupt. */
  const busy = useState('page-canvas-busy', () => false)
  /**
   * Canvas layer is painted (open zoom + close zoom). Stays true after `open`
   * flips false so the close flight can finish. Site chrome keys off this.
   */
  const surfaceOn = useState('page-canvas-surface', () => false)
  /**
   * When set, `.page-shell` Teleports into this selector (live dock inside a frame).
   * Prefer a real slot node over fixed+scroll sync — no wobble on mobile.
   */
  const dockTo = useState<string | null>('page-canvas-dock-to', () => null)

  function openCanvas() {
    if (open.value) return
    open.value = true
  }

  function closeCanvas() {
    if (!open.value) return
    open.value = false
  }

  function toggleCanvas() {
    open.value = !open.value
  }

  return {
    open,
    busy,
    surfaceOn,
    dockTo,
    openCanvas,
    closeCanvas,
    toggleCanvas,
  }
}

export type PageShellParts = {
  shell: HTMLElement
  paint: HTMLElement
}

export function getPageShell(): PageShellParts | null {
  if (!import.meta.client) return null
  // Settle covers clone `.page-shell` — never treat them as the live shell.
  const shell = document.querySelector(
    '.page-shell:not(.pc-shell-settle-cover)',
  ) as HTMLElement | null
  const paint = shell?.querySelector('.page-shell__paint') as HTMLElement | null
  if (!shell || !paint) return null
  return { shell, paint }
}

export const PAGE_SHELL_DOCK_ID = 'pc-live-dock'
export const PAGE_SHELL_DOCK_SELECTOR = `#${PAGE_SHELL_DOCK_ID}`
