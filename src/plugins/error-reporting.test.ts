import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ErrorHook = (...args: unknown[]) => void

interface ErrorReportingPlugin {
  setup(nuxtApp: { hook(name: string, callback: ErrorHook): void }): void
}

describe('error reporting plugin', () => {
  const hooks = new Map<string, ErrorHook>()

  beforeEach(async () => {
    vi.resetModules()
    hooks.clear()
    vi.stubGlobal('defineNuxtPlugin', (plugin: ErrorReportingPlugin) => plugin)
    const { default: plugin } = await import('./error-reporting')
    ;(plugin as unknown as ErrorReportingPlugin).setup({ hook: (name, callback) => hooks.set(name, callback) })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reports component errors with the Vue lifecycle info', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('render failed')

    hooks.get('vue:error')?.(error, null, 'render function')

    expect(consoleError).toHaveBeenCalledWith('[startica:vue]', 'render function', error)
  })

  it('reports plugin startup and server render errors', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('plugin failed')

    hooks.get('app:error')?.(error)

    expect(consoleError).toHaveBeenCalledWith('[startica:app]', '', error)
  })
})
