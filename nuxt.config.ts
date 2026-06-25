// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-06-24',
  srcDir: 'src/',

  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxtjs/i18n', '@pinia/nuxt'],

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
    ],
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // server-only (never exposed to the client)
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    public: {
      supabaseUrl: process.env.SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
    },
  },
})
