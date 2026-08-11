import { reactive } from 'vue'

/** One SVG clipPath for the whole surface window (stone + hero content). */
export const FLOW_SURFACE_CLIP_ID = 'flow-surface-clip'
export const FLOW_SURFACE_CLIP_CSS = `url(#${FLOW_SURFACE_CLIP_ID})`

/**
 * Living surface path + viewport box.
 * Hero visuals mount inside the clipped window — one clip, no dual masks.
 */
export const flowSurfaceMask = reactive({
  path: '',
  clipPath: '',
  openTopPath: '',
  width: 1,
  height: 1,
  top: 0,
  left: 0,
  /** 0 = hero frame, 1 = fully morphed away */
  morph: 0,
  pointerInteractive: true,
  /**
   * When true, path rebuild skips roam/pointer (static silhouette).
   * Set while WebGL+copy are mounted — living clip under canvas kills FPS.
   */
  freezeSilhouette: false,
})

export type FlowSurfaceBox = {
  top: number
  left: number
  width: number
  height: number
}

let pathFlush: ((box?: FlowSurfaceBox) => void) | null = null
let clipPathEl: SVGPathElement | null = null

export function registerFlowSurfacePathFlush(fn: ((box?: FlowSurfaceBox) => void) | null) {
  pathFlush = fn
}

export function flushFlowSurfacePath(box?: FlowSurfaceBox) {
  pathFlush?.(box)
}

export function registerFlowSurfaceClipPathEl(el: SVGPathElement | null) {
  clipPathEl = el
  if (el && flowSurfaceMask.path) el.setAttribute('d', flowSurfaceMask.path)
}

export function publishFlowSurfacePath(d: string) {
  flowSurfaceMask.path = d
  flowSurfaceMask.clipPath = d ? FLOW_SURFACE_CLIP_CSS : ''
  if (clipPathEl) {
    if (d) clipPathEl.setAttribute('d', d)
    else clipPathEl.removeAttribute('d')
  }
}

export function useFlowSurfaceMask() {
  return flowSurfaceMask
}
