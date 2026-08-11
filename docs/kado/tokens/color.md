# Color

Цвета Kado — DTCG JSON для Figma Variables и CSS custom properties.

## Файлы

| Файл | Mode |
| --- | --- |
| `design-tokens/kadoflow-colors-light.json` | Light |
| `design-tokens/kadoflow-colors-inverse.json` | Inverse |

## Группы

| Группа | Назначение |
| --- | --- |
| `palette/*` | неизменяемые цвета бренда (исходники) |
| `semantic/*` | роли в UI (фон, текст, акцент) — **предпочитать в макетах** |
| `project/*` | акценты конкретного кейса, не постоянный UI студии |

## CSS (сайт)

Подключение через `app/assets/css/colors.css` → переменные вроде `--palette-sand`, `--palette-ink`, и Tailwind theme (`milk`, `porcelain`, `sand`, `ink`, `ash`, `stone`, `moss`, `forest`).

Типичный фон страницы: **sand**. Панель Flow Surface: **stone**. Текст: **ink** / **ash**.

## Импорт в Figma

См. [Figma](../usage/figma.md).
