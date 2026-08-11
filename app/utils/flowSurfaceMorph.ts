/**
 * Controllable Flow Surface morph plans.
 * Scroll only sets a *target*; the host eases toward it with `lag`
 * (own tempo — not scrubbed 1:1 to scroll velocity).
 *
 * - horizontal → left + width
 * - vertical   → top + height
 */

export type MorphGroup = 'horizontal' | 'vertical'

export type SurfaceBox = {
  top: number
  left: number
  width: number
  height: number
}

export type MorphStage = {
  group: MorphGroup
  duration: number
  at?: number
  ease?: string
}

export type SurfaceMorphPlan = {
  id: string
  /**
   * Time constant (seconds) for catching ~63% toward the scroll target.
   * Higher = more delay / softer motion, independent of scroll speed.
   */
  lag: number
  stages: MorphStage[]
}

/**
 * Hero wide window → Kado panel.
 * Stages overlap on purpose: vertical starts while width is still squeezing.
 * Tune via `at` / `duration` (normalized timeline units mapped from scroll).
 */
export const heroToKadoPlan: SurfaceMorphPlan = {
  id: 'hero-to-kado',
  lag: 0.1,
  stages: [
    { group: 'horizontal', duration: 1, at: 0, ease: 'power2.inOut' },
    // Drop starts ~mid squeeze — not after width fully settles
    { group: 'vertical', duration: 1, at: 0.38, ease: 'power2.inOut' },
  ],
}

/** Timeline length = furthest stage end */
export function planDuration(plan: SurfaceMorphPlan): number {
  let max = 0
  for (const stage of plan.stages) {
    const at = stage.at ?? 0
    max = Math.max(max, at + stage.duration)
  }
  return Math.max(max, 0.001)
}

/**
 * Map scroll progress 0…1 → { h, v } through plan stages + eases.
 * `easeFn` should be gsap.parseEase(name) or identity.
 */
export function targetsFromScrollProgress(
  plan: SurfaceMorphPlan,
  scrollProgress: number,
  easeFn: (name: string) => (t: number) => number,
): { h: number; v: number } {
  const p = Math.min(1, Math.max(0, scrollProgress))
  const t = p * planDuration(plan)
  let h = 0
  let v = 0

  for (const stage of plan.stages) {
    const at = stage.at ?? 0
    const raw = (t - at) / Math.max(stage.duration, 0.0001)
    const u = Math.min(1, Math.max(0, raw))
    const eased = stage.ease ? easeFn(stage.ease)(u) : u
    if (stage.group === 'horizontal') h = Math.max(h, eased)
    else v = Math.max(v, eased)
  }

  return { h, v }
}

export function mixBox(a: SurfaceBox, b: SurfaceBox, h: number, v: number): SurfaceBox {
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
  const th = clamp01(h)
  const tv = clamp01(v)
  return {
    left: a.left + (b.left - a.left) * th,
    width: a.width + (b.width - a.width) * th,
    top: a.top + (b.top - a.top) * tv,
    height: a.height + (b.height - a.height) * tv,
  }
}

/** Doc box → viewport box at a given scrollY (fixed pose snapshot). */
export function poseAtScrollY(doc: SurfaceBox, scrollY: number): SurfaceBox {
  return {
    top: doc.top - scrollY,
    left: doc.left - (typeof window !== 'undefined' ? window.scrollX : 0),
    width: doc.width,
    height: doc.height,
  }
}

/**
 * ScrollY where ScrollTrigger end `center center` on `section` fires
 * (section center aligned with viewport center).
 */
export function scrollYForCenterCenter(section: HTMLElement): number {
  const top = section.getBoundingClientRect().top + window.scrollY
  return top + section.offsetHeight / 2 - window.innerHeight / 2
}

/** Viewport box (for position:fixed) */
export function readBox(el: HTMLElement | null | undefined): SurfaceBox | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return null
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  }
}

/** Document-space box — stable while scrolling */
export function readDocBox(el: HTMLElement | null | undefined): SurfaceBox | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return null
  return {
    top: r.top + window.scrollY,
    left: r.left + window.scrollX,
    width: r.width,
    height: r.height,
  }
}

export function docToViewport(box: SurfaceBox): SurfaceBox {
  return {
    top: box.top - window.scrollY,
    left: box.left - window.scrollX,
    width: box.width,
    height: box.height,
  }
}

export function applyBox(el: HTMLElement, box: SurfaceBox) {
  el.style.top = `${box.top}px`
  el.style.left = `${box.left}px`
  el.style.width = `${box.width}px`
  el.style.height = `${box.height}px`
  el.style.transform = ''
  el.style.transformOrigin = ''
}

/**
 * Compositor-friendly morph paint: fixed basis size + translate/scale.
 * Avoids per-frame width/height layout thrash on mobile scroll morph.
 */
export function applyBoxTransform(
  el: HTMLElement,
  box: SurfaceBox,
  basis: SurfaceBox,
) {
  const bw = Math.max(1, basis.width)
  const bh = Math.max(1, basis.height)
  el.style.top = '0px'
  el.style.left = '0px'
  el.style.width = `${bw}px`
  el.style.height = `${bh}px`
  el.style.transformOrigin = '0 0'
  el.style.transform = `translate3d(${box.left}px, ${box.top}px, 0) scale(${box.width / bw}, ${box.height / bh})`
}

/**
 * Translate an absolute SVG path (M/C/L/Z …) by (dx, dy).
 * Used so a surface-local living path can clip a stable hero-sized stage.
 */
export function offsetAbsolutePathD(d: string, dx: number, dy: number): string {
  return transformAbsolutePathD(d, (x, y) => [x + dx, y + dy])
}

/** Scale absolute path coords (e.g. stretch a surface clip taller). */
export function scaleAbsolutePathD(d: string, sx: number, sy: number): string {
  if (!d || (sx === 1 && sy === 1)) return d
  return transformAbsolutePathD(d, (x, y) => [x * sx, y * sy])
}

function transformAbsolutePathD(
  d: string,
  map: (x: number, y: number) => [number, number],
): string {
  if (!d) return d
  const tokens = d.trim().split(/[\s,]+/)
  const out: string[] = []
  let mode = ''
  let pair = 0
  let pendingX: number | null = null

  for (const token of tokens) {
    if (/^[A-Za-z]$/.test(token)) {
      mode = token
      pair = 0
      pendingX = null
      out.push(token)
      continue
    }
    const n = Number(token)
    if (!Number.isFinite(n)) {
      out.push(token)
      continue
    }
    const upper = mode.toUpperCase()
    if (upper === 'H') {
      const [x] = map(n, 0)
      out.push(String(x))
      continue
    }
    if (upper === 'V') {
      const [, y] = map(0, n)
      out.push(String(y))
      continue
    }
    if (upper === 'Z') {
      out.push(token)
      continue
    }
    if (pair % 2 === 0) {
      pendingX = n
    } else if (pendingX !== null) {
      const [x, y] = map(pendingX, n)
      out.push(String(x), String(y))
      pendingX = null
    }
    pair += 1
  }

  return out.join(' ')
}
