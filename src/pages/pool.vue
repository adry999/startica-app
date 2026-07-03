<script setup lang="ts">
const { t } = useI18n()
definePageMeta({ layout: 'admin' })
</script>

<template>
  <div class="space-y-4">
    <BasePageHeader :title="t('pool.title')" />
    <p class="text-sm text-slate-400">{{ t('pool.comingSoon') }}</p>
  </div>
</template>
