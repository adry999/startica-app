<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { updatePasswordSchema, type UpdatePasswordInput } from '~/shared/schemas/auth.schema'
import { createSupabaseBrowserClient } from '~/core/supabase/client'

const { t } = useI18n()
const authStore = useAuthStore()
const { updatePassword, loading } = useAuth()

const ready = ref(false)
const state = reactive<Partial<UpdatePasswordInput>>({ password: undefined, confirmPassword: undefined })

onMounted(async () => {
  // @supabase/ssr hard-codes flowType:'pkce', but Supabase's invite email uses
  // implicit flow (#access_token=…). Detect and exchange the hash manually so
  // the PKCE client never sees the implicit token and doesn't throw.
  if (window.location.hash.includes('access_token=')) {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (accessToken && refreshToken) {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      // Clean the hash so a page refresh doesn't re-attempt token exchange
      history.replaceState(null, '', window.location.pathname)
      if (error) {
        await navigateTo('/login')
        return
      }
    }
  }

  if (!authStore.user) {
    await authStore.fetchCurrentUser()
  }
  if (!authStore.user) {
    await navigateTo('/login')
    return
  }
  ready.value = true
})

async function onSubmit(event: FormSubmitEvent<UpdatePasswordInput>) {
  const ok = await updatePassword(event.data.password)
  if (ok) {
    await navigateTo('/')
  }
}
</script>

<template>
  <UCard class="w-full max-w-md">
    <template #header>
      <AuthCardHeader :title="t('auth.acceptInvite.title')" />
    </template>

    <p v-if="!ready" class="text-sm text-neutral-500">{{ t('common.loading') }}</p>

    <UForm
      v-else
      :schema="updatePasswordSchema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <p class="text-sm text-neutral-600">{{ t('auth.acceptInvite.subtitle') }}</p>

      <UFormField :label="t('auth.newPassword')" name="password">
        <UInput v-model="state.password" type="password" class="w-full" />
      </UFormField>

      <UFormField :label="t('auth.confirmPassword')" name="confirmPassword">
        <UInput v-model="state.confirmPassword" type="password" class="w-full" />
      </UFormField>

      <UButton type="submit" color="primary" block loading-auto :loading="loading">
        {{ t('auth.resetPasswordSubmit') }}
      </UButton>
    </UForm>
  </UCard>
</template>
