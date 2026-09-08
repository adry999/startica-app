// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-06-24',
  srcDir: 'src/',

  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxtjs/i18n', '@pinia/nuxt', '@nuxt/eslint'],

  i18n: {
    restructureDir: '',
    defaultLocale: 'ro',
    langDir: 'src/core/i18n/locales',
    locales: [
      { code: 'ro', name: 'Română', file: 'ro.json' },
      { code: 'en', name: 'English', file: 'en.json' },
    ],
  },

  typescript: {
    strict: true,
    typeCheck: true,
  },

  // Modular monolith: auto-import components/composables/stores from every
  // module folder + shared/, instead of only the Nuxt-default top-level dirs.
  components: {
    dirs: [
      '~/shared/ui',
      '~/modules/auth/components',
      '~/modules/kindergartens/components',
      '~/modules/dashboard/components',
      '~/modules/children/components',
      '~/modules/groups/components',
      '~/modules/staff/components',
      '~/modules/settings/components',
      '~/modules/billing/components',
      '~/modules/payments/components',
      '~/modules/expenses/components',
      '~/modules/pool/components',
    ],
  },

  imports: {
    dirs: [
      'shared/composables',
      'shared/utils',
      'modules/auth/composables',
      'modules/auth/stores',
      'modules/kindergartens/composables',
      'modules/kindergartens/stores',
      'modules/dashboard/composables',
      'modules/dashboard/stores',
      'modules/children/composables',
      'modules/children/stores',
      'modules/groups/composables',
      'modules/groups/stores',
      'modules/staff/composables',
      'modules/staff/stores',
      'modules/settings/composables',
      'modules/settings/stores',
      'modules/billing/composables',
      'modules/billing/stores',
      'modules/payments/composables',
      'modules/payments/stores',
      'modules/expenses/composables',
      'modules/expenses/stores',
      'modules/pool/composables',
      'modules/pool/stores',
    ],
  },

  css: ['~/assets/css/main.css'],

  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id: string) => {
            if (!id.includes('node_modules')) return
            if (id.includes('@nuxt/ui')) return 'nuxt-ui'
            if (id.includes('@nuxtjs/i18n') || id.includes('vue-i18n')) return 'i18n'
            if (id.includes('supabase')) return 'supabase'
            return 'vendor'
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
  },

  runtimeConfig: {
    // server-only (never exposed to the client)
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    public: {
      supabaseUrl: process.env.SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    },
  },
})
