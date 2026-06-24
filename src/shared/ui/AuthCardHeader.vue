<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div>
    <p class="text-xl font-semibold text-teal-700">Startica</p>
    <h1 class="text-lg font-semibold text-neutral-800">{{ title }}</h1>
  </div>
</template>
