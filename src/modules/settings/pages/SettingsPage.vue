<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSupabaseClient } from '~/core/supabase/client'
import * as settingsService from '../services/settings.service'
import { uploadKindergartenAvatar, deleteKindergartenAvatar } from '~/core/storage/avatar.service'

const { t, locale } = useI18n()
const toast = useToast()
const authStore = useAuthStore()
const tenantStore = useTenantStore()
const client = useSupabaseClient()

type Section = 'profile' | 'password' | 'language' | 'kindergarten'
const activeSection = ref<Section>('profile')

const fullName = ref(authStore.user?.fullName ?? '')
const saving = ref(false)
const sending = ref(false)
const loadingKg = ref(false)
const savingKg = ref(false)
const uploadingKgAvatar = ref(false)

const timezone = ref('Europe/Bucharest')
const kgLocale = ref<'ro' | 'en'>('ro')
const workingHoursStart = ref('07:30')
const workingHoursEnd = ref('18:00')
const kindergartenLogoUrl = ref<string | null>(null)

const navItems = [
  { key: 'profile' as Section, icon: 'i-heroicons-user-circle', labelKey: 'settings.profileSection' },
  { key: 'kindergarten' as Section, icon: 'i-heroicons-building-library', labelKey: 'settings.kindergartenSection' },
  { key: 'password' as Section, icon: 'i-heroicons-lock-closed', labelKey: 'settings.passwordSection' },
  { key: 'language' as Section, icon: 'i-heroicons-language', labelKey: 'settings.languageSection' },
]

const selectedKgId = computed(() => tenantStore.selectedKindergartenId)

const userInitials = computed(() => {
  const name = authStore.user?.fullName ?? ''
  return name.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('') || '?'
})

async function saveProfile() {
  if (!authStore.user) return
  saving.value = true
  const result = await settingsService.updateOwnProfile(client, authStore.user.id, fullName.value)
  saving.value = false
  if (!result.success) {
    toast.add({ title: t('settings.saveError'), color: 'error' })
    return
  }
  authStore.user.fullName = fullName.value
  toast.add({ title: t('settings.saveSuccess'), color: 'success' })
}

async function handleAvatarUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.[0] || !authStore.user) return

  const file = input.files[0]
  saving.value = true
  const result = await settingsService.updateOwnAvatar(client, authStore.user.id, file)
  saving.value = false

  if (!result.success) {
    toast.add({ title: t('settings.avatarUploadError'), color: 'error' })
    return
  }

  authStore.user.avatarUrl = result.data
  toast.add({ title: t('settings.avatarUploadSuccess'), color: 'success' })
}

async function loadKindergartenSettings() {
  if (!selectedKgId.value) return
  loadingKg.value = true
  const result = await settingsService.fetchKindergartenSettings(client, selectedKgId.value)
  loadingKg.value = false

  if (!result.success) {
    toast.add({ title: t('settings.loadError'), color: 'error' })
    return
  }

  const settings = result.data.settings as any
  timezone.value = settings?.timezone ?? 'Europe/Bucharest'
  kgLocale.value = settings?.default_locale === 'en' ? 'en' : 'ro'
  workingHoursStart.value = settings?.working_hours?.start ?? '07:30'
  workingHoursEnd.value = settings?.working_hours?.end ?? '18:00'
  kindergartenLogoUrl.value = settings?.logo_url ?? null
}

async function saveKindergartenSettings() {
  if (!selectedKgId.value || !authStore.user) return
  savingKg.value = true
  const result = await settingsService.updateKindergartenSettings(
    client,
    selectedKgId.value,
    authStore.user.id,
    {
      timezone: timezone.value,
      defaultLocale: kgLocale.value,
      workingHoursStart: workingHoursStart.value,
      workingHoursEnd: workingHoursEnd.value,
    },
  )
  savingKg.value = false

  if (!result.success) {
    toast.add({ title: t('settings.saveError'), color: 'error' })
    return
  }

  toast.add({ title: t('settings.saveSuccess'), color: 'success' })
}

async function handleKindergartenAvatarUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.[0] || !selectedKgId.value) return

  const file = input.files[0]
  uploadingKgAvatar.value = true
  const result = await uploadKindergartenAvatar(client, selectedKgId.value, file)
  uploadingKgAvatar.value = false

  if (!result.success) {
    toast.add({ title: t('settings.kindergartenAvatarUploadError'), color: 'error' })
    return
  }

  kindergartenLogoUrl.value = result.url || null
  await settingsService.updateKindergartenSettings(
    client,
    selectedKgId.value,
    authStore.user?.id || '',
    {
      timezone: timezone.value,
      defaultLocale: kgLocale.value,
      workingHoursStart: workingHoursStart.value,
      workingHoursEnd: workingHoursEnd.value,
      logoUrl: result.url,
    },
  )
  toast.add({ title: t('settings.kindergartenAvatarUploadSuccess'), color: 'success' })
}

async function sendPasswordReset() {
  if (!authStore.user?.email) return
  sending.value = true
  const result = await settingsService.requestOwnPasswordReset(
    client,
    authStore.user.email,
    `${window.location.origin}/reset-password`,
  )
  sending.value = false
  if (!result.success) {
    toast.add({ title: result.error, color: 'error' })
    return
  }
  toast.add({ title: t('settings.resetSent'), color: 'success' })
}

onMounted(() => {
  if (activeSection.value === 'kindergarten') {
    loadKindergartenSettings()
  }
})

watch(activeSection, (newSection) => {
  if (newSection === 'kindergarten' && !timezone.value) {
    loadKindergartenSettings()
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Page header -->
    <BasePageHeader :title="t('settings.pageTitle')" :subtitle="t('settings.pageSubtitle')" />

    <!-- Two-column layout -->
    <div class="flex flex-col gap-6 lg:flex-row lg:gap-8 lg:items-start">

      <!-- ── Left sub-nav ──────────────────────────────────────────────── -->
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

      <!-- ── Right panel ───────────────────────────────────────────────── -->
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
                  v-if="authStore.user?.avatarUrl"
                  :src="authStore.user.avatarUrl"
                  :alt="authStore.user.fullName"
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
                <p class="font-semibold text-slate-800">{{ authStore.user?.fullName }}</p>
                <p class="text-sm text-slate-400">{{ authStore.user?.email }}</p>
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
                <UInput :model-value="authStore.user?.email ?? ''" disabled class="w-full" />
                <p class="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
                  <UIcon name="i-heroicons-information-circle" class="h-3.5 w-3.5" />
                  {{ t('settings.emailReadonly') }}
                </p>
              </div>
              <div>
                <label class="mb-1.5 block text-[13px] font-medium text-slate-600">{{ t('settings.role') }}</label>
                <UInput
                  :model-value="authStore.user ? t(`auth.role.${authStore.user.role}`) : ''"
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
            <UButton color="primary" :loading="savingKg" @click="saveKindergartenSettings">
              {{ t('settings.save') }}
            </UButton>
          </div>

          <div class="p-6 space-y-6">
            <div v-if="loadingKg" class="flex justify-center py-8">
              <UIcon name="i-heroicons-spinner" class="animate-spin h-5 w-5 text-teal-600" />
            </div>
            <div v-else class="space-y-6">
              <!-- Avatar section -->
              <div class="flex items-center gap-4 pb-6 border-b border-border">
                <div class="relative">
                  <img
                    v-if="kindergartenLogoUrl"
                    :src="kindergartenLogoUrl"
                    alt="Kindergarten logo"
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
                      @change="handleKindergartenAvatarUpload"
                      :disabled="uploadingKgAvatar"
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
                <USelect
                  v-model="timezone"
                  :options="[
                    { label: 'Europe/Bucharest', value: 'Europe/Bucharest' },
                    { label: 'Europe/Chisinau', value: 'Europe/Chisinau' },
                    { label: 'UTC', value: 'UTC' },
                  ]"
                  class="w-full"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-[13px] font-medium text-slate-600">{{ t('settings.defaultLocale') }}</label>
                <USelect
                  v-model="kgLocale"
                  :options="[
                    { label: 'Română', value: 'ro' },
                    { label: 'English', value: 'en' },
                  ]"
                  class="w-full"
                />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="mb-1.5 block text-[13px] font-medium text-slate-600">{{ t('settings.workingHoursStart') }}</label>
                  <UInput v-model="workingHoursStart" type="time" class="w-full" />
                </div>
                <div>
                  <label class="mb-1.5 block text-[13px] font-medium text-slate-600">{{ t('settings.workingHoursEnd') }}</label>
                  <UInput v-model="workingHoursEnd" type="time" class="w-full" />
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
