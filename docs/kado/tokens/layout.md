# Layout

Внешние поля страницы, gutter сетки, потолок контентной полосы, слот шапки.

Источник: `design-tokens/responsive.json` → `tokens.layout.*`.

## Значения (px)

| Токен | 390 | 768 | 1280 | 1440 | 1920 | 2560 | CSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `layout.margin` | 16 | 24 | 32 | **40** | 48 | 56 | `--layout-margin` |
| `layout.gutter` | 16 | 24 | 32 | **40** | 48 | 56 | `--layout-gutter` |
| `layout.content-max` | 390 | 720 | 1200 | 1360 | 1800 | 2400 | `--layout-content-max` |
| `layout.header-content` | 32 | 40 | 48 | 48 | 48 | 48 | `--layout-header-content` |
| `layout.header-inset` | 16 | 16 | 24 | 32 | 40 | 48 | `--layout-header-inset` |

`header-inset` ≈ margin − ~20% (snap к 8dp) — только вертикаль шапки, боковые поля остаются `margin`.
`header-content` — высота лого; на мобилке меньше, с 1280 — 48.

На **1440** margin и gutter = **40** — канон макета студии.

## Производные

| CSS | Формула |
| --- | --- |
| `--layout-surface-top` | `2 × header-inset + header-content` |
| `--layout-content` | `min(content-max, 100vw − 2 × margin)` |
| `--layout-column` | `(content − 11 × gutter) / 12` |
| `--layout-span-N` | `N × column + (N − 1) × gutter` |

## Когда что брать

| Задача | Токен |
| --- | --- |
| Отступ от края экрана | `--layout-margin` |
| Вертикаль шапки (верх / до hero) | `--layout-header-inset` |
| Зазор между колонками | `--layout-gutter` |
| Max ширина текстовой/контентной полосы | `--layout-content-max` |
| Старт hero / surface под шапкой | `--layout-surface-top` |
| Ширина N колонок | `--layout-span-N` |

См. также [Рамка страницы](../layout/page-frame.md), [Сетка](../layout/grid.md).
