<script setup lang="ts">
const { locale, setLocale } = useI18n()

const languages = [
  { code: 'ro', label: 'Română', flag: '🇷🇴' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
] as const
</script>

<template>
  <div class="flex gap-3">
    <button
      v-for="lang in languages"
      :key="lang.code"
      type="button"
      :class="[
        'flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all',
        locale === lang.code
          ? 'border-teal-600 bg-teal-50 text-teal-700'
          : 'border-[#E3E7E5] bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
      ]"
      @click="setLocale(lang.code)"
    >
      <span class="text-xl leading-none">{{ lang.flag }}</span>
      <div class="text-left">
        <p class="text-sm font-medium">{{ lang.label }}</p>
        <p class="text-xs" :class="locale === lang.code ? 'text-teal-500' : 'text-slate-400'">
          {{ lang.code.toUpperCase() }}
        </p>
      </div>
      <UIcon
        v-if="locale === lang.code"
        name="i-heroicons-check-circle"
        class="ml-auto h-5 w-5 text-teal-600"
      />
    </button>
  </div>
</template>
