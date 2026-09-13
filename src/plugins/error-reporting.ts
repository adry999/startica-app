import { reportError } from '@core/errors/report-error'

export default defineNuxtPlugin({
  name: 'error-reporting',
  // Registered before other plugins so their startup failures reach app:error too.
  enforce: 'pre',
  setup(nuxtApp) {
    nuxtApp.hook('vue:error', (error, _instance, info) => reportError(error, { source: 'vue', detail: info }))
    nuxtApp.hook('app:error', error => reportError(error, { source: 'app' }))
  },
})
