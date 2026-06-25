<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { requestPasswordResetSchema, type RequestPasswordResetInput } from '~/shared/schemas/auth.schema'

const { t } = useI18n()
const { requestPasswordReset, loading } = useAuth()

const state = reactive<Partial<RequestPasswordResetInput>>({ email: undefined })
const submitted = ref(false)

async function onSubmit(event: FormSubmitEvent<RequestPasswordResetInput>) {
  await requestPasswordReset(event.data.email)
  // Always show the same success state, regardless of the result — never
  // reveal whether the email exists in the system.
  submitted.value = true
}
</script>

<template>
  <UCard class="w-full max-w-md">
    <template #header>
      <AuthCardHeader :title="t('auth.forgotPasswordTitle')" />
    </template>

    <UAlert v-if="submitted" color="success" variant="soft" :title="t('auth.forgotPasswordSuccess')" />

    <UForm v-else :schema="requestPasswordResetSchema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField :label="t('auth.email')" name="email">
        <UInput v-model="state.email" type="email" class="w-full" />
      </UFormField>

      <UButton type="submit" color="primary" block loading-auto :loading="loading">
        {{ t('auth.forgotPasswordSubmit') }}
      </UButton>
    </UForm>

    <template #footer>
      <div class="flex items-center justify-between text-sm">
        <NuxtLink to="/login" class="text-teal-600 hover:text-teal-700">
          {{ t('auth.backToLogin') }}
        </NuxtLink>
        <LanguageSwitcher />
      </div>
    </template>
  </UCard>
</template>
