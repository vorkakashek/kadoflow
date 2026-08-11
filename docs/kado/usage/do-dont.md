# Do / Don’t

## Do

- Писать токены на контрольных точках кратно **8** (space) / **4** (type).
- Брать поля экрана из `--layout-margin`.
- После правки `responsive.json` гонять `npm run tokens:fluid` и править таблицу в `docs/kado/tokens/`.
- Держать `html` font-size стабильным.
- Высоту hero / snap-секций брать из `--app-screen` (`100svh`), не из `dvh` / `100vh`. См. [viewport](../foundations/viewport.md).
- **Производительность выше декора**: целиться в стабильные 60fps на реальном mobile Safari/Chrome. Зерно — через tiling-текстуру, не через `feTurbulence` на весь surface.

## Don’t

- Хардкодить `padding: 37px` / `font-size: 19px` в секциях страницы.
- Ставить `font-size: var(--type-body)` на `html`.
- Вводить отдельный `surface-top` токен, который разъезжается с margin (он **производный**).
- Растягивать весь UI пропорционально под 4K — есть потолок шкалы (2560) и мягкий рост type.
- Путать gutter сетки с margin экрана.
- Вешать geometry страницы на `100dvh` — тулбар Safari/Chrome даст рывок absolute/fixed слоям.
- Считать SVG `feTurbulence` каноническим зерном — на WebKit это легко роняет FPS на всём экране.

## Быстрая диагностика

| Симптом | Частая причина |
| --- | --- |
| Шапка ближе к hero, чем к верху экрана | inset сверху/снизу должен быть один и тот же `--layout-header-inset` |
| Слева поле толще, чем справа | SVG viewBox / path translate, не margin |
| На 4K гигантские буквы | забыли потолок токена / лишний vw вне clamp |
| Tailwind `p-4` огромный | `html` font-size = fluid body |
| При скролле всё «подпрыгивает» | секция на `dvh` / resize слушает высоту тулбара |
