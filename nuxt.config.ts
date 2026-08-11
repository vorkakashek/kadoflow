import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/fonts'],

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: [
        'gsap',
        'gsap/ScrollTrigger',
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
    },
  },

  nitro: {
    preset: 'static',
  },

  routeRules: {
    '/**': { prerender: true },
  },
})
