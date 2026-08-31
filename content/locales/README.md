# Locales

`ru.json` is the authored source of all public copy. Keep normal spaces here;
do not add `&nbsp;` or non-breaking spaces manually.

`npm run locales:build` validates locale structure, applies language-aware
typography, and generates the runtime files in `app/generated/locales/`. The generated
JSON is ignored by Git and is rebuilt automatically before dev/build/generate.

When English copy is ready, add `en.json` with the same shape as `ru.json` and
register it in `nuxt.config.ts`. The generator will reject missing keys or
array-shape drift before Nuxt starts.
