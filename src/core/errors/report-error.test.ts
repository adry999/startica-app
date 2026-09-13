import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportError } from './report-error'

describe('reportError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs the error tagged with its source and detail', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('render failed')

    reportError(error, { source: 'vue', detail: 'render function' })

    expect(consoleError).toHaveBeenCalledWith('[startica:vue]', 'render function', error)
  })

  it('logs an empty detail when none is given', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('plugin failed')

    reportError(error, { source: 'app' })

    expect(consoleError).toHaveBeenCalledWith('[startica:app]', '', error)
  })
})
