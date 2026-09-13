<script setup lang="ts">
import { ref, watch } from 'vue'
import BasePageError from './BasePageError.vue'

const boundary = ref<{ clearError: () => void } | null>(null)
const route = useRoute()

// NuxtErrorBoundary never resets itself, and a layout outlives its pages: without this
// the crash panel would stay after navigating to a healthy page.
watch(() => route.path, () => boundary.value?.clearError())
</script>

<template>
  <NuxtErrorBoundary ref="boundary">
    <slot />
    <template #error="{ clearError }">
      <BasePageError @retry="clearError" />
    </template>
  </NuxtErrorBoundary>
</template>
