# Рамка страницы

Один ритм внешних полей: **`--layout-margin`**.

## Первый экран

```text
┌─ margin ─────────────────────────────┐
│  [logo / nav]                        │  ← высота контента шапки
│  margin                              │
│  ┌─ surface / hero ───────────────┐  │
│  │                                │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│              margin                  │
└──────────────────────────────────────┘
```

- Слева / справа / снизу у hero surface: `--layout-margin`.
- Сверху до surface: `--layout-surface-top` = `2 × header-inset + header-content`.
- Зазор **экран → лого** = зазор **лого → hero** = `margin`.

Схлопнутая шапка: верхний паддинг `margin / 2`, ширина → `content-max`.

## Секции ниже

`padding-inline: var(--layout-margin)`, контент часто `max-width: var(--layout-content-max); margin-inline: auto`.

## Не смешивать

Не добавлять второй «глобальный» отступ поверх margin (лишний padding на `body` / `main`), иначе поля разъедутся с surface.
