import { describe, expect, it } from 'vitest'
import { createLatestRequestGuard } from './latest-request'

describe('createLatestRequestGuard', () => {
  it('lets only the most recently started request apply its response', () => {
    const guard = createLatestRequestGuard()
    const kindergartenARequest = guard.begin()
    const kindergartenBRequest = guard.begin()

    expect(kindergartenARequest.isLatest()).toBe(false)
    expect(kindergartenBRequest.isLatest()).toBe(true)
  })

  it('discards an in-flight request when the screen is cleared', () => {
    const guard = createLatestRequestGuard()
    const request = guard.begin()

    guard.supersede()

    expect(request.isLatest()).toBe(false)
  })
})
