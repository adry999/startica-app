export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const configured = Boolean(
    config.public.supabaseUrl
    && config.public.supabaseAnonKey
    && config.supabaseServiceRoleKey
    && config.public.siteUrl,
  )

  if (!configured) {
    throw createError({ statusCode: 503, statusMessage: 'Service unavailable' })
  }

  return { status: 'ok' }
})
