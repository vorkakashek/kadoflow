import tailwindcss from '@tailwindcss/vite'
import { homeCaseIds } from './app/utils/homeCases'

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
      // Case detail is a frequent but route-lazy page. Transform it at dev
      // startup so the first animated navigation cannot hit a cold waterfall.
      warmup: {
        clientFiles: ['./app/pages/projects/**/*.vue'],
      },
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
    // The site is fully self-hosted: avoid provider metadata requests during builds.
    providers: {
      adobe: false,
      bunny: false,
      fontshare: false,
      fontsource: false,
      google: false,
      googleicons: false,
      npm: false,
    },
    families: [
      {
        name: 'Fixel Text',
        provider: 'local',
        weights: [300, 400, 500, 600, 700],
        styles: ['normal'],
        display: 'swap',
        // The local WOFF2 files contain both extended Latin and Cyrillic.
        // `latin` is only the local provider's filename lookup key.
        subsets: ['latin'],
      },
      {
        name: 'Fixel Display',
        provider: 'local',
        weights: [300, 400, 500, 600, 700],
        styles: ['normal'],
        display: 'swap',
        subsets: ['latin'],
      },
    ],
  },

  app: {
    head: {
      meta: [
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
    // Emit Brotli/gzip siblings so static hosts can serve compressed text assets
    // without doing compression work at request time.
    compressPublicAssets: true,
    prerender: {
      routes: homeCaseIds.map(id => `/projects/${id}`),
    },
  },

  routeRules: {
    '/_nuxt/**': {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    },
    '/_fonts/**': {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    },
    '/**': {
      prerender: true,
      headers: { 'cache-control': 'public, max-age=0, must-revalidate' },
    },
  },
})
