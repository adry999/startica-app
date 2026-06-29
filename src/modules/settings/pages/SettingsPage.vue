<script setup lang="ts">
import { ref } from 'vue'
import { useSupabaseClient } from '~/core/supabase/client'

const { t } = useI18n()
const toast = useToast()
const authStore = useAuthStore()
const client = useSupabaseClient()

type Section = 'profile' | 'password' | 'language'
const activeSection = ref<Section>('profile')

const fullName = ref(authStore.user?.fullName ?? '')
const saving   = ref(false)
const sending  = ref(false)

const navItems = [
  { key: 'profile'  as Section, icon: 'i-heroicons-user-circle',  labelKey: 'settings.profileSection'  },
  { key: 'password' as Section, icon: 'i-heroicons-lock-closed',   labelKey: 'settings.passwordSection' },
  { key: 'language' as Section, icon: 'i-heroicons-language',      labelKey: 'settings.languageSection' },
]

const userInitials = computed(() => {
  const name = authStore.user?.fullName ?? ''
  return name.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('') || '?'
})

async function saveProfile() {
  if (!authStore.user) return
  saving.value = true
  const { error } = await client
    .from('users')
    .update({ full_name: fullName.value, updated_by: authStore.user.id })
    .eq('id', authStore.user.id)
  saving.value = false
  if (error) {
    toast.add({ title: t('settings.saveError'), color: 'error' })
    return
  }
  authStore.user.fullName = fullName.value
  toast.add({ title: t('settings.saveSuccess'), color: 'success' })
}

async function sendPasswordReset() {
  if (!authStore.user?.email) return
  sending.value = true
  const { error } = await client.auth.resetPasswordForEmail(authStore.user.email)
  sending.value = false
  if (error) {
    toast.add({ title: error.message, color: 'error' })
    return
  }
  toast.add({ title: t('settings.resetSent'), color: 'success' })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Page header -->
    <div>
      <h1 class="text-xl font-semibold text-slate-800">{{ t('settings.pageTitle') }}</h1>
      <p class="mt-0.5 text-sm text-slate-400">{{ t('settings.pageSubtitle') }}</p>
    </div>

    <!-- Two-column layout -->
    <div class="flex gap-8 items-start">

      <!-- ── Left sub-nav ──────────────────────────────────────────────── -->
      <nav class="w-[220px] shrink-0 space-y-0.5">
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
              <span class="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xl font-semibold text-white ring-4 ring-teal-50">
                {{ userInitials }}
              </span>
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
