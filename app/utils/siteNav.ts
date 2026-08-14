/** Primary site routes + Page Canvas frames (spec §9.2). */

export type SiteNavFrameKind = 'page'

export interface SiteNavFrame {
  id: string
  kind: SiteNavFrameKind
  /** Route for page frames. */
  to: string
  label: string
  blurb: string
  /** Display index in canvas (01…). */
  index: string
  /** Preview motif class key for CSS miniature. */
  motif: 'home' | 'projects' | 'services' | 'about' | 'contact'
}

/** Header shortcuts (subset). */
export const headerLinks = [
  { label: 'кейсы', to: '/projects' },
  { label: 'услуги', to: '/services' },
  { label: 'контакт', to: '/contact' },
] as const

/** Full Page Canvas layout — 2 per row on desktop. Equal tile size. */
export const canvasFrames: SiteNavFrame[] = [
  {
    id: 'home',
    kind: 'page',
    to: '/',
    label: 'Главная',
    blurb: 'Позиционирование и первый экран',
    index: '01',
    motif: 'home',
  },
  {
    id: 'projects',
    kind: 'page',
    to: '/projects',
    label: 'Проекты',
    blurb: 'Каталог кейсов',
    index: '02',
    motif: 'projects',
  },
  {
    id: 'services',
    kind: 'page',
    to: '/services',
    label: 'Услуги',
    blurb: 'Форматы работы под ключ',
    index: '03',
    motif: 'services',
  },
  {
    id: 'about',
    kind: 'page',
    to: '/about',
    label: 'О Kado',
    blurb: 'Студия, подход, автор',
    index: '04',
    motif: 'about',
  },
  {
    id: 'contact',
    kind: 'page',
    to: '/contact',
    label: 'Контакты',
    blurb: 'Обсудить проект',
    index: '05',
    motif: 'contact',
  },
]

export function matchFramePath(path: string): string {
  const clean = path.replace(/\/+$/, '') || '/'
  if (clean === '/') return 'home'
  const hit = canvasFrames.find((f) => f.to !== '/' && clean.startsWith(f.to))
  return hit?.id ?? 'home'
}
