<script setup lang="ts">
defineProps<{
  label: string
  value?: string | number
  icon?: string
  iconClass?: string
  loading?: boolean
}>()
</script>

<template>
  <div class="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
    <div class="flex items-center justify-between">
      <p class="text-xs font-medium uppercase tracking-widest text-slate-400">{{ label }}</p>
      <div
        v-if="icon"
        :class="['flex h-9 w-9 items-center justify-center rounded-xl', iconClass ?? 'bg-teal-50 text-teal-600']"
      >
        <UIcon :name="icon" class="h-5 w-5" />
      </div>
    </div>
    <p class="mt-3 text-3xl font-semibold tabular-nums text-slate-800">
      <span v-if="loading" class="animate-pulse text-slate-200">—</span>
      <slot v-else-if="$slots.default" />
      <span v-else>{{ value ?? '—' }}</span>
    </p>
    <p v-if="$slots.meta" class="mt-1 text-xs text-slate-400">
      <slot name="meta" />
    </p>
  </div>
</template>
