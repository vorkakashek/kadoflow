# CSS-переменные

## Генерация

```bash
npm run tokens:fluid
```

Пишет `app/assets/css/fluid.generated.css`. Подключается из `app/assets/css/main.css`.

## Имена

Токен `layout.margin` → `--layout-margin` (точки → дефисы).

## Tailwind `@theme` bridge

| Theme token | → |
| --- | --- |
| `--spacing-margin` | `--layout-margin` |
| `--spacing-gutter` | `--layout-gutter` |
| `--spacing-section` | `--space-section` |
| `--spacing-block` | `--space-block` |
| `--text-body` … `--text-hero` | `--type-*` |
| `--color-sand` … | palette |

В Vue/разметке чаще пишут напрямую `var(--layout-margin)` в `:style` или CSS — так явнее связь с Kado.

## Чеклист компонента

1. Внешние поля — margin / surface-top, не магические числа.
2. Вертикальный ритм секции — `--space-section` / `--space-block`.
3. Кегль — `--type-*`, не `text-xl` «на глаз».
4. Rem-утилиты Tailwind — только локальный chrome (чипы, мелкий gap), не рамка страницы.
