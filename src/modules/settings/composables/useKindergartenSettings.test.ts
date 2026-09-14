import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { Result } from '@shared/types/result'
import {
  useKindergartenSettings,
  type KindergartenSettingsGateway,
  type KindergartenSettingsRecord,
} from './useKindergartenSettings'

const storedRecord: KindergartenSettingsRecord = {
  settings: { timezone: 'Europe/Chisinau', default_locale: 'en', working_hours: { start: '08:00', end: '17:00' } },
  logoUrl: 'https://cdn.example/old-logo.png',
}

function createGateway(overrides: Partial<KindergartenSettingsGateway> = {}): KindergartenSettingsGateway {
  return {
    fetchSettings: vi.fn<KindergartenSettingsGateway['fetchSettings']>().mockResolvedValue({ success: true, data: storedRecord }),
    saveSettings: vi.fn<KindergartenSettingsGateway['saveSettings']>().mockResolvedValue({ success: true, data: undefined }),
    uploadLogo: vi.fn<KindergartenSettingsGateway['uploadLogo']>().mockResolvedValue({ success: true, data: 'https://cdn.example/new-logo.png' }),
    saveLogoUrl: vi.fn<KindergartenSettingsGateway['saveLogoUrl']>().mockResolvedValue({ success: true, data: undefined }),
    ...overrides,
  }
}

const logoFile = new File(['logo'], 'logo.png', { type: 'image/png' })

describe('useKindergartenSettings', () => {
  it('loads the stored settings instead of keeping the defaults', async () => {
    const settings = useKindergartenSettings(ref('kg-1'), createGateway())

    await expect(settings.load()).resolves.toBe(true)

    expect(settings.form.value).toEqual({
      timezone: 'Europe/Chisinau',
      defaultLocale: 'en',
      workingHoursStart: '08:00',
      workingHoursEnd: '17:00',
    })
    expect(settings.logoUrl.value).toBe('https://cdn.example/old-logo.png')
    expect(settings.canSave.value).toBe(true)
  })

  it('refuses to save before the stored settings have loaded', async () => {
    const gateway = createGateway()
    const settings = useKindergartenSettings(ref('kg-1'), gateway)

    await expect(settings.save('actor-1')).resolves.toBe(false)

    expect(gateway.saveSettings).not.toHaveBeenCalled()
  })

  it('refuses to save when loading the stored settings failed', async () => {
    const gateway = createGateway({
      fetchSettings: vi.fn<KindergartenSettingsGateway['fetchSettings']>().mockResolvedValue({ success: false, error: 'network' }),
    })
    const settings = useKindergartenSettings(ref('kg-1'), gateway)
    await settings.load()

    await expect(settings.save('actor-1')).resolves.toBe(false)

    expect(gateway.saveSettings).not.toHaveBeenCalled()
  })

  it('saves the loaded form for the kindergarten and actor', async () => {
    const gateway = createGateway()
    const settings = useKindergartenSettings(ref('kg-1'), gateway)
    await settings.load()
    settings.form.value.workingHoursEnd = '18:30'

    await expect(settings.save('actor-1')).resolves.toBe(true)

    expect(gateway.saveSettings).toHaveBeenCalledWith('kg-1', 'actor-1', {
      timezone: 'Europe/Chisinau',
      defaultLocale: 'en',
      workingHoursStart: '08:00',
      workingHoursEnd: '18:30',
    })
  })

  it('refuses to save without a signed-in actor', async () => {
    const gateway = createGateway()
    const settings = useKindergartenSettings(ref('kg-1'), gateway)
    await settings.load()

    await expect(settings.save(null)).resolves.toBe(false)

    expect(gateway.saveSettings).not.toHaveBeenCalled()
  })

  it('reports a logo upload as failed when saving its url is refused, keeping the previous logo', async () => {
    const gateway = createGateway({
      saveLogoUrl: vi.fn<KindergartenSettingsGateway['saveLogoUrl']>().mockResolvedValue({ success: false, error: 'forbidden' }),
    })
    const settings = useKindergartenSettings(ref('kg-1'), gateway)
    await settings.load()

    await expect(settings.uploadLogo(logoFile, 'actor-1')).resolves.toBe(false)

    expect(settings.logoUrl.value).toBe('https://cdn.example/old-logo.png')
    expect(settings.isUploadingLogo.value).toBe(false)
  })

  it('shows the new logo only after both the upload and the url save succeed', async () => {
    const gateway = createGateway()
    const settings = useKindergartenSettings(ref('kg-1'), gateway)
    await settings.load()

    await expect(settings.uploadLogo(logoFile, 'actor-1')).resolves.toBe(true)

    expect(gateway.saveLogoUrl).toHaveBeenCalledWith('kg-1', 'actor-1', 'https://cdn.example/new-logo.png')
    expect(settings.logoUrl.value).toBe('https://cdn.example/new-logo.png')
  })

  it('sets loadFailed and stops loading when fetching settings fails, then clears loadFailed after a following success', async () => {
    const gateway = createGateway({
      fetchSettings: vi.fn<KindergartenSettingsGateway['fetchSettings']>()
        .mockResolvedValueOnce({ success: false, error: 'network' })
        .mockResolvedValueOnce({ success: true, data: storedRecord }),
    })
    const settings = useKindergartenSettings(ref('kg-1'), gateway)

    await expect(settings.load()).resolves.toBe(false)

    expect(settings.loadFailed.value).toBe(true)
    expect(settings.isLoading.value).toBe(false)

    await expect(settings.load()).resolves.toBe(true)

    expect(settings.loadFailed.value).toBe(false)
  })

  it('does not set loadFailed for a superseded failed load, and leaves it false once the newer load succeeds', async () => {
    let resolveFirst: (result: Result<KindergartenSettingsRecord>) => void = () => {}
    const firstLoad = new Promise<Result<KindergartenSettingsRecord>>((resolve) => { resolveFirst = resolve })
    const gateway = createGateway({
      fetchSettings: vi.fn<KindergartenSettingsGateway['fetchSettings']>()
        .mockReturnValueOnce(firstLoad)
        .mockResolvedValueOnce({ success: true, data: storedRecord }),
    })
    const kindergartenId = ref<string | null>('kg-1')
    const settings = useKindergartenSettings(kindergartenId, gateway)

    const loadingFirst = settings.load()
    kindergartenId.value = 'kg-2'
    await settings.load()

    expect(settings.loadFailed.value).toBe(false)

    resolveFirst({ success: false, error: 'network' })
    await loadingFirst

    expect(settings.loadFailed.value).toBe(false)
  })

  it('marks the load as failed and stops loading when fetchSettings rejects, while still propagating the rejection', async () => {
    const gateway = createGateway({
      fetchSettings: vi.fn<KindergartenSettingsGateway['fetchSettings']>().mockRejectedValue(new Error('boom')),
    })
    const settings = useKindergartenSettings(ref('kg-1'), gateway)

    await expect(settings.load()).rejects.toThrow('boom')

    expect(settings.isLoading.value).toBe(false)
    expect(settings.loadFailed.value).toBe(true)
  })

  it('does not apply an uploaded logo when the kindergarten changed before the upload finished', async () => {
    let resolveUpload: (result: Result<string>) => void = () => {}
    const uploadPromise = new Promise<Result<string>>((resolve) => { resolveUpload = resolve })
    const gateway = createGateway({
      uploadLogo: vi.fn<KindergartenSettingsGateway['uploadLogo']>().mockReturnValue(uploadPromise),
    })
    const kindergartenId = ref<string | null>('kg-1')
    const settings = useKindergartenSettings(kindergartenId, gateway)
    await settings.load()

    const uploading = settings.uploadLogo(logoFile, 'actor-1')
    kindergartenId.value = 'kg-2'
    resolveUpload({ success: true, data: 'https://cdn.example/new-logo.png' })

    await expect(uploading).resolves.toBe(true)

    expect(settings.logoUrl.value).toBe('https://cdn.example/old-logo.png')
  })

  it('ignores settings that arrive after the kindergarten changed', async () => {
    let resolveFirst: (result: Result<KindergartenSettingsRecord>) => void = () => {}
    const firstLoad = new Promise<Result<KindergartenSettingsRecord>>((resolve) => { resolveFirst = resolve })
    const secondRecord: KindergartenSettingsRecord = { settings: { timezone: 'UTC' }, logoUrl: null }
    const gateway = createGateway({
      fetchSettings: vi.fn<KindergartenSettingsGateway['fetchSettings']>()
        .mockReturnValueOnce(firstLoad)
        .mockResolvedValueOnce({ success: true, data: secondRecord }),
    })
    const kindergartenId = ref<string | null>('kg-1')
    const settings = useKindergartenSettings(kindergartenId, gateway)

    const loadingFirst = settings.load()
    kindergartenId.value = 'kg-2'
    await settings.load()
    resolveFirst({ success: true, data: storedRecord })

    await expect(loadingFirst).resolves.toBe(false)
    expect(settings.form.value.timezone).toBe('UTC')
    expect(settings.canSave.value).toBe(true)
  })
})
