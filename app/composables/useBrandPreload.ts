/**
 * Global brand preloader gate — scene asset progress + ready flags.
 * Displayed % is time-smoothed; never snaps to 99 until the exit beat asks for it.
 */
const SEEN_KEY = 'kf-preload-seen'

const rawProgress = ref(0)
const displayProgress = ref(0)
const sceneProgress = ref(0)
const fontsReady = ref(false)
const sceneReady = ref(false)
const minOrbitDone = ref(false)
const revealed = ref(false)
const active = ref(true)
/** Exit beat may drive display the rest of the way to 99. */
const finishing = ref(false)
/**
 * 0–1 iris hole progress during exit — FlowSurface / hero can sync a soft intro.
 */
const revealT = ref(0)
/** True when this browser already finished a brand reveal (warm / repeat visit). */
const repeatVisit = ref(false)

let crawlTimer: ReturnType<typeof setInterval> | null = null
let safetyTimer: ReturnType<typeof setTimeout> | null = null
let began = false
let loadStartedAt = 0

/** Typical first-visit scene budget (ms) — drives the time curve (not a hard wait). */
const EXPECTED_LOAD_MS = 1200
/** Cached revisit — progress curve shouldn't invent a long wait. */
const EXPECTED_LOAD_MS_REPEAT = 450
/** Soft ceiling until exit — avoids the 93→99 slam. */
const PRE_EXIT_CAP = 0.9

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n))
}

function readRepeatVisit() {
  if (!import.meta.client) return false
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeRepeatVisit() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* private mode / quota */
  }
  repeatVisit.value = true
}

function expectedLoadMs() {
  return repeatVisit.value ? EXPECTED_LOAD_MS_REPEAT : EXPECTED_LOAD_MS
}

function recomputeRaw() {
  const elapsed = import.meta.client
    ? Math.max(0, performance.now() - loadStartedAt)
    : 0
  const timeGuess = 1 - Math.exp(-elapsed / expectedLoadMs())

  const asset = sceneProgress.value * 0.78 + (fontsReady.value ? 0.07 : 0)
  let mixed = Math.max(asset, timeGuess * 0.72)
  mixed = Math.max(mixed, Math.min(timeGuess, asset + 0.2))

  if (!finishing.value) {
    mixed = Math.min(mixed, PRE_EXIT_CAP)
  }

  rawProgress.value = clamp01(Math.max(rawProgress.value, mixed))
}

function tickDisplay() {
  if (!active.value && revealed.value) return
  const target = finishing.value ? 1 : Math.min(rawProgress.value, PRE_EXIT_CAP)
  const cur = displayProgress.value
  const gap = target - cur
  if (gap <= 0.0004) {
    displayProgress.value = target
    return
  }
  // Repeat visits crawl the odometer faster; exit finish stays snappy.
  const maxStep = finishing.value
    ? 0.012
    : repeatVisit.value
      ? 0.028
      : 0.01
  const k = finishing.value ? 0.08 : repeatVisit.value ? 0.22 : 0.1
  displayProgress.value = clamp01(cur + Math.min(gap * k, maxStep))
}

function startCrawl() {
  if (crawlTimer || !import.meta.client) return
  crawlTimer = setInterval(() => {
    if (!active.value) {
      stopCrawl()
      return
    }
    if (!sceneReady.value && sceneProgress.value < 0.22) {
      sceneProgress.value = clamp01(sceneProgress.value + 0.003)
    }
    recomputeRaw()
    tickDisplay()
  }, 50)
}

function stopCrawl() {
  if (!crawlTimer) return
  clearInterval(crawlTimer)
  crawlTimer = null
}

export function useBrandPreload() {
  function setSceneProgress(p: number) {
    sceneProgress.value = clamp01(Math.max(sceneProgress.value, p))
    recomputeRaw()
  }

  function markSceneReady() {
    sceneReady.value = true
    sceneProgress.value = 1
    recomputeRaw()
  }

  function markFontsReady() {
    fontsReady.value = true
    recomputeRaw()
  }

  function markMinOrbitDone() {
    minOrbitDone.value = true
  }

  function beginFinish() {
    finishing.value = true
    // Stop the 50ms crawl — mid-exit mobile hitches from timer+Vue wakeups.
    stopCrawl()
    recomputeRaw()
    tickDisplay()
  }

  function setRevealT(t: number) {
    revealT.value = clamp01(t)
  }

  function setDisplayProgress(p: number) {
    displayProgress.value = clamp01(p)
    rawProgress.value = Math.max(rawProgress.value, displayProgress.value)
  }

  function markRevealed() {
    revealed.value = true
    active.value = false
    revealT.value = 1
    writeRepeatVisit()
    stopCrawl()
    if (safetyTimer) {
      clearTimeout(safetyTimer)
      safetyTimer = null
    }
    if (import.meta.client) {
      document.documentElement.classList.remove('preload-lock')
    }
  }

  function begin() {
    if (!import.meta.client) return
    repeatVisit.value = readRepeatVisit()
    if (began && (revealed.value || !active.value)) {
      revealed.value = false
      active.value = true
      minOrbitDone.value = false
      finishing.value = false
      revealT.value = 0
      rawProgress.value = sceneReady.value ? 0.28 : 0
      displayProgress.value = 0
      if (!sceneReady.value) sceneProgress.value = Math.min(sceneProgress.value, 0.12)
    }
    began = true
    loadStartedAt = performance.now()
    document.documentElement.classList.add('preload-lock')
    startCrawl()
    const fonts = document.fonts
    if (!fonts?.ready) markFontsReady()
    else {
      void fonts.ready.then(() => markFontsReady())
      // Don't block exit if a webfont never settles (common on flaky mobile nets).
      window.setTimeout(() => markFontsReady(), 2500)
    }
    if (safetyTimer) clearTimeout(safetyTimer)
    // Soft unlock: stub routes never mount HeroSwarm — don't sit until hard safety.
    window.setTimeout(() => {
      if (!sceneReady.value && sceneProgress.value < 0.2) markSceneReady()
    }, repeatVisit.value ? 400 : 1200)
    safetyTimer = setTimeout(() => {
      if (!sceneReady.value) markSceneReady()
      markFontsReady()
    }, repeatVisit.value ? 2000 : 4500)
    recomputeRaw()
  }

  const canExit = computed(() => sceneReady.value && fontsReady.value)

  const progress = computed(() => displayProgress.value)

  const displayPercent = computed(() =>
    Math.min(99, Math.floor(displayProgress.value * 99 + 1e-6)),
  )

  return {
    progress,
    displayPercent,
    sceneReady: readonly(sceneReady),
    fontsReady: readonly(fontsReady),
    minOrbitDone: readonly(minOrbitDone),
    revealed: readonly(revealed),
    active: readonly(active),
    finishing: readonly(finishing),
    revealT: readonly(revealT),
    repeatVisit: readonly(repeatVisit),
    canExit,
    setSceneProgress,
    setDisplayProgress,
    setRevealT,
    beginFinish,
    markSceneReady,
    markFontsReady,
    markMinOrbitDone,
    markRevealed,
    begin,
  }
}
