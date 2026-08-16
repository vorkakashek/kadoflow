/** Shared clip used by the menu iris and SPA page hops. */

export const IRIS_OPEN_S = 0.62
export const IRIS_CLOSE_S = 0.55
export const IRIS_OPEN_EASE = 'power3.in'
export const IRIS_CLOSE_EASE = 'power2.in'

export type IrisGeom = {
  cx: number
  cy: number
  w: number
  h: number
  vw: number
  vh: number
  /** Corner radius. Defaults to a stadium (`min(w,h)/2`). */
  r?: number
}

export type IrisBox = {
  left: number
  top: number
  width: number
  height: number
}

export function viewportIrisBox(): IrisBox {
  return {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  const x2 = x + w
  const y2 = y + h
  return `path('M${x + rr} ${y}H${x2 - rr}A${rr} ${rr} 0 0 1 ${x2} ${y + rr}V${y2 - rr}A${rr} ${rr} 0 0 1 ${x2 - rr} ${y2}H${x + rr}A${rr} ${rr} 0 0 1 ${x} ${y2 - rr}V${y + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${y}Z')`
}

/**
 * Start as the menu pill (`inset` / `path` rounded rect). Switch to `circle()`
 * only once the shape is actually round — negative `inset` clamps to 0 and
 * collapses toward the top-left, and a premature circle is larger than the chip.
 */
export function applyIrisClip(root: HTMLElement, g: IrisGeom) {
  const w = Math.max(0, g.w)
  const h = Math.max(0, g.h)
  const rad = Math.min(g.r ?? Math.min(w, h) / 2, w / 2, h / 2)
  const x = g.cx - w / 2
  const y = g.cy - h / 2
  const t = y
  const rgt = g.vw - (x + w)
  const b = g.vh - (y + h)
  const l = x
  const circular = Math.abs(w - h) < 0.75 && rad >= Math.min(w, h) / 2 - 0.75
  const overflow = t < 0 || rgt < 0 || b < 0 || l < 0
  const v = circular
    ? `circle(${Math.max(w, h) / 2}px at ${g.cx}px ${g.cy}px)`
    : overflow
      ? roundedRectPath(x, y, w, h, rad)
      : `inset(${t}px ${rgt}px ${b}px ${l}px round ${rad}px)`
  root.style.clipPath = v
  root.style.setProperty('-webkit-clip-path', v)
}

export function clearIrisClip(root: HTMLElement | null) {
  if (!root) return
  root.style.clipPath = ''
  root.style.removeProperty('-webkit-clip-path')
  root.style.willChange = ''
}

export function irisCoverFrom(start: IrisGeom): IrisGeom {
  const cover =
    2 *
      Math.hypot(
        Math.max(start.cx, start.vw - start.cx),
        Math.max(start.cy, start.vh - start.cy),
      ) +
    12
  return { ...start, w: cover, h: cover }
}

export function irisGeomFromBox(
  box: IrisBox | null,
  container: IrisBox,
  fallback?: { w: number; h: number; cx: number; cy: number },
): IrisGeom {
  const vw = container.width
  const vh = container.height
  if (!box) {
    const fb = fallback ?? {
      w: 72,
      h: 72,
      cx: vw / 2,
      cy: vh / 2,
    }
    return { ...fb, vw, vh }
  }
  return {
    cx: box.left - container.left + box.width / 2,
    cy: box.top - container.top + box.height / 2,
    w: box.width,
    h: box.height,
    vw,
    vh,
  }
}
