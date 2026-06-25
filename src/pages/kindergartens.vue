<script setup lang="ts">
import KindergartensListPage from '~/modules/kindergartens/pages/KindergartensListPage.vue'

definePageMeta({ layout: 'admin', middleware: ['role'], roles: ['super_admin'] })
</script>

<template>
  <KindergartensListPage />
</template>
