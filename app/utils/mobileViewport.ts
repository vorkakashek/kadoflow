/**
 * Mobile browser chrome helpers.
 * Toolbar show/hide changes innerHeight without a real layout resize —
 * reacting to that reflows fixed/absolute layers and feels like a jump.
 */

export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0
  )
}

export function isNarrowViewport(maxWidth = 767): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= maxWidth
}

/** iPhone / iPad (incl. iPadOS desktop UA). */
export function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

let lastWidth = 0

/**
 * True when only the viewport height changed (typical URL-bar collapse).
 * Call from resize handlers; updates the remembered width.
 */
export function isMobileChromeHeightOnlyResize(): boolean {
  if (typeof window === 'undefined') return false
  const w = window.innerWidth
  const prev = lastWidth
  lastWidth = w
  if (!isCoarsePointer() && !isNarrowViewport()) return false
  if (prev === 0) return false
  return w === prev
}
