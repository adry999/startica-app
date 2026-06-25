<script setup lang="ts">
const { t } = useI18n()

defineProps<{ title: string }>()
</script>

<template>
  <div>
    <p class="text-xl font-semibold text-teal-700">{{ t('common.appName') }}</p>
    <h1 class="text-lg font-semibold text-neutral-800">{{ title }}</h1>
  </div>
</template>
