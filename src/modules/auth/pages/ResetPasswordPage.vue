<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { updatePasswordSchema, type UpdatePasswordInput } from '~/shared/schemas/auth.schema'

const { t } = useI18n()
const { isPasswordRecovery, updatePassword, loading } = useAuth()

const state = reactive<Partial<UpdatePasswordInput>>({ password: undefined, confirmPassword: undefined })
const success = ref(false)

async function onSubmit(event: FormSubmitEvent<UpdatePasswordInput>) {
  const ok = await updatePassword(event.data.password)
  if (ok) {
    success.value = true
    await navigateTo('/')
  }
}
</script>

<template>
  <UCard class="w-full max-w-md">
    <template #header>
      <AuthCardHeader :title="t('auth.resetPasswordTitle')" />
    </template>

    <UAlert
      v-if="!isPasswordRecovery && !success"
      color="error"
      variant="soft"
      :title="t('auth.resetPasswordInvalidLink')"
    />

    <UForm v-else-if="!success" :schema="updatePasswordSchema" :state="state" class="space-y-4" @submit="onSubmit">
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
