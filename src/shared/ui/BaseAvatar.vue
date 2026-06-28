<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  src?: string | null
}>(), { size: 'md', src: null })

const initials = computed(() =>
  props.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('') || '?',
)

const sizeClass = computed(() => ({
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
}[props.size]))
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="name"
    :class="['shrink-0 rounded-full object-cover', sizeClass]"
  >
  <span
    v-else
    :class="['inline-flex shrink-0 items-center justify-center rounded-full bg-teal-600 font-semibold text-white', sizeClass]"
  >
    {{ initials }}
  </span>
</template>
