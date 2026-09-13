<script setup lang="ts">
import { computed } from 'vue'
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const { t } = useI18n()

// Errors thrown with createError({ statusCode }) may not carry the newer `status` field yet.
const status = computed(() => props.error.status ?? props.error.statusCode ?? 500)
const isNotFound = computed(() => status.value === 404)

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <UApp>
    <div class="flex min-h-screen items-center justify-center bg-app-bg px-4">
      <div class="w-full max-w-md space-y-4 rounded-xl border border-border bg-white p-8 text-center" role="alert">
        <p class="text-sm font-semibold text-slate-400">{{ status }}</p>
        <h1 class="text-xl font-semibold text-slate-900">
          {{ isNotFound ? t('errors.page.notFoundTitle') : t('errors.page.unexpectedTitle') }}
        </h1>
        <p class="text-sm text-slate-600">
          {{ isNotFound ? t('errors.page.notFoundDescription') : t('errors.page.unexpectedDescription') }}
        </p>
        <UButton color="primary" @click="goHome">{{ t('errors.page.backHome') }}</UButton>
      </div>
    </div>
  </UApp>
</template>
