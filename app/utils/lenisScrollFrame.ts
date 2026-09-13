export type LenisScrollFrameListener = (scrollY: number) => void

const listeners = new Set<LenisScrollFrameListener>()
let sourceConnected = false

/** True while the desktop Lenis instance owns scroll-frame publication. */
export function isLenisScrollFrameConnected() {
  return sourceConnected
}

export function setLenisScrollFrameConnected(connected: boolean) {
  sourceConnected = connected
}

/** Publish after Lenis has applied this frame's scroll position. */
export function publishLenisScrollFrame(scrollY: number) {
  listeners.forEach(listener => listener(scrollY))
}

export function subscribeLenisScrollFrame(listener: LenisScrollFrameListener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
