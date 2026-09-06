export type HomeFlowPhase =
  | 'hero'
  | 'corridor'
  | 'cases-entering'
  | 'cases-docked'
  | 'cases-returning'

export type HomeCasePhase = 'idle' | 'switching'
export type HomeRoutePhase = 'idle' | 'opening-detail' | 'detail' | 'returning-home'

export type HomeExperiencePhase =
  | HomeFlowPhase
  | 'case-switching'
  | 'detail-opening'
  | 'detail-open'
  | 'detail-returning'

type HomeExperienceState = {
  activeCaseId: string
  caseInverse: boolean
  flowPhase: HomeFlowPhase
  casePhase: HomeCasePhase
  routePhase: HomeRoutePhase
  surfaceDocked: boolean
  surfaceReturning: boolean
  surfaceReady: boolean
  caseMediaVisible: boolean
  homeReturnSurfacePending: boolean
  homeReturnMediaDocked: boolean
}

/**
 * The single coordination boundary for the home experience.
 *
 * Components still own their rendering and timelines, but they no longer
 * communicate by mutating a loose collection of global booleans and nonce
 * refs. Every cross-feature transition is named here, so invalid ownership
 * combinations can be removed without changing the visual implementation.
 */
export function useHomeExperience() {
  const state = useState<HomeExperienceState>('home-experience', () => ({
    activeCaseId: 'audience',
    caseInverse: false,
    flowPhase: 'hero',
    casePhase: 'idle',
    routePhase: 'idle',
    surfaceDocked: false,
    surfaceReturning: false,
    surfaceReady: false,
    caseMediaVisible: false,
    homeReturnSurfacePending: false,
    homeReturnMediaDocked: false,
  }))

  const activeCaseId = computed(() => state.value.activeCaseId)
  const caseInverse = computed(() => state.value.caseInverse)
  const flowPhase = computed(() => state.value.flowPhase)
  const casePhase = computed(() => state.value.casePhase)
  const routePhase = computed(() => state.value.routePhase)
  const surfaceDocked = computed(() => state.value.surfaceDocked)
  const surfaceReturning = computed(() => state.value.surfaceReturning)
  const surfaceReady = computed(() => state.value.surfaceReady)
  const caseMediaVisible = computed(() => state.value.caseMediaVisible)
  const homeReturnPending = computed(() => state.value.homeReturnSurfacePending)
  const homeReturnMediaDocked = computed(() => state.value.homeReturnMediaDocked)
  const phase = computed<HomeExperiencePhase>(() => {
    if (state.value.routePhase === 'opening-detail') return 'detail-opening'
    if (state.value.routePhase === 'detail') return 'detail-open'
    if (state.value.routePhase === 'returning-home') return 'detail-returning'
    if (state.value.casePhase === 'switching') return 'case-switching'
    return state.value.flowPhase
  })

  function selectCase(id: string, inverse = state.value.caseInverse) {
    state.value.activeCaseId = id
    state.value.caseInverse = inverse
  }

  function setCaseInverse(inverse: boolean) {
    state.value.caseInverse = inverse
  }

  function beginCaseSwitch() {
    state.value.casePhase = 'switching'
  }

  function completeCaseSwitch() {
    state.value.casePhase = 'idle'
  }

  function beginCasesEntry() {
    if (!state.value.surfaceReturning && !state.value.surfaceDocked) {
      state.value.flowPhase = 'cases-entering'
    }
  }

  function setSurfaceDocked(docked: boolean) {
    state.value.surfaceDocked = docked
    if (docked) {
      if (!state.value.surfaceReturning) state.value.flowPhase = 'cases-docked'
      return
    }
    if (
      !state.value.surfaceReturning
      && state.value.flowPhase !== 'cases-entering'
    ) {
      state.value.flowPhase = 'corridor'
    }
    state.value.surfaceReady = false
  }

  function setSurfaceReady(ready: boolean) {
    state.value.surfaceReady = ready
  }

  function setCaseMediaVisible(visible: boolean) {
    state.value.caseMediaVisible = visible
  }

  function setSurfaceReturning(returning: boolean) {
    state.value.surfaceReturning = returning
    if (returning) {
      state.value.flowPhase = 'cases-returning'
      state.value.surfaceReady = false
      return
    }
    state.value.flowPhase = state.value.surfaceDocked
      ? 'cases-docked'
      : 'corridor'
  }

  function beginDetailOpen(caseId: string) {
    state.value.activeCaseId = caseId
    state.value.routePhase = 'opening-detail'
    state.value.homeReturnSurfacePending = false
    state.value.homeReturnMediaDocked = false
  }

  function completeDetailOpen() {
    if (state.value.routePhase === 'opening-detail') {
      state.value.routePhase = 'detail'
    }
  }

  function beginDetailReturn() {
    state.value.routePhase = 'returning-home'
    state.value.homeReturnSurfacePending = true
    state.value.homeReturnMediaDocked = false
  }

  function consumeHomeReturnSurface() {
    state.value.homeReturnSurfacePending = false
  }

  function markHomeReturnMediaDocked() {
    if (state.value.routePhase === 'returning-home') {
      state.value.homeReturnMediaDocked = true
    }
  }

  function completeDetailReturn() {
    state.value.routePhase = 'idle'
    state.value.homeReturnSurfacePending = false
    state.value.homeReturnMediaDocked = false
  }

  return {
    phase,
    flowPhase,
    casePhase,
    routePhase,
    activeCaseId,
    caseInverse,
    surfaceDocked,
    surfaceReturning,
    surfaceReady,
    caseMediaVisible,
    homeReturnPending,
    homeReturnMediaDocked,
    selectCase,
    setCaseInverse,
    beginCaseSwitch,
    completeCaseSwitch,
    beginCasesEntry,
    setSurfaceDocked,
    setSurfaceReady,
    setCaseMediaVisible,
    setSurfaceReturning,
    beginDetailOpen,
    completeDetailOpen,
    beginDetailReturn,
    consumeHomeReturnSurface,
    markHomeReturnMediaDocked,
    completeDetailReturn,
  }
}
