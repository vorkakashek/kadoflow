/** Shared circular-ish clip used by the menu iris and SPA page hops. */

export const IRIS_OPEN_S = 0.62
export const IRIS_CLOSE_S = 0.55
export const IRIS_OPEN_EASE = 'power3.in'
export const IRIS_CLOSE_EASE = 'power2.in'

export type IrisClip = { t: number; r: number; b: number; l: number; rad: number }

export type IrisGeom = {
  cx: number
  cy: number
  w: number
  h: number
  vw: number
  vh: number
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

export function applyIrisClip(root: HTMLElement, c: IrisClip) {
  const rad = Math.max(0, c.rad)
  const v = `inset(${c.t}px ${c.r}px ${c.b}px ${c.l}px round ${rad}px)`
  root.style.clipPath = v
  root.style.setProperty('-webkit-clip-path', v)
}

export function clearIrisClip(root: HTMLElement | null) {
  if (!root) return
  root.style.clipPath = ''
  root.style.removeProperty('-webkit-clip-path')
  root.style.willChange = ''
}

export function clipFromGeom(g: IrisGeom): IrisClip {
  const w = Math.max(0, g.w)
  const h = Math.max(0, g.h)
  const x = g.cx - w / 2
  const y = g.cy - h / 2
  return {
    t: y,
    r: g.vw - (x + w),
    b: g.vh - (y + h),
    l: x,
    rad: Math.min(w, h) / 2,
  }
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
