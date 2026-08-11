# Space

Вертикальный ритм секций и внутренних блоков. Шаг **8dp**.

## Значения (px)

| Токен | 390 | 768 | 1280 | 1440 | 1920 | 2560 | CSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `space.section` | 80 | 112 | 160 | 200 | 224 | 240 | `--space-section` |
| `space.block` | 32 | 48 | 64 | 80 | 88 | 96 | `--space-block` |

## Смысл

| Токен | Роль |
| --- | --- |
| **section** | padding / gap **между** крупными секциями страницы |
| **block** | внутренние промежутки **внутри** секции (стек текстов, группы) |

## Пример

```css
.section {
  padding-block: var(--space-section);
  padding-inline: var(--layout-margin);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-block);
}
```

Hero-copy использует одинаковый `padding-block: var(--space-block)` сверху и снизу — равные поля к краям surface.
