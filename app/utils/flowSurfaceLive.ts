import { flowSurfaceMask } from '~/composables/useFlowSurfaceMask'

/**
 * Living-edge segments for the flow surface.
 * Flip `pointer` / `roam` here to arm cursor dent or the perimeter wave
 * on a stretch without hunting through the morph host.
 *
 * - hero: first screen, rest pose
 * - transit: after hero, until the second block settles
 * - kado: second block and further
 */
export type FlowSurfaceLiveId = 'hero' | 'transit' | 'kado'

export type FlowSurfaceLiveFlags = {
  pointer: boolean
  roam: boolean
}

export const FLOW_SURFACE_LIVE: Record<FlowSurfaceLiveId, FlowSurfaceLiveFlags> = {
  hero: { pointer: true, roam: true },
  transit: { pointer: false, roam: false },
  kado: { pointer: false, roam: false },
}

export function flowSurfaceLiveFromMorph(
  morph: number,
  idleEps = 0.02,
): FlowSurfaceLiveId {
  if (morph < idleEps) return 'hero'
  if (morph > 1 - idleEps) return 'kado'
  return 'transit'
}

export function applyFlowSurfaceLive(id: FlowSurfaceLiveId) {
  const flags = FLOW_SURFACE_LIVE[id]
  flowSurfaceMask.liveId = id
  flowSurfaceMask.pointerInteractive = flags.pointer
  flowSurfaceMask.roamActive = flags.roam
}
