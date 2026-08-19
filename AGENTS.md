# Kadoflow: compact working context

## What this project is

- Russian-first portfolio and lead-generation site for Kadoflow, an author-led design/development studio.
- Core promise: expressive turnkey websites, from structure and visual concept through development and launch.
- Brand formula: “Свобода формы. Порядок процесса.” Visual tone is editorial, calm and tactile; motion should feel organic but controlled.

## Current implementation

- Nuxt 4 / Vue 3 / TypeScript, Tailwind 4, GSAP/ScrollTrigger and Three.js. Static output (`nitro.preset: static`, prerendered routes).
- `/` is the real product today: interactive Three.js sphere swarm in the hero; one `FlowSurface` morphs through Hero → Kado → Cases; the Cases section switches among Audience, Keys Store, Балтика Brew and SCHMIDT.
- Global experience: short brand preloader, header, custom cursor/scrollbar, Page Canvas menu, iris/SPA transitions and baked page previews.
- `/projects`, `/services`, `/about` and `/contact` are still `PageStub` shells. Detailed case pages, real contact flow, i18n, analytics and legal/production SEO work are not implemented.

## Where truth lives

- Runtime behavior: `app/`; key orchestration is in `app/pages/index.vue`, `FlowSurfaceHost.vue`, `HeroSwarmCanvas.vue`, `HomeCases.vue`, `PageCanvas.vue` and `SiteHeader.vue`.
- Case/nav data: `app/utils/homeCases.ts` and `app/utils/siteNav.ts`.
- Responsive values: `design-tokens/responsive.json` is canonical. Run `npm run tokens:fluid`; never hand-edit `app/assets/css/fluid.generated.css`.
- Design guidance: `docs/kado/`; product/content briefs: `docs/brand-and-website-brief.md`, `docs/content-cases-contact-and-studio.md`; motion decisions: `docs/motion-and-interaction-spec.md`.
- `docs/idea-archive.md` is explicitly not a backlog. Do not revive rejected/deferred ideas unless the user asks.
- `docs/` and root `assets/` are intentionally gitignored local reference material; shipped media is under `public/`.

## Non-negotiable engineering constraints

- Performance comes before decorative richness. Target stable 60 fps on real mobile Safari/Chrome; desktop smoothness is not sufficient evidence.
- Avoid full-surface SVG `feTurbulence`, stacked expensive live effects and unnecessary per-frame DOM/layout reads. Prefer baked textures/assets, instancing and transform/opacity animation.
- Use `--app-screen` / `100svh` for full-screen geometry. Do not base fixed/snap layouts on `100dvh`; mobile browser chrome height changes must not rebuild everything.
- Respect `prefers-reduced-motion`, pause WebGL/animation when hidden or out of view, and keep iOS motion permission behind a user gesture.
- Start development with `npm run dev` (`--host` is required). iOS device-motion QA needs an HTTPS tunnel, not plain LAN HTTP.
- Preserve the page/overlay stacking model documented in `app/pages/index.vue`; careless Teleports or visibility changes can drop the Android WebGL buffer or break the closing iris.
- Deferred tap haptics stay deferred until the desktop Kado↔Cases soft scrub is accepted.

## Baseline and known risks (2026-08-19)

- `main` matched `origin/main` at `02ffefb`; only the user’s untracked `.vscode/` existed. Re-check before editing and preserve unrelated changes.
- `npm run build` passed. Expected warnings: remote font-provider metadata can be unavailable in a restricted network; one client chunk is about 539 kB minified and exceeds Vite’s 500 kB warning threshold.
- There is no dedicated test, lint or typecheck script. Verification currently means at least a production build plus focused browser/device QA for animation changes.
- Main maintainability risk: several interaction components are 1k–1.6k lines and share state through `usePageCanvas` / `useFlowSurfaceMask`; prefer narrow changes and trace state/cleanup before refactoring.

## Collaboration history and context hygiene

- The implementation history is captured well by git: the initial site, Page Canvas/iris navigation, iOS/WebGL hardening, gyro controls, Cases and the waypoint corridor were developed through Cursor-agent-assisted commits.
- Do not bulk-read old agent/chat logs. At least one historical Kadoflow task embeds multi-megabyte base64 screenshots and can expand to millions of tokens. Use task summaries, git history and targeted turn/file reads with strict limits.
- Communicate with the user in Russian by default. Be concrete and visually literate; favor measured performance and a coherent interaction system over adding more spectacle.
