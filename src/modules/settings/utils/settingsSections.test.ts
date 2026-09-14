import { describe, expect, it } from 'vitest'
import { visibleSettingsSections } from './settingsSections'

describe('visibleSettingsSections', () => {
  it('shows the kindergarten section to someone allowed to change the kindergarten', () => {
    expect(visibleSettingsSections(true)).toEqual(['profile', 'kindergarten', 'password', 'language'])
  })

  it('hides the kindergarten section from everyone else', () => {
    expect(visibleSettingsSections(false)).toEqual(['profile', 'password', 'language'])
  })
})
