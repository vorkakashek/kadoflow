export type ProjectCaseMedia = {
  src: string
  alt: string
  shape?: 'wide' | 'landscape' | 'portrait' | 'square'
  type?: 'image' | 'video'
  poster?: string
  mobileSrc?: string
  mobilePoster?: string
  webpSrcset?: string
  avifSrcset?: string
  sizes?: string
  aspectRatio?: string
}

export type ProjectCaseSection = {
  id: string
  layout: 'intro' | 'disclosure' | 'gallery' | 'feature' | 'split'
  title: string
  paragraphs: string[]
  media: ProjectCaseMedia[]
  statement?: string
}

export type ProjectCaseDetail = {
  /** Optional case-detail summary; keeps portfolio framing separate from home copy. */
  summary?: string
  /** Optional hero media that is independent from the home-case card. */
  headerMedia?: {
    src: string
    alt: string
    width: number
    height: number
    webpSrcset?: string
    avifSrcset?: string
  }
  sections: ProjectCaseSection[]
  final: string
  closing: ProjectCaseMedia
}

const keysMedia = [
  { src: '/home/cases/keys-store/keys-1.webp', alt: 'Keys Store — витрина направлений', shape: 'portrait' as const },
  { src: '/home/cases/keys-store/keys-2.png', alt: 'Keys Store — каталог цифровых товаров', shape: 'wide' as const },
  { src: '/home/cases/keys-store/keys-3.png', alt: 'Keys Store — карточка и сценарий покупки', shape: 'square' as const },
]

const baltikaResponsiveWidths = [480, 960, 1440, 1920, 2640]

function baltikaResponsiveMedia(
  index: number,
  alt: string,
  shape: NonNullable<ProjectCaseMedia['shape']>,
  sizes: string,
): ProjectCaseMedia {
  const stem = `/home/cases/baltika/baltika-${index}`
  return {
    src: `${stem}.png`,
    alt,
    shape,
    webpSrcset: baltikaResponsiveWidths.map(width => `${stem}-${width}.webp ${width}w`).join(', '),
    avifSrcset: baltikaResponsiveWidths.map(width => `${stem}-${width}.avif ${width}w`).join(', '),
    sizes,
  }
}

const baltikaObjectMedia = baltikaResponsiveMedia(
  1,
  'Балтика Brew — объект в продуктовой сцене',
  'wide',
  '(max-width: 767.98px) 100vw, 42vw',
)

const baltikaObjectDetailMedia = baltikaResponsiveMedia(
  2,
  'Балтика Brew — деталь продуктовой сцены',
  'landscape',
  '(max-width: 767.98px) 100vw, 58vw',
)

const baltikaLabelMedia = baltikaResponsiveMedia(
  3,
  'Балтика Brew — этикетка в визуальной системе',
  'landscape',
  '(max-width: 767.98px) 100vw, 83.333vw',
)

const baltikaMotionMedia = {
  src: '/home/cases/baltika/baltika-motion.mp4',
  mobileSrc: '/home/cases/baltika/baltika-motion-mobile.mp4',
  alt: 'Балтика Brew — движение 3D-сцены',
  shape: 'square' as const,
  type: 'video' as const,
  poster: '/home/cases/baltika/baltika-motion-poster.webp',
  mobilePoster: '/home/cases/baltika/baltika-motion-mobile-poster.webp',
}

const baltikaDataMedia = {
  src: '/home/cases/baltika/baltika-8.png',
  alt: 'Балтика Brew — характеристики продукта',
  shape: 'landscape' as const,
  aspectRatio: '2760 / 2070',
  webpSrcset: ['/home/cases/baltika/baltika-8-480.webp 480w', '/home/cases/baltika/baltika-8-960.webp 960w', '/home/cases/baltika/baltika-8-1440.webp 1440w', '/home/cases/baltika/baltika-8-1920.webp 1920w', '/home/cases/baltika/baltika-8-2760.webp 2760w'].join(', '),
  avifSrcset: ['/home/cases/baltika/baltika-8-480.avif 480w', '/home/cases/baltika/baltika-8-960.avif 960w', '/home/cases/baltika/baltika-8-1440.avif 1440w', '/home/cases/baltika/baltika-8-1920.avif 1920w', '/home/cases/baltika/baltika-8-2760.avif 2760w'].join(', '),
  sizes: '(max-width: 767.98px) 100vw, min(83.333vw, 1206px)',
}

const baltikaRouteMedia = [
  {
    src: '/home/cases/baltika/baltika-9.png',
    alt: 'Балтика Brew — характеристики продукта, второй экран',
    shape: 'wide' as const,
    aspectRatio: '3750 / 2500',
    webpSrcset: ['/home/cases/baltika/baltika-9-480.webp 480w', '/home/cases/baltika/baltika-9-960.webp 960w', '/home/cases/baltika/baltika-9-1440.webp 1440w'].join(', '),
    avifSrcset: ['/home/cases/baltika/baltika-9-480.avif 480w', '/home/cases/baltika/baltika-9-960.avif 960w', '/home/cases/baltika/baltika-9-1440.avif 1440w'].join(', '),
    sizes: '(max-width: 767.98px) 100vw, min(83.333vw, 1440px)',
  },
]

const baltikaCollectionMedia = [
  baltikaResponsiveMedia(6, 'Балтика Brew — продуктовая линейка, третья позиция', 'wide', '(max-width: 767.98px) 82vw, 38vw'),
  baltikaResponsiveMedia(5, 'Балтика Brew — продуктовая линейка, вторая позиция', 'landscape', '(max-width: 767.98px) 82vw, 38vw'),
  baltikaResponsiveMedia(7, 'Балтика Brew — продуктовая линейка, четвёртая позиция', 'landscape', '(max-width: 767.98px) 82vw, 38vw'),
  baltikaResponsiveMedia(4, 'Балтика Brew — продуктовая линейка, первая позиция', 'wide', '(max-width: 767.98px) 82vw, 38vw'),
]

const baltikaResponsiveCompositionMedia: ProjectCaseMedia = {
  src: '/home/cases/baltika/baltika-11.png',
  alt: 'Балтика Brew — адаптивная композиция сайта',
  shape: 'landscape',
  aspectRatio: '4 / 3',
  webpSrcset: [480, 960, 1440, 1920, 2760].map(width => `/home/cases/baltika/baltika-11-${width}.webp ${width}w`).join(', '),
  avifSrcset: [480, 960, 1440, 1920, 2760].map(width => `/home/cases/baltika/baltika-11-${width}.avif ${width}w`).join(', '),
  sizes: '(max-width: 767.98px) 100vw, min(83.333vw, 1440px)',
}

const baltikaClosingMedia: ProjectCaseMedia = {
  src: '/home/cases/baltika/baltika-12.png',
  alt: 'Балтика Brew — финальная композиция проекта',
  shape: 'wide',
  aspectRatio: '1040 / 617',
  webpSrcset: [480, 960, 1440, 2080].map(width => `/home/cases/baltika/baltika-12-${width}.webp ${width}w`).join(', '),
  avifSrcset: [480, 960, 1440, 2080].map(width => `/home/cases/baltika/baltika-12-${width}.avif ${width}w`).join(', '),
  sizes: '100vw',
}

const schmidtMedia = {
  src: '/home/cases/schmidt/schmidt.webp',
  alt: 'SCHMIDT — горизонтальная история продукта',
  shape: 'wide' as const,
}

export const projectCaseDetails: Record<string, ProjectCaseDetail> = {
  'keys-store': {
    sections: [
      {
        id: 'keys-system',
        layout: 'intro',
        title: 'Один магазин.<br>Несколько бизнес-логик.',
        paragraphs: [
          'Keys Store объединяет игры для Steam и PlayStation, цифровые подписки, а также покупку и продажу Steam-предметов. За одним брендом скрываются разные типы товара, правила выбора, способы оплаты и ожидания пользователя.',
        ],
        media: [keysMedia[0], keysMedia[1]],
        statement: 'Задача была не в том, чтобы сделать ещё один каталог. Нужно было собрать торговую систему, в которой человек быстро понимает, что покупает, на какой платформе это работает и как завершить сделку.',
      },
      {
        id: 'keys-catalog-language',
        layout: 'disclosure',
        title: 'Универсальный язык<br>каталогов.',
        paragraphs: [
          'Для каталогов создан единый язык: общая сетка, карточки, фильтры, типографическая иерархия, статусы и работа с ценой. При переходе между разделами пользователь сохраняет привычную логику.',
          'Система адаптируется к продукту: игра сообщает платформу и способ получения, подписка — срок и состав, Steam-предмет — наличие, цену покупки и продажи.',
        ],
        media: [keysMedia[0]],
      },
      {
        id: 'keys-difference',
        layout: 'gallery',
        title: 'Разница видна.<br>Система остаётся общей.',
        paragraphs: ['Единый стиль не означает одинаковые интерфейсы. Каждый каталог получает собственные акценты и только те данные, которые помогают принять решение в конкретном сценарии.'],
        media: [keysMedia[1], keysMedia[0], keysMedia[2]],
        statement: 'Сложность продукта не скрыта за декоративным единообразием — она переведена в понятные параметры выбора.',
      },
      {
        id: 'keys-checkout',
        layout: 'disclosure',
        title: 'Путь к покупке<br>без лишних решений.',
        paragraphs: [
          'Покупка цифрового товара может включать платформу, регион, валюту, способ оплаты и способ получения. Мы собрали путь в последовательный сценарий, где следующий шаг и итоговые условия видны до подтверждения.',
          'Рубли, зарубежные варианты и криптовалюта не превращают checkout в набор технических развилок. Интерфейс помогает выбрать подходящий способ и сохранить ощущение контроля.',
        ],
        media: [keysMedia[2]],
      },
      {
        id: 'keys-trust',
        layout: 'split',
        title: 'Доверие встроено<br>в интерфейс.',
        paragraphs: ['Дизайн объясняет механику сделки, показывает доступность и сроки, фиксирует статус заказа и делает условия прозрачными — от выбора товара до получения игры или выплаты за продажу.'],
        media: [keysMedia[2], keysMedia[1]],
      },
      {
        id: 'keys-identity',
        layout: 'disclosure',
        title: 'Айдентика —<br>часть продукта.',
        paragraphs: [
          'Логотип и визуальный язык собирают разнородные направления в один узнаваемый продукт. Яркие игровые изображения маркируют категории, а интерфейсная оболочка удерживает общий ритм.',
          'Айдентика не существует отдельно от UX: она помогает быстрее распознавать разделы, платформы и типы услуг.',
        ],
        media: [keysMedia[0]],
      },
    ],
    final: 'Keys Store — большая торговая система, в которой разные цифровые продукты собраны в единый опыт. Пользователь сохраняет привычный маршрут, даже когда меняются товар, платформа и логика сделки.',
    closing: keysMedia[1],
  },
  baltika: {
    summary: 'Как мы спроектировали интерфейс и 3D-систему для продуктового сайта.',
    headerMedia: {
      src: '/home/cases/baltika/baltika-detail-header-portrait-640.webp',
      alt: 'Балтика Brew — 3D-модель бутылки в Blender',
      width: 640,
      height: 1138,
      webpSrcset: [
        '/home/cases/baltika/baltika-detail-header-portrait-320.webp 320w',
        '/home/cases/baltika/baltika-detail-header-portrait-480.webp 480w',
        '/home/cases/baltika/baltika-detail-header-portrait-640.webp 640w',
      ].join(', '),
      avifSrcset: [
        '/home/cases/baltika/baltika-detail-header-portrait-320.avif 320w',
        '/home/cases/baltika/baltika-detail-header-portrait-480.avif 480w',
        '/home/cases/baltika/baltika-detail-header-portrait-640.avif 640w',
      ].join(', '),
    },
    sections: [
      {
        id: 'baltika-object',
        layout: 'intro',
        title: 'Задача и объект<br>проектирования.',
        paragraphs: [
          'В рамках проекта для «Балтика Brew» мы разработали структуру продуктового сайта, визуальную концепцию и набор 3D-сцен. Кейс фиксирует решения команды и этапы производства цифрового продукта.',
          'Основным графическим объектом стала модель бутылки. Она использовалась для демонстрации принципов композиции, работы с материалами и поведения интерфейса на разных экранах.',
          'В целях соблюдения требований законодательства Российской Федерации отдельные элементы изображений и макетов в этом кейсе скрыты или заменены нейтральными.',
        ],
        media: [baltikaObjectMedia, baltikaObjectDetailMedia],
      },
      {
        id: 'baltika-label',
        layout: 'disclosure',
        title: 'Этикетка как элемент<br>визуальной системы.',
        paragraphs: [
          'Графика этикетки была встроена в 3D-модель и связана с фоновыми сценами. Это позволило выстроить единый принцип подачи для нескольких позиций линейки.',
          'Различия между позициями передавались через цвет, изображение и параметры сцены. Навигация и структура страниц при этом оставались единообразными.',
        ],
        media: [baltikaLabelMedia],
      },
      {
        id: 'baltika-collection',
        layout: 'gallery',
        title: 'Авторские образы<br>для каждого сорта.',
        paragraphs: ['Для каждой позиции линейки мы отобрали авторскую фотографию. Через цвет, фактуру и настроение она раскрывает характер сорта, а общая композиция связывает разные визуальные сюжеты в единую систему.'],
        media: baltikaCollectionMedia,
        statement: 'Фотографии помогают различать позиции и поддерживают характер каждой из них, сохраняя целостность линейки.',
      },
      {
        id: 'baltika-motion',
        layout: 'feature',
        title: 'Движение как часть<br>интерфейса.',
        paragraphs: ['Анимация использовалась для переходов между состояниями 3D-сцены и последовательного появления информации. Она поддерживает навигацию и не демонстрирует употребление продукта.'],
        media: [baltikaMotionMedia],
      },
      {
        id: 'baltika-data',
        layout: 'disclosure',
        title: 'Характеристики<br>без визуального шума.',
        paragraphs: [
          'На страницах предусмотрены справочные данные: крепость, плотность, горечь, объём и описание, предоставленное заказчиком.',
          'Мы распределили информацию по уровням, чтобы пользователь мог последовательно ознакомиться с содержанием страницы.',
        ],
        media: [baltikaDataMedia],
      },
      {
        id: 'baltika-route',
        layout: 'split',
        title: 'Редакционные<br>и справочные<br>разделы.',
        paragraphs: ['Новости, материалы о производстве и справочный раздел с перечнем мест продаж объединены общей навигацией. В кейсе этот блок рассматривается только как часть информационной архитектуры сайта.'],
        media: baltikaRouteMedia,
      },
      {
        id: 'baltika-responsive',
        layout: 'disclosure',
        title: 'Адаптивная<br>композиция.',
        paragraphs: [
          'Для широких экранов разработана горизонтальная композиция с разнесёнными текстовыми и графическими блоками.',
          'На мобильных устройствах те же материалы перестраиваются в последовательную вертикальную структуру с сохранением порядка чтения.',
        ],
        media: [baltikaResponsiveCompositionMedia],
      },
    ],
    final: 'В рамках проекта для «Балтика Brew» мы разработали структуру, визуальную систему, 3D-графику и анимацию продуктового сайта. Этот кейс описывает выполненные дизайнерские и технические решения и не содержит предложения приобрести или употреблять алкогольную продукцию.',
    closing: baltikaClosingMedia,
  },
  schmidt: {
    sections: [
      {
        id: 'schmidt-horizontal',
        layout: 'feature',
        title: 'История продукта,<br>рассказанная в сторону.',
        paragraphs: ['Вместо привычного движения вниз пользователь проходит историю SCHMIDT слева направо: от предметного образа бутылки к происхождению бренда, производству и коктейлям.'],
        media: [schmidtMedia],
        statement: 'Горизонтальный маршрут задаёт темп знакомства и превращает лендинг в непрерывную траекторию — это не эффект ради эффекта.',
      },
      {
        id: 'schmidt-materials',
        layout: 'disclosure',
        title: 'Чистота в предметной<br>композиции.',
        paragraphs: [
          'Прозрачное стекло, зерно, жемчуг и тонкая золотистая линия объясняют свойства продукта через физические материалы. Бутылка остаётся главным объектом.',
          'Крупная типографика и белое пространство удерживают контраст: сайт ощущается чистым и собранным, но не стерильным.',
        ],
        media: [schmidtMedia],
      },
      {
        id: 'schmidt-brand',
        layout: 'split',
        title: 'История бренда<br>как следующая сцена.',
        paragraphs: ['Семейная история, наследие и ценности появляются не отдельной текстовой страницей, а частью той же пространственной последовательности. Факты получают вес и ритм, не прерывая движение.'],
        media: [schmidtMedia, schmidtMedia],
      },
      {
        id: 'schmidt-production',
        layout: 'gallery',
        title: 'Производство как<br>прозрачный процесс.',
        paragraphs: ['Спирт, вода, купажирование и фильтрация получают собственный номер, предметный образ и короткое объяснение. Пользователь движется не по списку характеристик, а по логике создания напитка.'],
        media: [schmidtMedia, schmidtMedia, schmidtMedia, schmidtMedia],
        statement: 'Четыре этапа складываются в один осязаемый производственный маршрут.',
      },
      {
        id: 'schmidt-flavours',
        layout: 'disclosure',
        title: 'Линейка вкусов<br>продолжается в рецептах.',
        paragraphs: [
          'Supreme, Cranberry, Grapefruit и Black Currant раскрываются не только через бутылку, но и через собственный коктейльный сценарий.',
          'Ингредиенты, рецепт и настроение переводят продукт с полки в культуру употребления — от Dry Martini до Paloma и Black Currant Mojito.',
        ],
        media: [schmidtMedia],
      },
      {
        id: 'schmidt-navigation',
        layout: 'intro',
        title: 'Интерактив не прячет<br>навигацию.',
        paragraphs: ['Простые подсказки, устойчивая координатная логика и повторяемый ритм сцен сохраняют понятность нестандартного маршрута.', 'Пользователь всегда видит направление движения и может вернуться к продукту после рецепта. Иммерсивность не превращается в квест.'],
        media: [schmidtMedia, schmidtMedia],
      },
      {
        id: 'schmidt-responsive',
        layout: 'disclosure',
        title: 'Один ритм.<br>Разные экраны.',
        paragraphs: [
          'На широком экране история разворачивается как длинная горизонтальная композиция. На узких экранах порядок сцен сохраняется, а подсказки становятся явнее.',
          'Адаптив оценивается не по уменьшению блоков, а по сохранению одного и того же ритма знакомства с брендом.',
        ],
        media: [schmidtMedia],
      },
    ],
    final: 'SCHMIDT превращает знакомство с премиальной водкой в контролируемую последовательность сцен. Арт-дирекция, горизонтальный ритм и интерактивная анимация связывают предметный образ, происхождение, производство и культуру употребления.',
    closing: schmidtMedia,
  },
}
