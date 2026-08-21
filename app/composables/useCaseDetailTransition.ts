export type CaseDetailTransitionRequest = {
  direction: 'open' | 'close'
  /** A browser-history return keeps its original entry instead of pushing one. */
  historyBack?: boolean
  to: string
  src: string
  alt: string
  wash: string
  rect?: { top: number; left: number; width: number; height: number }
  targetSelector?: string
}

export type CaseDetailOrigin = 'home' | 'projects'

export function useCaseDetailTransition() {
  const request = useState<CaseDetailTransitionRequest | null>(
    'case-detail-transition-request',
    () => null,
  )
  const active = useState('case-detail-transition-active', () => false)
  const origin = useState<CaseDetailOrigin>('case-detail-origin', () => 'home')
  const homeCaseId = useState('home-active-case-id', () => 'audience')
  /** Detail content stays staged behind the fullscreen transition until it ends. */
  const detailContentVisible = useState('case-detail-content-visible', () => true)

  function openCaseDetail(next: Omit<CaseDetailTransitionRequest, 'direction'> & { origin: CaseDetailOrigin }) {
    if (active.value) return
    origin.value = next.origin
    if (next.origin === 'home') homeCaseId.value = next.to.split('/').at(-1) ?? homeCaseId.value
    detailContentVisible.value = false
    request.value = { ...next, direction: 'open' }
  }

  function closeCaseDetail(next: Omit<CaseDetailTransitionRequest, 'direction' | 'to' | 'targetSelector'>) {
    if (active.value) return
    const returningHome = origin.value === 'home'
    request.value = {
      ...next,
      direction: 'close',
      to: returningHome ? '/#cases' : '/projects',
      targetSelector: returningHome
        ? `[data-case-media="${next.src}"]`
        : `[data-case-cover="${next.src}"]`,
    }
  }

  return { request, active, origin, homeCaseId, detailContentVisible, openCaseDetail, closeCaseDetail }
}
