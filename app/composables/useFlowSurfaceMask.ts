import { reactive } from 'vue'

/**
 * Living surface path (surface-local coords) + live viewport box.
 * `clipPath` is the shared CSS string: surface window + hero shell apply it 1:1.
 */
export const flowSurfaceMask = reactive({
  path: '',
  /** Same CSS clip string surface + hero apply — single silhouette. */
  clipPath: '',
  openTopPath: '',
  width: 1,
  height: 1,
  top: 0,
  left: 0,
  /** 0 = hero frame, 1 = fully morphed away */
  morph: 0,
  /** Cursor dent — host turns this off during morph / kado */
  pointerInteractive: true,
})

export type FlowSurfaceBox = {
  top: number
  left: number
  width: number
  height: number
}

/** FlowSurface rebuilds path for an explicit box (same frame as host applyBox). */
let pathFlush: ((box?: FlowSurfaceBox) => void) | null = null
/** HomeHero writes clip-path imperatively — Vue :style lags a frame behind surface. */
let heroClipFlush: ((mode?: 'full' | 'path') => void) | null = null

export function registerFlowSurfacePathFlush(fn: ((box?: FlowSurfaceBox) => void) | null) {
  pathFlush = fn
}

export function flushFlowSurfacePath(box?: FlowSurfaceBox) {
  pathFlush?.(box)
}

export function registerHeroClipFlush(fn: ((mode?: 'full' | 'path') => void) | null) {
  heroClipFlush = fn
}

/** `path` = living silhouette only (cheap); `full` = box + content layout. */
export function flushHeroClip(mode: 'full' | 'path' = 'full') {
  heroClipFlush?.(mode)
}

export function useFlowSurfaceMask() {
  return flowSurfaceMask
}
