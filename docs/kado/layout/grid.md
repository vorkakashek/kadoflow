# 12-колоночная сетка

Kado — **12 колонок**, gutter = `--layout-gutter`, внешние поля = `--layout-margin`.

## Как считается колонка

Не таблица px по брейкпоинтам, а формула:

```text
content = min(content-max, 100vw − 2 × margin)
column  = (content − 11 × gutter) / 12
span-N  = N × column + (N − 1) × gutter
```

CSS: `--layout-column`, `--layout-span-1` … `--layout-span-12`.

## В разметке

Типичный паттерн:

```html
<div
  style="
    max-width: var(--layout-content-max);
    margin-inline: auto;
    padding-inline: var(--layout-margin);
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    column-gap: var(--layout-gutter);
  "
>
  <!-- col-span-* -->
</div>
```

Или ширина блока через `width: var(--layout-span-5)` без участия в grid.

## Канон

На **1440**: margin **40**, gutter **40** — как в исходном макете студии.
