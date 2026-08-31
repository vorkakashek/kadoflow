export type MotionPreference = 'full' | 'minimal'

const STORAGE_KEY = 'kadoflow-motion'
const CHANGE_EVENT = 'kadoflow:motion-change'

function storedPreference(): MotionPreference {
  if (!import.meta.client) return 'full'
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'minimal' || stored === 'full') return stored
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'minimal'
      : 'full'
  } catch {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'minimal'
      : 'full'
  }
}

function applyPreference(mode: MotionPreference) {
  if (!import.meta.client) return
  document.documentElement.dataset.motion = mode
}

export function isMinimalMotionPreferred() {
  if (!import.meta.client) return false
  const applied = document.documentElement.dataset.motion
  if (applied === 'minimal' || applied === 'full') return applied === 'minimal'
  return storedPreference() === 'minimal'
}

export function useMotionPreference() {
  const mode = useState<MotionPreference>('motion-preference', () => 'full')
  const hydrated = useState<boolean>('motion-preference-hydrated', () => false)
  const minimal = computed(() => mode.value === 'minimal')

  function hydrate() {
    if (!import.meta.client || hydrated.value) return
    hydrated.value = true
    mode.value = storedPreference()
    applyPreference(mode.value)
  }

  function setMode(next: MotionPreference) {
    if (mode.value === next && hydrated.value) return
    mode.value = next
    hydrated.value = true
    applyPreference(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* private mode / quota */
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { mode: next } }))
  }

  return {
    mode: readonly(mode),
    minimal,
    hydrate,
    setMode,
  }
}

export const MOTION_PREFERENCE_CHANGE_EVENT = CHANGE_EVENT
