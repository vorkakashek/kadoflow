# Kadoflow design tokens

Машинный источник размеров и цветов. **Документация для людей:** [`docs/kado/`](../docs/kado/index.md).

## Файлы

- `kadoflow-colors-light.json` / `kadoflow-colors-inverse.json` — DTCG цвета (Figma Variables);
- `responsive.json` — кусочный fluid (`390 → 768 → 1280 → 1440 → 1920 → 2560`), база **8dp** / type **4**.

Генерация:

```bash
npm run tokens:fluid
```

→ `app/assets/css/fluid.generated.css`.

Кратко про шкалу и таблицы — в docs; не дублируем здесь вторую «правду».
