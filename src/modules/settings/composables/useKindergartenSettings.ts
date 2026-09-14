import { computed, ref, type Ref } from 'vue'
import { createLatestRequestGuard } from '@core/async/latest-request'
import type { Result } from '@shared/types/result'
import type { KindergartenSettings } from '../services/settings.service'

export interface KindergartenSettingsForm {
  timezone: string
  defaultLocale: 'ro' | 'en'
  workingHoursStart: string
  workingHoursEnd: string
}

export interface KindergartenSettingsRecord {
  settings: KindergartenSettings | null
  logoUrl: string | null
}

export interface KindergartenSettingsGateway {
  fetchSettings(kindergartenId: string): Promise<Result<KindergartenSettingsRecord>>
  saveSettings(kindergartenId: string, actorId: string, form: KindergartenSettingsForm): Promise<Result<void>>
  uploadLogo(kindergartenId: string, file: File): Promise<Result<string>>
  saveLogoUrl(kindergartenId: string, actorId: string, logoUrl: string): Promise<Result<void>>
}

function toForm(settings: KindergartenSettings | null): KindergartenSettingsForm {
  return {
    timezone: settings?.timezone ?? 'Europe/Bucharest',
    defaultLocale: settings?.default_locale === 'en' ? 'en' : 'ro',
    workingHoursStart: settings?.working_hours?.start ?? '07:30',
    workingHoursEnd: settings?.working_hours?.end ?? '18:00',
  }
}

export function useKindergartenSettings(kindergartenId: Ref<string | null>, gateway: KindergartenSettingsGateway) {
  const settingsRequests = createLatestRequestGuard()

  const form = ref<KindergartenSettingsForm>(toForm(null))
  const logoUrl = ref<string | null>(null)
  const loadedKindergartenId = ref<string | null>(null)
  const isLoading = ref(false)
  const isSaving = ref(false)
  const isUploadingLogo = ref(false)

  // Saving before the stored settings arrive would overwrite them with the defaults.
  const canSave = computed(() =>
    kindergartenId.value !== null && loadedKindergartenId.value === kindergartenId.value && !isSaving.value)

  async function load(): Promise<boolean> {
    const requestedId = kindergartenId.value
    if (!requestedId) return false
    const request = settingsRequests.begin()
    loadedKindergartenId.value = null
    isLoading.value = true

    const result = await gateway.fetchSettings(requestedId)
    if (!request.isLatest()) return false
    isLoading.value = false
    if (!result.success) return false

    form.value = toForm(result.data.settings)
    logoUrl.value = result.data.logoUrl
    loadedKindergartenId.value = requestedId
    return true
  }

  async function save(actorId: string | null): Promise<boolean> {
    const targetId = kindergartenId.value
    if (!actorId || !targetId || !canSave.value) return false
    isSaving.value = true
    try {
      const result = await gateway.saveSettings(targetId, actorId, { ...form.value })
      return result.success
    }
    finally {
      isSaving.value = false
    }
  }

  async function uploadLogo(file: File, actorId: string | null): Promise<boolean> {
    const targetId = kindergartenId.value
    if (!actorId || !targetId) return false
    isUploadingLogo.value = true
    try {
      const upload = await gateway.uploadLogo(targetId, file)
      if (!upload.success) return false
      const saved = await gateway.saveLogoUrl(targetId, actorId, upload.data)
      if (!saved.success) return false
      if (kindergartenId.value === targetId) logoUrl.value = upload.data
      return true
    }
    finally {
      isUploadingLogo.value = false
    }
  }

  return { form, logoUrl, isLoading, isSaving, isUploadingLogo, canSave, load, save, uploadLogo }
}
