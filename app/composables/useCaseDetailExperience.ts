export type CaseDetailExperiencePhase =
  | 'idle'
  | 'entry-covered'
  | 'active'
  | 'exit-covered'

type CaseDetailExperienceState = {
  caseId: string | null
  phase: CaseDetailExperiencePhase
  pageMounted: boolean
  contentVisible: boolean
}

/**
 * Owns the lifecycle shared by a case page, its fullscreen route cover and
 * optional motion enhancements. Rendering remains local to each component;
 * this composable decides when those components are allowed to run.
 */
export function useCaseDetailExperience() {
  const state = useState<CaseDetailExperienceState>('case-detail-experience', () => ({
    caseId: null,
    phase: 'idle',
    pageMounted: false,
    contentVisible: true,
  }))
  const { documentVisible } = useMotionRuntime()
  const {
    open: pageCanvasOpen,
    busy: pageCanvasBusy,
    surfaceOn: pageCanvasSurfaceOn,
    irisLive,
    pageIrisLive,
  } = usePageCanvas()

  const caseId = computed(() => state.value.caseId)
  const phase = computed(() => state.value.phase)
  const pageMounted = computed(() => state.value.pageMounted)
  const contentVisible = computed(() => state.value.contentVisible)
  const motionActive = computed(() => (
    state.value.pageMounted
    && state.value.phase === 'active'
    && documentVisible.value
    && !pageCanvasOpen.value
    && !pageCanvasBusy.value
    && !pageCanvasSurfaceOn.value
    && !irisLive.value
    && !pageIrisLive.value
  ))

  function beginTransitionEntry(nextCaseId: string) {
    state.value.caseId = nextCaseId
    state.value.phase = 'entry-covered'
    state.value.contentVisible = false
  }

  function stageDirectEntry(nextCaseId: string) {
    state.value.caseId = nextCaseId
    state.value.phase = 'entry-covered'
    state.value.contentVisible = false
  }

  function mountPage(nextCaseId: string) {
    state.value.caseId = nextCaseId
    state.value.pageMounted = true
  }

  function revealContent() {
    state.value.contentVisible = true
  }

  function completeEntry() {
    state.value.contentVisible = true
    state.value.phase = 'active'
  }

  function beginExit() {
    state.value.phase = 'exit-covered'
  }

  function unmountPage() {
    state.value.pageMounted = false
    if (state.value.phase !== 'exit-covered') {
      state.value.phase = 'idle'
      state.value.caseId = null
      state.value.contentVisible = true
    }
  }

  function completeExit() {
    state.value.pageMounted = false
    state.value.phase = 'idle'
    state.value.caseId = null
    state.value.contentVisible = true
  }

  return {
    caseId,
    phase,
    pageMounted,
    contentVisible,
    motionActive,
    beginTransitionEntry,
    stageDirectEntry,
    mountPage,
    revealContent,
    completeEntry,
    beginExit,
    unmountPage,
    completeExit,
  }
}
