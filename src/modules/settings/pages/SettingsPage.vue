<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { uploadKindergartenAvatar } from '~/core/storage/avatar.service'
import { useSupabaseClient } from '~/core/supabase/client'
import {
  useKindergartenSettings,
  type KindergartenSettingsGateway,
} from '../composables/useKindergartenSettings'
import * as settingsService from '../services/settings.service'
import type { KindergartenSettings } from '../services/settings.service'
import { visibleSettingsSections, type SettingsSection } from '../utils/settingsSections'

const { t } = useI18n()
const toast = useToast()
const { can } = usePermissions()
const actorStore = useActorStore()
const tenantStore = useTenantStore()
const client = useSupabaseClient()

const activeSection = ref<SettingsSection>('profile')

const fullName = ref(actorStore.actor?.fullName ?? '')
const saving = ref(false)
const sending = ref(false)

const sectionPresentation: Record<SettingsSection, { icon: string, labelKey: string }> = {
  profile: { icon: 'i-heroicons-user-circle', labelKey: 'settings.profileSection' },
  kindergarten: { icon: 'i-heroicons-building-library', labelKey: 'settings.kindergartenSection' },
  password: { icon: 'i-heroicons-lock-closed', labelKey: 'settings.passwordSection' },
  language: { icon: 'i-heroicons-language', labelKey: 'settings.languageSection' },
}

const navItems = computed(() => visibleSettingsSections(can('update', 'kindergarten'))
  .map(section => ({ key: section, ...sectionPresentation[section] })))

const timezoneOptions = [
  { label: 'Europe/Bucharest', value: 'Europe/Bucharest' },
  { label: 'Europe/Chisinau', value: 'Europe/Chisinau' },
  { label: 'UTC', value: 'UTC' },
]

const localeOptions = [
  { label: 'Română', value: 'ro' },
  { label: 'English', value: 'en' },
]

const userInitials = computed(() => {
  const name = actorStore.actor?.fullName ?? ''
  return name.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('') || '?'
})

const selectedKindergartenId = computed(() => tenantStore.selectedKindergartenId)

const kindergartenSettingsGateway: KindergartenSettingsGateway = {
  async fetchSettings(kindergartenId) {
    const result = await settingsService.fetchKindergartenSettings(client, kindergartenId)
    if (!result.success) return result
    // logo_url is a column on kindergartens, not a key inside the settings jsonb.
    return {
      success: true,
      data: { settings: result.data.settings as KindergartenSettings | null, logoUrl: result.data.logo_url },
    }
  },
  async saveSettings(kindergartenId, actorId, form) {
    const result = await settingsService.updateKindergartenSettings(client, kindergartenId, actorId, form)
    return result.success ? { success: true, data: undefined } : result
  },
  async uploadLogo(kindergartenId, file) {
    const result = await uploadKindergartenAvatar(client, kindergartenId, file)
    return result.success && result.url
      ? { success: true, data: result.url }
      : { success: false, error: result.error ?? 'upload_failed' }
  },
  saveLogoUrl: (kindergartenId, actorId, logoUrl) =>
    settingsService.updateKindergartenLogo(client, kindergartenId, actorId, logoUrl),
}

const kindergartenSettings = useKindergartenSettings(selectedKindergartenId, kindergartenSettingsGateway)
const {
  form: kindergartenForm,
  logoUrl: kindergartenLogoUrl,
  isLoading: loadingKindergartenSettings,
  isSaving: savingKindergartenSettings,
  isUploadingLogo: uploadingKindergartenLogo,
  canSave: canSaveKindergartenSettings,
} = kindergartenSettings

watch([activeSection, selectedKindergartenId], ([section]) => {
  if (section === 'kindergarten') kindergartenSettings.load()
})

async function saveProfile() {
  if (!actorStore.actor) return
  saving.value = true
  const result = await settingsService.updateOwnProfile(client, actorStore.actor.id, fullName.value)
  saving.value = false
  if (!result.success) {
    toast.add({ title: t('settings.saveError'), color: 'error' })
    return
  }
  actorStore.updateProfile({ fullName: fullName.value })
  toast.add({ title: t('settings.saveSuccess'), color: 'success' })
}

async function handleAvatarUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.[0] || !actorStore.actor) return

  const file = input.files[0]
  saving.value = true
  const result = await settingsService.updateOwnAvatar(client, actorStore.actor.id, file)
  saving.value = false

  if (!result.success) {
    toast.add({ title: t('settings.avatarUploadError'), color: 'error' })
    return
  }

  actorStore.updateProfile({ avatarUrl: result.data })
  toast.add({ title: t('settings.avatarUploadSuccess'), color: 'success' })
}

async function saveKindergartenSettings() {
  const saved = await kindergartenSettings.save(actorStore.actorId)
  if (!saved) {
    toast.add({ title: t('settings.saveError'), color: 'error' })
    return
  }
  toast.add({ title: t('settings.saveSuccess'), color: 'success' })
}

async function handleKindergartenLogoUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const uploaded = await kindergartenSettings.uploadLogo(file, actorStore.actorId)
  if (!uploaded) {
    toast.add({ title: t('settings.kindergartenAvatarUploadError'), color: 'error' })
    return
  }
  toast.add({ title: t('settings.kindergartenAvatarUploadSuccess'), color: 'success' })
}

async function sendPasswordReset() {
  if (!actorStore.actor?.email) return
  sending.value = true
  const result = await settingsService.requestOwnPasswordReset(
    client,
    actorStore.actor.email,
    `${window.location.origin}/reset-password`,
  )
  sending.value = false
  if (!result.success) {
    toast.add({ title: t('settings.resetError'), color: 'error' })
    return
  }
  toast.add({ title: t('settings.resetSent'), color: 'success' })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Page header -->
    <BasePageHeader :title="t('settings.pageTitle')" :subtitle="t('settings.pageSubtitle')" />

    <!-- Two-column layout -->
    <div class="flex flex-col gap-6 lg:flex-row lg:gap-8 lg:items-start">

      <nav class="grid w-full grid-cols-3 gap-1 lg:block lg:w-[220px] lg:shrink-0 lg:space-y-0.5">
        <button
          v-for="item in navItems"
          :key="item.key"
          type="button"
          :class="[
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left',
            activeSection === item.key
              ? 'bg-teal-50 text-teal-700'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
          ]"
          @click="activeSection = item.key"
        >
          <UIcon
            :name="item.icon"
            :class="['h-5 w-5 shrink-0', activeSection === item.key ? 'text-teal-600' : 'text-slate-400']"
          />
          {{ t(item.labelKey) }}
        </button>
      </nav>

      <div class="flex-1 min-w-0">

        <!-- Profile section -->
        <div
          v-if="activeSection === 'profile'"
          class="rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)]"
        >
          <!-- Card header -->
          <div class="flex items-center justify-between border-b border-border px-6 py-5">
            <div>
              <h2 class="text-base font-semibold text-slate-800">{{ t('settings.profileSection') }}</h2>
              <p class="mt-0.5 text-sm text-slate-400">{{ t('settings.profileDescription') }}</p>
            </div>
            <UButton color="primary" :loading="saving" @click="saveProfile">
              {{ t('settings.saveProfile') }}
            </UButton>
          </div>

          <!-- Card body -->
          <div class="p-6 space-y-6">
            <!-- Avatar row -->
            <div class="flex items-center gap-4 pb-6 border-b border-border">
              <div class="relative">
                <img
                  v-if="actorStore.actor?.avatarUrl"
                  :src="actorStore.actor.avatarUrl"
                  :alt="actorStore.actor.fullName"
                  class="inline-flex h-16 w-16 shrink-0 rounded-full object-cover ring-4 ring-teal-50"
                />
                <span
                  v-else
                  class="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xl font-semibold text-white ring-4 ring-teal-50"
                >
                  {{ userInitials }}
                </span>
                <label class="absolute bottom-0 right-0 cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="handleAvatarUpload"
                    :disabled="saving"
                  />
                  <div class="rounded-full bg-teal-600 p-1.5 text-white hover:bg-teal-700">
                    <UIcon name="i-heroicons-camera" class="h-3.5 w-3.5" />
                  </div>
                </label>
              </div>
              <div>
                <p class="font-semibold text-slate-800">{{ actorStore.actor?.fullName }}</p>
                <p class="text-sm text-slate-400">{{ actorStore.actor?.email }}</p>
              </div>
            </div>

            <!-- Form fields -->
            <div class="space-y-5 max-w-lg">
              <div>
                <label class="mb-1.5 block text-[13px] font-medium text-slate-600">{{ t('settings.fullName') }}</label>
                <UInput v-model="fullName" class="w-full" />
              </div>
              <div>
                <label class="mb-1.5 block text-[13px] font-medium text-slate-600">{{ t('settings.email') }}</label>
                <UInput :model-value="actorStore.actor?.email ?? ''" disabled class="w-full" />
                <p class="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
                  <UIcon name="i-heroicons-information-circle" class="h-3.5 w-3.5" />
                  {{ t('settings.emailReadonly') }}
                </p>
              </div>
              <div>
                <label class="mb-1.5 block text-[13px] font-medium text-slate-600">{{ t('settings.role') }}</label>
                <UInput
                  :model-value="actorStore.actor ? t(`auth.role.${actorStore.actor.role}`) : ''"
                  disabled
                  class="w-full"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Password section -->
        <div
          v-else-if="activeSection === 'password'"
          class="rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)]"
        >
          <div class="border-b border-border px-6 py-5">
            <h2 class="text-base font-semibold text-slate-800">{{ t('settings.passwordSection') }}</h2>
            <p class="mt-0.5 text-sm text-slate-400">{{ t('settings.passwordHint') }}</p>
          </div>
          <div class="p-6">
            <UButton color="neutral" variant="outline" :loading="sending" @click="sendPasswordReset">
              <UIcon name="i-heroicons-envelope" class="mr-2 h-4 w-4" />
              {{ t('settings.sendResetEmail') }}
            </UButton>
          </div>
        </div>

        <!-- Kindergarten section -->
        <div
          v-else-if="activeSection === 'kindergarten'"
          class="rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)]"
        >
          <div class="flex items-center justify-between border-b border-border px-6 py-5">
            <div>
              <h2 class="text-base font-semibold text-slate-800">{{ t('settings.kindergartenSection') }}</h2>
              <p class="mt-0.5 text-sm text-slate-400">{{ t('settings.kindergartenDescription') }}</p>
            </div>
            <UButton
              color="primary"
              :loading="savingKindergartenSettings"
              :disabled="!canSaveKindergartenSettings"
              @click="saveKindergartenSettings"
            >
              {{ t('settings.save') }}
            </UButton>
          </div>

          <div class="p-6 space-y-6">
            <div v-if="loadingKindergartenSettings" class="flex justify-center py-8">
              <UIcon name="i-heroicons-spinner" class="animate-spin h-5 w-5 text-teal-600" />
            </div>
            <div v-else class="space-y-6">
              <!-- Avatar section -->
              <div class="flex items-center gap-4 pb-6 border-b border-border">
                <div class="relative">
                  <img
                    v-if="kindergartenLogoUrl"
                    :src="kindergartenLogoUrl"
                    :alt="t('settings.kindergartenLogo')"
                    class="inline-flex h-16 w-16 shrink-0 rounded-lg object-cover ring-4 ring-teal-50"
                  />
                  <div
                    v-else
                    class="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-sm font-semibold text-slate-400 ring-4 ring-teal-50"
                  >
                    <UIcon name="i-heroicons-building-library" class="h-6 w-6" />
                  </div>
                  <label class="absolute bottom-0 right-0 cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      class="hidden"
                      :disabled="uploadingKindergartenLogo"
                      @change="handleKindergartenLogoUpload"
                    />
                    <div class="rounded-full bg-teal-600 p-1.5 text-white hover:bg-teal-700">
                      <UIcon name="i-heroicons-camera" class="h-3.5 w-3.5" />
                    </div>
                  </label>
                </div>
                <div>
                  <p class="font-semibold text-slate-800">{{ t('settings.kindergartenLogo') }}</p>
                  <p class="text-sm text-slate-400">{{ t('settings.kindergartenLogoDescription') }}</p>
                </div>
              </div>

              <!-- Settings fields -->
              <div class="grid grid-cols-1 gap-5 max-w-lg">
                <div>
                  <label class="mb-1.5 block text-[13px] font-medium text-slate-600">{{ t('settings.timezone') }}</label>
                <USelect v-model="kindergartenForm.timezone" :items="timezoneOptions" class="w-full" />
              </div>
              <div>
                <label class="mb-1.5 block text-[13px] font-medium text-slate-600">{{ t('settings.defaultLocale') }}</label>
                <USelect v-model="kindergartenForm.defaultLocale" :items="localeOptions" class="w-full" />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="mb-1.5 block text-[13px] font-medium text-slate-600">{{ t('settings.workingHoursStart') }}</label>
                  <UInput v-model="kindergartenForm.workingHoursStart" type="time" class="w-full" />
                </div>
                <div>
                  <label class="mb-1.5 block text-[13px] font-medium text-slate-600">{{ t('settings.workingHoursEnd') }}</label>
                  <UInput v-model="kindergartenForm.workingHoursEnd" type="time" class="w-full" />
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Language section -->
        <div
          v-else-if="activeSection === 'language'"
          class="rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)]"
        >
          <div class="border-b border-border px-6 py-5">
            <h2 class="text-base font-semibold text-slate-800">{{ t('settings.languageSection') }}</h2>
            <p class="mt-0.5 text-sm text-slate-400">{{ t('settings.languageHint') }}</p>
          </div>
          <div class="p-6">
            <LanguageSwitcher />
          </div>
        </div>

      </div>
    </div>
  </div>
</template>
