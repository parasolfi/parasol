import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/fonts'],

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Parasol — if it can be measured, it can be insured',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Parametric cover for any event a public source can settle — weather, delays, energy prices, catastrophe. Name the number that would hurt and get paid the moment it happens.',
        },
        { name: 'theme-color', content: '#ffffff' },
        { property: 'og:title', content: 'Parasol — if it can be measured, it can be insured' },
        {
          property: 'og:description',
          content: 'Parametric cover that pays itself out. Built on Polygon.',
        },
        { property: 'og:type', content: 'website' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
})
