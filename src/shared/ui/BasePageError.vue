<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()
</script>

<template>
  <UAlert
    role="alert"
    color="error"
    variant="soft"
    icon="i-heroicons-exclamation-triangle"
    :title="t('errors.page.title')"
    :description="t('errors.page.description')"
  >
    <template #actions>
      <UButton color="error" variant="soft" size="xs" @click="emit('retry')">{{ t('common.retry') }}</UButton>
    </template>
  </UAlert>
</template>
