<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { updatePasswordSchema, type UpdatePasswordInput } from '~/shared/schemas/auth.schema'

const { t } = useI18n()
const authStore = useAuthStore()
const { updatePassword, loading } = useAuth()

const ready = ref(false)
const state = reactive<Partial<UpdatePasswordInput>>({ password: undefined, confirmPassword: undefined })

onMounted(async () => {
  // Supabase auto-exchanges the invite ?code= before this runs.
  // fetchCurrentUser() ensures the resulting session is applied to the store.
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
