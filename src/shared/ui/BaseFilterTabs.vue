<script setup lang="ts" generic="T extends string">
defineProps<{
  items: Array<{ label: string; value: T }>
  modelValue: T
}>()

defineEmits<{
  (e: 'update:modelValue', value: T): void
}>()
</script>

<template>
  <div class="inline-flex rounded-full bg-slate-100 p-1">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      :class="[
        'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
        item.value === modelValue
          ? 'bg-white text-slate-800 shadow-sm'
          : 'text-slate-500 hover:text-slate-600',
      ]"
      @click="$emit('update:modelValue', item.value)"
    >
      {{ item.label }}
    </button>
  </div>
</template>
