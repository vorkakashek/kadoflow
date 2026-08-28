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
  /** Case-detail metadata; it is intentionally hidden on the home stage. */
  client: string
  year: string
  collaboration?: string
  /** Optional public destination shown in the case-detail metadata. */
  projectUrl?: string
  /** Domain label used for the public destination. */
  projectLabel?: string
  focusTags: string[]
  roleTags: string[]
  /** Page / section wash color. */
  wash: string
  /** Light text on dark washes. */
  inverse?: boolean
  media: {
    src: string
    /** Responsive modern-format candidates; `src` remains the PNG fallback. */
    webpSrcset?: string
    avifSrcset?: string
    alt: string
    /** Intrinsic raster size reserves the final figure geometry before decode. */
    width: number
    height: number
    /** Portrait mockups stay tall; landscape can sit wider later. */
    orientation?: 'portrait' | 'landscape'
    /** Width in 12-col layout spans (uses `--layout-span-N`). */
    cols?: 2 | 3 | 4 | 5 | 6 | 7 | 12
    /** Optional motion treatment for the home case surface. */
    video?: {
      webm: string
      mp4: string
      mobileWebm?: string
      mobileMp4?: string
      poster: string
    }
  }
}

export const homeCases: HomeCase[] = [
  {
    id: 'audience',
    label: 'Audience',
    title: 'Audience',
    client: 'HookahPlace Audience',
    year: '2026',
    blurb: 'Как мы связали айдентику, контент\nи сервисные сценарии в единую\nцифровую систему.',
    focusTags: ['тишина', 'ритм', 'японская пластика'],
    roleTags: ['арт-дирекция', 'UX/UI-дизайн', 'под ключ'],
    projectUrl: 'https://audience.moscow/',
    projectLabel: 'audience.moscow',
    wash: '#0A0501',
    inverse: true,
    media: {
      src: '/home/cases/audience/audience-cover.png',
      webpSrcset: [
        '/home/cases/audience/audience-cover-480.webp 480w',
        '/home/cases/audience/audience-cover-960.webp 960w',
        '/home/cases/audience/audience-cover-1440.webp 1440w',
        '/home/cases/audience/audience-cover-1920.webp 1920w',
        '/home/cases/audience/audience-cover-2560.webp 2560w',
        '/home/cases/audience/audience-cover-3712.webp 3712w',
      ].join(', '),
      avifSrcset: [
        '/home/cases/audience/audience-cover-480.avif 480w',
        '/home/cases/audience/audience-cover-960.avif 960w',
        '/home/cases/audience/audience-cover-1440.avif 1440w',
        '/home/cases/audience/audience-cover-1920.avif 1920w',
        '/home/cases/audience/audience-cover-2560.avif 2560w',
        '/home/cases/audience/audience-cover-3712.avif 3712w',
      ].join(', '),
      alt: 'Audience — мобильный мокап сайта',
      width: 3712,
      height: 4608,
      orientation: 'portrait',
      cols: 5,
    },
  },
  {
    id: 'keys-store',
    label: 'Keys Store',
    title: 'Keys Store',
    client: 'Keys-Store.com',
    year: '2025',
    blurb: 'Единая торговая система, в которой\nмы упаковали игры, подписки\nи Steam-предметы.',
    focusTags: ['система', 'скорость', 'доверие'],
    roleTags: ['логотип', 'UX/UI-дизайн', 'дизайн-система', 'каталоги', 'checkout'],
    projectUrl: 'https://keys-store.com/',
    projectLabel: 'keys-store.com',
    wash: '#3f2b95',
    inverse: true,
    media: {
      src: '/home/cases/keys-store/keys-1.webp',
      alt: 'Keys Store — витрина',
      width: 2079,
      height: 1296,
      orientation: 'portrait',
      cols: 8,
    },
  },
  {
    id: 'baltika',
    label: 'Балтика Brew',
    title: 'Балтика Brew',
    client: 'Балтика',
    year: '2025',
    collaboration: 'BOSON GROUP',
    blurb: 'Об одной форме,\nв которой мы движением\nраскрыли несколько характеров.',
    focusTags: ['объект', 'движение', 'трансформация'],
    roleTags: ['веб-дизайн', '3D-графика', 'анимация'],
    wash: 'var(--palette-milk)',
    media: {
      src: '/home/cases/baltika/baltika-cover.png',
      webpSrcset: [
        '/home/cases/baltika/baltika-cover-480.webp 480w',
        '/home/cases/baltika/baltika-cover-960.webp 960w',
        '/home/cases/baltika/baltika-cover-1440.webp 1440w',
      ].join(', '),
      avifSrcset: [
        '/home/cases/baltika/baltika-cover-480.avif 480w',
        '/home/cases/baltika/baltika-cover-960.avif 960w',
        '/home/cases/baltika/baltika-cover-1440.avif 1440w',
      ].join(', '),
      alt: 'Балтика Brew — продукт',
      width: 1696,
      height: 2528,
      orientation: 'portrait',
      cols: 4,
    },
  },
  {
    id: 'schmidt',
    label: 'SCHMIDT',
    title: 'SCHMIDT',
    client: 'SCHMIDT',
    year: '2024',
    collaboration: 'PAIR GROUP',
    blurb: 'Как мы выстроили историю премиального\nпродукта в горизонтальном ритме.',
    focusTags: ['ритм', 'контраст', 'материальность'],
    roleTags: ['арт-дирекция', 'веб-дизайн', 'фронтенд', 'интерактивная анимация'],
    projectUrl: 'https://schmidtspirits.com/',
    projectLabel: 'schmidtspirits.com',
    wash: '#fafafa',
    media: {
      src: '/home/cases/schmidt/schmidt.webp',
      alt: 'SCHMIDT — премиальная водка',
      width: 2559,
      height: 1437,
      orientation: 'landscape',
      cols: 8,
    },
  },
]

export function homeCaseDetailPath(item: Pick<HomeCase, 'id'>): string {
  return `/projects/${item.id}`
}
