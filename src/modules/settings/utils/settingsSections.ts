export type SettingsSection = 'profile' | 'kindergarten' | 'password' | 'language'

const allSections: SettingsSection[] = ['profile', 'kindergarten', 'password', 'language']

// The kindergarten section writes to kindergartens, which RLS lets only a super admin update.
export function visibleSettingsSections(canManageKindergarten: boolean): SettingsSection[] {
  return canManageKindergarten ? allSections : allSections.filter(section => section !== 'kindergarten')
}
