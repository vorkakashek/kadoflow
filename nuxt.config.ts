import tailwindcss from '@tailwindcss/vite'
import { homeCases } from './app/utils/homeCases'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },

  modules: ['@nuxt/fonts'],

  css: ['~/assets/css/main.css', 'lenis/dist/lenis.css'],

  // Bind on all interfaces so phone can open the LAN IP.
  // Device motion on iOS: use a public HTTPS tunnel (see preview:tunnel), not LAN HTTP.
  devServer: {
    host: '0.0.0.0',
    port: 3000,
  },

  vite: {
    plugins: [tailwindcss()],
    server: {
      host: true,
      strictPort: true,
      // Localtunnel / Cloudflare quick tunnels hit Vite's host check otherwise.
      allowedHosts: ['.loca.lt', '.trycloudflare.com', '.ngrok-free.app', '.ngrok.io'],
      // Vite 8: WS options live on `server.ws` (hmr.* is deprecated).
      // Bind HMR on the Nuxt port, but do NOT force client protocol/port —
      // HTTPS tunnels need wss://host (443), LAN keeps ws://ip:3000 via location.
      ws: {
        port: 3000,
        timeout: 2000,
      },
    },
    optimizeDeps: {
      include: [
        'gsap',
        'gsap/ScrollTrigger',
        'lenis',
        'three',
        'three/examples/jsm/loaders/HDRLoader.js',
      ],
    },
  },

  fonts: {
    families: [
      {
        name: 'Outfit',
        provider: 'google',
        weights: [400, 500, 600, 700],
        display: 'swap',
        subsets: ['latin', 'latin-ext'],
      },
    ],
  },

  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'Kadoflow — свобода формы, порядок процесса',
      meta: [
        {
          name: 'description',
          content:
            'Авторская студия дизайна и разработки. Создаю выразительные сайты под ключ — от структуры до запуска.',
        },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      ],
      // Before first paint: warm revisit shows full black macron, not empty gray track.
      script: [
        {
          key: 'preload-warm',
          innerHTML:
            "try{if(localStorage.getItem('kf-preload-seen')==='1')document.documentElement.setAttribute('data-preload-warm','1')}catch(e){}",
          tagPosition: 'head',
        },
      ],
      style: [
        {
          key: 'preload-warm-css',
          innerHTML:
            'html[data-preload-warm] .brand-preload__arc:not(.brand-preload__arc--track){stroke-dashoffset:0!important}',
          tagPosition: 'head',
        },
      ],
    },
  },

  nitro: {
    preset: 'static',
    prerender: {
      routes: homeCases.map((item) => `/projects/${item.id}`),
    },
  },

  routeRules: {
    '/**': { prerender: true },
  },
})
