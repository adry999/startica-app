<script setup lang="ts">
import { ref } from 'vue'
import { useSupabaseClient } from '~/core/supabase/client'

const { t } = useI18n()
const toast = useToast()
const authStore = useAuthStore()
const client = useSupabaseClient()

const fullName = ref(authStore.user?.fullName ?? '')
const saving   = ref(false)
const sending  = ref(false)

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
  <div class="max-w-2xl space-y-8">
    <!-- Header -->
    <div>
      <h1 class="text-xl font-semibold text-slate-800">{{ t('settings.pageTitle') }}</h1>
      <p class="mt-0.5 text-sm text-slate-400">{{ t('settings.pageSubtitle') }}</p>
    </div>

    <!-- Profile card -->
    <div class="rounded-xl border border-border bg-white p-6 space-y-5">
      <h2 class="text-sm font-semibold text-slate-800">{{ t('settings.profileSection') }}</h2>

      <div class="flex items-center gap-4">
        <span class="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-600 text-lg font-semibold text-white">
          {{ (authStore.user?.fullName ?? '?').trim().split(/\s+/).slice(0,2).map((w: string) => w[0]?.toUpperCase() ?? '').join('') }}
        </span>
        <div>
          <p class="font-medium text-slate-800">{{ authStore.user?.fullName }}</p>
          <p class="text-sm text-slate-400">{{ authStore.user?.email }}</p>
        </div>
      </div>

      <div class="space-y-4">
        <div>
          <label class="mb-1.5 block text-sm font-medium text-slate-700">{{ t('settings.fullName') }}</label>
          <UInput v-model="fullName" class="w-full max-w-sm" />
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium text-slate-700">{{ t('settings.email') }}</label>
          <UInput :model-value="authStore.user?.email ?? ''" disabled class="w-full max-w-sm" />
          <p class="mt-1 text-xs text-slate-400">{{ t('settings.emailReadonly') }}</p>
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium text-slate-700">{{ t('settings.role') }}</label>
          <UInput :model-value="authStore.user ? t(`auth.role.${authStore.user.role}`) : ''" disabled class="w-full max-w-sm" />
        </div>
      </div>

      <UButton color="primary" :loading="saving" @click="saveProfile">
        {{ t('settings.saveProfile') }}
      </UButton>
    </div>

    <!-- Password card -->
    <div class="rounded-xl border border-border bg-white p-6 space-y-4">
      <h2 class="text-sm font-semibold text-slate-800">{{ t('settings.passwordSection') }}</h2>
      <p class="text-sm text-slate-500">{{ t('settings.passwordHint') }}</p>
      <UButton color="neutral" variant="outline" :loading="sending" @click="sendPasswordReset">
        {{ t('settings.sendResetEmail') }}
      </UButton>
    </div>
  </div>
</template>
