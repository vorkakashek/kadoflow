export type MotionScrollDirection = -1 | 0 | 1

type MotionRuntimeState = {
  scrollY: number
  scrollDelta: number
  scrollDirection: MotionScrollDirection
  scrollRevision: number
  resizeRevision: number
  documentVisible: boolean
}

/**
 * Read-only viewport snapshot shared by motion features.
 * The client plugin is the only owner of browser listeners and commits at most
 * one reactive update per animation frame.
 */
export function useMotionRuntime() {
  const state = useState<MotionRuntimeState>('motion-runtime', () => ({
    scrollY: 0,
    scrollDelta: 0,
    scrollDirection: 0,
    scrollRevision: 0,
    resizeRevision: 0,
    documentVisible: true,
  }))

  const scrollY = computed(() => state.value.scrollY)
  const scrollDelta = computed(() => state.value.scrollDelta)
  const scrollDirection = computed(() => state.value.scrollDirection)
  const scrollRevision = computed(() => state.value.scrollRevision)
  const resizeRevision = computed(() => state.value.resizeRevision)
  const documentVisible = computed(() => state.value.documentVisible)

  function commitScroll(nextY: number) {
    const y = Math.max(0, nextY)
    const delta = y - state.value.scrollY
    state.value.scrollY = y
    state.value.scrollDelta = delta
    state.value.scrollDirection = delta > 0.5 ? 1 : delta < -0.5 ? -1 : 0
    state.value.scrollRevision += 1
  }

  function commitResize() {
    state.value.resizeRevision += 1
  }

  function setDocumentVisible(visible: boolean) {
    state.value.documentVisible = visible
  }

  return {
    scrollY,
    scrollDelta,
    scrollDirection,
    scrollRevision,
    resizeRevision,
    documentVisible,
    commitScroll,
    commitResize,
    setDocumentVisible,
  }
}
