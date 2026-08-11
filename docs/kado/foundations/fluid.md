# Fluid-интерполяция

Kado = **кусочный fluid**: между соседними [брейкпоинтами](./breakpoints.md) каждый токен линейно растёт (или падает) от значения A к B.

## Пайплайн

```text
design-tokens/responsive.json
        │
        ▼
npm run tokens:fluid   (scripts/generate-fluid.mjs)
        │
        ▼
app/assets/css/fluid.generated.css
        │
        ▼
--layout-margin, --type-hero, …
```

Генерация также перед `dev` / `build` / `generate`.

## Формула (смысл)

На отрезке viewport `v1 → v2` и значений `s1 → s2`:

```text
size = clamp(s1, intercept + slope × vw, s2)
```

На ширине `v1` получаешь `s1`, на `v2` — `s2`. Между — дробные px.

## Что генерируется дополнительно

Не из таблицы токенов, а формулами в том же CSS:

| Переменная | Смысл |
| --- | --- |
| `--layout-content` | `min(content-max, 100vw − 2 × margin)` |
| `--layout-column` | `(content − 11 × gutter) / 12` |
| `--layout-span-N` | ширина N колонок + gutter’ы между ними |
| `--layout-header-content` | высота лого (`layout.header-content`) |
| `--layout-header-inset` | вертикаль шапки (≈ margin − 20%, snap 8dp) |
| `--layout-surface-top` | `2 × header-inset + header-content` |

## Правила для авторов токенов

1. Массив значений токена = ровно `viewports.length`.
2. Соседние точки без огромных скачков (если скачок нужен — осознанно).
3. Только шаги [8dp / 4 type](./dp-8.md) на контрольных ширинах.
4. После правки JSON — `npm run tokens:fluid` и обновить таблицу в `docs/kado/tokens/…`.

## Чего не делаем

- Один глобальный `min → max` на весь сайт (типа fluid.tw) — плохо стыкуется с кусочной шкалой.
- Ручной `calc(…vw)` в компонентах в обход токенов.
- `font-size` на `html` от `--type-body` (ломает rem).
