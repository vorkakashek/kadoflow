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
  /** Preview motif class key for CSS miniature (fallback if shot missing). */
  motif: 'home' | 'projects' | 'services' | 'about' | 'contact'
  /** Static color viewport shot (desktop). */
  preview: string
  /** Baked grayscale sibling — no CSS filter on the tile. */
  previewBw: string
  /** Phone viewport color shot — used on thumb tiles, not a crop of `preview`. */
  previewM: string
  /** Baked grayscale sibling for `previewM`. */
  previewMBw: string
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
    preview: '/previews/home.jpg',
    previewBw: '/previews/home-bw.jpg',
    previewM: '/previews/home-m.jpg',
    previewMBw: '/previews/home-m-bw.jpg',
  },
  {
    id: 'projects',
    kind: 'page',
    to: '/projects',
    label: 'Проекты',
    blurb: 'Каталог кейсов',
    index: '02',
    motif: 'projects',
    preview: '/previews/projects.jpg',
    previewBw: '/previews/projects-bw.jpg',
    previewM: '/previews/projects-m.jpg',
    previewMBw: '/previews/projects-m-bw.jpg',
  },
  {
    id: 'services',
    kind: 'page',
    to: '/services',
    label: 'Услуги',
    blurb: 'Форматы работы под ключ',
    index: '03',
    motif: 'services',
    preview: '/previews/services.jpg',
    previewBw: '/previews/services-bw.jpg',
    previewM: '/previews/services-m.jpg',
    previewMBw: '/previews/services-m-bw.jpg',
  },
  {
    id: 'about',
    kind: 'page',
    to: '/about',
    label: 'О Kado',
    blurb: 'Студия, подход, автор',
    index: '04',
    motif: 'about',
    preview: '/previews/about.jpg',
    previewBw: '/previews/about-bw.jpg',
    previewM: '/previews/about-m.jpg',
    previewMBw: '/previews/about-m-bw.jpg',
  },
  {
    id: 'contact',
    kind: 'page',
    to: '/contact',
    label: 'Контакты',
    blurb: 'Обсудить проект',
    index: '05',
    motif: 'contact',
    preview: '/previews/contact.jpg',
    previewBw: '/previews/contact-bw.jpg',
    previewM: '/previews/contact-m.jpg',
    previewMBw: '/previews/contact-m-bw.jpg',
  },
]

export function matchFramePath(path: string): string {
  const clean = path.replace(/\/+$/, '') || '/'
  if (clean === '/') return 'home'
  const hit = canvasFrames.find((f) => f.to !== '/' && clean.startsWith(f.to))
  return hit?.id ?? 'home'
}
