import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runtimeConfig } = vi.hoisted(() => {
  const runtimeConfig = {
    supabaseServiceRoleKey: 'service-key',
    public: {
      supabaseUrl: 'http://localhost:54321',
      supabaseAnonKey: 'anon-key',
      siteUrl: 'http://localhost:3000',
    },
  }

  const globals = globalThis as Record<string, unknown>
  globals.defineEventHandler = (handler: unknown) => handler
  globals.useRuntimeConfig = () => runtimeConfig
  globals.createError = (opts: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(opts.statusMessage), { statusCode: opts.statusCode })

  return { runtimeConfig }
})

import handler from './health.get'

type RouteHandler = (event: Record<string, unknown>) => unknown

describe('GET /api/health', () => {
  beforeEach(() => {
    runtimeConfig.supabaseServiceRoleKey = 'service-key'
    runtimeConfig.public.supabaseUrl = 'http://localhost:54321'
    runtimeConfig.public.supabaseAnonKey = 'anon-key'
    runtimeConfig.public.siteUrl = 'http://localhost:3000'
  })

  it('returns ok when all required runtime configuration is present', () => {
    expect(((handler as unknown) as RouteHandler)({})).toEqual({ status: 'ok' })
  })

  it('returns 503 without required runtime configuration', () => {
    runtimeConfig.public.siteUrl = ''
    try {
      ((handler as unknown) as RouteHandler)({})
      throw new Error('Expected health handler to reject missing configuration')
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 503 })
    }
  })
})
