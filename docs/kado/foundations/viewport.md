# Мобильный viewport (svh / lvh / dvh)

Панельки Safari / Chrome на телефоне то прячутся, то появляются — от этого меняется **видимая** высота. Если секции, `fixed` и absolute-маски слушают эту высоту, сайт **рывком** растёт и двигает слои.

## Три высоты

| Единица | Смысл | Когда брать |
| --- | --- | --- |
| `svh` | small — панельки **видны** (самый низкий экран) | Герои, snap-секции, всё, что не должно прыгать при скролле |
| `lvh` | large — панельки **скрыты** | Редко: потолок, фоны «на весь большой экран» |
| `dvh` | dynamic — прыгает вместе с панельками | Только fullscreen-оверлеи / модалки, где надо точно в видимую область |

`100vh` на мобилках ≈ large → контент часто обрезается под строкой поиска. Не использовать для full-bleed секций.

## Практика Kadoflow

1. **Высота первого экрана / snap-якоря** — `100svh` (`--app-screen`). Лучше короткий зазор при скрытой панели, чем reflow.
2. **Не пересчитывать layout на `resize`, если изменилась только высота** на coarse/narrow — это почти всегда тулбар. Утилита: `isMobileChromeHeightOnlyResize()` в `app/utils/mobileViewport.ts`.
3. **ScrollTrigger** — `ScrollTrigger.config({ ignoreMobileResize: true })` (уже в `gsap.client.ts`).
4. **`history.scrollRestoration = 'manual'`** — меньше «открыли уже проскролленным».
5. **Safe area** — `env(safe-area-inset-*)` + `viewport-fit=cover` для notch / home indicator. FAB меню: `bottom`/`right` от margin и safe-area.
6. **`visualViewport`** — для клавиатуры и тонкой подстройки fixed UI; для тулбара обычно хватает `svh` + игнор height-only resize.
7. **Fixed bottom UI** — якорить к layout viewport (`position: fixed` + safe-area), не к `100dvh`.

## CSS-токены

```css
:root {
  --app-screen: 100svh; /* стабильная «высота экрана» для секций */
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
}
```

## Do / Don’t

| Do | Don’t |
| --- | --- |
| Hero / section = `svh` | Hero = `dvh` / `100vh` |
| Игнор height-only resize на mobile | `capturePoses()` на каждый toolbar resize |
| FAB + safe-area | `bottom: 0` без inset на iPhone |
| Модалка fullscreen → `dvh` ок | Весь документ на `dvh` |

См. также [web.dev — viewport units](https://web.dev/blog/viewport-units).
