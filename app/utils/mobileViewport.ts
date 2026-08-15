/**
 * Mobile browser chrome helpers.
 * Toolbar show/hide changes innerHeight without a real layout resize —
 * reacting to that reflows fixed/absolute layers and feels like a jump.
 */

/** True when the primary pointer is coarse (finger) — not merely “has a touchscreen”. */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false
  // Hybrid laptops often report maxTouchPoints > 0 while the user works with a mouse.
  // Prefer the fine pointer when both exist so desktop motion (cursor dent, etc.) stays on.
  if (window.matchMedia('(pointer: fine)').matches) return false
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0
  )
}

/** Mouse / trackpad available — even on touchscreen Windows boxes. */
export function hasFinePointer(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: fine)').matches
}

export function isNarrowViewport(maxWidth = 767): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= maxWidth
}

/**
 * Right-thumb chrome: phone / tablet / coarse pointer, or a narrow window.
 * iPhone landscape is often >768px — still keep «меню» in the bottom-right.
 */
export function isThumbNav(): boolean {
  if (typeof window === 'undefined') return false
  if (isAppleTouchDevice()) return true
  return window.matchMedia('(max-width: 767.98px), (pointer: coarse)').matches
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
