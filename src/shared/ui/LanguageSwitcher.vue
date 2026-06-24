<script setup lang="ts">
const { locale, setLocale } = useI18n()
</script>

<template>
  <div class="flex gap-2 text-sm">
    <button
      type="button"
      :class="locale === 'ro' ? 'font-semibold text-teal-600' : 'text-neutral-500 hover:text-teal-600'"
      @click="setLocale('ro')"
    >
      RO
    </button>
    <button
      type="button"
      :class="locale === 'en' ? 'font-semibold text-teal-600' : 'text-neutral-500 hover:text-teal-600'"
      @click="setLocale('en')"
    >
      EN
    </button>
  </div>
</template>
