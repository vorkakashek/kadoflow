/**
 * Home cases — single-viewport switcher (list + stage).
 */
export type HomeCase = {
  id: string
  /** Left rail pill label. */
  label: string
  /** Large stage title. */
  title: string
  /** Short description under focus tags (≈2 lines). */
  blurb: string
  /** Top-right tags (mood / focus). */
  focusTags: string[]
  /** Bottom-right tags (role / scope). */
  roleTags: string[]
  /** Page / section wash color. */
  wash: string
  /** Optional full-bleed pattern / photo behind the case. */
  bgImage?: string
  /** Light text on dark washes. */
  inverse?: boolean
  media: {
    src: string
    alt: string
    /** Portrait mockups stay tall; landscape can sit wider later. */
    orientation?: 'portrait' | 'landscape'
    /** Width in 12-col layout spans (uses `--layout-span-N`). */
    cols?: 2 | 3 | 4 | 5 | 6
  }
}

export const homeCases: HomeCase[] = [
  {
    id: 'audience',
    label: 'Audience',
    title: 'Audience',
    blurb: 'Цифровое расширение пространства\nв японской эстетике.',
    focusTags: ['тишина', 'ритм', 'японская пластика'],
    roleTags: ['арт-дирекция', 'UX/UI-дизайн', 'под ключ'],
    wash: '#0a0a0a',
    bgImage: '/home/cases/case-bg-audience.png',
    inverse: true,
    media: {
      src: '/home/cases/audience-img.png',
      alt: 'Audience — мобильный мокап сайта',
      orientation: 'portrait',
      cols: 3,
    },
  },
  {
    id: 'keys-store',
    label: 'Keys Store',
    title: 'Keys Store',
    blurb: 'Игры, подписки и Steam-предметы\nв единой торговой системе.',
    focusTags: ['система', 'скорость', 'доверие'],
    roleTags: ['дизайн-система', 'адаптивный веб', 'под ключ'],
    wash: '#3f2b95',
    inverse: true,
    media: {
      src: '/home/cases/keys-1.png',
      alt: 'Keys Store — витрина',
      orientation: 'portrait',
    },
  },
  {
    id: 'baltika',
    label: 'Балтика Brew',
    title: 'Балтика Brew',
    blurb: 'Одна форма, несколько характеров —\nраскрытых через движение.',
    focusTags: ['объект', 'движение', 'трансформация'],
    roleTags: ['веб-дизайн', '3D-графика', 'анимация'],
    wash: 'var(--palette-milk)',
    media: {
      src: '/home/cases/baltika.png',
      alt: 'Балтика Brew — продукт',
      orientation: 'portrait',
    },
  },
  {
    id: 'schmidt',
    label: 'SCHMIDT',
    title: 'SCHMIDT',
    blurb: 'История премиального продукта,\nвыстроенная в горизонтальном ритме.',
    focusTags: ['ритм', 'контраст', 'материальность'],
    roleTags: ['арт-дирекция', 'веб-дизайн', 'фронтенд'],
    wash: '#ffffff',
    media: {
      src: '/home/cases/schmidt.png',
      alt: 'SCHMIDT — премиальная водка',
      orientation: 'landscape',
    },
  },
]

export function homeCaseBackground(item: HomeCase): string {
  if (item.bgImage) {
    return `${item.wash} url(${item.bgImage}) center / cover no-repeat`
  }
  return item.wash
}
