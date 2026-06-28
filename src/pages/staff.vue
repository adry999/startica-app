<script setup lang="ts">
import StaffListPage from '~/modules/staff/pages/StaffListPage.vue'

definePageMeta({ layout: 'admin', middleware: ['role'], roles: ['super_admin', 'admin'] })
</script>

<template>
  <StaffListPage />
</template>
