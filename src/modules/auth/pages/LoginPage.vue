<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { loginSchema, type LoginInput } from '~/shared/schemas/auth.schema'

const { t } = useI18n()
const { login, loading, error } = useAuth()
const route = useRoute()

const state = reactive<Partial<LoginInput>>({ email: undefined, password: undefined })

async function onSubmit(event: FormSubmitEvent<LoginInput>) {
  const ok = await login(event.data.email, event.data.password)
  if (ok) {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await navigateTo(redirect)
  }
}
</script>

<template>
  <UCard class="w-full max-w-md">
    <template #header>
      <AuthCardHeader :title="t('auth.loginTitle')" />
    </template>

    <UAlert v-if="error" color="error" variant="soft" :title="t('auth.invalidCredentials')" class="mb-4" />

    <UForm :schema="loginSchema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField :label="t('auth.email')" name="email">
        <UInput v-model="state.email" type="email" class="w-full" />
      </UFormField>

      <UFormField :label="t('auth.password')" name="password">
        <UInput v-model="state.password" type="password" class="w-full" />
      </UFormField>

      <UButton type="submit" color="primary" block loading-auto :loading="loading">
        {{ t('auth.submit') }}
      </UButton>
    </UForm>

    <template #footer>
      <div class="flex items-center justify-between text-sm">
        <NuxtLink to="/forgot-password" class="text-teal-600 hover:text-teal-700">
          {{ t('auth.forgotPassword') }}
        </NuxtLink>
      </div>
    </template>
  </UCard>
</template>
